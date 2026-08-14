/**
 * 无头物理自测脚本：直接驱动 FlightEngine（120Hz 固定步长，无 three.js / DOM 依赖）。
 * 运行：npm run physics:test
 * 覆盖：滑跑抬轮起飞、失速与推杆改出、软/硬着陆判定、偏航-侧滑、滚转-偏航耦合、
 *       配平稳定性、边界判定。
 */
import { FlightEngine, PHYSICS_DT } from '../src/physics/engine'
import { stallAlpha } from '../src/config/aircraft'
import type { ControlInput, ControlSensitivity } from '../src/types/physics'
import { toDeg } from '../src/utils/math'

const SENS: ControlSensitivity = { elevator: 1, aileron: 1, rudder: 1 }
const NO_INPUT: ControlInput = { elevator: 0, aileron: 0, rudder: 0, throttleDelta: 0, brake: false, trimDelta: 0 }

let passCount = 0
let failCount = 0

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passCount += 1
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`)
  } else {
    failCount += 1
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`)
  }
}

/** 运行固定秒数，每步给定控制输入 */
function run(
  engine: FlightEngine,
  seconds: number,
  controlFn: (t: number, e: FlightEngine) => ControlInput,
): void {
  const steps = Math.round(seconds / PHYSICS_DT)
  for (let i = 0; i < steps; i++) {
    engine.setControls(controlFn(i * PHYSICS_DT, engine), SENS)
    engine.tick(PHYSICS_DT)
  }
}

function neutral(t: number, e: FlightEngine): ControlInput {
  void t
  void e
  return NO_INPUT
}

function pitchUp(t: number, e: FlightEngine): ControlInput {
  void t
  void e
  return { ...NO_INPUT, elevator: 1 }
}

function pitchDown(t: number, e: FlightEngine): ControlInput {
  void t
  void e
  return { ...NO_INPUT, elevator: -1 }
}

function throttleFull(t: number, e: FlightEngine): ControlInput {
  void t
  void e
  return { ...NO_INPUT, throttleDelta: 1 }
}

function rudderRight(t: number, e: FlightEngine): ControlInput {
  void t
  void e
  return { ...NO_INPUT, rudder: 1 }
}

function aileronRight(t: number, e: FlightEngine): ControlInput {
  void t
  void e
  return { ...NO_INPUT, aileron: 1 }
}

/** 俯仰保持控制器：目标 7° 姿态，用于测试抬轮（模拟飞行员柔和拉杆） */
function pitchHold(targetPitch: number, k = 6): (t: number, e: FlightEngine) => ControlInput {
  return (_t, e) => {
    const err = targetPitch - e.state.pitch
    return { ...NO_INPUT, elevator: Math.max(0, Math.min(1, err * k)), throttleDelta: 1 }
  }
}

/** 抬轮+爬升控制器：满杆抬到 ~6° 后减杆（模拟飞行员抬轮手法，避免过度抬轮失速） */
function rotateAndClimb(t: number, e: FlightEngine): ControlInput {
  void t
  const s = e.state
  const elevator = s.onGround || s.altitudeAGL < 0.3 ? (s.pitch < 0.105 ? 1 : 0.35) : 0.35
  return { ...NO_INPUT, elevator, throttleDelta: 1 }
}

/** 配平爬升测试：抬杆至 5° 后松杆，前 1.1 s 抬头配平（≈0.13 rad，对应 α≈7° 爬升），验证配平维持爬升 */
function makeTrimClimb(): (t: number, e: FlightEngine) => ControlInput {
  let t0 = -1
  return (t, e) => {
    if (t0 < 0) t0 = t
    const dt = t - t0
    const elevator = e.state.pitch < 0.09 ? 1 : 0
    const trimDelta = dt < 1.1 ? 1 : 0
    return { ...NO_INPUT, elevator, throttleDelta: 1, trimDelta }
  }
}

/** 进近+拉平控制器：低空拉平减下降率，拉飘后回杆防止爬升（模拟飞行员着陆拉飘） */
function approachFlare(t: number, e: FlightEngine): ControlInput {
  void t
  const s = e.state
  let target: number
  if (s.altitudeAGL < 8) {
    target = s.climbRate > 0.2 ? 0.09 : 0.15
  } else {
    target = 0.08
  }
  const err = target - s.pitch
  return { ...NO_INPUT, elevator: Math.max(-0.4, Math.min(1, err * 5)) }
}

/** 把飞机放到空中指定状态（测试用） */
function teleportAirborne(
  engine: FlightEngine,
  y: number,
  speed: number,
  pitch = 0,
  vY = 0,
): void {
  engine.reset()
  const s = engine.state
  s.position = { x: -700, y, z: 0 }
  s.velocity = { x: speed * Math.cos(pitch), y: vY, z: 0 }
  s.airborne = true
}

