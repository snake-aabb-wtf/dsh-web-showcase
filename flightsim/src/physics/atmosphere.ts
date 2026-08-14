/**
 * 国际标准大气（ISA）简化模型。
 * 密度随海拔的压高公式（指数/幂律），来源：ICAO Standard Atmosphere 与
 * Anderson, "Introduction to Flight" 第 3 章大气模型：
 *   ρ(h) = ρ0 · (1 - L·h/T0)^(g/(R·L) - 1)，h ≤ 11000 m（对流层）
 * 其中 L = 0.0065 K/m 温度直减率，g/(R·L) - 1 ≈ 4.25588。
 */

const RHO0 = 1.225 // 海平面空气密度 kg/m³
const LAPSE = 0.0065
const T0 = 288.15 // 海平面温度 K
const EXPONENT = 4.25588

/** 海拔高度（米）处的空气密度（kg/m³） */
export function airDensity(altitude: number): number {
  const h = Math.max(altitude, -500)
  if (h > 11000) {
    // 对流层顶以上（模拟器极少到达）：等温层近似
    const rhoTrop = RHO0 * Math.pow(1 - (LAPSE * 11000) / T0, EXPONENT)
    return rhoTrop * Math.exp((-9.80665 * (h - 11000)) / (216.65 * 287.05))
  }
  return RHO0 * Math.pow(1 - (LAPSE * h) / T0, EXPONENT)
}

/** 海平面密度（m/s→IAS 换算用） */
export const RHO_SEA_LEVEL = RHO0
