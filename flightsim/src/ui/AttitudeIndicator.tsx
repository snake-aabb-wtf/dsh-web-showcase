/**
 * HUD 姿态仪（第三人称视角用）：与座舱内姿态仪同一绘制函数（gauges.drawAttitude），
 * 读数同样来自 flightEngine.state，指数平滑后 Canvas 2D 绘制。
 */
import { useEffect, useRef } from 'react'
import { flightEngine } from '../physics/engine'
import { damp, toDeg } from '../utils/math'
import { drawAttitude } from '../cockpit/gauges'

const SIZE = 132

export function AttitudeIndicator({ visible }: { visible: boolean }): React.ReactElement | null {
  const ref = useRef<HTMLCanvasElement>(null)
  const smooth = useRef({ pitch: 0, roll: 0 })

  useEffect(() => {
    if (!visible) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const s = flightEngine.state
      const st = smooth.current
      st.pitch = damp(st.pitch, toDeg(s.pitch), 12, dt)
      st.roll = damp(st.roll, toDeg(s.roll), 12, dt)
      const canvas = ref.current
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = SIZE * dpr
        if (canvas.width !== w) {
          canvas.width = w
          canvas.height = w
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          drawAttitude(ctx, SIZE, st.pitch, st.roll)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [visible])

  return (
    <div className="hud-attitude" style={{ display: visible ? undefined : 'none' }}>
      <canvas ref={ref} style={{ width: SIZE, height: SIZE }} />
      <span>姿态</span>
    </div>
  )
}
