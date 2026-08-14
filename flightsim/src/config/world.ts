/**
 * 世界配置：地形、跑道/滑行道/机坪布局、出生点、边界、天气与画质档位。
 * 世界坐标系：X 东、Y 上、Z 南。跑道沿 X 轴（09/27 方向），中心线位于 Z=0。
 */
import type { Vec3 } from '../types/physics'

/** 跑道（沿 X 轴） */
export const RUNWAY = {
  center: { x: 0, z: 0 } as const,
  halfLength: 1050, // 跑道长 2100 m
  halfWidth: 15, // 跑道宽 30 m
  shoulder: 6, // 道肩
}

/** 滑行道：从跑道东端(1050,0)向北(南向 Z 增)连到机坪 */
export const TAXIWAY = {
  from: { x: 1050, z: 0 } as const,
  to: { x: 1080, z: 360 } as const,
  halfWidth: 10,
}

/** 停机坪 */
export const APRON = {
  center: { x: 1090, z: 380 } as const,
  halfW: 70,
  halfH: 55,
}

/** 出生点：跑道西端，机头朝东（+X） */
export const SPAWN: { position: Vec3; yaw: number } = {
  position: { x: -700, y: 0, z: 0 },
  yaw: 0, // 机头朝 +X（东），对应罗盘航向 90°
}

/** 世界边界（硬边界，超出判定坠毁）与软边界（HUD 警告） */
export const WORLD_RADIUS = 4800
export const WARN_RADIUS = 4200

/** 地形范围（边长，米）与网格分辨率（受画质影响） */
export const TERRAIN_SIZE = 11000
export const TERRAIN_SEGMENTS = { high: 300, low: 220 } as const

/** 地形起伏幅度（米） */
export const TERRAIN_AMPLITUDE = 42

/** 太阳方向（世界单位向量，指向太阳） */
export const SUN_DIR: Vec3 = { x: 0.42, y: 0.62, z: -0.32 }

/** 雾（大气透视） */
export const FOG = {
  color: '#c9d6e2',
  near: 1400,
  far: 5400,
}

/** 云 */
export const CLOUDS = {
  count: { high: 150, low: 70 } as const,
  minAlt: 450,
  maxAlt: 1150,
  minRadius: 900,
  maxRadius: 4300,
  scaleMin: 34,
  scaleMax: 95,
}

/** 树木数量与分布 */
export const TREES = {
  count: { high: 420, low: 200 } as const,
  maxRadius: 4200,
  minAlt: -12,
  maxAlt: 52,
}

/** 画质档位 */
export type Quality = 'high' | 'low'
