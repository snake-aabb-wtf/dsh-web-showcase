import { Vec2 } from '../math/Vec2'
import type { Body } from '../bodies/Body'
import type { Manifold, ContactPoint } from '../collision/Manifold'

/** 接触点穿透容差（允许轻微嵌入，避免抖动） */
const SLOP = 0.02
/** 位置修正强度（split impulse 的 β） */
const BAUMGARTE = 0.2
/** 恢复系数生效的最低接近速度（px/s），低于此值不弹 */
const RESTITUTION_THRESHOLD = 40

/** 混合规则：摩擦取几何平均，恢复取最大值（Box2D 同款） */
export function mixFriction(a: number, b: number): number {
  return Math.sqrt(a * b)
}
export function mixRestitution(a: number, b: number): number {
  return Math.max(a, b)
}

/** 预计算后的单接触点数据 */
interface PreparedPoint {
  point: ContactPoint
  rA: Vec2
  rB: Vec2
  /** 法向有效质量倒数 kNormal⁻¹ */
  normalMass: number
  /** 切向有效质量倒数 */
  tangentMass: number
  /** 恢复系数带来的速度偏置（≤ 0） */
  velocityBias: number
  /** 位置修正目标：max(pen - slop, 0) */
  positionBias: number
  /** 本帧累积的位置修正冲量 */
  positionImpulse: number
}

interface PreparedContact {
  manifold: Manifold
  bodyA: Body
  bodyB: Body
  invMassA: number
  invMassB: number
  invIA: number
  invIB: number
  mu: number
  points: PreparedPoint[]
  /** 双方都在休眠 → 跳过求解 */
  inactive: boolean
}

/**
 * 接触求解器 —— 顺序冲量法（Sequential Impulses）。
 *
 * 核心思想：把每个接触点看作一个 1D 速度约束，逐个求解并立即应用冲量，
 * 重复多轮（velocityIterations）让冲量在整条接触链上"传导"收敛
 * （这正是堆叠物体的稳定性来源）。
 *
 * 每个接触点两个约束：
 *   1. 法向：相对速度沿法线分量 ≥ 0（单向，只能推不能拉）
 *   2. 切向：库仑摩擦，切向冲量 |P_t| ≤ μ·P_n
 *
 * 位置修正采用 **split impulse**（分离冲量）：
 * 位置修正冲量不进入速度，避免 Baumgarte 修正给系统注入能量（"弹跳"假象）。
 */
export class ContactSolver {
  private contacts: PreparedContact[] = []

  /** 每帧从流形列表重建求解数据（含热启动） */
  prepare(manifolds: Manifold[], prevManifolds: Map<string, Manifold>): void {
    this.contacts.length = 0

    for (const manifold of manifolds) {
      const a = manifold.bodyA
      const b = manifold.bodyB
      const inactive = a.sleeping && b.sleeping
      const mu = mixFriction(a.friction, b.friction)
      const e = mixRestitution(a.restitution, b.restitution)

      const contact: PreparedContact = {
        manifold,
        bodyA: a,
        bodyB: b,
        invMassA: a.invMass,
        invMassB: b.invMass,
        invIA: a.invInertia,
        invIB: b.invInertia,
        mu,
        points: [],
        inactive,
      }

      const n = manifold.normal
      const t = manifold.tangent
      const pairKey = `${Math.min(a.id, b.id)}|${Math.max(a.id, b.id)}`
      manifold.warmStart(prevManifolds.get(pairKey))

      for (const p of manifold.points) {
        const rA = Vec2.sub(p.position, a.position)
        const rB = Vec2.sub(p.position, b.position)

        // 相对速度（接触点处）：vB + ωB×rB - vA - ωA×rA
        const dv = b.pointVelocity(p.position, new Vec2())
        dv.sub(a.pointVelocity(p.position, new Vec2()))

        const rnA = rA.cross(n)
        const rnB = rB.cross(n)
        const kNormal = contact.invMassA + contact.invMassB + contact.invIA * rnA * rnA + contact.invIB * rnB * rnB

        const rtA = rA.cross(t)
        const rtB = rB.cross(t)
        const kTangent = contact.invMassA + contact.invMassB + contact.invIA * rtA * rtA + contact.invIB * rtB * rtB

        const vn = dv.dot(n)
        let velocityBias = 0
        if (vn < -RESTITUTION_THRESHOLD) {
          velocityBias = -e * vn
        }

        contact.points.push({
          point: p,
          rA,
          rB,
          normalMass: kNormal > 0 ? 1 / kNormal : 0,
          tangentMass: kTangent > 0 ? 1 / kTangent : 0,
          velocityBias,
          positionBias: Math.max(p.penetration - SLOP, 0),
          positionImpulse: 0,
        })
      }

      if (contact.points.length > 0) {
        this.contacts.push(contact)
      }
    }

    // 热启动：把上一帧累积的冲量直接应用到速度上
    for (const c of this.contacts) {
      if (c.inactive) continue
      for (const p of c.points) {
        const Pn = Vec2.scale(c.manifold.normal, p.point.normalImpulse)
        const Pt = Vec2.scale(c.manifold.tangent, p.point.tangentImpulse)
        applyImpulse(c, p, Pn)
        applyImpulse(c, p, Pt)
      }
    }
  }

