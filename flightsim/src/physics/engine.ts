/**
 * 六自由度飞行物理引擎（核心）。
 *
 * 设计要点：
 *  1. 固定时间步长积分（默认 120 Hz），与渲染帧率完全解耦：
 *     tick(realDt) 用累加器把真实帧间隔切成整数个固定步长，渲染快慢不影响仿真。
 *  2. 半隐式欧拉积分（速度/角速度先行更新，再更新位置/姿态），120 Hz 下稳定且常用
 *     （Gaffer On Games, "Fix Your Timestep"）。
 *  3. 姿态用四元数表示，积分 q̇ = ½ q ⊗ ω̂（Kuipers），每步归一化。
 *  4. 力模型：气动力（升力/阻力/侧力，见 aero.ts）+ 螺旋桨推力 + 重力 + 起落架接触力；
 *     力矩模型：气动力矩（稳定导数）+ 螺旋桨反扭矩 + 推力线力臂 +
 *     陀螺耦合项 ω×(Iω)（Euler 方程），体现俯仰/滚转/偏航耦合。
 *  5. 起落架三点式弹簧-阻尼接触模型：支撑、滚动/侧向摩擦、前轮转向、
 *     刹车，天然复现"滑跑抬轮"与"着陆接地"过程。
 *  6. 模块不依赖 three.js / DOM，可无头运行与自动化测试。
 */
import { AIRCRAFT, type AircraftConfig, engineRpm } from '../config/aircraft'
import { SPAWN, WORLD_RADIUS, WARN_RADIUS } from '../config/world'
import type { ControlInput, ControlSensitivity, CrashEvent, FlightState, TouchdownEvent, Vec3 } from '../types/physics'
import { airDensity } from './atmosphere'
import {
  cdTotal,
  clTotal,
  cyTotal,
  groundEffectFactor,
  isStalled,
  momentCoefficients,
  propTorque,
  thrustModel,
} from './aero'
import { terrainHeight, terrainNormal, isOnRunway } from '../world/heightfield'
import {
  clamp,
  damp,
  eulerToQuat,
  quatDerivative,
  quatNormalize,
  quatRotate,
  quatToEuler,
  vec3Add,
  vec3Cross,
  vec3Dot,
  vec3Scale,
  vec3Sub,
  vec3Normalize,
} from '../utils/math'

/** 固定物理步长（秒）：120 Hz */
export const PHYSICS_DT = 1 / 120

const GEAR_DOWN_EFFECTIVE = 0.5 // gearTransition 低于该值视为起落架已放下
/** 每帧最大物理步数：累加器钳制 0.1 s 对应 120 Hz × 12 步；
 *  上限放宽到 200 以支持仿真时间加速（timeScale>1，如测试自动驾驶）与极低帧率环境 */
const MAX_STEPS_PER_FRAME = 200
const MAX_FRAME_DT = 0.1

interface GearContact {
  bodyPos: Vec3 // 机体坐标（x 前、y 右、z 下）
  isNose: boolean
}

export class FlightEngine {
  readonly cfg: AircraftConfig = AIRCRAFT
  readonly state: FlightState
  /** 固定步长（可覆盖用于测试） */
  fixedDt = PHYSICS_DT

