/**
 * 物理核心类型定义（纯数据，不依赖 three.js，保证物理模块可无头运行与测试）
 */

/** 三维向量（SI 单位：米 / 米每秒 / 弧度每秒） */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** 四元数（顺序与 three.js 一致：x,y,z 虚部，w 实部），表示 body->world 旋转 */
export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

/** 控制灵敏度（设置面板可调，默认 1） */
export interface ControlSensitivity {
  elevator: number
  aileron: number
  rudder: number
}

/**
 * 飞行员输入（一个物理步内采样的原始控制量）。
 * 约定：elevator +1 = 拉杆（抬头），aileron +1 = 右压杆（右滚），rudder +1 = 右舵（机头右偏）。
 */
export interface ControlInput {
  elevator: number
  aileron: number
  rudder: number
  /** 油门增量方向：+1 加油门 / -1 收油门 / 0 保持（由引擎内部按速率积分） */
  throttleDelta: number
  /** 目标油门 0..1（手柄扳机等绝对输入用；定义时优先于 throttleDelta） */
  throttleTarget?: number
  /** 配平增量方向：+1 抬头配平 / -1 低头配平 / 0 保持（引擎按速率积分） */
  trimDelta: number
  /** 刹车（按住有效） */
  brake: boolean
}

/** 襟翼档位：0=收上, 1=起飞位(10°), 2=着陆位(30°) */
export type FlapSetting = 0 | 1 | 2

/** 起落架状态：0=放下, 1=收起（含过渡动画过程） */
export type GearState = 0 | 1

export type CrashReason =
  | 'none'
  | 'hard-landing' // 着陆过重
  | 'terrain' // 撞击地形
  | 'gear-up' // 起落架未放下的接地
  | 'boundary' // 飞出边界

/**
 * 六自由度刚体状态 + 派生的飞行数据。
 * 该对象由物理引擎在每个固定步长内更新，渲染层与仪表层只读。
 */
export interface FlightState {
  /** 世界位置（米，世界坐标系：X 东、Y 上、Z 南；跑道沿 X 轴） */
  position: Vec3
  /** 世界系速度（米/秒） */
  velocity: Vec3
  /** body->world 姿态四元数（机体坐标：x 前、y 右、z 下） */
  quaternion: Quat
  /** 机体角速度（弧度/秒，body 系） */
  angularVelocity: Vec3

  // ---- 以下为每个物理步派生的量（供仪表 / HUD / 相机使用） ----
  /** 真空速 TAS（米/秒） */
  airspeed: number
  /** 指示空速 IAS（米/秒，按海平面密度折算，与空速表一致） */
  ias: number
  /** 攻角（弧度，抬头为正） */
  alpha: number
  /** 侧滑角（弧度，机头右偏于速度矢量为正） */
  beta: number
  /** 俯仰角（弧度，抬头为正） */
  pitch: number
  /** 横滚角（弧度，右翼下沉为正） */
  roll: number
  /** 航向（弧度，北偏东为正；0 = 北） */
  heading: number
  /** 爬升率（米/秒，>0 上升） */
  climbRate: number
  /** 离地高度 AGL（米） */
  altitudeAGL: number
  /** 是否在跑道/地面接触（任一主起落架受力） */
  onGround: boolean
  /** 最近一次接地时的下降率（米/秒，正值表示下降） */
  touchdownSink: number
  /** 是否处于失速状态（攻角接近/超过临界攻角） */
  stall: boolean
  /** 平滑后的油门 0..1 */
  throttle: number
  /** 襟翼档位 */
  flapSetting: FlapSetting
  /** 襟翼过渡 0..1（0=收上，1=全放） */
  flapTransition: number
  /** 起落架目标状态 */
  gearState: GearState
  /** 起落架过渡 0=放下 .. 1=收起 */
  gearTransition: number
  /** 发动机转速（转/分） */
  rpm: number
  /** 刹车是否按下 */
  brake: boolean
  /** 升降舵配平（rad，正值 = 抬头配平） */
  elevatorTrim: number
  /** 是否已坠毁（物理冻结） */
  crashed: boolean
  crashReason: CrashReason
  crashInfo: string
  /** 仿真时间（秒） */
  time: number
  /** 是否接近/超出软边界（HUD 提示） */
  boundaryWarn: boolean
  /** 是否曾离地（用于任务/统计） */
  airborne: boolean
  /** 自出生点沿地面滑跑距离（米） */
  groundRoll: number
}

/** 坠毁事件载荷 */
export interface CrashEvent {
  reason: CrashReason
  message: string
}

/** 接地事件载荷 */
export interface TouchdownEvent {
  /** 接地时下降率（米/秒） */
  sinkRate: number
  /** 是否落在跑道区域内 */
  onRunway: boolean
  /** 是否软着陆（未超限） */
  hard: boolean
}