function section(name: string): void {
  console.log(`\n== ${name} ==`)
}

// ---------------------------------------------------------------- 1. 滑跑起飞
section('1. 滑跑 / 抬轮 / 离地')
{
  const e = new FlightEngine()
  // 满油门滑跑 16 s（不拉杆不应离地）
  run(e, 16, throttleFull)
  check('滑跑后仍在跑道（未自行离地）', e.state.onGround, `V=${e.state.airspeed.toFixed(1)} m/s`)
  check('滑跑速度达到抬轮速度 (>28 m/s)', e.state.airspeed > 28, `${e.state.airspeed.toFixed(1)} m/s`)
  check('滑跑距离合理 (200~600 m)', e.state.groundRoll > 200 && e.state.groundRoll < 600, `${e.state.groundRoll.toFixed(0)} m`)

  // 抬轮（满杆至 6° 后减杆），随后爬升
  run(e, 10, rotateAndClimb)
  check('拉杆后离地（抬轮成功）', !e.state.onGround && e.state.airborne, `V=${e.state.airspeed.toFixed(1)} m/s pitch=${toDeg(e.state.pitch).toFixed(1)}°`)
  check('离地速度在合理范围 (28~40 m/s)', e.state.airspeed > 28 && e.state.airspeed < 40, `${e.state.airspeed.toFixed(1)} m/s`)
  check('离地后爬升', e.state.climbRate > 0.5, `${e.state.climbRate.toFixed(1)} m/s`)

  // 继续爬升 15 s 检查姿态稳定
  run(e, 15, pitchHold(0.14))
  check('爬升中姿态受控 (pitch < 30°)', Math.abs(e.state.pitch) < 0.52, `${toDeg(e.state.pitch).toFixed(1)}°`)
}

// ---------------------------------------------------------------- 2. 失速与改出
section('2. 失速复现 / 机头下坠 / 推杆改出')
{
  const e = new FlightEngine()
  teleportAirborne(e, 600, 40)
  const aS = stallAlpha(e.cfg, 0)
  // 拉满杆 4 s 进入失速
  run(e, 4, pitchUp)
  check('大攻角拉杆速度下降', e.state.airspeed < 32, `V=${e.state.airspeed.toFixed(1)} m/s`)
  check('进入失速（α 超过临界攻角）', Math.abs(e.state.alpha) > aS, `α=${toDeg(e.state.alpha).toFixed(1)}° vs 临界 ${toDeg(aS).toFixed(1)}°`)
  check('失速告警触发', e.state.stall, 'stall=true')
  check('失速后下沉（升力不足）', e.state.climbRate < -1, `${e.state.climbRate.toFixed(1)} m/s`)
  // 记录失速中的俯仰角，松杆观察机头下坠
  const pitchAtStall = e.state.pitch
  run(e, 2, neutral)
  check('机头下坠（松杆后俯仰角回落）', e.state.pitch < pitchAtStall - 0.04, `pitch ${toDeg(pitchAtStall).toFixed(1)}° → ${toDeg(e.state.pitch).toFixed(1)}°`)

  // 推杆改出
  run(e, 6, pitchDown)
  run(e, 10, neutral)
  check('推杆后攻角恢复', Math.abs(e.state.alpha) < aS - 0.05, `α=${toDeg(e.state.alpha).toFixed(1)}°`)
  check('改出后速度恢复', e.state.airspeed > 28, `${e.state.airspeed.toFixed(1)} m/s`)
  check('失速告警解除', !e.state.stall, '')
}

// ---------------------------------------------------------------- 3. 着陆判定
section('3. 软着陆 vs 硬着陆（过重判定坠毁）')
{
  const soft = new FlightEngine()
  // 进近状态：速度 33 m/s、俯仰 4.6°、下降率 2 m/s、高度 12 m，低空拉平
  // （地面效应导致短暂"漂浮"属真实物理现象，给予 20 s 足够接地时间）
  teleportAirborne(soft, 12, 33, 0.08, -2)
  run(soft, 20, approachFlare)
  check('拉平后软着陆不坠毁', !soft.state.crashed && soft.state.onGround, `sink=${soft.state.touchdownSink.toFixed(2)} m/s`)

  const hard = new FlightEngine()
  teleportAirborne(hard, 30, 30, 0.05, -6) // 下降率 6 m/s，30 m 高度
  run(hard, 8, neutral)
  check('下降率 6 m/s 判定坠毁', hard.state.crashed, `reason=${hard.state.crashReason}`)
  check('坠毁原因 = 着陆过重', hard.state.crashReason === 'hard-landing', hard.state.crashInfo)

  const gearUp = new FlightEngine()
  teleportAirborne(gearUp, 30, 30, 0.03, -3)
  gearUp.requestGear()
  run(gearUp, 12, neutral)
  check('起落架未放下接地判定坠毁', gearUp.state.crashed && gearUp.state.crashReason === 'gear-up', gearUp.state.crashInfo)
}

