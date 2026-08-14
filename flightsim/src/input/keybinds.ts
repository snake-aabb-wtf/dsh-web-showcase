/** 键位定义：动作 → 默认键码列表（KeyboardEvent.code），可在设置中自定义 */

export const CONTROL_ACTIONS = [
  'pitchUp',
  'pitchDown',
  'rollLeft',
  'rollRight',
  'yawLeft',
  'yawRight',
  'throttleUp',
  'throttleDown',
  'flaps',
  'gear',
  'brake',
  'view',
  'pause',
  'reset',
  'debug',
  'trimUp',
  'trimDown',
] as const

export type ControlAction = (typeof CONTROL_ACTIONS)[number]

/** 按住型动作（持续生效） */
export const HELD_ACTIONS: readonly ControlAction[] = [
  'pitchUp',
  'pitchDown',
  'rollLeft',
  'rollRight',
  'yawLeft',
  'yawRight',
  'throttleUp',
  'throttleDown',
  'brake',
  'trimUp',
  'trimDown',
]

/** 边沿触发型动作（按下一次触发一次） */
export const EDGE_ACTIONS: readonly ControlAction[] = [
  'flaps',
  'gear',
  'view',
  'pause',
  'reset',
  'debug',
]

export const ACTION_LABELS: Record<ControlAction, string> = {
  pitchUp: '拉杆（抬头）',
  pitchDown: '推杆（低头）',
  rollLeft: '左压杆（左滚）',
  rollRight: '右压杆（右滚）',
  yawLeft: '左舵',
  yawRight: '右舵',
  throttleUp: '增大油门',
  throttleDown: '减小油门',
  flaps: '收放襟翼',
  gear: '收放起落架',
  brake: '刹车',
  view: '切换视角',
  pause: '暂停 / 继续',
  reset: '重置飞行',
  debug: '调试信息',
  trimUp: '抬头配平',
  trimDown: '低头配平',
}

export const DEFAULT_KEYBINDS: Record<ControlAction, string[]> = {
  pitchUp: ['KeyW', 'ArrowUp'],
  pitchDown: ['KeyS', 'ArrowDown'],
  rollLeft: ['KeyA', 'ArrowLeft'],
  rollRight: ['KeyD', 'ArrowRight'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'PageUp'],
  throttleDown: ['ControlLeft', 'ControlRight', 'PageDown'],
  flaps: ['KeyF'],
  gear: ['KeyG'],
  brake: ['KeyB'],
  view: ['KeyV'],
  pause: ['KeyP'],
  reset: ['KeyR'],
  debug: ['F1'],
  trimUp: ['KeyX'],
  trimDown: ['KeyC'],
}

/** 键码 → 可读名称（设置面板显示用） */
export function keyCodeName(code: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: '左 Shift',
    ShiftRight: '右 Shift',
    ControlLeft: '左 Ctrl',
    ControlRight: '右 Ctrl',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    KeyW: 'W',
    KeyS: 'S',
    KeyA: 'A',
    KeyD: 'D',
    KeyQ: 'Q',
    KeyE: 'E',
    KeyF: 'F',
    KeyG: 'G',
    KeyB: 'B',
    KeyV: 'V',
    KeyP: 'P',
    KeyR: 'R',
    KeyX: 'X',
    KeyC: 'C',
    F1: 'F1',
    Space: '空格',
    Escape: 'Esc',
    Enter: '回车',
    Tab: 'Tab',
  }
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return '小键盘' + code.slice(6)
  return map[code] ?? code
}
