/**
 * 会话编排层：把输入事件、物理引擎、任务、音频、UI 状态连接起来。
 * 独立于 React 渲染周期 —— 物理循环由 Canvas 内的 FlightLoop 驱动（固定步长）。
 */
import { flightEngine } from './physics/engine'
import { engineAudio } from './audio/engineSound'
import { MissionTracker } from './mission/tracker'
import { useGameStore } from './store/gameStore'

export const mission = new MissionTracker()

/** 开始飞行（主菜单进入：自由飞行 / 起降任务） */
export function startFlight(mode: 'free' | 'task'): void {
  flightEngine.reset()
  const st = useGameStore.getState()
  st.setCrashInfo(null)
  st.setMissionMode(mode === 'task')
  if (mode === 'task') {
    mission.start()
  } else {
    mission.stop()
  }
  if (st.view !== 'chase') st.toggleView()
  st.setScreen('flying')
  // 音频需用户手势后创建
  engineAudio.init()
  engineAudio.setVolume(st.settings.volume)
}

/** 重置当前飞行（R 键 / 暂停菜单） */
export function resetFlight(): void {
  flightEngine.reset()
  const st = useGameStore.getState()
  st.setCrashInfo(null)
  if (st.missionMode) mission.start()
  st.setScreen('flying')
}

/** 暂停/继续（P 键 / 菜单按钮） */
export function togglePause(): void {
  const st = useGameStore.getState()
  if (st.screen === 'flying') {
    flightEngine.paused = true
    st.setScreen('paused')
  } else if (st.screen === 'paused') {
    flightEngine.paused = false
    st.setScreen('flying')
  }
}

export function resumeFlight(): void {
  flightEngine.paused = false
  useGameStore.getState().setScreen('flying')
}

/** 返回主菜单 */
export function backToMenu(): void {
  flightEngine.paused = false
  mission.stop()
  const st = useGameStore.getState()
  st.setCrashInfo(null)
  st.setMissionMode(false)
  st.setScreen('menu')
}