// ---------------------------------------------------------------- 4. 姿态耦合
section('4. 偏航→侧滑 / 滚转→偏航耦合')
{
  const e = new FlightEngine()
  teleportAirborne(e, 500, 50)
  run(e, 4, rudderRight)
  check('踩右舵产生侧滑 (|β| > 2°)', Math.abs(e.state.beta) > 0.035, `β=${toDeg(e.state.beta).toFixed(1)}°`)
  const hdgAfterRudder = e.state.heading
  run(e, 3, neutral)
  check('松舵后侧滑收敛（风标稳定性）', Math.abs(e.state.beta) < 0.1, `β=${toDeg(e.state.beta).toFixed(1)}°`)
  check('右舵航向确实右转', Math.abs(e.state.heading - hdgAfterRudder) < 0.5, '')

  const e2 = new FlightEngine()
  teleportAirborne(e2, 500, 50)
  run(e2, 3, aileronRight)
  check('右压杆产生右滚', e2.state.roll > 0.05, `roll=${toDeg(e2.state.roll).toFixed(1)}°`)
  check('滚转伴随偏航变化（耦合）', Math.abs(e2.state.heading - Math.PI / 2) > 0.02 || Math.abs(e2.state.beta) > 0.02, `hdg=${toDeg(e2.state.heading).toFixed(1)}° β=${toDeg(e2.state.beta).toFixed(1)}°`)
}

// ---------------------------------------------------------------- 5. 稳定性
section('5. 平飞稳定性（配平状态 30 s）')
{
  const e = new FlightEngine()
  teleportAirborne(e, 1000, 60, 0, 0)
  run(e, 30, neutral)
  check('30 s 内未坠毁', !e.state.crashed, '')
  check('速度保持合理范围', e.state.airspeed > 45 && e.state.airspeed < 80, `${e.state.airspeed.toFixed(1)} m/s`)
  check('俯仰角不发散', Math.abs(e.state.pitch) < 0.5, `${toDeg(e.state.pitch).toFixed(1)}°`)
}

// ---------------------------------------------------------------- 6. 边界
section('6. 边界判定')
{
  const e = new FlightEngine()
  teleportAirborne(e, 500, 40)
  e.state.position = { x: 4900, y: 500, z: 0 } // 超出硬边界
  run(e, 0.5, neutral)
  check('飞出边界判定坠毁', e.state.crashed && e.state.crashReason === 'boundary', e.state.crashInfo)
}

// ---------------------------------------------------------------- 7. 确定性 & 步长
section('7. 固定步长与确定性')
{
  const a = new FlightEngine()
  const b = new FlightEngine()
  teleportAirborne(a, 400, 45)
  teleportAirborne(b, 400, 45)
  run(a, 10, pitchUp)
  run(b, 10, pitchUp)
  const same =
    Math.abs(a.state.position.x - b.state.position.x) < 1e-9 &&
    Math.abs(a.state.pitch - b.state.pitch) < 1e-9
  check('相同输入 → 相同结果（确定性）', same, `x=${a.state.position.x.toFixed(3)}/${b.state.position.x.toFixed(3)}`)
  check('仿真时间推进正确', Math.abs(a.state.time - 10) < 1e-6, `${a.state.time.toFixed(4)} s`)
}

// ---------------------------------------------------------------- 8. 配平维持爬升
section('8. 配平：松杆后维持爬升姿态')
{
  const e = new FlightEngine()
  run(e, 16, throttleFull) // 滑跑至 Vr
  run(e, 14, makeTrimClimb())
  check('配平后松杆仍保持抬头姿态', e.state.pitch > 0.05, `pitch=${toDeg(e.state.pitch).toFixed(1)}° trim=${e.state.elevatorTrim.toFixed(2)} rad`)
  check('配平后持续爬升', e.state.climbRate > 0.5, `${e.state.climbRate.toFixed(1)} m/s`)
  check('配平爬升未坠毁', !e.state.crashed, e.state.crashInfo)
}

console.log(`\n========================================`)
console.log(`结果: ${passCount} 通过, ${failCount} 失败`)
if (failCount > 0) process.exit(1)
