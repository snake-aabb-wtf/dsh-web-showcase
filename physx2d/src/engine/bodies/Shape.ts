import { Vec2, Rot } from '../math/Vec2'
import type { AABB } from '../collision/AABB'

/**
 * 形状基类。
 * 所有几何都定义在**局部坐标系**中，通过刚体的 position/angle 变换到世界系。
 */
export abstract class Shape {
  abstract readonly kind: 'circle' | 'polygon'

  /** 计算世界系 AABB（由刚体状态变换） */
  abstract computeAABB(position: Vec2, angle: number, out: AABB): void

  /** 密度已知时计算质量与转动惯量（局部系、质心在原点） */
  abstract computeMass(density: number): { mass: number; inertia: number }
}

/** 圆形形状 */
export class CircleShape extends Shape {
  readonly kind = 'circle' as const

  constructor(public radius: number) {
    super()
  }

  computeAABB(position: Vec2, _angle: number, out: AABB): void {
    out.set(
      position.x - this.radius,
      position.y - this.radius,
      position.x + this.radius,
      position.y + this.radius,
    )
  }

  computeMass(density: number): { mass: number; inertia: number } {
    const mass = density * Math.PI * this.radius * this.radius
    // 圆盘绕质心：I = ½ m r²
    const inertia = 0.5 * mass * this.radius * this.radius
    return { mass, inertia }
  }
}

/**
 * 凸多边形形状。
 * 顶点按**逆时针**顺序排列，顶点与质心间的连线不得穿越边界（简单多边形）。
 */
export class PolygonShape extends Shape {
  readonly kind = 'polygon' as const

  /** 局部系顶点（逆时针） */
  vertices: Vec2[] = []
  /** 每条边的外法线（局部系，已归一化） */
  normals: Vec2[] = []

  /** 由一组顶点构造（自动计算质心并平移，使质心落在原点） */
  static fromVertices(pts: Vec2[]): PolygonShape {
    const shape = new PolygonShape()
    shape.setVertices(pts)
    return shape
  }

  /** 生成矩形（hx, hy 为半宽高） */
  static box(hx: number, hy: number): PolygonShape {
    return PolygonShape.fromVertices([
      new Vec2(-hx, -hy),
      new Vec2(hx, -hy),
      new Vec2(hx, hy),
      new Vec2(-hx, hy),
    ])
  }

  /** 生成正多边形（近似圆，用于演示 SAT 多边形碰撞） */
  static regularPolygon(sides: number, radius: number): PolygonShape {
    const pts: Vec2[] = []
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2
      pts.push(new Vec2(Math.cos(a) * radius, Math.sin(a) * radius))
    }
    return PolygonShape.fromVertices(pts)
  }

  setVertices(pts: Vec2[]): void {
    // 1) 计算质心（多边形面积加权平均）
    let area = 0
    let cx = 0
    let cy = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[(i + 1) % pts.length]
      const cross = p.x * q.y - p.y * q.x // 有符号二倍面积
      area += cross
      cx += (p.x + q.x) * cross
      cy += (p.y + q.y) * cross
    }
    area *= 0.5
    if (Math.abs(area) < 1e-9) throw new Error('Polygon has (near) zero area')
    const sign = area > 0 ? 1 : -1
    cx = (cx / (6 * area)) * sign
    cy = (cy / (6 * area)) * sign

    // 2) 平移到质心，保证逆时针
    this.vertices = pts.map((p) => new Vec2((p.x - cx) * sign, (p.y - cy) * sign))
    // 3) 计算每条边的外法线
    this.normals = this.vertices.map((_, i) => {
      const a = this.vertices[i]
      const b = this.vertices[(i + 1) % this.vertices.length]
      const edge = Vec2.sub(b, a)
      // 逆时针多边形，外法线 = 边向量的右旋（-y, x）方向
      return new Vec2(edge.y, -edge.x).normalize()
    })
  }

  /** 顶点数 */
  get count(): number {
    return this.vertices.length
  }

  computeAABB(position: Vec2, angle: number, out: AABB): void {
    const rot = new Rot(angle)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const world = new Vec2()
    for (const v of this.vertices) {
      rot.rotate(v, world).add(position)
      if (world.x < minX) minX = world.x
      if (world.y < minY) minY = world.y
      if (world.x > maxX) maxX = world.x
      if (world.y > maxY) maxY = world.y
    }
    out.set(minX, minY, maxX, maxY)
  }

  computeMass(density: number): { mass: number; inertia: number } {
    // 质心在原点时，多边形面积 = Σ cross / 2
    let area = 0
    let inertia = 0
    for (let i = 0; i < this.vertices.length; i++) {
      const p = this.vertices[i]
      const q = this.vertices[(i + 1) % this.vertices.length]
      const cross = Math.abs(p.cross(q))
      area += cross
      // 三角形（原点, p, q）绕原点的转动惯量：I = m/6 · (|p|² + |q|² + p·q)
      inertia += cross * (p.lengthSq() + q.lengthSq() + p.dot(q))
    }
    area *= 0.5
    const mass = density * area
    inertia = (density * inertia) / 12
    return { mass, inertia }
  }

  /** 世界系顶点（渲染 / 裁剪用，避免每帧重复分配可传入 out 数组） */
  computeWorldVertices(position: Vec2, angle: number, out: Vec2[]): Vec2[] {
    const rot = new Rot(angle)
    for (let i = 0; i < this.vertices.length; i++) {
      const w = out[i] ?? new Vec2()
      rot.rotate(this.vertices[i], w).add(position)
      out[i] = w
    }
    out.length = this.vertices.length
    return out
  }
}
