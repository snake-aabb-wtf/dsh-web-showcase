/**
 * 调试面板（F1）：实时显示物理/飞行关键量，便于自测与调参。
 */
import { useEffect, useRef } from 'react'
import { flightEngine } from '../physics/engine'
import { headingDeg, mToFeet, msToFpm, msToKnots } from '../utils/format'
import { toDeg } from '../utils/math'

export function DebugPanel(): React.ReactElement {
  const bodyRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const el = bodyRef.current
      if (el) {
        const s = flightEngine.state
        const lines = [
          `IAS ${msToKnots(s.ias).toFixed(0)} kt | TAS ${s.airspeed.toFixed(0)} m/s`,
          `ALT ${mToFeet(s.position.y).toFixed(0)} ft | AGL ${s.altitudeAGL.toFixed(1)} m`,
          `V/S ${msToFpm(s.climbRate).toFixed(0)} fpm`,
          `α ${toDeg(s.alpha).toFixed(1)}° | β ${toDeg(s.beta).toFixed(1)}°`,
          `pitch ${toDeg(s.pitch).toFixed(1)}° | roll ${toDeg(s.roll).toFixed(1)}° | hdg ${(headingDeg(s.heading) % 360).toFixed(0)}°`,
          `thr ${(s.throttle * 100).toFixed(0)}% | rpm ${s.rpm.toFixed(0)} | flaps ${s.flapSetting} | gear ${s.gearTransition.toFixed(2)}`,
          `onGround ${s.onGround} | stall ${s.stall} | airborne ${s.airborne} | crashed ${s.crashed} ${s.crashReason}`,
          `pos ${s.position.x.toFixed(0)}, ${s.position.y.toFixed(1)}, ${s.position.z.toFixed(0)}`,
          `ω ${s.angularVelocity.x.toFixed(2)}, ${s.angularVelocity.y.toFixed(2)}, ${s.angularVelocity.z.toFixed(2)} rad/s`,
          `time ${s.time.toFixed(1)} s | rollDist ${s.groundRoll.toFixed(0)} m`,
        ]
        el.textContent = lines.join('\n')
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="debug-panel">
      <div className="debug-title">调试 (F1)</div>
      <pre ref={bodyRef} />
    </div>
  )
}
