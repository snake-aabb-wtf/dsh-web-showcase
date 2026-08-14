/**
 * 输入总线：键盘（支持自定义键位）、鼠标指针锁定、手柄。
 * 与物理引擎解耦：这里只维护"按住集合 / 边沿事件 / 鼠标增量"，由采样模块
 * 每帧转换为 ControlInput 交给引擎。
 */
import { EDGE_ACTIONS, type ControlAction } from './keybinds'
import { useGameStore } from '../store/gameStore'

type EdgeHandler = () => void

class InputBus {
  /** 当前按住的键码 → 动作（支持一个动作多个键、多键同时按） */
  private pressed = new Map<string, ControlAction>()
  private edgeHandlers = new Map<ControlAction, Set<EdgeHandler>>()
  private attached = false
  /** 指针锁定状态下累积的鼠标增量（像素/帧），由采样模块消费 */
  mouseDelta = { x: 0, y: 0 }
  pointerLocked = false

  attach(): void {
    if (this.attached) return
    this.attached = true
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  detach(): void {
    if (!this.attached) return
    this.attached = false
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
  }

  isHeld(action: ControlAction): boolean {
    for (const a of this.pressed.values()) {
      if (a === action) return true
    }
    return false
  }

  /** 注册边沿事件（如 F 键循环襟翼） */
  onEdge(action: ControlAction, handler: EdgeHandler): () => void {
    let set = this.edgeHandlers.get(action)
    if (!set) {
      set = new Set()
      this.edgeHandlers.set(action, set)
    }
    set.add(handler)
    return () => set?.delete(handler)
  }

  /** 消费并清零鼠标增量 */
  consumeMouseDelta(): { x: number; y: number } {
    const d = { x: this.mouseDelta.x, y: this.mouseDelta.y }
    this.mouseDelta.x = 0
    this.mouseDelta.y = 0
    return d
  }

  /** 请求指针锁定（需用户手势，如点击画布） */
  requestPointerLock(el: HTMLElement): void {
    if (!this.pointerLocked && el.requestPointerLock) {
      el.requestPointerLock()
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock()
    }
  }

  // ---------------- 内部 ----------------

  private keyToAction(code: string): ControlAction | null {
    const kb = useGameStore.getState().keybinds
    for (const action of kb instanceof Object ? Object.keys(kb) : []) {
      if (kb[action as ControlAction]?.includes(code)) return action as ControlAction
    }
    return null
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
    if (e.code === 'Escape' && !this.pointerLocked) {
      // Esc：飞行中呼出暂停（在会话层处理）
      this.fireEdge('pause')
      return
    }
    const action = this.keyToAction(e.code)
    if (!action) return
    e.preventDefault()
    if (this.pressed.has(e.code)) return // 长按去重
    this.pressed.set(e.code, action)
    if (EDGE_ACTIONS.includes(action)) {
      this.fireEdge(action)
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code)
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement) {
      this.mouseDelta.x += e.movementX
      this.mouseDelta.y += e.movementY
    }
  }

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement !== null
    if (!this.pointerLocked) {
      this.mouseDelta.x = 0
      this.mouseDelta.y = 0
    }
  }

  private fireEdge(action: ControlAction): void {
    const set = this.edgeHandlers.get(action)
    if (!set) return
    for (const h of [...set]) h()
  }
}

export const inputBus = new InputBus()
