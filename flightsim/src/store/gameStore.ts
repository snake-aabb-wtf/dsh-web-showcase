/**
 * 全局 UI / 设置状态（zustand）。
 * 注意：飞行数据（速度/高度等）不经过 React 状态，由 HUD/仪表通过 rAF 直接读取
 * 物理引擎状态，避免每帧 setState 造成渲染压力。
 */
import { create } from 'zustand'
import type { CrashEvent } from '../types/physics'
import type { Quality } from '../config/world'
import { CONTROL_ACTIONS, DEFAULT_KEYBINDS, type ControlAction } from '../input/keybinds'

export type Screen = 'menu' | 'flying' | 'paused' | 'crashed'
export type ViewMode = 'chase' | 'cockpit'

export interface Settings {
  sensElevator: number
  sensAileron: number
  sensRudder: number
  cameraSmooth: number
  quality: Quality
  volume: number
  pointerLock: boolean
  showFps: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  sensElevator: 1,
  sensAileron: 1,
  sensRudder: 1,
  cameraSmooth: 0.6,
  quality: 'high',
  volume: 0.5,
  pointerLock: false,
  showFps: false,
}

interface GameStoreState {
  screen: Screen
  view: ViewMode
  crashInfo: CrashEvent | null
  missionMode: boolean
  showDebug: boolean
  settings: Settings
  keybinds: Record<ControlAction, string[]>

  setScreen: (s: Screen) => void
  toggleView: () => void
  setCrashInfo: (info: CrashEvent | null) => void
  setMissionMode: (on: boolean) => void
  toggleDebug: () => void
  updateSettings: (patch: Partial<Settings>) => void
  updateKeybind: (action: ControlAction, codes: string[]) => void
  resetKeybinds: () => void
  resetSettings: () => void
}

const LS_SETTINGS = 'sky172.settings'
const LS_KEYBINDS = 'sky172.keybinds'

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) } as T
  } catch {
    return fallback
  }
}

function loadKeybinds(): Record<ControlAction, string[]> {
  try {
    const raw = localStorage.getItem(LS_KEYBINDS)
    if (!raw) return DEFAULT_KEYBINDS
    const parsed = JSON.parse(raw) as Partial<Record<ControlAction, string[]>>
    const merged = { ...DEFAULT_KEYBINDS }
    for (const a of CONTROL_ACTIONS) {
      if (Array.isArray(parsed[a]) && parsed[a]!.length > 0) merged[a] = parsed[a]!
    }
    return merged
  } catch {
    return DEFAULT_KEYBINDS
  }
}

export const useGameStore = create<GameStoreState>((set, get) => ({
  screen: 'menu',
  view: 'chase',
  crashInfo: null,
  missionMode: false,
  showDebug: false,
  settings: loadJSON<Settings>(LS_SETTINGS, DEFAULT_SETTINGS),
  keybinds: loadKeybinds(),

  setScreen: (s) => set({ screen: s }),
  toggleView: () => set((st) => ({ view: st.view === 'chase' ? 'cockpit' : 'chase' })),
  setCrashInfo: (info) => set({ crashInfo: info }),
  setMissionMode: (on) => set({ missionMode: on }),
  toggleDebug: () => set((st) => ({ showDebug: !st.showDebug })),
  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(next))
    } catch {
      /* 隐私模式下忽略 */
    }
  },
  updateKeybind: (action, codes) => {
    const next = { ...get().keybinds, [action]: codes }
    set({ keybinds: next })
    try {
      localStorage.setItem(LS_KEYBINDS, JSON.stringify(next))
    } catch {
      /* 忽略 */
    }
  },
  resetKeybinds: () => {
    set({ keybinds: DEFAULT_KEYBINDS })
    try {
      localStorage.setItem(LS_KEYBINDS, JSON.stringify(DEFAULT_KEYBINDS))
    } catch {
      /* 忽略 */
    }
  },
  resetSettings: () => {
    set({ settings: DEFAULT_SETTINGS })
    try {
      localStorage.setItem(LS_SETTINGS, JSON.stringify(DEFAULT_SETTINGS))
    } catch {
      /* 忽略 */
    }
  },
}))
