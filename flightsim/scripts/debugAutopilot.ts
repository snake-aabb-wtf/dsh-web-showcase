/**
 * 无头复现自动驾驶序列（与浏览器共用同一 AutopilotTest 控制器），快速迭代调试。
 * 模拟 6fps 渲染 + 6× 时间加速：每帧 tick(1/6 s)。
 */
import { FlightEngine, PHYSICS_DT } from '../src/physics/engine'
import { AutopilotTest } from '../src/dev/autopilot'
import type { ControlSensitivity } from '../src/types/physics'

// Node 垫片：autopilot 模块的 window 访问
const g = globalThis as unknown as { window?: unknown }
g.window = { location: { search: '' } }

const SENS: ControlSensitivity = { elevator: 1, aileron: 1, rudder: 1 }

const e = new FlightEngine()
const ap = new AutopilotTest()

for (let f = 0; f < 4000; f++) {
  const ctrl = ap.update(e)
  e.setControls(ctrl, SENS)
  e.tick(1 / 6) // 一帧 = 1/6 仿真秒（20 个固定步）
  if (f % 30 === 0) {
    const s = e.state
    const ph = (g.window as { __apPhase?: string }).__apPhase ?? '?'
    console.log(
      `[${ph}] t=${s.time.toFixed(0)} ALT=${(s.position.y * 3.2808).toFixed(0)}ft V=${s.airspeed.toFixed(1)} ` +
        `pitch=${(s.pitch * 57.3).toFixed(1)}° α=${(s.alpha * 57.3).toFixed(1)}° roll=${(s.roll * 57.3).toFixed(1)}° ` +
        `V/S=${s.climbRate.toFixed(1)} stall=${s.stall} inElev=${ctrl.elevator.toFixed(1)} defl=${e.debug.elevatorDefl.toFixed(2)} crashed=${s.crashed}`,
    )
  }
  if (e.state.crashed || ap.report.done) {
    const s = e.state
    const ph = (g.window as { __apPhase?: string }).__apPhase ?? '?'
    console.log(
      `[结束 ${ph}] t=${s.time.toFixed(1)} pos=(${s.position.x.toFixed(0)}, ${s.position.z.toFixed(0)}) r=${Math.hypot(s.position.x, s.position.z).toFixed(0)} ` +
        `ALT=${(s.position.y * 3.2808).toFixed(0)}ft V=${s.airspeed.toFixed(1)} pitch=${(s.pitch * 57.3).toFixed(1)}° ` +
        `hdg=${((s.heading * 57.3 + 360) % 360).toFixed(0)}° crashed=${s.crashed} ${s.crashInfo}`,
    )
    break
  }
}

console.log('\n=== 检查项 ===')
for (const c of ap.report.checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`)
}
console.log(`阶段: ${ap.report.phase}  坠毁: ${e.state.crashed} ${e.state.crashInfo}`)
