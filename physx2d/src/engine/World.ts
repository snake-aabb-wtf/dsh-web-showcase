import { Vec2 } from './math/Vec2'
import { Body } from './bodies/Body'
import { CircleShape, PolygonShape } from './bodies/Shape'
import { BroadPhase } from './collision/BroadPhase'
import { collide } from './collision/NarrowPhase'
import { Manifold } from './collision/Manifold'
import { ContactSolver } from './dynamics/ContactSolver'
import { Joint, DistanceJoint, MouseJoint } from './dynamics/Joints'

export interface WorldStats {
  bodyCount: number
  dynamicCount: number
  contactCount: number
  pairCount: number
  bucketCount: number
  sleepingCount: number
}

/** 世界设置（可被 UI 实时调节） */
export interface WorldSettings {
  gravity: number
  velocityIterations: number
  positionIterations: number
}

/**
 * 物理世界：管理刚体、关节，并按固定步长推进仿真。
 *
 * 每个时间步的流水线（半隐式欧拉 + 顺序冲量）：
 *   1. 积分外力 → 更新速度（半隐式欧拉的第一步）
 *   2. 广相：空间哈希找出候选对
 *   3. 窄相：SAT/距离检测生成接触流形（热启动）
 *   4. 速度迭代：求解接触 + 关节的速度约束（顺序冲量）
 *   5. 积分速度 → 更新位置
 *   6. 位置迭代：split impulse 修正穿透
 *   7. 休眠检测
 */
export class World {
  gravity = new Vec2(0, 1500)
  settings: WorldSettings = {
    gravity: 1500,
    velocityIterations: 8,
    positionIterations: 3,
  }

  readonly bodies: Body[] = []
  readonly joints: Joint[] = []

  private broadPhase = new BroadPhase()
  private contactSolver = new ContactSolver()
  /** 上一帧的流形（按对 key 索引），用于热启动 */
  private prevManifolds = new Map<string, Manifold>()
  /** 当前帧流形（渲染调试用） */
  manifolds: Manifold[] = []

  stats: WorldStats = {
    bodyCount: 0,
    dynamicCount: 0,
    contactCount: 0,
    pairCount: 0,
    bucketCount: 0,
    sleepingCount: 0,
  }


  // 临时缓冲（避免每帧分配）
  private tempVec = new Vec2()
  private tempVec2 = new Vec2()

  /** 固定步长（秒）。越大越不稳定，越小越慢。 */
  fixedDt = 1 / 120
  /** 时间倍率（0.1 ~ 3） */
  timeScale = 1

  private accumTime = 0

  addBody(body: Body): Body {
    body.updateMassData(1)
    body.syncAABB()
    this.bodies.push(body)
    return body
  }

  removeBody(body: Body): void {
    const i = this.bodies.indexOf(body)
    if (i >= 0) this.bodies.splice(i, 1)
    // 移除相关关节
    for (let j = this.joints.length - 1; j >= 0; j--) {
      const joint = this.joints[j]
      if (joint instanceof DistanceJoint && (joint.bodyA === body || joint.bodyB === body)) {
        this.joints.splice(j, 1)
      }
    }
  }

  addJoint(joint: Joint): Joint {
    this.joints.push(joint)
    return joint
  }

  removeJoint(joint: Joint): void {
    const i = this.joints.indexOf(joint)
    if (i >= 0) this.joints.splice(i, 1)
  }

  clear(): void {
    this.bodies.length = 0
    this.joints.length = 0
    this.prevManifolds.clear()
  }

