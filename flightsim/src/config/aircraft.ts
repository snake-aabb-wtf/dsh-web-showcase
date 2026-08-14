/**
 * 飞机气动/动力/结构参数 —— 以塞斯纳 172（Cessna 172）单发高翼螺旋桨飞机为基准。
 * 全部集中于此，便于统一调参。单位为 SI（米、千克、秒、弧度、瓦）。
 *
 * 参考数据来源：
 *  - Cessna 172S 飞行员操作手册 (POH) 与 FAA Aircraft Flight Manual（尺寸/重量/性能包线）
 *  - NASA 技术报告 C-172 惯性矩常用值：Ixx≈1064、Iyy≈2953、Izz≈3800 kg·m²
 *  - 气动导数量级参考：Etkin & Reid "Dynamics of Flight"、JSBSim Cessna172 模型
 *    （CLα≈0.09/deg、Cmα 负值保证纵向静稳定、Clp/Cmq/Cnr 阻尼导数等）
 */

export interface AircraftConfig {
  // ---------- 质量与惯性 ----------
  mass: number // 总质量 kg（约 1110 kg ≈ 2450 lb，含燃油）
  /** 惯性矩（kg·m²），绕机体轴：x 滚转、y 俯仰、z 偏航（绕重心） */
  inertia: { x: number; y: number; z: number }

  // ---------- 几何 ----------
  wingArea: number // 机翼参考面积 S（m²），C-172 ≈ 16.2 m² (174 ft²)
  wingSpan: number // 翼展 b（m），≈ 11.0 m (36 ft)
  chord: number // 平均气动弦长 c̄（m），≈ 1.5 m
  aspectRatio: number // 展弦比 AR = b²/S ≈ 7.5
  oswald: number // 奥斯瓦尔德效率因子 e ≈ 0.8（典型轻航机 0.7~0.85）

  // ---------- 纵向气动系数（稳定轴系，参考重心） ----------
  CL0: number // 零攻角升力系数（带弯度翼型，C-172 约 0.35）
  CL_alpha: number // 升力线斜率 1/rad（薄翼理论约 2π，实际约 0.09/deg ≈ 5.2/rad）
  CLmax: number // 最大升力系数（失速点），C-172 约 1.6
  CL_post: number // 失速后平台升力系数（大攻角下机翼仍有部分升力）
  CD0: number // 寄生阻力系数（起落架收起、襟翼收上，含机身/机翼/尾翼摩擦与压差阻力）
  CD_gear: number // 起落架放下附加阻力系数
  CD_flap: number[] // 各襟翼档位附加阻力 [收上, 起飞位, 着陆位]
  dCL_flap: number[] // 各襟翼档位升力增量
  dCm_flap: number[] // 各襟翼档位俯仰力矩增量（放襟翼产生低头力矩）
  CD_flat: number // 大攻角/平板阻力系数（失速后阻力上限，参考 Hoerner 平板阻力）
  Cm0: number // 零升俯仰力矩系数（配平基准）
  Cm_alpha: number // 纵向静稳定导数（负值 → 静稳定）
  Cmq: number // 俯仰阻尼导数（负值）
  Cm_alphaDot: number // 攻角变化率阻尼导数（负值，抑制飘摆/短周期振荡）
  Cm_de: number // 升降舵效率（负值：拉杆产生抬头力矩）
  elevatorMax: number // 升降舵最大偏角（rad，约 25°）

  // ---------- 横航向气动系数 ----------
  Cl_beta: number // 上反角效应（β → 滚转），正 β 产生左滚（正值）
  Cl_p: number // 滚转阻尼（负值）
  Cl_r: number // 偏航率诱导滚转（螺旋效应）
  Cl_da: number // 副翼效率（正 δa 右滚）
  aileronMax: number // 副翼最大偏角（rad，约 20°）
  Cn_beta: number // 航向静稳定（风标稳定性，正值）
  Cn_r: number // 偏航阻尼（负值）
  Cn_p: number // 滚转诱导偏航（负值 → 右滚产生左偏航，配合 Cn_da 体现"滚转诱导偏航"）
  Cn_da: number // 副翼反偏航（不利偏航，负值）
  Cn_dr: number // 方向舵效率（负值：右舵产生右偏航力矩……符号约定见 aero.ts）
  rudderMax: number // 方向舵最大偏角（rad，约 25°）
  Cy_beta: number // 侧力导数（负值：正 β 产生负侧力）
  Cy_dr: number // 方向舵侧力效率

  // ---------- 动力 ----------
  enginePower: number // 发动机最大功率（W），160 hp ≈ 119.3 kW
  propEfficiency: number // 螺旋桨效率 η（巡航典型 0.7~0.85）
  staticThrust: number // 静推力上限（N），约 2450 N（550 lbf）
  idleThrustFraction: number // 慢车推力比例
  rpmIdle: number // 慢车转速
  rpmMax: number // 最大转速
  /** 螺旋桨反扭矩作用于机身的比例（右旋桨 → 左滚力矩），体现"油门→滚转耦合" */
  propTorqueK: number
  /** 推力线相对重心的力臂（m），推力线偏高 → 加油门产生低头力矩 */
  thrustArm: number

