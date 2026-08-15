import { Vec2 } from '../math/Vec2'
import type { Body } from '../bodies/Body'

/** 关节基类：参与求解器的速度/位置迭代 */
export abstract class Joint {
  abstract prepare(dt: number): void
  abstract solveVelocity(): void
  abstract solvePosition(): void
}

/**
 * 距离关节：约束两个刚体上两个锚点之间的距离不变。
 * 可用于：链条、绳、钟摆、桥、布（网格）。
 * frequency > 0 时表现为软弹簧（frequency=频率Hz，dampingRatio=阻尼比）。
 */
export class DistanceJoint extends Joint {
  bodyA: Body
  bodyB: Body
  /** 锚点（局部坐标） */
  anchorLocalA: Vec2
  anchorLocalB: Vec2
  /** 静止长度 */
  length: number
  frequency = 0
  dampingRatio = 0

  // 求解缓存
  private u = new Vec2()
  private rA = new Vec2()
  private rB = new Vec2()
  private mass = 0
  private gamma = 0
  private bias = 0
  private impulse = 0

  constructor(bodyA: Body, bodyB: Body, anchorA: Vec2, anchorB: Vec2) {
    super()
    this.bodyA = bodyA
    this.bodyB = bodyB
    this.anchorLocalA = bodyA.worldToLocal(anchorA)
    this.anchorLocalB = bodyB.worldToLocal(anchorB)
    this.length = Vec2.dist(anchorA, anchorB)
  }

  prepare(dt: number): void {
    const a = this.bodyA
    const b = this.bodyB
    a.localToWorld(this.anchorLocalA, this.rA)
    this.rA.sub(a.position)
    b.localToWorld(this.anchorLocalB, this.rB)
    this.rB.sub(b.position)

    // 当前距离与方向
    const d = Vec2.add(b.position, this.rB)
    d.sub(a.position).sub(this.rA)
    const dist = d.length()
    if (dist > 1e-9) this.u.copy(d).scale(1 / dist)
    else this.u.set(0, 1)

    const crA = this.rA.cross(this.u)
    const crB = this.rB.cross(this.u)
    const invMass = a.invMass + b.invMass + a.invInertia * crA * crA + b.invInertia * crB * crB

    // 软约束参数（弹簧）：ω = 2πf，γ 与 bias 让约束变为柔性的质量-弹簧-阻尼
    if (this.frequency > 0) {
      const omega = 2 * Math.PI * this.frequency
      const dSpring = 2 * this.mass * this.dampingRatio * omega
      const k = this.mass * omega * omega
      this.gamma = dt * (dSpring + dt * k)
      if (this.gamma > 0) this.gamma = 1 / this.gamma
      this.bias = (dist - this.length) * dt * k * this.gamma
      this.mass = invMass + this.gamma
    } else {
      this.gamma = 0
      this.bias = 0
      this.mass = invMass
    }
    if (this.mass > 0) this.mass = 1 / this.mass
  }

  solveVelocity(): void {
    const a = this.bodyA
    const b = this.bodyB
    const dv = b.pointVelocity(Vec2.add(b.position, this.rB), new Vec2())
    dv.sub(a.pointVelocity(Vec2.add(a.position, this.rA), new Vec2()))

    const cdot = dv.dot(this.u)
    const lambda = -(cdot + this.bias + this.gamma * this.impulse) * this.mass
    this.impulse += lambda

    applyJointImpulse(a, b, this.rA, this.rB, this.u, lambda)
  }

  solvePosition(): void {
    const a = this.bodyA
    const b = this.bodyB
    const cA = Vec2.add(a.position, this.rA)
    const cB = Vec2.add(b.position, this.rB)
    const d = Vec2.sub(cB, cA)
    const dist = d.length()
    if (dist < 1e-9) return

    const u = Vec2.scale(d, 1 / dist)
    const C = clamp(dist - this.length, -0.4, 0.4)
    const crA = this.rA.cross(u)
    const crB = this.rB.cross(u)
    const invMass = a.invMass + b.invMass + a.invInertia * crA * crA + b.invInertia * crB * crB
    if (invMass <= 0) return

    const impulse = (-C / invMass) * 0.8
    applyJointImpulse(a, b, this.rA, this.rB, u, impulse)
  }
}

/**
 * 鼠标关节：把刚体上的锚点软性地拉向一个目标点（鼠标位置）。
 *
 * 采用**力型弹簧**而非约束求解器：每步在力积分阶段直接施加
 *   F = k·(目标 − 锚点) − c·v_锚点，且 |F| ≤ maxForce。
 * 相比"累积冲量 + 钳制"的约束写法，力型弹簧不会出现
 * 累积冲量顶格后 dImpulse=0 的"饱和锁死"（刚体冻结在距光标处不动的死点）。
 */
export class MouseJoint extends Joint {
  body: Body
  /** 抓住刚体时的锚点（局部坐标） */
  anchorLocal: Vec2
  /** 目标点（世界坐标，由鼠标更新） */
  target = new Vec2()
  /** 最大拉力（力限幅） */
  maxForce = 1e6
  /** 弹簧频率（Hz） */
  frequency = 5
  /** 阻尼比（1 = 临界阻尼） */
  dampingRatio = 0.7

  private u = new Vec2()
  private r = new Vec2()

  constructor(body: Body, anchorWorld: Vec2) {
    super()
    this.body = body
    this.anchorLocal = body.worldToLocal(anchorWorld)
    this.target.copy(anchorWorld)
  }

  /** 由外部更新目标点 */
  setTarget(world: Vec2): void {
    this.target.copy(world)
  }

  /** 在 World 力积分阶段调用：向刚体施加限幅弹簧力 */
  applySpringForce(): void {
    const b = this.body
    b.localToWorld(this.anchorLocal, this.r)
    this.r.sub(b.position)

    const anchor = Vec2.add(b.position, this.r)
    const d = Vec2.sub(this.target, anchor)
    const dist = d.length()
    if (dist < 1e-6) return

    const omega = 2 * Math.PI * this.frequency
    const k = b.mass * omega * omega // 弹簧刚度
    const c = 2 * b.mass * this.dampingRatio * omega // 阻尼系数

    // 弹簧力 + 阻尼力（阻尼使用锚点速度，含旋转贡献）
    this.u.copy(d).scale(1 / dist)
    const v = b.pointVelocity(anchor, new Vec2())
    const F = Vec2.scale(d, k).addScaled(v, -c)

    // 力限幅：|F| ≤ maxForce
    const lenSq = F.lengthSq()
    const maxSq = this.maxForce * this.maxForce
    if (lenSq > maxSq) F.scale(this.maxForce / Math.sqrt(lenSq))

    b.applyForceAtPoint(F, anchor)
  }

  prepare(_dt: number): void {
    // 力型弹簧无需约束预计算
  }

  solveVelocity(): void {
    // 力已在积分阶段施加
  }

  solvePosition(): void {
    // 无需位置投影
  }
}

function applyJointImpulse(a: Body, b: Body, rA: Vec2, rB: Vec2, u: Vec2, lambda: number): void {
  a.velocity.addScaled(u, -a.invMass * lambda)
  a.angularVelocity -= a.invInertia * rA.cross(u) * lambda
  b.velocity.addScaled(u, b.invMass * lambda)
  b.angularVelocity += b.invInertia * rB.cross(u) * lambda
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
