/**
 * 设置面板：灵敏度、相机、画质、音量、指针锁定、FPS 与键位自定义。
 * 可在主菜单与暂停菜单中打开。所有设置持久化到 localStorage。
 */
import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { ACTION_LABELS, DEFAULT_KEYBINDS, keyCodeName, type ControlAction } from '../input/keybinds'
import { inputBus } from '../input/InputBus'
import { engineAudio } from '../audio/engineSound'

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}): React.ReactElement {
  return (
    <label className="setting-row">
      <span className="setting-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="setting-value">{props.value.toFixed(props.step < 1 ? 2 : 1)}</span>
    </label>
  )
}

function KeybindsEditor(): React.ReactElement {
  const keybinds = useGameStore((s) => s.keybinds)
  const updateKeybind = useGameStore((s) => s.updateKeybind)
  const resetKeybinds = useGameStore((s) => s.resetKeybinds)
  const [capturing, setCapturing] = useState<ControlAction | null>(null)

  const startCapture = (action: ControlAction): void => {
    setCapturing(action)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    if (!capturing) return
    e.preventDefault()
    e.stopPropagation()
    if (e.code === 'Escape') {
      setCapturing(null)
      return
    }
    // 检查冲突：同一键已有其他动作则移除
    const newBinds = { ...keybinds }
    for (const a of Object.keys(newBinds) as ControlAction[]) {
      newBinds[a] = newBinds[a].filter((c) => c !== e.code)
    }
    const merged = [...newBinds[capturing], e.code]
    updateKeybind(capturing, merged)
    setCapturing(null)
  }

  return (
    <div className="keybinds" onKeyDown={onKey}>
      <div className="section-title">键位自定义（点击行后按下新键）</div>
      <div className="keybind-list">
        {(Object.keys(DEFAULT_KEYBINDS) as ControlAction[]).map((action) => (
          <button
            key={action}
            type="button"
            className={`keybind-row ${capturing === action ? 'capturing' : ''}`}
            onClick={() => startCapture(action)}
          >
            <span className="keybind-action">{ACTION_LABELS[action]}</span>
            <span className="keybind-keys">
              {capturing === action ? '按下新键… (Esc 取消)' : keybinds[action].map(keyCodeName).join(' / ')}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-small" onClick={resetKeybinds}>
        恢复默认键位
      </button>
    </div>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const resetSettings = useGameStore((s) => s.resetSettings)
  const [tab, setTab] = useState<'general' | 'keys'>('general')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel-settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>设置</h2>
          <button type="button" className="btn btn-small" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="tabs">
          <button type="button" className={`tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
            通用
          </button>
          <button type="button" className={`tab ${tab === 'keys' ? 'active' : ''}`} onClick={() => setTab('keys')}>
            键位
          </button>
        </div>

        {tab === 'general' && (
          <div className="panel-body">
            <Slider
              label="升降舵灵敏度"
              value={settings.sensElevator}
              min={0.4}
              max={2}
              step={0.1}
              onChange={(v) => updateSettings({ sensElevator: v })}
            />
            <Slider
              label="副翼灵敏度"
              value={settings.sensAileron}
              min={0.4}
              max={2}
              step={0.1}
              onChange={(v) => updateSettings({ sensAileron: v })}
            />
            <Slider
              label="方向舵灵敏度"
              value={settings.sensRudder}
              min={0.4}
              max={2}
              step={0.1}
              onChange={(v) => updateSettings({ sensRudder: v })}
            />
            <Slider
              label="相机平滑"
              value={settings.cameraSmooth}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(v) => updateSettings({ cameraSmooth: v })}
            />
            <Slider
              label="音量"
              value={settings.volume}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => {
                updateSettings({ volume: v })
                engineAudio.setVolume(v)
              }}
            />
            <div className="setting-row">
              <span className="setting-label">画质</span>
              <div className="segmented">
                <button
                  type="button"
                  className={settings.quality === 'low' ? 'active' : ''}
                  onClick={() => updateSettings({ quality: 'low' })}
                >
                  低
                </button>
                <button
                  type="button"
                  className={settings.quality === 'high' ? 'active' : ''}
                  onClick={() => updateSettings({ quality: 'high' })}
                >
                  高
                </button>
              </div>
            </div>
            <div className="setting-row">
              <span className="setting-label">鼠标指针锁定控制</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.pointerLock}
                  onChange={(e) => updateSettings({ pointerLock: e.target.checked })}
                />
                <span className="switch-track" />
              </label>
              <span className="setting-hint">{settings.pointerLock ? '飞行中点击画面锁定鼠标' : '关闭'}</span>
            </div>
            <div className="setting-row">
              <span className="setting-label">显示 FPS</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.showFps}
                  onChange={(e) => updateSettings({ showFps: e.target.checked })}
                />
                <span className="switch-track" />
              </label>
            </div>
            <button type="button" className="btn btn-small" onClick={resetSettings}>
              恢复默认设置
            </button>
          </div>
        )}

        {tab === 'keys' && (
          <div className="panel-body">
            <KeybindsEditor />
            <div className="setting-hint">
              提示：点击画布可启用指针锁定（需在设置中开启），鼠标控制副翼/升降舵；Esc 退出锁定。
            </div>
            {inputBus.pointerLocked && (
              <button type="button" className="btn btn-small" onClick={() => inputBus.exitPointerLock()}>
                退出指针锁定
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
