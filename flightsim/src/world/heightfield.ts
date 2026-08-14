/**
 * 程序化地形高度场：物理（地面接触/碰撞）与渲染（地形网格）共用的唯一数据源。
 * 使用确定性值噪声（网格点哈希 + 双线性插值）叠加多倍频，生成起伏丘陵；
 * 跑道/滑行道/机坪区域被压平到海拔 0（平滑过渡），保证滑跑与起飞平稳。
 */
import { APRON, RUNWAY, TAXIWAY } from '../config/world'
import { clamp, smoothstep } from '../utils/math'

/** 确定性哈希：整数坐标 → [0,1) 伪随机（用于值噪声网格点） */
function hash2(ix: number, iz: number): number {
  let h = ix * 374761393 + iz * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 100000) / 100000
}

/** 值噪声单倍频（网格大小 cell，双线性插值） */
function valueNoise(x: number, z: number, cell: number): number {
  const gx = Math.floor(x / cell)
  const gz = Math.floor(z / cell)
  const fx = clamp((x / cell - gx), 0, 1)
  const fz = clamp((z / cell - gz), 0, 1)
  const sx = fx * fx * (3 - 2 * fx)
  const sz = fz * fz * (3 - 2 * fz)
  const v00 = hash2(gx, gz)
  const v10 = hash2(gx + 1, gz)
  const v01 = hash2(gx, gz + 1)
  const v11 = hash2(gx + 1, gz + 1)
  const a = v00 + (v10 - v00) * sx
  const b = v01 + (v11 - v01) * sx
  return a + (b - a) * sz // 0..1
}

/** 多倍频地形高度（未压平，米） */
function rawHeight(x: number, z: number): number {
  let h = 0
  let amp = 1
  let wl = 1500
  for (let i = 0; i < 4; i++) {
    h += (valueNoise(x, z, wl) - 0.5) * amp
    amp *= 0.55
    wl *= 0.45
  }
  // 归一化到 ±1 附近再乘幅度
  const n = h / 1.7
  // 轻微东高西低 + 一条山脊线，提供视觉参照
  return n * 42 + Math.sin(x * 0.0009) * 10 + 8
}

/** 跑道/滑行道/机坪压平权重（0..1，外缘平滑过渡） */
function flattenMask(x: number, z: number): number {
  // 跑道矩形
  const rw = smoothstep(RUNWAY.halfWidth + RUNWAY.shoulder + 45, RUNWAY.halfWidth + RUNWAY.shoulder + 8, Math.abs(z))
  const rl = smoothstep(RUNWAY.halfLength + 45, RUNWAY.halfLength + 8, Math.abs(x))
  const runwayMask = Math.max(rw, rl)
  // 滑行道（线段矩形）
  const tx = TAXIWAY.from.x + ((TAXIWAY.to.x - TAXIWAY.from.x) * (z - TAXIWAY.from.z)) / (TAXIWAY.to.z - TAXIWAY.from.z)
  const tInZ = z >= TAXIWAY.from.z - 8 && z <= TAXIWAY.to.z + 8
  const taxiMask = tInZ ? smoothstep(TAXIWAY.halfWidth + 20, TAXIWAY.halfWidth + 5, Math.abs(x - tx)) : 1
  // 机坪
  const ap = Math.max(
    smoothstep(APRON.halfW + 25, APRON.halfW + 6, Math.abs(x - APRON.center.x)),
    smoothstep(APRON.halfH + 25, APRON.halfH + 6, Math.abs(z - APRON.center.z)),
  )
  return Math.min(runwayMask, taxiMask, ap)
}

/** 世界地形高度（米）。物理与渲染共用。 */
export function terrainHeight(x: number, z: number): number {
  const flat = flattenMask(x, z)
  return rawHeight(x, z) * flat
}

/** 地形法线（数值差分，单位向量，Y 向上）。供渲染与车辆朝向使用。 */
export function terrainNormal(x: number, z: number): { x: number; y: number; z: number } {
  const e = 2
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  const n = { x: -hx / (2 * e), y: 1, z: -hz / (2 * e) }
  const l = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z)
  return { x: n.x / l, y: n.y / l, z: n.z / l }
}

/** 是否位于跑道区域内（着陆判定/任务） */
export function isOnRunway(x: number, z: number): boolean {
  return (
    Math.abs(x) <= RUNWAY.halfLength &&
    Math.abs(z) <= RUNWAY.halfWidth + RUNWAY.shoulder
  )
}

/** 是否位于硬边界内 */
export function inWorld(x: number, z: number, radius: number): boolean {
  return Math.hypot(x, z) <= radius
}