  // ---------- 起落架（三点式，位置为机体坐标：x 前、y 右、z 下，原点=重心） ----------
  gearNose: { x: number; y: number; z: number } // 前起落架接地点（略在重心前）
  gearMainL: { x: number; y: number; z: number } // 左主起落架
  gearMainR: { x: number; y: number; z: number } // 右主起落架
  gearStiffness: number // 支柱刚度 N/m
  gearDamping: number // 支柱阻尼 N·s/m
  muRoll: number // 滚动摩擦系数（自由滚动）
  muBrake: number // 刹车摩擦系数
  muLateral: number // 轮胎侧向摩擦系数（防侧滑）
  steerK: number // 前轮转向效率（地面滑跑时方向舵输入 → 前轮侧向力比例）
  /** 硬着陆判定阈值（m/s）：下降率超过该值接地 → 判定坠毁（约 690 ft/min） */
  hardLandingSink: number
  /** 离地判定后允许的最大接地下降率（软着陆，用于弹跳阻尼） */
  softLandingSink: number

  // ---------- 气动增强 ----------
  groundEffectK: number // 地面效应升力增益系数
  groundEffectRef: number // 地面效应特征高度（m）
  /** 失速时机头下坠力矩（模拟失速时气动中心前移/尾翼失速导致的 pitch-break） */
  stallBreakCm: number

  // ---------- 操纵面动态 ----------
  elevatorRate: number // 升降舵偏转速率 rad/s
  aileronRate: number // 副翼偏转速率 rad/s
  rudderRate: number // 方向舵偏转速率 rad/s
  throttleRate: number // 油门速率 1/s
}

export const AIRCRAFT: AircraftConfig = {
  mass: 1110,

  inertia: { x: 1064, y: 2953, z: 3800 },

  wingArea: 16.2,
  wingSpan: 11.0,
  chord: 1.5,
  aspectRatio: 7.5,
  oswald: 0.8,

  CL0: 0.4,
  CL_alpha: 5.2,
  CLmax: 1.62,
  CL_post: 0.95,
  CD0: 0.027,
  CD_gear: 0.021,
  CD_flap: [0, 0.02, 0.075],
  dCL_flap: [0, 0.35, 0.62],
  dCm_flap: [0, -0.06, -0.12],
  CD_flat: 1.6,
  Cm0: 0.0,
  Cm_alpha: -0.62,
  Cmq: -16.0,
  Cm_alphaDot: -4.0,
  Cm_de: -0.58,
  elevatorMax: 0.436, // 25°

  Cl_beta: 0.09,
  Cl_p: -0.62,
  Cl_r: 0.08,
  Cl_da: 0.09,
  aileronMax: 0.349, // 20°
  Cn_beta: 0.085,
  Cn_r: -0.14,
  Cn_p: -0.03,
  Cn_da: -0.035,
  Cn_dr: -0.062,
  rudderMax: 0.436, // 25°
  Cy_beta: -0.38,
  Cy_dr: 0.15,

  enginePower: 119300,
  propEfficiency: 0.82,
  staticThrust: 2450,
  idleThrustFraction: 0.03,
  rpmIdle: 650,
  rpmMax: 2700,
  propTorqueK: 0.35,
  thrustArm: 0.12,

  // 三点式起落架几何（静载分配：前轮约 25%、主轮约 75% —— 与 C-172 一致）：
  // 重心在主轮前约 0.32 m、前轮后约 0.95 m（轮距 1.27 m）；接地点在重心下方约 1.05 m。
  gearNose: { x: 0.95, y: 0, z: 1.05 },
  gearMainL: { x: -0.32, y: -1.55, z: 1.05 },
  gearMainR: { x: -0.32, y: 1.55, z: 1.05 },
  gearStiffness: 42000,
  gearDamping: 3600,
  muRoll: 0.025,
  muBrake: 0.5,
  muLateral: 1.0,
  steerK: 0.65,
  hardLandingSink: 3.5,
  softLandingSink: 1.0,

  groundEffectK: 0.22,
  groundEffectRef: 5.0,
  stallBreakCm: 0.05,

  elevatorRate: 1.2,
  aileronRate: 1.6,
  rudderRate: 1.4,
  throttleRate: 0.5,
}

/** 临界攻角（rad）：线性段升力达到 CLmax 的攻角（随襟翼档位降低） */
export function stallAlpha(cfg: AircraftConfig, flapSetting: number): number {
  const dCL = cfg.dCL_flap[flapSetting] ?? 0
  return Math.max(0.05, (cfg.CLmax - cfg.CL0 - dCL) / cfg.CL_alpha)
}

/** 发动机可用推力模型：螺旋桨推力 ≈ η·P/V（功率-推力关系），低速受静推力上限约束 */
export function engineRpm(cfg: AircraftConfig, throttle: number, airspeed: number): number {
  const base = cfg.rpmIdle + throttle * (cfg.rpmMax - cfg.rpmIdle)
  // 定距桨转速随速度变化的简化模型：低速时螺旋桨打滑转速升高
  const slip = 1 + 0.35 * Math.max(0, 1 - airspeed / 45)
  return Math.max(cfg.rpmIdle, Math.min(2900, base * slip))
}
