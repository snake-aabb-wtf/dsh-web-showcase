/**
 * 主菜单：开始飞行 / 起降任务 / 操作说明 / 设置。
 */
import { useState } from 'react'
import { startFlight } from '../session'
import { ACTION_LABELS, DEFAULT_KEYBINDS, keyCodeName, type ControlAction } from '../input/keybinds'
import { SettingsPanel } from './SettingsPanel'

export function MainMenu(): React.ReactElement {
  const [showControls, setShowControls] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="menu-screen">
      <div className="menu-sky" />
      <div className="menu-content">
        <h1 className="menu-title">
          SKY<span>172</span> 飞行模拟器
        </h1>
        <p className="menu-subtitle">纯前端 · 离线可运行 · 手写六自由度气动物理</p>
        <div className="menu-buttons">
          <button type="button" className="btn btn-primary" onClick={() => startFlight('free')}>
            ✈ 开始飞行
          </button>
          <button type="button" className="btn" onClick={() => startFlight('task')}>
            🎯 起降任务
          </button>
          <button type="button" className="btn" onClick={() => setShowControls(true)}>
            📖 操作说明
          </button>
          <button type="button" className="btn" onClick={() => setShowSettings(true)}>
            ⚙ 设置
          </button>
        </div>
        <p className="menu-footer">Cessna 172 基准气动 · Three.js / R3F · 120Hz 固定步长物理</p>
      </div>

      {showControls && <ControlsPanel onClose={() => setShowControls(false)} />}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export function ControlsPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const kb = DEFAULT_KEYBINDS
  const rows: { action: ControlAction; extra?: string }[] = [
    { action: 'pitchUp' },
    { action: 'pitchDown' },
    { action: 'rollLeft' },
    { action: 'rollRight' },
    { action: 'yawLeft' },
    { action: 'yawRight' },
    { action: 'throttleUp' },
    { action: 'throttleDown' },
    { action: 'flaps' },
    { action: 'gear' },
    { action: 'brake' },
    { action: 'view' },
    { action: 'pause' },
    { action: 'reset' },
    { action: 'debug', extra: '调试面板' },
  ]
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel-controls" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>操作说明</h2>
          <button type="button" className="btn btn-small" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="panel-body">
          <div className="tips">
            <p>• 起飞：按住 Shift 推满油门 → 空速 55 kt 左右轻拉杆抬轮 → 离地后收轮收襟翼。</p>
            <p>• 失速改出：大攻角拉杆速度下降 → 机头下坠并告警 → 推杆减小攻角、加油门恢复速度。</p>
            <p>• 着陆：放下起落架(G)与襟翼(F)，进近速度 65 kt 左右，接地下降率控制在 690 ft/min 以内。</p>
            <p>• 视角：V 切换第三人称/座舱；座舱内可见六块仪表，读数与物理实时一致。</p>
            <p>• 暂停 P · 重置 R · 调试 F1；设置中可自定义键位、灵敏度与画质。</p>
          </div>
          <table className="key-table">
            <thead>
              <tr>
                <th>功能</th>
                <th>按键</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.action}>
                  <td>{ACTION_LABELS[r.action]}{r.extra ? `（${r.extra}）` : ''}</td>
                  <td className="keys">{kb[r.action].map(keyCodeName).join(' / ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
