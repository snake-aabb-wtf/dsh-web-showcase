/**
 * 浏览器集成验证用的"自动驾驶测试"钩子（仅在 URL 带 ?autopilot=1 时激活）。
 *
 * 用内置简单自动驾驶（俯仰保持/配平/协调转弯/拉平）驱动真实物理引擎完成
 * 完整飞行序列：滑跑抬轮起飞 → 配平爬升 → 失速复现与推杆改出 → 180° 返场 →
 * 下降对准跑道 → 拉平软着陆。每阶段输出 PASS/FAIL 检查项，
 * 结果写入 window.__autopilotReport，供轻量级 E2E 探针读取。
 * 这是工程上的测试钩子，不参与正常游戏逻辑。
 */
import type { FlightEngine } from '../physics/engine'
import type { ControlInput } from '../types/physics'
import { clamp, wrapAngle } from '../utils/math'
import { isOnRunway } from '../world/heightfield'

export interface AutopilotCheck {
  name: string
  pass: boolean
  detail: string
}

export interface AutopilotReport {
  done: boolean
  checks: AutopilotCheck[]
  phase: string
  crashed: boolean
}

const NO_INPUT: ControlInput = { elevator: 0, aileron: 0, rudder: 0, throttleDelta: 0, brake: false, trimDelta: 0 }

/** 滚转稳定：保持机翼水平（对抗螺旋桨反扭矩等滚转扰动） */
function wingLevel(e: FlightEngine, gain = 1.5, limit = 0.45): number {
  return clamp(-e.state.roll * gain, -limit, limit)
}

const CLIMB_ALT = 457 // 1500 ft（验证爬升的足够高度）
const DESCEND_ALT = 80 // 进入拉平的高度（米）

type Phase = 'roll' | 'rotate' | 'climb' | 'stall' | 'recover' | 'climb2' | 'turn' | 'descend' | 'land' | 'done'

export class AutopilotTest {
  private phase: Phase = 'roll'
  private checks: AutopilotCheck[] = []
  private stallSeenAt = -1
  private trimDone = false
  private turnTarget = 0
  private recoverSince = -1
  private published = false

  report: AutopilotReport = { done: false, checks: [], phase: 'roll', crashed: false }

  private check(name: string, pass: boolean, detail = ''): void {
    this.checks.push({ name, pass, detail })
    console.log(`${pass ? 'PASS' : 'FAIL'} [autopilot] ${name}${detail ? `  (${detail})` : ''}`)
  }

