import type { Body } from '../engine/bodies/Body'
import type { World } from '../engine/World'
import { Vec2 } from '../engine/math/Vec2'
import { DistanceJoint, MouseJoint } from '../engine/dynamics/Joints'

export interface DebugFlags {
  aabb: boolean
  contacts: boolean
  normals: boolean
  velocities: boolean
  joints: boolean
}

const DEFAULT_FLAGS: DebugFlags = {
  aabb: false,
  contacts: false,
  normals: false,
  velocities: false,
  joints: true,
}

/** 生成稳定的按色相区分的颜色 */
function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`
}

/**
 * 渲染器：Canvas 2D 绘制 + 相机（平移/缩放）。
 * 物理世界坐标系：y 轴向下，原点在屏幕中心附近。
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D
  width = 0
  height = 0

  /** 相机：缩放（px / world 单位）与偏移（世界坐标 → 屏幕坐标） */
  zoom = 1.6
  offset = new Vec2(0, 0)

  debug: DebugFlags = { ...DEFAULT_FLAGS }

  /** 鼠标世界坐标（渲染鼠标关节用） */
  mouseWorld = new Vec2()
  mouseJoint: MouseJoint | null = null

  private bgGradient: CanvasGradient | null = null
  private dpr = 1

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.round(rect.width * this.dpr)
    this.canvas.height = Math.round(rect.height * this.dpr)
    this.bgGradient = null
  }

  // ------------------------------------------------------------ 坐标转换

  worldToScreen(p: Vec2, out = new Vec2()): Vec2 {
    out.x = (p.x - this.offset.x) * this.zoom + this.width / 2
    out.y = (p.y - this.offset.y) * this.zoom + this.height / 2
    return out
  }

  screenToWorld(sx: number, sy: number, out = new Vec2()): Vec2 {
    out.x = (sx - this.width / 2) / this.zoom + this.offset.x
    out.y = (sy - this.height / 2) / this.zoom + this.offset.y
    return out
  }

  /** 围绕屏幕点缩放（鼠标滚轮） */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy)
    this.zoom = Math.max(0.2, Math.min(8, this.zoom * factor))
    // 保持鼠标下的世界点不动
    const after = this.screenToWorld(sx, sy)
    this.offset.add(Vec2.sub(before, after))
  }

  panBy(dxPx: number, dyPx: number): void {
    this.offset.x -= dxPx / this.zoom
    this.offset.y -= dyPx / this.zoom
  }

  /** 让世界中的某区域适配到屏幕 */
  focusOn(minX: number, minY: number, maxX: number, maxY: number): void {
    const w = maxX - minX
    const h = maxY - minY
    if (w <= 0 || h <= 0) return
    this.zoom = Math.min(this.width / w, this.height / h) * 0.9
    this.offset.set((minX + maxX) / 2, (minY + maxY) / 2)
  }

  // ------------------------------------------------------------ 绘制

  render(world: World): void {
    const ctx = this.ctx
    const dpr = this.dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    this.drawBackground()

    // 关节（在刚体下面画线）
    if (this.debug.joints) {
      for (const joint of world.joints) {
        if (joint instanceof DistanceJoint) {
          this.drawDistanceJoint(joint)
        }
      }
    }

    for (const body of world.bodies) {
      this.drawBody(body)
    }

    // 鼠标关节
    if (this.mouseJoint) {
      this.drawMouseJoint()
    }

    if (this.debug.aabb) {
      ctx.strokeStyle = 'rgba(120, 220, 120, 0.5)'
      ctx.lineWidth = 1 / this.zoom
      for (const body of world.bodies) {
        const a = body.aabb
        const s = this.worldToScreen(new Vec2(a.lower.x, a.lower.y))
        const e = this.worldToScreen(new Vec2(a.upper.x, a.upper.y))
        ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y)
      }
    }

    if (this.debug.contacts || this.debug.normals) {
      for (const m of world.manifolds) {
        const n = this.worldToScreen(m.normal, new Vec2())
        for (const p of m.points) {
          const s = this.worldToScreen(p.position)
          if (this.debug.contacts) {
            ctx.beginPath()
            ctx.arc(s.x, s.y, 4, 0, Math.PI * 2)
            ctx.fillStyle = '#ff5d5d'
            ctx.fill()
          }
          if (this.debug.normals) {
            ctx.beginPath()
            ctx.moveTo(s.x, s.y)
            ctx.lineTo(s.x + n.x * 22, s.y + n.y * 22)
            ctx.strokeStyle = '#ffd166'
            ctx.lineWidth = 2
            ctx.stroke()
          }
        }
      }
    }

    if (this.debug.velocities) {
      for (const body of world.bodies) {
        if (!body.isDynamic || body.sleeping) continue
        const s = this.worldToScreen(body.position)
        const vx = body.velocity.x * 0.05
        const vy = body.velocity.y * 0.05
        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(s.x + vx, s.y + vy)
        ctx.strokeStyle = 'rgba(90, 170, 255, 0.8)'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }

  private drawBackground(): void {
    const ctx = this.ctx
    if (!this.bgGradient) {
      this.bgGradient = ctx.createLinearGradient(0, 0, 0, this.height)
      this.bgGradient.addColorStop(0, '#10141d')
      this.bgGradient.addColorStop(1, '#0a0d13')
    }
    ctx.fillStyle = this.bgGradient
    ctx.fillRect(0, 0, this.width, this.height)

    // 网格（世界坐标对齐，随相机滚动）
    const gridSize = 64
    const start = this.screenToWorld(0, 0)
    const end = this.screenToWorld(this.width, this.height)
    const gx0 = Math.floor(start.x / gridSize) * gridSize
    const gy0 = Math.floor(start.y / gridSize) * gridSize

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = gx0; x <= end.x + gridSize; x += gridSize) {
      const s = this.worldToScreen(new Vec2(x, 0))
      ctx.moveTo(s.x, 0)
      ctx.lineTo(s.x, this.height)
    }
    for (let y = gy0; y <= end.y + gridSize; y += gridSize) {
      const s = this.worldToScreen(new Vec2(0, y))
      ctx.moveTo(0, s.y)
      ctx.lineTo(this.width, s.y)
    }
    ctx.stroke()
  }

  private drawBody(body: Body): void {
    const ctx = this.ctx
    const s = this.worldToScreen(body.position)

    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.rotate(body.angle)

    const sleeping = body.sleeping
    const staticBody = body.type === 'static'

    if (body.shape.kind === 'circle') {
      const r = (body.shape as import('../engine/bodies/Shape').CircleShape).radius * this.zoom
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = staticBody
        ? '#3a4152'
        : hsl(body.hue, 55, sleeping ? 22 : 45, 0.95)
      ctx.fill()
      ctx.strokeStyle = staticBody ? '#4a5266' : hsl(body.hue, 65, 62, 0.9)
      ctx.lineWidth = 1.5
      ctx.stroke()
    } else {
      // 已 translate 到质心，直接用局部顶点
      const poly = body.shape as import('../engine/bodies/Shape').PolygonShape
      ctx.beginPath()
      for (let i = 0; i < poly.count; i++) {
        const v = poly.vertices[i]
        const px = v.x * this.zoom
        const py = v.y * this.zoom
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.fillStyle = staticBody
        ? '#3a4152'
        : hsl(body.hue, staticBody ? 0 : 55, sleeping ? 22 : 45, 0.95)
      ctx.fill()
      ctx.strokeStyle = staticBody ? '#4a5266' : hsl(body.hue, 65, 62, 0.9)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // 朝向指示线（从质心指向局部 +x 方向）
    ctx.beginPath()
    ctx.moveTo(0, 0)
    const len = body.shape.kind === 'circle'
      ? (body.shape as import('../engine/bodies/Shape').CircleShape).radius * 0.85 * this.zoom
      : 12 * this.zoom
    ctx.lineTo(len, 0)
    ctx.strokeStyle = staticBody ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.restore()
  }

  private drawDistanceJoint(joint: DistanceJoint): void {
    const ctx = this.ctx
    const a = joint.bodyA.localToWorld(joint.anchorLocalA)
    const b = joint.bodyB.localToWorld(joint.anchorLocalB)
    const sA = this.worldToScreen(a)
    const sB = this.worldToScreen(b)
    ctx.beginPath()
    ctx.moveTo(sA.x, sA.y)
    ctx.lineTo(sB.x, sB.y)
    ctx.strokeStyle = 'rgba(255, 190, 90, 0.75)'
    ctx.lineWidth = 2
    ctx.stroke()
    for (const p of [sA, sB]) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffbe5a'
      ctx.fill()
    }
  }

  private drawMouseJoint(): void {
    if (!this.mouseJoint) return
    const ctx = this.ctx
    const anchor = this.mouseJoint.body.localToWorld(this.mouseJoint.anchorLocal)
    const sA = this.worldToScreen(anchor)
    const sT = this.worldToScreen(this.mouseWorld)
    ctx.beginPath()
    ctx.moveTo(sA.x, sA.y)
    ctx.lineTo(sT.x, sT.y)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.setLineDash([6, 5])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(sT.x, sT.y, 8, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}
