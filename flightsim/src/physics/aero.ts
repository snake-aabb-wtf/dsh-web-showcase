/**
 * 气动力与力矩模型（手写气动方程，稳定导数量纲模型）。
 *
 * 力与力矩以机体坐标系（x 前、y 右、z 下）给出，量纲气动表达式：
 *   L = q̄·S·CL ， q̄ = ½ρV² 为动压
 *   D = q̄·S·CD
 *   Y = q̄·S·CY
 *   M(滚转/俯仰/偏航) = q̄·S·b(或 c̄)·C(对应系数)
 *
 * 升力模型：线性段 CL = CL0 + CLα·α + ΔCLflap；超过临界攻角后失速骤降
 * （CLmax → CL_post 平台 → 大攻角向平板 0 收敛），并附加失速阻力增量。
 * 阻力模型：寄生阻力 + 诱导阻力（CD = CD0 + CL²/(π·e·AR)，来源：
 * 诱导阻力理论，见 Anderson "Fundamentals of Aerodynamics" 5.3 节）。
 * 力矩模型：稳定导数量纲（Cmα 纵向静稳定、Clp/Cmq/Cnr 阻尼、
 * Clβ/Cnβ 横航向静稳定、Cnδa 不利偏航体现"滚转诱导偏航"、
 * Cn_p 滚转-偏航耦合），参考 Etkin & Reid "Dynamics of Flight"。
 *
 * 符号约定：α 抬头为正；β 为机头右偏于速度矢量的侧滑角（正 β 时
 * 相对气流来自左侧 → 负侧力 Cyβ<0，风标稳定 Cnβ>0）。
 */
import type { AircraftConfig } from '../config/aircraft'
import { stallAlpha } from '../config/aircraft'
import { clamp, lerp, smoothstep } from '../utils/math'

/** 翼身组合（含襟翼）升力系数：线性 + 失速骤降 + 大攻角退化 */
export function clTotal(
  alpha: number,
  flapSetting: number,
  cfg: AircraftConfig,
): number {
  const aS = stallAlpha(cfg, flapSetting)
  const a = Math.abs(alpha)
  const sign = Math.sign(alpha)
  const dCL = cfg.dCL_flap[flapSetting] ?? 0

  // 线性段（含负攻角对称性，直接给出有符号值）
  if (a <= aS) {
    return cfg.CL0 + cfg.CL_alpha * alpha + dCL
  }
  // 失速过渡带（约 0.1 rad ≈ 5.7° 内骤降）
  const aDrop = aS + 0.1
  if (a < aDrop) {
    return sign * lerp(cfg.CLmax, cfg.CL_post, (a - aS) / 0.1)
  }
  // 失速平台 → 大攻角升力衰减（34° 后向 90° 时约 0.25 收敛，避免深失速升力虚高导致翻滚过猛）
  if (a < Math.PI / 2) {
    const decay = 1 - (1 - 0.25 / cfg.CL_post) * smoothstep(0.6, Math.PI / 2, a)
    return sign * cfg.CL_post * decay
  }
  // 大攻角（>90°）向平板零升力平滑收敛：CL = CL_post·½(1+cos(a−π/2))
  return sign * cfg.CL_post * 0.5 * (1 + Math.cos(a - Math.PI / 2))
}

/** 总阻力系数：寄生 + 诱导 + 襟翼/起落架增量 + 失速附加阻力 */
export function cdTotal(
  alpha: number,
  clLinear: number,
  flapSetting: number,
  gearDown: boolean,
  cfg: AircraftConfig,
): number {
  const k = 1 / (Math.PI * cfg.oswald * cfg.aspectRatio)
  const induced = k * clLinear * clLinear
  const flap = cfg.CD_flap[flapSetting] ?? 0
  const gear = gearDown ? cfg.CD_gear : 0
  const aS = stallAlpha(cfg, flapSetting)
  // 失速后阻力向平板阻力爬升
  const stallExtra = (cfg.CD_flat - cfg.CD0) * smoothstep(aS, aS + 0.18, Math.abs(alpha))
  return cfg.CD0 + induced + flap + gear + stallExtra
}

/** 侧力系数 */
export function cyTotal(beta: number, rudderDefl: number, cfg: AircraftConfig): number {
  return cfg.Cy_beta * beta + cfg.Cy_dr * rudderDefl
}

/**
 * 力矩系数（Cl 滚转 / Cm 俯仰 / Cn 偏航）。
 * 无量纲角速度 p̂=p·b/2V 等为量纲一致化处理（半翼展/半弦长归一化）。
 */
