/**
 * 数学工具：向量/四元数/角度（纯函数，不依赖 three.js）
 * 姿态约定：
 *   - 机体坐标系：x 前、y 右、z 下（航空惯例）
 *   - 世界坐标系：X 东、Y 上、Z 南（three.js 惯例，y-up）
 *   - 姿态欧拉角（用于构造/提取）：偏航 ψ（绕竖直轴，机头向 +Z 为正）、
 *     俯仰 θ（绕右翼轴抬头为正）、横滚 φ（绕前轴右翼下沉为正）
 */
import type { Quat, Vec3 } from '../types/physics'

export const TAU = Math.PI * 2

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** 指数平滑（一阶低通），lambda 越大跟随越快；帧率无关 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

/** 三次平滑步进（0..1），用于地形过渡带 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** 归一化角度到 (-PI, PI] */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU
  while (a <= -Math.PI) a += TAU
  return a
}

/** 角度差（弧度），结果在 (-PI, PI] */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(a - b)
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function vec3Scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function vec3Len(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

export function vec3Normalize(a: Vec3): Vec3 {
  const l = vec3Len(a)
  return l > 1e-9 ? vec3Scale(a, 1 / l) : vec3(0, 0, 0)
}

/** 绕单位轴旋转向量（罗德里格斯公式） */
export function rotateAboutAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const cross = vec3Cross(axis, v)
  const dot = vec3Dot(axis, v)
  return {
    x: v.x * cos + cross.x * sin + axis.x * dot * (1 - cos),
    y: v.y * cos + cross.y * sin + axis.y * dot * (1 - cos),
    z: v.z * cos + cross.z * sin + axis.z * dot * (1 - cos),
  }
}

// ---------------- 四元数 ----------------

export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 }
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w)
  if (l < 1e-12) return quatIdentity()
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l }
}

/** Hamilton 四元数乘法（q1 ∘ q2，先 q2 后 q1，即先施加 q2 旋转再施加 q1） */
export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w }
}

/** 用四元数旋转向量（q 视为 body->world 时，v 为 body 向量，结果为 world 向量） */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2 * w * (q.xyz × v) + 2 * q.xyz × (q.xyz × v)
  const qx = q.x
  const qy = q.y
  const qz = q.z
  const qw = q.w
  const t = vec3Cross({ x: qx, y: qy, z: qz }, v)
  const t2 = vec3Scale(t, 2)
  const s = vec3Cross({ x: qx, y: qy, z: qz }, t2)
  const u = vec3Scale(t2, qw)
  return { x: v.x + u.x + s.x, y: v.y + u.y + s.y, z: v.z + u.z + s.z }
}

/** 由单位正交基（f 前、r 右、d 下，均为世界坐标）构造四元数（列主序旋转矩阵法） */
export function matrixToQuat(f: Vec3, r: Vec3, d: Vec3): Quat {
  // 旋转矩阵 R = [f r d]（列为基向量）
  const m00 = f.x
  const m01 = r.x
  const m02 = d.x
  const m10 = f.y
  const m11 = r.y
  const m12 = d.y
  const m20 = f.z
  const m21 = r.z
  const m22 = d.z
  const trace = m00 + m11 + m22
  if (trace > 0) {
    let s = Math.sqrt(trace + 1.0)
    const w = s * 0.5
    s = 0.5 / s
    return { x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s, w }
  }
  if (m00 > m11 && m00 > m22) {
    let s = Math.sqrt(1.0 + m00 - m11 - m22)
    const x = s * 0.5
    s = 0.5 / s
    return { x, y: (m01 + m10) * s, z: (m02 + m20) * s, w: (m21 - m12) * s }
  }
  if (m11 > m22) {
    let s = Math.sqrt(1.0 + m11 - m00 - m22)
    const y = s * 0.5
    s = 0.5 / s
    return { x: (m01 + m10) * s, y, z: (m12 + m21) * s, w: (m02 - m20) * s }
  }
  let s = Math.sqrt(1.0 + m22 - m00 - m11)
  const z = s * 0.5
  s = 0.5 / s
  return { x: (m02 + m20) * s, y: (m12 + m21) * s, z, w: (m10 - m01) * s }
}

/**
 * 由欧拉角构造姿态四元数（body->world）。
 * 构造顺序（与提取互为精确逆变换）：
 *   1. 偏航 ψ：所有基向量绕世界 Y 轴旋转 -ψ（机头向 +Z 为正向偏航，见 rotateAboutAxis 右手规则）
 *   2. 俯仰 θ：f、d 绕当前右翼轴 r 旋转 θ（抬头为正）
 *   3. 横滚 φ：r、d 绕当前前轴 f 旋转 φ（右翼下沉为正）
 */
export function eulerToQuat(yaw: number, pitch: number, roll: number): Quat {
  let f: Vec3 = { x: 1, y: 0, z: 0 }
  let r: Vec3 = { x: 0, y: 0, z: 1 }
  let d: Vec3 = { x: 0, y: -1, z: 0 }

  const up: Vec3 = { x: 0, y: 1, z: 0 }
  f = rotateAboutAxis(f, up, -yaw)
  r = rotateAboutAxis(r, up, -yaw)
  d = rotateAboutAxis(d, up, -yaw)

  f = rotateAboutAxis(f, r, pitch)
  d = rotateAboutAxis(d, r, pitch)

  r = rotateAboutAxis(r, f, roll)
  d = rotateAboutAxis(d, f, roll)

  return matrixToQuat(f, r, d)
}

/** 从姿态四元数提取欧拉角（与 eulerToQuat 精确互逆） */
export function quatToEuler(q: Quat): { yaw: number; pitch: number; roll: number } {
  const f = quatRotate(q, { x: 1, y: 0, z: 0 })
  const r = quatRotate(q, { x: 0, y: 1, z: 0 })
  const pitch = Math.asin(clamp(f.y, -1, 1))
  const yaw = Math.atan2(f.z, f.x)
  const roll = Math.asin(clamp(-r.y, -1, 1))
  return { yaw, pitch, roll }
}

/**
 * 四元数运动学导数：q̇ = ½ q ⊗ ω̂，其中 ω̂ = (ωx, ωy, ωz, 0)
 * 推导：刚体姿态四元数与机体角速度的关系（Kuipers, "Quaternions and Rotation Sequences"）
 */
export function quatDerivative(q: Quat, omega: Vec3): Quat {
  return quatMul(q, { x: omega.x * 0.5, y: omega.y * 0.5, z: omega.z * 0.5, w: 0 })
}
