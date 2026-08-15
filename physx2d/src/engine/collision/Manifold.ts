import type { Body } from '../bodies/Body'
import { Vec2 } from '../math/Vec2'

/** 单个接触点（最多两个点构成一条接触流形） */
export interface ContactPoint {
  /** 世界系接触点位置 */
  position: Vec2
  /** 穿透深度（≥ 0） */
  penetration: number
  /** 累积的法向冲量（热启动/求解用） */
  normalImpulse: number
  /** 累积的切向冲量（摩擦） */
  tangentImpulse: number
  /** 稳定标识：用于跨帧匹配接触点做热启动 */
  id: string
}

/**
 * 接触流形（Manifold）：一对刚体之间碰撞结果的描述。
 * 法线 + 1~2 个接触点，交给求解器。
 */
export class Manifold {
  bodyA: Body
  bodyB: Body
  /** 单位法线：从 A 指向 B */
  normal = new Vec2()
  /** 切向（摩擦方向） */
  tangent = new Vec2()
  points: ContactPoint[] = []

  constructor(a: Body, b: Body) {
    this.bodyA = a
    this.bodyB = b
  }

  get count(): number {
    return this.points.length
  }

  /** 重置为单点接触 */
  resetSinglePoint(): void {
    if (this.points.length > 1) this.points.length = 1
  }

  /**
   * 根据上一帧的流形恢复冲量（热启动）。
   * 通过 id 匹配接触点：id 由碰撞特征（顶点索引等）派生，帧间稳定。
   */
  warmStart(prev: Manifold | undefined): void {
    if (!prev) {
      for (const p of this.points) {
        p.normalImpulse = 0
        p.tangentImpulse = 0
      }
      return
    }
    for (const p of this.points) {
      p.normalImpulse = 0
      p.tangentImpulse = 0
      for (const q of prev.points) {
        if (p.id === q.id) {
          p.normalImpulse = q.normalImpulse
          p.tangentImpulse = q.tangentImpulse
          break
        }
      }
    }
  }
}
