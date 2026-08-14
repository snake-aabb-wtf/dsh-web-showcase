/**
 * 控制采样：把键盘（可自定义键位）+ 鼠标指针锁定 + 手柄输入
 * 合成为每个物理帧的 ControlInput 与灵敏度。
 */
import type { ControlInput, ControlSensitivity } from '../types/physics'
import { inputBus } from '../input/InputBus'
import { useGameStore } from '../store/gameStore'
import { clamp } from '../utils/math'

const DEADZONE = 0.18
const MOUSE_GAIN = 0.004

function readGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
  const pads = navigator.getGamepads()
  for (const p of pads) {
    if (p && p.connected) return p
  }
  return null
}

/**
 * 每渲染帧调用一次，返回引擎所需输入。
 * 若手柄提供值则手柄优先（键盘仍可叠加）。
 */
export function sampleControlInput(): { ctrl: ControlInput; sens: ControlSensitivity } {
  const { settings } = useGameStore.getState()

  let elevator = (inputBus.isHeld('pitchUp') ? 1 : 0) + (inputBus.isHeld('pitchDown') ? -1 : 0)
  let aileron = (inputBus.isHeld('rollRight') ? 1 : 0) + (inputBus.isHeld('rollLeft') ? -1 : 0)
  let rudder = (inputBus.isHeld('yawRight') ? 1 : 0) + (inputBus.isHeld('yawLeft') ? -1 : 0)
  let throttleDelta = (inputBus.isHeld('throttleUp') ? 1 : 0) + (inputBus.isHeld('throttleDown') ? -1 : 0)
  const brake = inputBus.isHeld('brake')
  const trimDelta = (inputBus.isHeld('trimUp') ? 1 : 0) + (inputBus.isHeld('trimDown') ? -1 : 0)
  let throttleTarget: number | undefined

  // 鼠标指针锁定控制（加分项）：移动鼠标控制副翼/升降舵
  if (settings.pointerLock && inputBus.pointerLocked) {
    const md = inputBus.consumeMouseDelta()
    const mRoll = clamp(md.x * MOUSE_GAIN * settings.sensAileron, -1, 1)
    const mPitch = clamp(-md.y * MOUSE_GAIN * settings.sensElevator, -1, 1)
    aileron = clamp(aileron + mRoll, -1, 1)
    elevator = clamp(elevator + mPitch, -1, 1)
  }

  // 手柄（加分项）：左摇杆副翼/升降舵，右摇杆方向舵，扳机/肩键油门
  const gp = readGamepad()
  if (gp) {
    if (Math.abs(gp.axes[0] ?? 0) > DEADZONE) aileron = gp.axes[0]
    if (Math.abs(gp.axes[1] ?? 0) > DEADZONE) elevator = -gp.axes[1]
    if (Math.abs(gp.axes[2] ?? 0) > DEADZONE) rudder = gp.axes[2]
    const trigger = gp.axes[3] ?? -1
    if (trigger > -0.8) {
      // 右扳机 0..1 作为目标油门
      throttleTarget = clamp((trigger + 1) / 2, 0, 1)
      throttleDelta = 0
    }
  }

  const ctrl: ControlInput = {
    elevator,
    aileron,
    rudder,
    throttleDelta,
    brake,
    throttleTarget,
    trimDelta,
  }
  const sens: ControlSensitivity = {
    elevator: settings.sensElevator,
    aileron: settings.sensAileron,
    rudder: settings.sensRudder,
  }
  return { ctrl, sens }
}
