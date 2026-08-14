/**
 * 简单任务模式（加分项）：完成一次完整起降。
 * 阶段：滑跑起飞 → 爬升至 2000 ft → 巡航保持 → 转向返场 → 进近 → 着陆。
 * 纯逻辑模块，不依赖 React；由会话层每帧驱动。
 */
import type { FlightState } from '../types/physics'
import { isOnRunway } from '../world/heightfield'
import { RUNWAY } from '../config/world'
import { angleDiff } from '../utils/math'

export type MissionPhase = 'taxi' | 'climb' | 'cruise' | 'return' | 'approach' | 'landed'

export interface MissionSnapshot {
  active: boolean
  phase: MissionPhase
  /** 各阶段是否已完成（显示清单用） */
  done: Record<MissionPhase, boolean>
  message: string
  complete: boolean
}

export const MISSION_STEPS: { phase: MissionPhase; label: string }[] = [
  { phase: 'taxi', label: '滑跑起飞' },
  { phase: 'climb', label: '爬升至 2000 ft' },
  { phase: 'cruise', label: '巡航保持 8 秒' },
  { phase: 'return', label: '转向返场' },
  { phase: 'approach', label: '进近下降' },
  { phase: 'landed', label: '着陆（下降率 < 690 ft/min）' },
]

const CLIMB_ALT = 610 // 2000 ft
const CRUISE_MIN_ALT = 520
const CRUISE_HOLD_TIME = 8
const RETURN_DIST = 3500
const APPROACH_DIST = 1300
const APPROACH_ALT = 320

export class MissionTracker {
  private active = false
  private phase: MissionPhase = 'taxi'
  private done: Record<MissionPhase, boolean> = {
    taxi: false,
    climb: false,
    cruise: false,
    return: false,
    approach: false,
    landed: false,
  }
  private cruiseHoldStart = 0
  private wasOnGround = true
  private message = ''

  start(): void {
    this.active = true
    this.phase = 'taxi'
    this.done = { taxi: false, climb: false, cruise: false, return: false, approach: false, landed: false }
    this.cruiseHoldStart = 0
    this.wasOnGround = true
    this.message = '开始滑跑，推满油门起飞'
  }

  stop(): void {
    this.active = false
  }

  get activeNow(): boolean {
    return this.active
  }

  /** 每帧更新（渲染帧粒度足够，任务不需要物理步粒度） */
  update(s: FlightState): MissionSnapshot {
    if (!this.active || s.crashed) {
      return this.buildSnapshot()
    }

    // 接地事件检测（由引擎 touchdown 回调也可，这里用状态边沿）
    const touch = s.onGround && !this.wasOnGround
    this.wasOnGround = s.onGround

    switch (this.phase) {
      case 'taxi':
        if (s.airborne && s.ias > 25) {
          this.phase = 'climb'
          this.done.taxi = true
          this.message = '离地！保持爬升到 2000 ft'
        }
        break
      case 'climb':
        if (s.position.y >= CLIMB_ALT) {
          this.phase = 'cruise'
          this.done.climb = true
          this.cruiseHoldStart = s.time
          this.message = '到达 2000 ft，保持高度巡航'
        }
        break
      case 'cruise':
        if (s.position.y < CRUISE_MIN_ALT) {
          this.cruiseHoldStart = s.time
        } else if (s.time - this.cruiseHoldStart > CRUISE_HOLD_TIME) {
          this.phase = 'return'
          this.done.cruise = true
          this.message = '巡航完成，转向返场'
        }
        break
      case 'return': {
        const dist = Math.hypot(s.position.x - RUNWAY.center.x, s.position.z - RUNWAY.center.z)
        const bearing = Math.atan2(RUNWAY.center.z - s.position.z, RUNWAY.center.x - s.position.x)
        if (dist < RETURN_DIST && Math.abs(angleDiff(s.heading, bearing)) < 0.7) {
          this.phase = 'approach'
          this.done.return = true
          this.message = '对准跑道，放襟翼减速下降'
        }
        break
      }
      case 'approach':
        {
          const dist = Math.hypot(s.position.x - RUNWAY.center.x, s.position.z - RUNWAY.center.z)
          if (dist < APPROACH_DIST && s.position.y < APPROACH_ALT && s.climbRate < 1) {
            this.done.approach = true
          }
        }
        if (touch) {
          const onRunway = isOnRunway(s.position.x, s.position.z)
          if (onRunway && s.touchdownSink < 3.5) {
            this.phase = 'landed'
            this.done.landed = true
            this.message = '着陆成功！任务完成 🎉'
          } else {
            this.message = onRunway ? '着陆偏重/偏出跑道' : '未降落在跑道区域'
          }
        }
        break
      case 'landed':
        break
    }
    return this.buildSnapshot()
  }

  /** 供 HUD 每帧读取当前快照 */
  getSnapshot(): MissionSnapshot {
    return this.buildSnapshot()
  }

  private buildSnapshot(): MissionSnapshot {
    return {
      active: this.active,
      phase: this.phase,
      done: { ...this.done },
      message: this.message,
      complete: this.phase === 'landed' && this.done.landed,
    }
  }
}
