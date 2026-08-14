/**
 * 应用根组件：主菜单 / 飞行（Canvas + HUD + 仪表 + 覆盖层）。
 * 输入总线与物理引擎回调在此接线；物理循环在 Canvas 内的 FlightLoop 中驱动。
 */
import * as THREE from 'three'
import { useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment } from './world/Environment'
import { FlightObject } from './aircraft/FlightObject'
import { CameraRig } from './cameras/CameraRig'
import { HUD } from './ui/HUD'
import { InstrumentCluster } from './cockpit/instruments'
import { MainMenu } from './ui/MainMenu'
import { PauseMenu, CrashOverlay } from './ui/PauseMenu'
import { DebugPanel } from './ui/DebugPanel'
import { inputBus } from './input/InputBus'
import { sampleControlInput } from './physics/controls'
import { flightEngine } from './physics/engine'
import { engineAudio } from './audio/engineSound'
import { mission, togglePause, resetFlight, startFlight } from './session'
import { useGameStore } from './store/gameStore'
import { autopilotEnabled, autopilotSpeed, autopilotTest } from './dev/autopilot'
import { DEFAULT_SENSITIVITY } from './config/sensitivity'

/** Canvas 内物理循环：采样输入（键盘/手柄 或 自动驾驶测试钩子）→ 固定步长推进（与渲染帧率解耦） */
function FlightLoop(): React.ReactElement | null {
  useFrame((_, delta) => {
    if (autopilotEnabled) {
      flightEngine.setControls(autopilotTest.update(flightEngine), DEFAULT_SENSITIVITY)
    } else {
      const { ctrl, sens } = sampleControlInput()
      flightEngine.setControls(ctrl, sens)
    }
    flightEngine.tick(delta)
    if (autopilotEnabled) autopilotTest.maybePublish()
    if (mission.activeNow) mission.update(flightEngine.state)
    const s = flightEngine.state
    engineAudio.update(s.rpm, s.throttle, s.ias, s.stall)
  })
  return null
}

export function App(): React.ReactElement {
  const screen = useGameStore((s) => s.screen)
  const view = useGameStore((s) => s.view)
  const showDebug = useGameStore((s) => s.showDebug)

  // 自动驾驶验证模式：自动开始飞行并加速仿真
  useEffect(() => {
    if (!autopilotEnabled) return
    flightEngine.setTimeScale(autopilotSpeed)
    startFlight('free')
  }, [])

  // 输入与事件接线（一次性）
  useEffect(() => {
    inputBus.attach()
    const offs = [
      inputBus.onEdge('flaps', () => flightEngine.requestFlaps()),
      inputBus.onEdge('gear', () => flightEngine.requestGear()),
      inputBus.onEdge('view', () => {
        const st = useGameStore.getState()
        if (st.screen === 'flying' || st.screen === 'paused') st.toggleView()
      }),
      inputBus.onEdge('pause', () => {
        const st = useGameStore.getState()
        if (st.screen === 'flying' || st.screen === 'paused') togglePause()
      }),
      inputBus.onEdge('reset', () => {
        const st = useGameStore.getState()
        if (st.screen === 'flying' || st.screen === 'paused' || st.screen === 'crashed') resetFlight()
      }),
      inputBus.onEdge('debug', () => useGameStore.getState().toggleDebug()),
    ]
    flightEngine.onCrash = (e) => {
      useGameStore.getState().setCrashInfo(e)
      useGameStore.getState().setScreen('crashed')
    }
    flightEngine.onTouchdown = () => {
      // 任务进度在 FlightLoop 中逐帧推进
    }
    return () => {
      offs.forEach((off) => off())
      inputBus.detach()
    }
  }, [])

  // 暂停状态同步到引擎
  useEffect(() => {
    flightEngine.paused = screen === 'paused'
  }, [screen])

  const inFlight = screen === 'flying' || screen === 'paused' || screen === 'crashed'

  return (
    <div className="app">
      {screen === 'menu' && <MainMenu />}

      {inFlight && (
        <>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ fov: 62, near: 0.1, far: 30000, position: [-25, 9, -35] }}
            gl={{ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping
              gl.toneMappingExposure = 1.05
            }}
            onClick={(e) => {
              // 指针锁定：点击画布锁定（需在设置中开启该功能）
              const st = useGameStore.getState()
              if (st.settings.pointerLock && st.screen === 'flying') {
                inputBus.requestPointerLock(e.target as HTMLElement)
              }
            }}
          >
            <Environment />
            <FlightObject />
            <CameraRig />
            <FlightLoop />
          </Canvas>

          <HUD />
          <InstrumentCluster visible={view === 'cockpit'} />
          {showDebug && <DebugPanel />}
          {screen === 'paused' && <PauseMenu />}
          {screen === 'crashed' && <CrashOverlay />}
        </>
      )}
    </div>
  )
}