  /** 一轮速度求解（法向 + 摩擦），由 World 循环调用 velocityIterations 次 */
  solveVelocity(): void {
    for (const c of this.contacts) {
      if (c.inactive) continue
      const n = c.manifold.normal
      const t = c.manifold.tangent
      const a = c.bodyA
      const b = c.bodyB

      for (const p of c.points) {
        // ---------- 法向约束 ----------
        const dv = b.pointVelocity(p.point.position, new Vec2())
        dv.sub(a.pointVelocity(p.point.position, new Vec2()))
        const vn = dv.dot(n)

        // λ = -(vn − bias) · kNormal；累积冲量不允许为负（不能相互吸引）
        // 注意符号：velocityBias = -e·vn（正值表示反弹目标速度），
        // 若误写成 (vn + bias) 会把"反弹"误解为"继续接近"，导致刚体沉穿地面。
        let lambda = -(vn - p.velocityBias) * p.normalMass
        const newImpulse = Math.max(p.point.normalImpulse + lambda, 0)
        lambda = newImpulse - p.point.normalImpulse
        p.point.normalImpulse = newImpulse

        applyImpulse(c, p, Vec2.scale(n, lambda))

        // ---------- 切向约束（库仑摩擦）----------
        const vt = dv.dot(t)
        lambda = -vt * p.tangentMass
        const maxFriction = c.mu * p.point.normalImpulse
        const newTangent = clamp(p.point.tangentImpulse + lambda, -maxFriction, maxFriction)
        lambda = newTangent - p.point.tangentImpulse
        p.point.tangentImpulse = newTangent

        applyImpulse(c, p, Vec2.scale(t, lambda))
      }
    }
  }

  /** 一轮位置修正（split impulse，只改位置不改速度），由 World 循环调用 positionIterations 次 */
  solvePosition(): void {
    for (const c of this.contacts) {
      if (c.inactive) continue
      const n = c.manifold.normal
      const a = c.bodyA
      const b = c.bodyB

      for (const p of c.points) {
        // 剩余需要修正的穿透量（分离量变化 = 修正冲量 × kNormal，逐轮递减）
        const remaining = Math.max(p.positionBias - p.positionImpulse / p.normalMass, 0)
        if (remaining <= 0) continue

        // 位置冲量 = β · C · kNormal⁻¹（每次迭代修正一部分，多轮收敛）
        const impulse = BAUMGARTE * remaining * p.normalMass
        p.positionImpulse += impulse

        // 位置修正：A 沿 -n、B 沿 +n（与速度求解的冲量方向一致）
        a.position.x -= a.invMass * impulse * n.x
        a.position.y -= a.invMass * impulse * n.y
        a.angle -= a.invInertia * p.rA.cross(n) * impulse

        b.position.x += b.invMass * impulse * n.x
        b.position.y += b.invMass * impulse * n.y
        b.angle += b.invInertia * p.rB.cross(n) * impulse
      }
    }
  }

  get contactCount(): number {
    return this.contacts.length
  }
}

/** 向刚体施加冲量（B 沿 +方向、A 沿 -方向） */
function applyImpulse(c: PreparedContact, p: PreparedPoint, impulse: Vec2): void {
  const a = c.bodyA
  const b = c.bodyB
  a.velocity.x -= a.invMass * impulse.x
  a.velocity.y -= a.invMass * impulse.y
  a.angularVelocity -= a.invInertia * p.rA.cross(impulse)

  b.velocity.x += b.invMass * impulse.x
  b.velocity.y += b.invMass * impulse.y
  b.angularVelocity += b.invInertia * p.rB.cross(impulse)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
