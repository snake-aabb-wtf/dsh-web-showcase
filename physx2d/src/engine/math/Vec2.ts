/**
 * Vec2 — 二维向量。
 * 物理引擎中最基础的数学单元。为避免 GC 压力，采用可变对象 + 方法链风格。
 */
export class Vec2 {
  constructor(
    public x: number = 0,
    public y: number = 0,
  ) {}

  set(x: number, y: number): this {
    this.x = x
    this.y = y
    return this
  }

  copy(v: Vec2): this {
    this.x = v.x
    this.y = v.y
    return this
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y)
  }

  add(v: Vec2): this {
    this.x += v.x
    this.y += v.y
    return this
  }

  sub(v: Vec2): this {
    this.x -= v.x
    this.y -= v.y
    return this
  }

  scale(s: number): this {
    this.x *= s
    this.y *= s
    return this
  }

  /** this += v * s */
  addScaled(v: Vec2, s: number): this {
    this.x += v.x * s
    this.y += v.y * s
    return this
  }

  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y
  }

  /** 二维叉积（返回标量 z 分量） */
  cross(v: Vec2): number {
    return this.x * v.y - this.y * v.x
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y
  }

  length(): number {
    return Math.sqrt(this.lengthSq())
  }

  normalize(): this {
    const len = this.length()
    if (len > 1e-12) this.scale(1 / len)
    else this.set(0, 0)
    return this
  }

  /** 旋转 90°（逆时针） */
  perp(): Vec2 {
    return new Vec2(-this.y, this.x)
  }

  /** 绕原点旋转 angle 弧度 */
  rotate(angle: number): this {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const x = this.x
    this.x = c * x - s * this.y
    this.y = s * x + c * this.y
    return this
  }

  /** 该向量与 v 的夹角（弧度） */
  angleTo(v: Vec2): number {
    return Math.atan2(this.cross(v), this.dot(v))
  }

  // ---------- 静态工具 ----------

  static add(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x + b.x, a.y + b.y)
  }

  static sub(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(a.x - b.x, a.y - b.y)
  }

  static scale(v: Vec2, s: number): Vec2 {
    return new Vec2(v.x * s, v.y * s)
  }

  static dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y
  }

  static cross(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x
  }

  /** 标量叉积：返回向量（等价于 perp(v) * s） */
  static crossScalar(v: Vec2, s: number): Vec2 {
    return new Vec2(s * v.y, -s * v.x)
  }

  static distSq(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return dx * dx + dy * dy
  }

  static dist(a: Vec2, b: Vec2): number {
    return Math.sqrt(Vec2.distSq(a, b))
  }
}

/** 旋转矩阵（2x2），用于把向量从局部系变换到世界系 */
export class Rot {
  /** 角度（弧度） */
  constructor(public angle: number = 0) {}

  /** 世界系 x 轴基向量 */
  get xAxis(): Vec2 {
    return new Vec2(Math.cos(this.angle), Math.sin(this.angle))
  }

  /** 世界系 y 轴基向量 */
  get yAxis(): Vec2 {
    return new Vec2(-Math.sin(this.angle), Math.cos(this.angle))
  }

  /** 局部向量 → 世界向量：v' = R · v */
  rotate(v: Vec2, out = new Vec2()): Vec2 {
    const c = Math.cos(this.angle)
    const s = Math.sin(this.angle)
    out.x = c * v.x - s * v.y
    out.y = s * v.x + c * v.y
    return out
  }

  /** 世界向量 → 局部向量：v' = Rᵀ · v */
  rotateInverse(v: Vec2, out = new Vec2()): Vec2 {
    const c = Math.cos(this.angle)
    const s = Math.sin(this.angle)
    out.x = c * v.x + s * v.y
    out.y = -s * v.x + c * v.y
    return out
  }
}