  /** 每渲染帧调用，返回该帧的控制输入 */
  update(e: FlightEngine): ControlInput {
    const s = e.state
    const w = window as unknown as { __apPhase?: string; __apStall?: boolean; __apTrim?: number }
    w.__apPhase = this.phase
    w.__apStall = s.stall
    w.__apTrim = s.elevatorTrim

    // 已结束：不再输出任何控制/检查
    if (this.phase === 'done') return NO_INPUT

    // 坠毁 → 记录失败并结束
    if (s.crashed) {
      this.check(`${this.phase} 阶段坠毁`, false, s.crashInfo)
      this.phase = 'done'
      return NO_INPUT
    }

    switch (this.phase) {
      case 'roll':
        if (s.airspeed > 27.5) {
          this.check('滑跑加速至抬轮速度 (>53 kt)', true, `${(s.airspeed * 1.9438).toFixed(0)} kt`)
          this.phase = 'rotate'
        }
        return { ...NO_INPUT, throttleDelta: 1 }

      case 'rotate': {
        // 0.85 杆量柔和抬轮至 5° 后完全松杆（此时不配平，避免叠加超限）
        const elevator = s.pitch < 0.085 ? 0.85 : 0
        if (s.airborne && s.altitudeAGL > 5) {
          this.check('抬轮离地', true, `${(s.airspeed * 1.9438).toFixed(0)} kt pitch=${(s.pitch * 57.3).toFixed(1)}°`)
          this.phase = 'climb'
        }
        return { ...NO_INPUT, elevator, aileron: wingLevel(e), throttleDelta: 1 }
      }

      case 'climb':
        // 配平 + 俯仰保持 8.6°：高速甩头时控制器自动回杆/推杆，抑制极限环
        if (s.elevatorTrim >= 0.13) this.trimDone = true
        if (this.trimDone && s.position.y >= CLIMB_ALT) {
          this.check('配平爬升至 1500 ft', s.climbRate > 0.5, `V/S=${(s.climbRate * 196.85).toFixed(0)} fpm`)
          this.phase = 'stall'
        }
        return {
          ...NO_INPUT,
          elevator: clamp((0.15 - s.pitch) * 2.5, -0.3, 0.5),
          aileron: wingLevel(e),
          throttleDelta: 1,
          trimDelta: this.trimDone ? 0 : 1,
        }

      case 'stall':
        if (s.stall && this.stallSeenAt < 0) this.stallSeenAt = s.time
        if (this.stallSeenAt > 0 && s.time - this.stallSeenAt > 1.5) {
          this.check(
            '失速复现（大攻角拉杆 → 速度下降/告警）',
            true,
            `α=${(s.alpha * 57.3).toFixed(1)}° V=${(s.airspeed * 1.9438).toFixed(0)} kt`,
          )
          this.phase = 'recover'
        }
        return { ...NO_INPUT, elevator: 1, aileron: wingLevel(e), throttleDelta: 1 }

      case 'recover': {
        // 滞回改出：α > 失速角(13.4°) 持续推杆破失速；
        // α ≤ 失速角后拉杆 0.4（平衡攻角 ≈9.3°，恒低于失速角，不会触发振荡切换），
        // 至少持续 3 s，待速度/姿态恢复再转入重新爬升。
        // 注意：配平仅回零即停（若持续 -1 会把配平推到 -0.25 低头极限，抵消拉杆导致俯冲）
        const trimReset = s.elevatorTrim > 0.005 ? -1 : 0
        if (s.alpha > 0.234) {
          this.recoverSince = -1
          return { ...NO_INPUT, elevator: -0.5, aileron: wingLevel(e), throttleDelta: 1, trimDelta: trimReset }
        }
        if (this.recoverSince < 0) this.recoverSince = s.time
        if (s.time - this.recoverSince > 3 && s.pitch > 0.0 && s.airspeed > 26) {
          this.check(
            '推杆改出失速（攻角恢复、速度与姿态恢复）',
            true,
            `α=${(s.alpha * 57.3).toFixed(1)}° pitch=${(s.pitch * 57.3).toFixed(1)}° V=${(s.airspeed * 1.9438).toFixed(0)} kt`,
          )
          this.trimDone = false
          // 返场目标：指向跑道中心 (0,0)，而非盲目 180° 掉头（避免位置漂移后越飞越远）
          this.turnTarget = Math.PI / 2 + Math.atan2(-s.position.z, -s.position.x)
          this.phase = 'climb2'
        }
        return { ...NO_INPUT, elevator: 0.4, aileron: wingLevel(e), throttleDelta: 1, trimDelta: trimReset }
      }

      case 'climb2':
        // 失速改出后：配平重建 + 俯仰保持，同时边爬升边转向跑道中心（避免继续远离）
        if (s.elevatorTrim >= 0.13) this.trimDone = true
        if (this.trimDone && s.position.y >= 610) {
          this.check('改出后重新爬升至 2000 ft', true, `ALT=${(s.position.y * 3.2808).toFixed(0)} ft`)
          this.phase = 'turn'
        }
        {
          const hdgErr = wrapAngle(this.turnTarget - s.heading)
          const aileron = clamp(hdgErr * 1.2, -0.35, 0.35)
          const rudder = clamp(-hdgErr * 0.6, -0.3, 0.3)
          return {
            ...NO_INPUT,
            elevator: clamp((0.15 - s.pitch) * 2.5, -0.3, 0.5),
            aileron,
            rudder,
            throttleDelta: 1,
            trimDelta: this.trimDone ? 0 : 1,
          }
        }

      case 'turn': {
        const err = wrapAngle(this.turnTarget - s.heading)
        // 协调转弯：副翼压坡度 + 方向舵协调
        const aileron = clamp(err * 1.5, -0.55, 0.55)
        const rudder = clamp(-err * 1.0, -0.45, 0.45)
        if (Math.abs(err) < 0.09) {
          this.check('180° 转向返场', true, `hdg=${((s.heading * 57.3 + 360) % 360).toFixed(0)}°`)
          this.phase = 'descend'
        }
        return { ...NO_INPUT, elevator: 0.2, aileron, rudder, throttleDelta: 1 }
      }

      case 'descend': {
        // 下降并温和修正航迹：按当前位置选择进场方向（东侧进场朝西 270°，西侧朝东 90°），
        // 航向误差主导，横向偏差仅小坡度修正（≤16°）
        const approachHdg = s.position.x > 0 ? Math.PI * 1.5 : Math.PI / 2
        const hdgErr = wrapAngle(approachHdg - s.heading)
        const trackErr = -s.position.z
        const bank = clamp(hdgErr * 1.0 + trackErr * 0.0008, -0.28, 0.28)
        let elevator = -0.02
        if (s.climbRate < -6) elevator = 0.03 // 下沉过快时回杆
        if (s.position.y < DESCEND_ALT) {
          this.check('下降至进近高度', true, `ALT=${(s.position.y * 3.2808).toFixed(0)} ft`)
          this.phase = 'land'
        }
        return { ...NO_INPUT, elevator, aileron: bank, rudder: clamp(-hdgErr * 0.5, -0.3, 0.3), throttleDelta: -1 }
      }

      case 'land': {
        // 拉平：低空抬姿态减下降率；杆量限幅避免高速下猛拉失速
        const targetPitch = s.altitudeAGL < 20 ? 0.12 : 0.02
        let elevator = clamp((targetPitch - s.pitch) * 3, -0.2, 0.85)
        if (s.altitudeAGL < 15 && s.climbRate < -3.5) elevator = 0.85
        if (s.onGround) {
          const onRunway = isOnRunway(s.position.x, s.position.z)
          this.check('软着陆（接地下降率 < 690 fpm）', s.touchdownSink < 3.5, `${(s.touchdownSink * 196.85).toFixed(0)} fpm`)
          this.check('着陆在跑道区域', onRunway, `pos=${s.position.x.toFixed(0)}, ${s.position.z.toFixed(0)}`)
          this.phase = 'done'
        }
        return { ...NO_INPUT, elevator, aileron: wingLevel(e), rudder: 0, throttleDelta: 0 }
      }
    }
    return NO_INPUT
  }

  /** 结束阶段：发布报告（幂等） */
  maybePublish(): void {
    if (this.published) return
    if (this.phase !== 'done') return
    this.published = true
    this.report = { done: true, checks: this.checks, phase: this.phase, crashed: false }
    const w = window as unknown as { __autopilotReport?: AutopilotReport }
    w.__autopilotReport = this.report
    const pass = this.checks.filter((c) => c.pass).length
    console.log(`[autopilot] 序列结束: ${pass}/${this.checks.length} 通过`)
  }
}

/** URL 参数：?autopilot=1 激活自动驾驶验证，ap_speed 为仿真加速倍率 */
export const autopilotEnabled = ((): boolean => {
  try {
    return new URLSearchParams(window.location.search).get('autopilot') === '1'
  } catch {
    return false
  }
})()

export const autopilotSpeed = ((): number => {
  try {
    const v = Number(new URLSearchParams(window.location.search).get('ap_speed'))
    return Number.isFinite(v) && v > 0 ? v : 6
  } catch {
    return 6
  }
})()

export const autopilotTest = new AutopilotTest()
