/**
 * 暂停菜单与坠毁提示。
 */
import { useState } from 'react'
import { backToMenu, resetFlight, resumeFlight } from '../session'
import { useGameStore } from '../store/gameStore'
import { SettingsPanel } from './SettingsPanel'
import { ControlsPanel } from './MainMenu'

export function PauseMenu(): React.ReactElement {
  const [showSettings, setShowSettings] = useState(false)
  const [showControls, setShowControls] = useState(false)

  return (
    <div className="modal-backdrop dim">
      <div className="modal panel-pause" onClick={(e) => e.stopPropagation()}>
        <h2>已暂停</h2>
        <div className="menu-buttons column">
          <button type="button" className="btn btn-primary" onClick={resumeFlight}>
            ▶ 继续飞行
          </button>
          <button type="button" className="btn" onClick={() => setShowSettings(true)}>
            ⚙ 设置
          </button>
          <button type="button" className="btn" onClick={() => setShowControls(true)}>
            📖 操作说明
          </button>
          <button type="button" className="btn" onClick={resetFlight}>
            ↺ 重置飞行
          </button>
          <button type="button" className="btn btn-danger" onClick={backToMenu}>
            ⌂ 返回主菜单
          </button>
        </div>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showControls && <ControlsPanel onClose={() => setShowControls(false)} />}
    </div>
  )
}

export function CrashOverlay(): React.ReactElement {
  const crashInfo = useGameStore((s) => s.crashInfo)

  return (
    <div className="modal-backdrop dim">
      <div className="modal panel-crash" onClick={(e) => e.stopPropagation()}>
        <h2 className="crash-title">💥 坠毁</h2>
        <p className="crash-message">{crashInfo?.message ?? '飞机坠毁。'}</p>
        <div className="menu-buttons column">
          <button type="button" className="btn btn-primary" onClick={resetFlight}>
            ↺ 重新开始
          </button>
          <button type="button" className="btn" onClick={backToMenu}>
            ⌂ 返回主菜单
          </button>
        </div>
      </div>
    </div>
  )
}