  /** 推进仿真。调用方应保证 dt 为固定步长（累加器模式）。 */
  step(dt: number): void {
    this.settings.gravity = this.gravity.y
    // 力型关节（鼠标弹簧）先于力积分施加
    for (const joint of this.joints) {
      if (joint instanceof MouseJoint) joint.applySpringForce()
    }
    this.integrateForces(dt)

    // ---- 广相 ----
    for (const body of this.bodies) body.syncAABB()
    this.broadPhase.rebuild(this.bodies)
    const pairs = this.broadPhase.generatePairs(this.bodies)

    // ---- 窄相 ----
    this.prevManifolds.clear()
    for (const m of this.manifolds) {
      this.prevManifolds.set(`${Math.min(m.bodyA.id, m.bodyB.id)}|${Math.max(m.bodyA.id, m.bodyB.id)}`, m)
    }
    const manifolds: Manifold[] = []
    for (const { a, b } of pairs) {
      const m = collide(a, b)
      if (m) {
        manifolds.push(m)
        // 唤醒规则：接触点闭合速度足够大时，唤醒沉睡中的刚体
        // （静止接触的闭合速度 ≈ 0，不会误唤醒，避免"触碰即醒"的连锁反应）
        if (a.sleeping || b.sleeping) {
          const vn = this.closingVelocity(m)
          if (vn > 25) {
            a.wake()
            b.wake()
          }
        }
      }
    }
    this.manifolds = manifolds

    // ---- 求解 ----
    this.contactSolver.prepare(manifolds, this.prevManifolds)

    for (const joint of this.joints) joint.prepare(dt)

    for (let i = 0; i < this.settings.velocityIterations; i++) {
      this.contactSolver.solveVelocity()
      for (const joint of this.joints) joint.solveVelocity()
    }

    // ---- 积分位置 ----
    for (const body of this.bodies) {
      if (!body.isDynamic || body.sleeping) continue
      body.position.addScaled(body.velocity, dt)
      body.angle += body.angularVelocity * dt
    }

    for (let i = 0; i < this.settings.positionIterations; i++) {
      this.contactSolver.solvePosition()
      for (const joint of this.joints) joint.solvePosition()
    }

    // ---- 休眠（岛屿级）：通过接触/关节连通的刚体组成一个岛屿，
    // 只有当岛屿内所有成员都低速运动足够久时，整岛同时入睡。
    // 这保证了堆叠不会出现"一个入睡 → 被邻居触碰唤醒"的振荡。----
    for (const body of this.bodies) body.updateSleep(dt)
    this.sleepIslands()

    // ---- 统计 ----
    let dynamicCount = 0
    let sleepingCount = 0
    for (const body of this.bodies) {
      if (body.isDynamic) {
        dynamicCount++
        if (body.sleeping) sleepingCount++
      }
    }
    this.stats = {
      bodyCount: this.bodies.length,
      dynamicCount,
      contactCount: manifolds.length,
      pairCount: pairs.length,
      bucketCount: this.broadPhase.bucketCount,
      sleepingCount,
    }
  }

  /** 接触点的法向闭合速度（>0 表示正在靠近） */
  private closingVelocity(m: Manifold): number {
    const p = m.points[0]
    if (!p) return 0
    const a = m.bodyA
    const b = m.bodyB
    const dv = b.pointVelocity(p.position, this.tempVec2)
    dv.sub(a.pointVelocity(p.position, this.tempVec))
    // 法线从 A 指向 B：B 向 A 靠近时 dv·n < 0
    return -dv.dot(m.normal)
  }

  /** 岛屿休眠判定：union-find 连通分量 → 全员低速 → 整岛入睡 */
  private sleepIslands(): void {
    const parent = new Map<number, number>()
    const find = (id: number): number => {
      let p = parent.get(id) ?? id
      while (parent.has(p)) p = parent.get(p) as number
      // 路径压缩（仅当不是根节点时，避免写入自环导致死循环）
      if (p !== id) parent.set(id, p)
      return p
    }
    const union = (x: number, y: number): void => {
      const rx = find(x)
      const ry = find(y)
      if (rx !== ry) parent.set(rx, ry)
    }

    for (const m of this.manifolds) {
      union(m.bodyA.id, m.bodyB.id)
    }
    for (const j of this.joints) {
      if (j instanceof DistanceJoint) union(j.bodyA.id, j.bodyB.id)
    }

    // 按岛屿分组
    const islands = new Map<number, Body[]>()
    for (const body of this.bodies) {
      if (!body.isDynamic) continue
      const root = find(body.id)
      let group = islands.get(root)
      if (!group) {
        group = []
        islands.set(root, group)
      }
      group.push(body)
    }

    for (const group of islands.values()) {
      if (group.length === 0) continue
      let allSlow = true
      for (const b of group) {
        if (!b.isSlow || b.sleepDuration < 0.4) {
          allSlow = false
          break
        }
      }
      if (allSlow) {
        for (const b of group) b.goToSleep()
      }
    }
  }