export function momentCoefficients(args: {
  alpha: number
  beta: number
  p: number // body 滚转角速度 rad/s
  q: number // body 俯仰角速度 rad/s
  r: number // body 偏航角速度 rad/s
  airspeed: number // m/s（计算 p̂ 等）
  elevatorDefl: number // rad（拉杆为负）
  aileronDefl: number // rad（右压杆为正）
  rudderDefl: number // rad（右舵为正）
  alphaDot: number // 攻角变化率 rad/s（Cm_α̇ 阻尼项）
  flapSetting: number
  cfg: AircraftConfig
}): { Cl: number; Cm: number; Cn: number } {
  const { cfg, alpha, beta, p, q, r, airspeed, elevatorDefl, aileronDefl, rudderDefl, alphaDot, flapSetting } = args
  const V = Math.max(airspeed, 1e-3)
  const pHat = (p * cfg.wingSpan) / (2 * V)
  const qHat = (q * cfg.chord) / (2 * V)
  const rHat = (r * cfg.wingSpan) / (2 * V)
  const alphaDotHat = (alphaDot * cfg.chord) / (2 * V)

  // 纵向：静稳定 + 阻尼 + 舵效 + 襟翼低头力矩 + 失速机头下坠
  // α 在深失速时对俯仰力矩的作用饱和（α_eff），避免大攻角下力矩发散
  const alphaEff = Math.sign(alpha) * Math.min(Math.abs(alpha), 0.5)
  const aS = stallAlpha(cfg, flapSetting)
  const stallFactor = smoothstep(aS, aS + 0.12, Math.abs(alpha))
  const Cm =
    cfg.Cm0 +
    cfg.Cm_alpha * alphaEff +
    cfg.Cmq * qHat +
    cfg.Cm_alphaDot * alphaDotHat +
    cfg.Cm_de * elevatorDefl +
    (cfg.dCm_flap[flapSetting] ?? 0) -
    cfg.stallBreakCm * Math.sign(alpha) * stallFactor

  // 横航向：上反角效应 + 滚转阻尼 + 螺旋效应 + 副翼；
  // β 侧滑稳定 + 偏航阻尼 + 滚转诱导偏航(Cn_p) + 不利偏航(Cn_da) + 方向舵
  const Cl = cfg.Cl_beta * beta + cfg.Cl_p * pHat + cfg.Cl_r * rHat + cfg.Cl_da * aileronDefl
  const Cn = cfg.Cn_beta * beta + cfg.Cn_r * rHat + cfg.Cn_p * pHat + cfg.Cn_da * aileronDefl + cfg.Cn_dr * rudderDefl

  return { Cl, Cm, Cn }
}

/**
 * 螺旋桨推力模型（沿机体 x 轴）：
 *   T = min(T_static·δt, η·P/V)    （V 较小时）
 * 来源：螺旋桨可用推力 ≈ 可用功率/速度（P·η/V），低速由静推力上限约束，
 * 静推力经验值取 550 lbf 量级（C-172 螺旋桨）。
 */
export function thrustModel(
  throttle: number,
  airspeed: number,
  cfg: AircraftConfig,
): number {
  const power = throttle * cfg.enginePower
  const staticT = throttle * cfg.staticThrust + cfg.idleThrustFraction * cfg.staticThrust
  if (airspeed < 3) return staticT
  return Math.min(staticT, (cfg.propEfficiency * power) / airspeed)
}

/** 螺旋桨反扭矩（N·m，绕机体 x 轴，右旋桨为正则产生左滚力矩）：轴功率/角速度 × 反应比例 */
export function propTorque(throttle: number, rpm: number, cfg: AircraftConfig): number {
  const omega = (Math.max(rpm, 100) * Math.PI * 2) / 60
  const shaftPower = throttle * cfg.enginePower
  return cfg.propTorqueK * (shaftPower / omega)
}

/** 地面效应：近地时升力增益（翼尖涡减弱、下洗减小），经验公式 */
export function groundEffectFactor(hAGL: number, cfg: AircraftConfig): number {
  if (hAGL >= cfg.groundEffectRef * 2.5) return 1
  return 1 + cfg.groundEffectK * Math.max(0, 1 - hAGL / cfg.groundEffectRef)
}

/** 失速判定（攻角接近临界攻角或升力接近 CLmax） */
export function isStalled(alpha: number, flapSetting: number, cfg: AircraftConfig): boolean {
  return Math.abs(alpha) >= stallAlpha(cfg, flapSetting) - 0.02 || Math.abs(alpha) >= 0.26
}

export { clamp }
