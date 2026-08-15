import { Vec2 } from '../math/Vec2'
import type { Shape } from './Shape'
import { AABB } from '../collision/AABB'

export type BodyType = 'static' | 'dynamic'

let BODY_SEQ = 0

/**
 * 刚体。
 * 状态量：位置 position、角度 angle、线速度 velocity、角速度 angularVelocity。
 * 受力 accumulate 到 force / torque，在每步开始时清空（半隐式欧拉积分）。
 */
export class Body {
  readonly id: number = BODY_SEQ++
  /** static 刚体质量无穷大，不参与积分 */
  type: BodyType = 'dynamic'

  shape: Shape

  position = new Vec2()
  angle = 0

  velocity = new Vec2()
  angularVelocity = 0

  /** 每步累积的外力 / 外力矩（重力、鼠标关节等） */
  force = new Vec2()
  torque = 0

  mass = 0
  invMass = 0
  inertia = 0
  invInertia = 0

  /** 恢复系数 e ∈ [0,1]：1 = 完全弹性 */
  restitution = 0.2
  /** 库仑摩擦系数 μ */
  friction = 0.6
  /** 线/角速度阻尼（模拟空气阻力） */
  linearDamping = 0.02
  angularDamping = 0.05

  // 休眠：低速运动持续一段时间后进入睡眠，大幅提升堆叠稳定性与性能
  sleeping = false
  private sleepTime = 0

  /** 每帧缓存的世界系 AABB（广相使用） */
  aabb: AABB

  /** 渲染颜色（hsl 色相） */
  hue = 200

  /** 渲染用的世界系顶点缓存 */
  worldVertices: Vec2[] = []

  constructor(shape: Shape) {
    this.shape = shape
    this.aabb = new AABB()
    this.shape.computeAABB(this.position, this.angle, this.aabb)
  }

  get isDynamic(): boolean {
    return this.type === 'dynamic'
  }

  setType(type: BodyType): this {
    this.type = type
    if (type === 'static') {
      this.invMass = 0
      this.invInertia = 0
      this.velocity.set(0, 0)
      this.angularVelocity = 0
    } else {
      this.updateMassData()
    }
    return this
  }

  /** 根据形状与密度重算质量/惯量（static 刚体质量无穷大） */
  updateMassData(density = 1): void {
    const { mass, inertia } = this.shape.computeMass(density)
    this.mass = mass
    this.inertia = inertia
    if (this.type === 'static') {
      this.invMass = 0
      this.invInertia = 0
    } else {
      this.invMass = mass > 0 ? 1 / mass : 0
      this.invInertia = inertia > 0 ? 1 / inertia : 0
    }
  }

  setPosition(x: number, y: number): this {
    this.position.set(x, y)
    return this
  }

  setAngle(angle: number): this {
    this.angle = angle
    return this
  }

  setVelocity(x: number, y: number): this {
    this.velocity.set(x, y)
    return this
  }

  setAngularVelocity(w: number): this {
    this.angularVelocity = w
    return this
  }

  applyForce(fx: number, fy: number): this {
    if (this.type === 'static' || this.sleeping) return this
    this.force.x += fx
    this.force.y += fy
    return this
  }

  applyForceAtPoint(f: Vec2, worldPoint: Vec2): this {
    if (this.type === 'static' || this.sleeping) return this
    this.force.add(f)
    this.torque += Vec2.sub(worldPoint, this.position).cross(f)
    return this
  }

  applyImpulse(ix: number, iy: number): this {
    if (this.type === 'static' || this.sleeping) return this
    this.velocity.x += this.invMass * ix
    this.velocity.y += this.invMass * iy
    return this
  }

  applyImpulseAtPoint(impulse: Vec2, worldPoint: Vec2): this {
    if (this.type === 'static' || this.sleeping) return this
    this.velocity.addScaled(impulse, this.invMass)
    this.angularVelocity += this.invInertia * Vec2.sub(worldPoint, this.position).cross(impulse)
    return this
  }

  /** 局部向量 → 世界向量 */
  localToWorld(local: Vec2, out = new Vec2()): Vec2 {
    const c = Math.cos(this.angle)
    const s = Math.sin(this.angle)
    out.x = c * local.x - s * local.y + this.position.x
    out.y = s * local.x + c * local.y + this.position.y
    return out
  }

  /** 世界向量 → 局部向量 */
  worldToLocal(world: Vec2, out = new Vec2()): Vec2 {
    const dx = world.x - this.position.x
    const dy = world.y - this.position.y
    const c = Math.cos(this.angle)
    const s = Math.sin(this.angle)
    out.x = c * dx + s * dy
    out.y = -s * dx + c * dy
    return out
  }

  /** 世界系速度（含角速度贡献）：v_p = v + ω × r */
  pointVelocity(worldPoint: Vec2, out = new Vec2()): Vec2 {
    const r = Vec2.sub(worldPoint, this.position)
    out.x = this.velocity.x - this.angularVelocity * r.y
    out.y = this.velocity.y + this.angularVelocity * r.x
    return out
  }

  /** 平移/旋转速度是否低于休眠阈值 */
  get isSlow(): boolean {
    return (
      this.velocity.lengthSq() < 6 * 6 &&
      Math.abs(this.angularVelocity) < 0.25
    )
  }

  get energySq(): number {
    return (
      this.mass * this.velocity.lengthSq() + this.inertia * this.angularVelocity * this.angularVelocity
    )
  }

  /** 每帧末调用：仅累积休眠计时（是否入睡由 World 按岛屿统一判定） */
  updateSleep(dt: number): void {
    if (this.type === 'static') return
    if (this.isSlow) {
      this.sleepTime += dt
    } else {
      this.sleepTime = 0
      this.sleeping = false
    }
  }

  /** 当前已连续低速的时长（World 岛屿休眠判定用） */
  get sleepDuration(): number {
    return this.sleepTime
  }

  /** 由 World 在岛屿休眠判定时调用 */
  goToSleep(): void {
    this.sleeping = true
    this.velocity.set(0, 0)
    this.angularVelocity = 0
  }

  wake(): void {
    this.sleeping = false
    this.sleepTime = 0
  }

  /** 更新缓存的世界系 AABB */
  syncAABB(): void {
    this.shape.computeAABB(this.position, this.angle, this.aabb)
  }

  /** 同步渲染顶点缓存 */
  syncWorldVertices(): void {
    if (this.shape.kind === 'polygon') {
      ;(this.shape as import('./Shape').PolygonShape).computeWorldVertices(
        this.position,
        this.angle,
        this.worldVertices,
      )
    }
  }
}