  /** 仿真时间倍率（>1 为时间加速；物理步长不变，仅加快推进） */
  private timeScale = 1

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.1, Math.min(scale, 20))
  }

  paused = false

  onCrash: ((e: CrashEvent) => void) | null = null
  onTouchdown: ((e: TouchdownEvent) => void) | null = null

  // 内部：操纵面当前偏角（rad，带速率限制）、累加器、接地状态
  private elevatorDefl = 0
  private aileronDefl = 0
  private rudderDefl = 0
  private accumulator = 0
  private prevAlpha = 0 // 上一固定步的攻角（用于 Cm_α̇ 阻尼项）
  private controls: ControlInput = { elevator: 0, aileron: 0, rudder: 0, throttleDelta: 0, brake: false, trimDelta: 0 }
  private sensitivity: ControlSensitivity = { elevator: 1, aileron: 1, rudder: 1 }
  /** 是否已离地（用于"接地"事件判定，仅在空中后首次接地才触发） */
  private touchdownArmed = false
  private gearContacts: GearContact[]

  constructor() {
    this.gearContacts = [
      { bodyPos: this.cfg.gearNose, isNose: true },
      { bodyPos: this.cfg.gearMainL, isNose: false },
      { bodyPos: this.cfg.gearMainR, isNose: false },
    ]
    this.state = this.createInitialState()
  }

  /** 生成出生状态：跑道西端，机头朝东，起落架放下，慢车 */
  private createInitialState(): FlightState {
    const x = SPAWN.position.x
    const z = SPAWN.position.z
    const ground = terrainHeight(x, z)
    const q = eulerToQuat(SPAWN.yaw, 0, 0)
    return {
      position: { x, y: ground + 1.07, z },
      velocity: { x: 0, y: 0, z: 0 },
      quaternion: q,
      angularVelocity: { x: 0, y: 0, z: 0 },
      airspeed: 0,
      ias: 0,
      alpha: 0,
      beta: 0,
      pitch: 0,
      roll: 0,
      heading: Math.PI / 2, // 罗盘航向 90°（朝东）
      climbRate: 0,
      altitudeAGL: 1.07,
      onGround: true,
      touchdownSink: 0,
      stall: false,
      throttle: 0.25,
      flapSetting: 0,
      flapTransition: 0,
      gearState: 0,
      gearTransition: 0,
      rpm: 1000,
      brake: false,
      elevatorTrim: 0,
      crashed: false,
      crashReason: 'none',
      crashInfo: '',
      time: 0,
      boundaryWarn: false,
      airborne: false,
      groundRoll: 0,
    }
  }

  /** 重置到出生状态（R 键 / 崩溃后重开） */
  reset(): void {
    const fresh = this.createInitialState()
    Object.assign(this.state, fresh)
    this.elevatorDefl = 0
    this.aileronDefl = 0
    this.rudderDefl = 0
    this.accumulator = 0
    this.touchdownArmed = false
    this.paused = false
  }

  /** 每渲染帧调用一次：真实帧间隔 × 时间倍率 -> 固定步长序列 */
  tick(realDt: number): void {
    if (this.paused || this.state.crashed) {
      this.accumulator = 0
      return
    }
    // 钳制最大帧间隔，防止标签页切回时"死亡螺旋"；时间加速时按倍率推进
    this.accumulator += Math.min(realDt, MAX_FRAME_DT) * this.timeScale
    let steps = 0
    while (this.accumulator >= this.fixedDt && steps < MAX_STEPS_PER_FRAME) {
      this.step(this.fixedDt)
      this.accumulator -= this.fixedDt
      steps += 1
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0
  }

  /** 设置控制输入与灵敏度（每帧由输入采样模块提供） */
  setControls(ctrl: ControlInput, sens: ControlSensitivity): void {
    this.controls = ctrl
    this.sensitivity = sens
  }

  /** 襟翼循环档位（F） */
  requestFlaps(): void {
    if (this.state.crashed) return
    this.state.flapSetting = ((this.state.flapSetting + 1) % 3) as 0 | 1 | 2
  }

  /** 起落架收放（G） */
  requestGear(): void {
    if (this.state.crashed) return
    this.state.gearState = (this.state.gearState === 0 ? 1 : 0) as 0 | 1
  }

  /** 单一固定步长积分 */
  private step(dt: number): void {
    const s = this.state
    const cfg = this.cfg

    // ---------- 1. 操纵面动态（速率限制，让操纵更真实） ----------
    this.updateSurfaces(dt)
    s.brake = this.controls.brake
    s.elevatorTrim = clamp(s.elevatorTrim + this.controls.trimDelta * 0.12 * dt, -0.25, 0.25)
    if (this.controls.throttleTarget !== undefined) {
      s.throttle = damp(s.throttle, this.controls.throttleTarget, 2.5, dt)
    } else {
      s.throttle = clamp(s.throttle + this.controls.throttleDelta * cfg.throttleRate * dt, 0, 1)
    }
    // 襟翼/起落架过渡动画（物理上逐步生效）
    const flapTarget = s.flapSetting / 2
    s.flapTransition = damp(s.flapTransition, flapTarget, 0.5, dt)
    s.gearTransition = damp(s.gearTransition, s.gearState, 0.35, dt)

    // ---------- 2. 运动学量 ----------
    const f = quatRotate(s.quaternion, { x: 1, y: 0, z: 0 }) // 机头（世界）
    const r = quatRotate(s.quaternion, { x: 0, y: 1, z: 0 }) // 右翼（世界）
    const d = quatRotate(s.quaternion, { x: 0, y: 0, z: 1 }) // 机腹（世界）
    const vB = {
      x: vec3Dot(s.velocity, f), // u 前向
      y: vec3Dot(s.velocity, r), // v 侧向（右）
      z: vec3Dot(s.velocity, d), // w 下向
    }
    const V = Math.max(Math.hypot(vB.x, vB.y, vB.z), 0.5) // 速度下限防除零
    const alpha = Math.atan2(vB.z, vB.x)
    const beta = Math.asin(clamp(vB.y / V, -1, 1))

    const altitude = s.position.y
    const rho = airDensity(altitude)
    const qbar = 0.5 * rho * V * V
    const groundH = terrainHeight(s.position.x, s.position.z)
    const hAGL = s.position.y - groundH

    // ---------- 3. 气动力（机体坐标） ----------
    const flapEff = s.flapTransition
    const flapSettingEff = s.flapSetting
    const gearDown = s.gearTransition < GEAR_DOWN_EFFECTIVE
    const geFactor = groundEffectFactor(Math.max(hAGL, 0), cfg)
    const CL = clTotal(alpha, flapSettingEff, cfg) * geFactor
    const CLlin = cfg.CL0 + cfg.CL_alpha * alpha + cfg.dCL_flap[flapSettingEff] * flapEff
    const CD = cdTotal(alpha, CLlin, flapSettingEff, gearDown, cfg)
    const CY = cyTotal(beta, this.rudderDefl, cfg)

    // 升力垂直于相对气流、位于对称面内；阻力沿相对气流反向
    // （升力方向推导：α=0 时指向上(-z_b)，抬头时向后倾斜 (sinα, 0, -cosα)）
    const liftDir: Vec3 = { x: Math.sin(alpha), y: 0, z: -Math.cos(alpha) }
    const dragDir: Vec3 = vec3Scale(vec3Normalize(vB), -1)
    const sideDir: Vec3 = { x: 0, y: 1, z: 0 }

    const Fx = qbar * cfg.wingArea * (CL * liftDir.x + CD * dragDir.x + CY * sideDir.x)
    const Fy = qbar * cfg.wingArea * (CL * liftDir.y + CD * dragDir.y + CY * sideDir.y)
    const Fz = qbar * cfg.wingArea * (CL * liftDir.z + CD * dragDir.z + CY * sideDir.z)
    const FBody: Vec3 = { x: Fx, y: Fy, z: Fz }

    // 气动力矩（机体坐标）：滚转用 b、俯仰用 c̄、偏航用 b
    const alphaDot = (alpha - this.prevAlpha) / dt
    this.prevAlpha = alpha
    const mc = momentCoefficients({
      alpha,
      beta,
      p: s.angularVelocity.x,
      q: s.angularVelocity.y,
      r: s.angularVelocity.z,
      airspeed: V,
      elevatorDefl: this.elevatorDefl,
      aileronDefl: this.aileronDefl,
      rudderDefl: this.rudderDefl,
      alphaDot,
      flapSetting: flapSettingEff,
      cfg,
    })
    const qS = qbar * cfg.wingArea
    const MBody: Vec3 = {
      x: qS * cfg.wingSpan * mc.Cl,
      y: qS * cfg.chord * mc.Cm,
      z: qS * cfg.wingSpan * mc.Cn,
    }

    // ---------- 4. 推力（沿机头方向）+ 螺旋桨反扭矩 + 推力线力臂 ----------
    const thrust = thrustModel(s.throttle, V, cfg)
    const thrustWorld = vec3Scale(f, thrust)
    MBody.y += -thrust * cfg.thrustArm // 推力线高于重心 → 加油门轻微低头
    MBody.x += -propTorque(s.throttle, s.rpm, cfg) // 右旋桨反扭矩 → 左滚

    // ---------- 5. 起落架接触力（世界坐标，含支撑/摩擦/转向/刹车） ----------
    let gearForceWorld: Vec3 = { x: 0, y: 0, z: 0 }
    let anyGearContact = false
    if (gearDown) {
      for (const g of this.gearContacts) {
        const contact = this.solveGearContact(g)
        if (contact) {
          gearForceWorld = vec3Add(gearForceWorld, contact.force)
          // 接触力对重心的力矩：τ = r_world × F
          const rWorld = quatRotate(s.quaternion, g.bodyPos)
          const tau = vec3Cross(rWorld, contact.force)
          MBody.x += vec3Dot(tau, f)
          MBody.y += vec3Dot(tau, r)
          MBody.z += vec3Dot(tau, d)
          anyGearContact = true
        }
      }
    } else {
      // 起落架收起：机身直接触地 → 坠毁
      this.checkFuselageContact()
    }

    // ---------- 6. 重力 ----------
    const gravityWorld: Vec3 = { x: 0, y: -cfg.mass * 9.80665, z: 0 }

    // ---------- 7. 合外力（世界坐标） ----------
    const aeroWorld = vec3Add(
      vec3Scale(f, FBody.x),
      vec3Add(vec3Scale(r, FBody.y), vec3Scale(d, FBody.z)),
    )
    const FTotal = vec3Add(vec3Add(aeroWorld, thrustWorld), vec3Add(gravityWorld, gearForceWorld))
    this.lastForces = { total: FTotal, aero: aeroWorld, thrust, gear: gearForceWorld }

    // ---------- 8. 积分（半隐式欧拉） ----------
    const invMass = 1 / cfg.mass
    const acc = vec3Scale(FTotal, invMass)
    s.velocity = vec3Add(s.velocity, vec3Scale(acc, dt))
    s.position = vec3Add(s.position, vec3Scale(s.velocity, dt))

    // 刚体欧拉方程：α = I⁻¹(τ - ω × (Iω))，ω×(Iω) 为陀螺耦合项
    const I = cfg.inertia
    const Iwx = I.x * s.angularVelocity.x
    const Iwy = I.y * s.angularVelocity.y
    const Iwz = I.z * s.angularVelocity.z
    const gyro = vec3Cross(s.angularVelocity, { x: Iwx, y: Iwy, z: Iwz })
    const tauNet = vec3Sub(MBody, gyro)
    s.angularVelocity.x = clamp(s.angularVelocity.x + (tauNet.x / I.x) * dt, -8, 8)
    s.angularVelocity.y = clamp(s.angularVelocity.y + (tauNet.y / I.y) * dt, -8, 8)
    s.angularVelocity.z = clamp(s.angularVelocity.z + (tauNet.z / I.z) * dt, -8, 8)

    // 地面滑跑时强阻尼角速度（轮胎摩擦抑制滚转/俯仰摆动）
    if (anyGearContact) {
      const k = Math.exp(-2.5 * dt)
      s.angularVelocity.x *= k
      s.angularVelocity.z *= k
      s.angularVelocity.y *= Math.exp(-1.0 * dt)
    }

    // 四元数积分：q ← q + ½ q⊗ω·dt，再归一化
    const dq = quatDerivative(s.quaternion, s.angularVelocity)
    s.quaternion = quatNormalize({
      x: s.quaternion.x + dq.x * dt,
      y: s.quaternion.y + dq.y * dt,
      z: s.quaternion.z + dq.z * dt,
      w: s.quaternion.w + dq.w * dt,
    })

    // ---------- 9. 接地判定 / 硬着陆坠毁 / 边界 ----------
    const nowOnGround = anyGearContact && s.velocity.y < 0.5
    const sinkRate = Math.max(0, -s.velocity.y)
    if (anyGearContact && this.touchdownArmed) {
      // 首次接地（空中后）：依据下降率判定是否过重
      const hard = sinkRate > cfg.hardLandingSink
      const onRunway = isOnRunway(s.position.x, s.position.z)
      if (hard) {
        this.crash('hard-landing', `着陆过重！接地下降率 ${(sinkRate * 196.85).toFixed(0)} ft/min，飞机损坏。`)
        return
      }
      this.touchdownArmed = false
      s.touchdownSink = sinkRate
      this.onTouchdown?.({ sinkRate, onRunway, hard })
    }
    if (nowOnGround) {
      s.onGround = true
      // 兜底保护：异常深陷时强制抬升（正常弹簧-阻尼接触不会触发）
      const groundHere = terrainHeight(s.position.x, s.position.z)
      if (s.position.y < groundHere + 0.3) {
        s.position.y = groundHere + 0.3
        if (s.velocity.y < 0) s.velocity.y = 0
      }
      if (!s.airborne) {
        const fwdSpeed = Math.max(0, vec3Dot(s.velocity, f))
        s.groundRoll += fwdSpeed * dt
      }
    } else {
      s.onGround = false
    }

    // 空中误入地形（撞山）
    if (!anyGearContact && hAGL < 0.05 && s.velocity.y < -1) {
      this.crash('terrain', '飞机撞上地形。')
      return
    }

    // 边界
    const radius = Math.hypot(s.position.x, s.position.z)
    s.boundaryWarn = radius > WARN_RADIUS
    if (radius > WORLD_RADIUS) {
      this.crash('boundary', '飞机飞出边界，任务终止。')
      return
    }

    // ---------- 10. 派生量（仪表/HUD/相机） ----------
    s.airspeed = V
    s.ias = V * Math.sqrt(Math.max(rho / 1.225, 0.2))
    s.alpha = alpha
    s.beta = beta
    const euler = quatToEuler(s.quaternion)
    s.pitch = euler.pitch
    s.roll = euler.roll
    s.heading = (Math.PI / 2 + euler.yaw + Math.PI * 2) % (Math.PI * 2) // 罗盘：+X=90°
    s.climbRate = s.velocity.y
    s.altitudeAGL = hAGL
    s.stall = isStalled(alpha, flapSettingEff, cfg) || (s.ias < 21 && !s.onGround && s.climbRate < -0.5)
    s.rpm = engineRpm(cfg, s.throttle, V)
    s.time += dt
    // 出生后 1 s 内不算"离地"（避免初始 2 cm 落地瞬间误判），之后离地才置位
    if (!s.onGround && hAGL > 0.5 && s.time > 1.0) {
      s.airborne = true
      this.touchdownArmed = true
    }

    // 数值保护
    if (!Number.isFinite(s.position.x) || !Number.isFinite(s.quaternion.w)) {
      this.reset()
    }
  }

  /** 单个起落架接触点求解：弹簧-阻尼支撑 + 库仑摩擦 + 转向/刹车 */
  private solveGearContact(g: GearContact): { force: Vec3 } | null {
    const s = this.state
    const cfg = this.cfg
    const rWorld = quatRotate(s.quaternion, g.bodyPos)
    const p = vec3Add(s.position, rWorld)
    const ground = terrainHeight(p.x, p.z)
    if (p.y >= ground) return null
    const n = terrainNormal(p.x, p.z)
    const pen = ground - p.y
    // 接触点速度（刚体点速度公式：v_p = v + ω × r）
    const omegaWorld = vec3Add(
      vec3Scale(quatRotate(s.quaternion, { x: 1, y: 0, z: 0 }), s.angularVelocity.x),
      vec3Add(
        vec3Scale(quatRotate(s.quaternion, { x: 0, y: 1, z: 0 }), s.angularVelocity.y),
        vec3Scale(quatRotate(s.quaternion, { x: 0, y: 0, z: 1 }), s.angularVelocity.z),
      ),
    )
    const vp = vec3Add(s.velocity, vec3Cross(omegaWorld, rWorld))
    const vn = vec3Dot(vp, n)
    const support = Math.max(0, cfg.gearStiffness * pen - cfg.gearDamping * Math.min(vn, 0))
    if (support <= 0) return null

    // 切向速度与库仑摩擦（大小 μ·N，方向与切向速度相反；
    // 低速正则化 reg 防止静摩擦抖动，仅作用于大小，不改变方向分解）
    const vh = vec3Sub(vp, vec3Scale(n, vn))
    const vhLen = Math.hypot(vh.x, vh.y, vh.z)
    const fwd = quatRotate(s.quaternion, { x: 1, y: 0, z: 0 }) // 机头方向
    const fwdGround = vec3Normalize(vec3Sub(fwd, vec3Scale(n, vec3Dot(fwd, n))))
    const latDir = vec3Normalize(vec3Sub(vh, vec3Scale(fwdGround, vec3Dot(vh, fwdGround))))

    const muFwd = this.controls.brake ? cfg.muBrake : cfg.muRoll
    let F: Vec3 = vec3Scale(n, support)
    if (vhLen > 1e-3) {
      const vhDir = vec3Scale(vh, 1 / vhLen)
      const fwdComp = vec3Dot(vhDir, fwdGround) // -1..1：前向/后向分量
      const latComp = latDir.x === 0 && latDir.y === 0 && latDir.z === 0 ? 0 : vec3Dot(vhDir, latDir)
      const reg = Math.min(1, vhLen / 0.15)
      const muVec = vec3Add(
        vec3Scale(fwdGround, muFwd * fwdComp),
        vec3Scale(latDir, cfg.muLateral * latComp),
      )
      F = vec3Add(F, vec3Scale(muVec, -support * reg))
    }

    // 前轮转向：地面滑跑时方向舵输入转为前轮侧向力
    if (g.isNose && vhLen > 0.3) {
      const steerF = vec3Scale(latDir, this.controls.rudder * cfg.steerK * support)
      F = vec3Add(F, steerF)
    }
    return { force: F }
  }

  /** 起落架收起时检查机身触地 */
  private checkFuselageContact(): void {
    const s = this.state
    const points: Vec3[] = [
      { x: 3.4, y: 0, z: 0.2 }, // 机头
      { x: -0.4, y: 0, z: 0.78 }, // 机腹
      { x: -3.4, y: 0, z: 0.35 }, // 机尾
    ]
    for (const bp of points) {
      const p = vec3Add(s.position, quatRotate(s.quaternion, bp))
      if (p.y < terrainHeight(p.x, p.z)) {
        this.crash('gear-up', '起落架未放下即接地，飞机坠毁。')
        return
      }
    }
  }

  /** 更新操纵面偏角（速率限制） */
  private updateSurfaces(dt: number): void {
    const cfg = this.cfg
    const sens = this.sensitivity
    // 拉杆为正输入 → 升降舵负偏转（后缘向上），由 Cm_de<0 产生抬头力矩；
    // 配平叠加同向偏置，但总偏转不超过舵面物理极限
    const trim = this.state.elevatorTrim
    const target = -(clamp(this.controls.elevator, -1, 1) * sens.elevator * cfg.elevatorMax + trim)
    this.elevatorDefl = moveToward(this.elevatorDefl, clamp(target, -cfg.elevatorMax, cfg.elevatorMax), cfg.elevatorRate, dt)
    this.aileronDefl = moveToward(this.aileronDefl, clamp(this.controls.aileron, -1, 1) * sens.aileron * cfg.aileronMax, cfg.aileronRate, dt)
    this.rudderDefl = moveToward(this.rudderDefl, clamp(this.controls.rudder, -1, 1) * sens.rudder * cfg.rudderMax, cfg.rudderRate, dt)
  }

  /** 调试：暴露内部舵面/输入状态（供无头测试与调参） */
  get debug(): {
    elevatorDefl: number
    aileronDefl: number
    rudderDefl: number
    controls: ControlInput
    forces: { total: Vec3; aero: Vec3; thrust: number; gear: Vec3 }
  } {
    return {
      elevatorDefl: this.elevatorDefl,
      aileronDefl: this.aileronDefl,
      rudderDefl: this.rudderDefl,
      controls: this.controls,
      forces: this.lastForces,
    }
  }

  private lastForces: { total: Vec3; aero: Vec3; thrust: number; gear: Vec3 } = {
    total: { x: 0, y: 0, z: 0 },
    aero: { x: 0, y: 0, z: 0 },
    thrust: 0,
    gear: { x: 0, y: 0, z: 0 },
  }

  private crash(reason: FlightState['crashReason'], message: string): void {
    const s = this.state
    if (s.crashed) return
    s.crashed = true
    s.crashReason = reason
    s.crashInfo = message
    this.onCrash?.({ reason, message })
  }
}

function moveToward(current: number, target: number, rate: number, dt: number): number {
  const delta = target - current
  const maxStep = rate * dt
  return current + clamp(delta, -maxStep, maxStep)
}

/** 全局单例（UI/渲染层共用；测试可另建实例） */
export const flightEngine = new FlightEngine()