  /** 外力积分（半隐式欧拉第一步）：v += (g + F/m)·dt，然后施加阻尼 */
  private integrateForces(dt: number): void {
    const gx = this.gravity.x
    const gy = this.gravity.y
    for (const body of this.bodies) {
      if (!body.isDynamic || body.sleeping) continue

      body.velocity.x += dt * (gx + body.force.x * body.invMass)
      body.velocity.y += dt * (gy + body.force.y * body.invMass)
      body.angularVelocity += dt * body.torque * body.invInertia

      // 阻尼（Box2D 风格：v /= 1 + dt·damping）
      const ld = 1 / (1 + dt * body.linearDamping)
      const ad = 1 / (1 + dt * body.angularDamping)
      body.velocity.scale(ld)
      body.angularVelocity *= ad

      body.force.set(0, 0)
      body.torque = 0
    }
  }

  /** 由累积时间驱动的步进入口：处理任意帧间隔（固定步长 + 累加器） */
  advance(frameDt: number): boolean {
    if (this.timeScale <= 0) return false
    this.accumTime += frameDt * this.timeScale
    const dt = this.fixedDt
    const maxSteps = 8 // 防止丢帧后螺旋死亡
    let steps = 0
    while (this.accumTime >= dt && steps < maxSteps) {
      this.step(dt)
      this.accumTime -= dt
      steps++
    }
    if (steps === maxSteps) this.accumTime = 0
    return steps > 0
  }

  // ---------------------------------------------------------------- 查询

  /** 拾取：返回包含该世界点的最上层动态刚体 */
  pickBody(worldPoint: Vec2): Body | null {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const body = this.bodies[i]
      if (!body.isDynamic) continue
      if (this.containsPoint(body, worldPoint)) return body
    }
    return null
  }

  containsPoint(body: Body, p: Vec2): boolean {
    if (body.shape.kind === 'circle') {
      const c = body.shape as CircleShape
      return Vec2.distSq(p, body.position) <= c.radius * c.radius
    }
    const poly = body.shape as PolygonShape
    const local = body.worldToLocal(p, this.tempVec)
    for (let i = 0; i < poly.count; i++) {
      // 点在每条边法线的内侧（负侧）
      this.tempVec2.copy(local).sub(poly.vertices[i])
      if (Vec2.dot(poly.normals[i], this.tempVec2) > 0) {
        return false
      }
    }
    return true
  }

  /** 创建鼠标关节（拖动刚体）。maxForce 按质量缩放，保证任何大小的刚体都能被拖走。 */
  createMouseJoint(body: Body, worldPoint: Vec2): MouseJoint {
    body.wake()
    const joint = new MouseJoint(body, worldPoint)
    joint.maxForce = Math.max(body.mass * 60000, 2e6)
    this.addJoint(joint)
    return joint
  }

  destroyMouseJoint(joint: MouseJoint): void {
    this.removeJoint(joint)
  }

  /** 在世界中任意位置生成一个随机刚体（用于"生成模式"） */
  spawnRandomBody(x: number, y: number, maxRadius = 26): Body {
    const roll = Math.random()
    let body: Body
    if (roll < 0.45) {
      const r = 8 + Math.random() * (maxRadius - 8)
      body = new Body(new CircleShape(r))
    } else if (roll < 0.8) {
      const hx = 8 + Math.random() * 22
      const hy = 8 + Math.random() * 22
      body = new Body(PolygonShape.box(hx, hy))
    } else {
      const sides = 3 + Math.floor(Math.random() * 4)
      body = new Body(PolygonShape.regularPolygon(sides, 10 + Math.random() * 16))
    }
    body
      .setPosition(x, y)
      .setAngle(Math.random() * Math.PI)
    body.restitution = 0.1 + Math.random() * 0.3
    body.friction = 0.4 + Math.random() * 0.4
    body.hue = Math.floor(Math.random() * 360)
    this.addBody(body)
    return body
  }
}
