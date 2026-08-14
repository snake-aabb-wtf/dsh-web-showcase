/**
 * HUD 平显：速度/高度/航向/油门/升降率 + 失速警告 + 边界警告 +
 * 起落架/襟翼/刹车状态 + 任务清单 + FPS。
 * 数值更新走 rAF + DOM ref（textContent），不经过 React setState，保证 60 帧流畅。
 */
import { useEffect, useRef } from 'react'
import { flightEngine } from '../physics/engine'
import { mission } from '../session'
import { MISSION_STEPS } from '../mission/tracker'
import { useGameStore } from '../store/gameStore'
import { headingDeg, mToFeet, msToFpm, msToKnots } from '../utils/format'
import { fmt0 } from '../utils/format'
import { AttitudeIndicator } from './AttitudeIndicator'

export function HUD(): React.ReactElement {
  const iasRef = useRef<HTMLSpanElement>(null)
  const altRef = useRef<HTMLSpanElement>(null)
  const vsiRef = useRef<HTMLSpanElement>(null)
  const hdgRef = useRef<HTMLSpanElement>(null)
  const thrRef = useRef<HTMLSpanElement>(null)
  const rpmRef = useRef<HTMLSpanElement>(null)
  const gearRef = useRef<HTMLDivElement>(null)
  const flapRef = useRef<HTMLDivElement>(null)
  const brakeRef = useRef<HTMLDivElement>(null)
  const trimRef = useRef<HTMLDivElement>(null)
  const stallRef = useRef<HTMLDivElement>(null)
  const boundaryRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const missionPanelRef = useRef<HTMLDivElement>(null)
  const missionMsgRef = useRef<HTMLDivElement>(null)
  const missionListRef = useRef<HTMLDivElement>(null)

  const showFps = useGameStore((s) => s.settings.showFps)
  const view = useGameStore((s) => s.view)

  useEffect(() => {
    let raf = 0
    let frames = 0
    let fpsTime = performance.now()
    const loop = (now: number): void => {
      const s = flightEngine.state

      if (iasRef.current) iasRef.current.textContent = fmt0(msToKnots(s.ias))
      if (altRef.current) altRef.current.textContent = fmt0(mToFeet(s.position.y))
      if (vsiRef.current) vsiRef.current.textContent = `${s.climbRate >= 0 ? '+' : ''}${fmt0(msToFpm(s.climbRate))}`
      if (hdgRef.current) hdgRef.current.textContent = fmt0(headingDeg(s.heading) % 360)
      if (thrRef.current) thrRef.current.textContent = fmt0(s.throttle * 100)
      if (rpmRef.current) rpmRef.current.textContent = fmt0(s.rpm)

      if (gearRef.current) {
        gearRef.current.classList.toggle('active', s.gearTransition >= 0.5)
        gearRef.current.textContent = s.gearTransition >= 0.5 ? '起落架收起' : '起落架放下'
      }
      if (flapRef.current) {
        const label = ['襟翼 0°', '襟翼 10°', '襟翼 30°'][s.flapSetting]
        flapRef.current.classList.toggle('active', s.flapSetting > 0)
        flapRef.current.textContent = label
      }
      if (brakeRef.current) {
        brakeRef.current.classList.toggle('active', s.brake && s.onGround)
        brakeRef.current.textContent = s.brake ? '刹车 ON' : '刹车'
      }
      if (trimRef.current) {
        trimRef.current.classList.toggle('active', Math.abs(s.elevatorTrim) > 0.01)
        trimRef.current.textContent = `配平 ${s.elevatorTrim >= 0 ? '+' : ''}${(s.elevatorTrim * 57.3).toFixed(1)}°`
      }
      if (stallRef.current) {
        const stalled = s.stall
        stallRef.current.style.display = stalled ? 'block' : 'none'
        stallRef.current.textContent = stalled ? '⚠ 失速 STALL — 推杆减小攻角' : ''
      }
      if (boundaryRef.current) {
        boundaryRef.current.style.display = s.boundaryWarn ? 'block' : 'none'
      }

      // 任务清单
      if (missionPanelRef.current || missionMsgRef.current || missionListRef.current) {
        const snap = mission.getSnapshot()
        if (missionPanelRef.current) {
          missionPanelRef.current.style.display = snap.active ? 'block' : 'none'
        }
        if (missionMsgRef.current) {
          missionMsgRef.current.textContent = snap.active ? snap.message : ''
        }
        if (missionListRef.current && snap.active) {
          let html = ''
          for (const step of MISSION_STEPS) {
            const done = snap.done[step.phase]
            const cur = snap.phase === step.phase && !snap.complete
            html += `<div class="mission-step ${done ? 'done' : ''} ${cur ? 'current' : ''}">${done ? '✔' : cur ? '▸' : '•'} ${step.label}</div>`
          }
          if (missionListRef.current.innerHTML !== html) {
            missionListRef.current.innerHTML = html
          }
        } else if (missionListRef.current) {
          missionListRef.current.innerHTML = ''
        }
      }

      // FPS
      frames += 1
      if (now - fpsTime >= 500) {
        if (fpsRef.current) fpsRef.current.textContent = fmt0((frames * 1000) / (now - fpsTime))
        frames = 0
        fpsTime = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="hud">
      <div className="hud-left-group">
        <div className="hud-left">
          <div className="hud-block">
            <span className="hud-label">空速</span>
            <span className="hud-value" ref={iasRef}>0</span>
            <span className="hud-unit">kt</span>
          </div>
          <div className="hud-block">
            <span className="hud-label">高度</span>
            <span className="hud-value" ref={altRef}>0</span>
            <span className="hud-unit">ft</span>
          </div>
          <div className="hud-block">
            <span className="hud-label">升降率</span>
            <span className="hud-value hud-small" ref={vsiRef}>0</span>
            <span className="hud-unit">ft/min</span>
          </div>
        </div>
        <AttitudeIndicator visible={view === 'chase'} />
      </div>

      <div className="hud-right">
        <div className="hud-block">
          <span className="hud-label">航向</span>
          <span className="hud-value" ref={hdgRef}>90</span>
          <span className="hud-unit">°</span>
        </div>
        <div className="hud-block">
          <span className="hud-label">油门</span>
          <span className="hud-value" ref={thrRef}>0</span>
          <span className="hud-unit">%</span>
        </div>
        <div className="hud-block">
          <span className="hud-label">转速</span>
          <span className="hud-value" ref={rpmRef}>0</span>
          <span className="hud-unit">RPM</span>
        </div>
      </div>

      <div className="hud-center-top">
        <div className="stall-warning" ref={stallRef} style={{ display: 'none' }} />
        <div className="boundary-warning" ref={boundaryRef} style={{ display: 'none' }}>
          ⚠ 即将飞出边界，请转向返场
        </div>
      </div>

      <div className="hud-bottom-left">
        <div className="chip" ref={gearRef}>起落架放下</div>
        <div className="chip" ref={flapRef}>襟翼 0°</div>
        <div className="chip" ref={brakeRef}>刹车</div>
        <div className="chip" ref={trimRef}>配平 0.0°</div>
      </div>

      <div className="mission-panel" ref={missionPanelRef}>
        <div className="mission-title">起降任务</div>
        <div ref={missionListRef} className="mission-list" />
        <div ref={missionMsgRef} className="mission-msg" />
      </div>

      {showFps && (
        <div className="fps-counter">
          FPS <span ref={fpsRef}>-</span>
        </div>
      )}

      <div className="hud-hint">V 切换视角 · P 暂停 · R 重置</div>
    </div>
  )
}
