/**
 * 座舱仪表簇：六个 Canvas 仪表（空速/高度/姿态/航向/升降率/转速）。
 * 每帧由 rAF 读取物理状态 → 指数平滑指针 → 重绘，读数与物理实时一致且平滑。
 */
import { useEffect, useRef } from 'react'
import { flightEngine } from '../physics/engine'
import { headingDeg, mToFeet, msToFpm, msToKnots } from '../utils/format'
import { damp, toDeg } from '../utils/math'
import { drawAltimeter, drawASI, drawAttitude, drawHeading, drawTach, drawVSI } from './gauges'

const SIZE = 148

interface SmoothState {
  asi: number
  alt: number
  pitch: number
  roll: number
  hdg: number
  vsi: number
  rpm: number
}

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = SIZE * dpr
  if (canvas.width !== w) {
    canvas.width = w
    canvas.height = w
  }
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

export function InstrumentCluster({ visible }: { visible: boolean }): React.ReactElement {
  const asiRef = useRef<HTMLCanvasElement>(null)
  const altRef = useRef<HTMLCanvasElement>(null)
  const attRef = useRef<HTMLCanvasElement>(null)
  const hdgRef = useRef<HTMLCanvasElement>(null)
  const vsiRef = useRef<HTMLCanvasElement>(null)
  const rpmRef = useRef<HTMLCanvasElement>(null)
  const smooth = useRef<SmoothState>({ asi: 0, alt: 0, pitch: 0, roll: 0, hdg: 0, vsi: 0, rpm: 800 })

  useEffect(() => {
    if (!visible) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const s = flightEngine.state
      const st = smooth.current

      // 目标值（物理状态 → 仪表单位）与指数平滑
      const target = {
        asi: msToKnots(s.ias),
        alt: mToFeet(s.position.y),
        pitch: toDeg(s.pitch),
        roll: toDeg(s.roll),
        hdg: headingDeg(s.heading),
        vsi: msToFpm(s.climbRate),
        rpm: s.rpm,
      }
      st.asi = damp(st.asi, target.asi, 9, dt)
      st.alt = damp(st.alt, target.alt, 9, dt)
      st.pitch = damp(st.pitch, target.pitch, 12, dt)
      st.roll = damp(st.roll, target.roll, 12, dt)
      st.hdg = damp(st.hdg, target.hdg, 9, dt)
      st.vsi = damp(st.vsi, target.vsi, 9, dt)
      st.rpm = damp(st.rpm, target.rpm, 7, dt)

      const ctxs = {
        asi: asiRef.current ? setupCanvas(asiRef.current) : null,
        alt: altRef.current ? setupCanvas(altRef.current) : null,
        att: attRef.current ? setupCanvas(attRef.current) : null,
        hdg: hdgRef.current ? setupCanvas(hdgRef.current) : null,
        vsi: vsiRef.current ? setupCanvas(vsiRef.current) : null,
        rpm: rpmRef.current ? setupCanvas(rpmRef.current) : null,
      }
      if (ctxs.asi) drawASI(ctxs.asi, SIZE, st.asi)
      if (ctxs.alt) drawAltimeter(ctxs.alt, SIZE, st.alt)
      if (ctxs.att) drawAttitude(ctxs.att, SIZE, st.pitch, st.roll)
      if (ctxs.hdg) drawHeading(ctxs.hdg, SIZE, st.hdg)
      if (ctxs.vsi) drawVSI(ctxs.vsi, SIZE, st.vsi)
      if (ctxs.rpm) drawTach(ctxs.rpm, SIZE, st.rpm)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [visible])

  const canvasStyle: React.CSSProperties = { width: SIZE, height: SIZE }

  return (
    <div className="instrument-cluster" style={{ display: visible ? undefined : 'none' }}>
      <div className="instrument-row">
        <div className="instrument-cell">
          <canvas ref={asiRef} style={canvasStyle} />
          <span>空速 ASI</span>
        </div>
        <div className="instrument-cell">
          <canvas ref={altRef} style={canvasStyle} />
          <span>高度 ALT</span>
        </div>
        <div className="instrument-cell">
          <canvas ref={attRef} style={canvasStyle} />
          <span>姿态 ATT</span>
        </div>
      </div>
      <div className="instrument-row">
        <div className="instrument-cell">
          <canvas ref={hdgRef} style={canvasStyle} />
          <span>航向 HDG</span>
        </div>
        <div className="instrument-cell">
          <canvas ref={vsiRef} style={canvasStyle} />
          <span>升降率 VSI</span>
        </div>
        <div className="instrument-cell">
          <canvas ref={rpmRef} style={canvasStyle} />
          <span>转速 RPM</span>
        </div>
      </div>
    </div>
  )
}
