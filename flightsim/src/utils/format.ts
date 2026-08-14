/** 单位换算与显示格式化（仪表 / HUD 共用） */

export const KNOTS_PER_MS = 1.943844492 // 1 m/s = 1.9438 kt
export const FEET_PER_M = 3.280839895 // 1 m = 3.2808 ft
export const FPM_PER_MS = 196.850394 // 1 m/s = 196.85 ft/min

export function msToKnots(v: number): number {
  return v * KNOTS_PER_MS
}

export function msToFpm(v: number): number {
  return v * FPM_PER_MS
}

export function mToFeet(v: number): number {
  return v * FEET_PER_M
}

/** 角度(弧度) -> 罗盘航向度数 0..360 */
export function headingDeg(headingRad: number): number {
  return (headingRad * 180) / Math.PI
}

export function fmt1(v: number): string {
  return v.toFixed(1)
}

export function fmt0(v: number): string {
  return Math.round(v).toString()
}
