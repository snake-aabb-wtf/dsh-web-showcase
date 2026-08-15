import { useCallback, useEffect, useRef, useState } from 'react'
import { World, type WorldStats } from './engine/World'
import type { MouseJoint } from './engine/dynamics/Joints'
import { Renderer, type DebugFlags } from './render/Renderer'
import { SCENES } from './demo/scenes'

/** 界面状态镜像（渲染循环里只读这份，避免闭包陈旧状态） */
interface UiRef {
  paused: boolean
  spawnMode: boolean
  debug: DebugFlags
}

const INITIAL_DEBUG: DebugFlags = { aabb: false, contacts: false, normals: false, velocities: false, joints: true }

const EMPTY_STATS: WorldStats = {
  bodyCount: 0,
  dynamicCount: 0,
  contactCount: 0,
  pairCount: 0,
  bucketCount: 0,
  sleepingCount: 0,
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<World | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const mouseJointRef = useRef<MouseJoint | null>(null)
  const uiRef = useRef<UiRef>({ paused: false, spawnMode: false, debug: INITIAL_DEBUG })
  const dragModeRef = useRef<'body' | 'pan' | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })

  const [sceneId, setSceneId] = useState(SCENES[0].id)
  const sceneIdRef = useRef(sceneId)
  const [paused, setPaused] = useState(false)
  const [spawnMode, setSpawnMode] = useState(false)
  const [debug, setDebug] = useState<DebugFlags>(INITIAL_DEBUG)
  const [stats, setStats] = useState<WorldStats>(EMPTY_STATS)
  const [fps, setFps] = useState(0)
  const [gravity, setGravity] = useState(1500)
  const [timeScale, setTimeScale] = useState(1)
  const [velIters, setVelIters] = useState(8)
  const [posIters, setPosIters] = useState(3)
  const [fixedDt, setFixedDt] = useState(1 / 120)

  const loadScene = useCallback((id: string) => {
    const world = worldRef.current
    const renderer = rendererRef.current
    if (!world || !renderer) return
    const scene = SCENES.find((s) => s.id === id) ?? SCENES[0]
    world.clear()
    // 场景可声明自己的求解迭代数（长关节链需要更多迭代），并同步 UI 滑杆
    if (scene.velocityIterations) world.settings.velocityIterations = scene.velocityIterations
    if (scene.positionIterations) world.settings.positionIterations = scene.positionIterations
    setVelIters(world.settings.velocityIterations)
    setPosIters(world.settings.positionIterations)
    scene.build(world)
    const b = scene.bounds
    renderer.focusOn(b.minX, b.minY, b.maxX, b.maxY)
    setStats(world.stats)
  }, [])

  // ---------------- 初始化 ----------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const world = new World()
    const renderer = new Renderer(canvas)
    worldRef.current = world
    rendererRef.current = renderer
    // 调试钩子：供自动化测试 / 控制台检查
    ;(window as unknown as Record<string, unknown>).__PHYSX = { world, renderer }
    renderer.resize()
    renderer.mouseWorld.set(0, 0)
    loadScene(sceneIdRef.current)

    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)

    // ---------------- 输入 ----------------
    const toLocal = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onPointerDown = (e: PointerEvent) => {
      const r = renderer
      const { x, y } = toLocal(e)
      const wp = r.screenToWorld(x, y)
      lastPointerRef.current = { x, y }

      if (e.button === 2 || e.button === 1) {
        // 右键/中键：平移
        dragModeRef.current = 'pan'
        canvas.style.cursor = 'grabbing'
        return
      }

      if (uiRef.current.spawnMode) {
        world.spawnRandomBody(wp.x, wp.y)
        return
      }

      const picked = world.pickBody(wp)
      if (picked) {
        dragModeRef.current = 'body'
        mouseJointRef.current = world.createMouseJoint(picked, wp)
        renderer.mouseJoint = mouseJointRef.current
        canvas.style.cursor = 'grabbing'
      } else {
        dragModeRef.current = 'pan'
        canvas.style.cursor = 'grabbing'
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const r = renderer
      const { x, y } = toLocal(e)
      const wp = r.screenToWorld(x, y)
      r.mouseWorld.copy(wp)

      if (dragModeRef.current === 'pan') {
        r.panBy(x - lastPointerRef.current.x, y - lastPointerRef.current.y)
      } else if (dragModeRef.current === 'body' && mouseJointRef.current) {
        mouseJointRef.current.setTarget(wp)
      } else if (dragModeRef.current === null) {
        // 悬停提示
        canvas.style.cursor = uiRef.current.spawnMode
          ? 'crosshair'
          : world.pickBody(wp)
            ? 'grab'
            : 'default'
      }
      lastPointerRef.current = { x, y }
    }

    const onPointerUp = () => {
      if (mouseJointRef.current) {
        world.destroyMouseJoint(mouseJointRef.current)
        mouseJointRef.current = null
        renderer.mouseJoint = null
      }
      dragModeRef.current = null
      canvas.style.cursor = 'default'
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { x, y } = toLocal(e as unknown as PointerEvent)
      renderer.zoomAt(x, y, e.deltaY < 0 ? 1.1 : 1 / 1.1)
    }

    const onContextMenu = (e: Event) => e.preventDefault()

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)

    // ---------------- 主循环 ----------------
    let raf = 0
    let last = performance.now()
    let frames = 0
    let fpsTime = 0
    let statsTime = 0

    const loop = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t
      frames++
      fpsTime += dt
      if (fpsTime >= 0.5) {
        setFps(Math.round(frames / fpsTime))
        frames = 0
        fpsTime = 0
      }

      if (!uiRef.current.paused) {
        world.advance(dt)
      }

      renderer.render(world)

      statsTime += dt
      if (statsTime >= 0.25) {
        statsTime = 0
        setStats({ ...world.stats })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------- 状态 → 引擎同步 ----------------
  useEffect(() => {
    uiRef.current = { paused, spawnMode, debug }
  }, [paused, spawnMode, debug])

  useEffect(() => {
    if (worldRef.current) worldRef.current.gravity.y = gravity
  }, [gravity])

  useEffect(() => {
    if (worldRef.current) worldRef.current.timeScale = timeScale
  }, [timeScale])

  useEffect(() => {
    if (worldRef.current) worldRef.current.settings.velocityIterations = velIters
  }, [velIters])

  useEffect(() => {
    if (worldRef.current) worldRef.current.settings.positionIterations = posIters
  }, [posIters])

  useEffect(() => {
    if (worldRef.current) worldRef.current.fixedDt = fixedDt
  }, [fixedDt])

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.debug = debug
  }, [debug])

  useEffect(() => {
    sceneIdRef.current = sceneId
    loadScene(sceneId)
  }, [sceneId, loadScene])

  // ---------------- 动作 ----------------
  const togglePause = () => setPaused((p) => !p)

  const singleStep = () => {
    const world = worldRef.current
    if (!world) return
    setPaused(true)
    world.step(world.fixedDt)
    setStats({ ...world.stats })
  }

  const resetView = () => {
    const renderer = rendererRef.current
    if (!renderer) return
    const scene = SCENES.find((s) => s.id === sceneIdRef.current) ?? SCENES[0]
    const b = scene.bounds
    renderer.focusOn(b.minX, b.minY, b.maxX, b.maxY)
  }

  const clearDynamics = () => {
    const world = worldRef.current
    if (!world) return
    for (let i = world.bodies.length - 1; i >= 0; i--) {
      if (world.bodies[i].isDynamic) world.removeBody(world.bodies[i])
    }
    setStats({ ...world.stats })
  }

  const dropRain = () => {
    const world = worldRef.current
    const renderer = rendererRef.current
    if (!world || !renderer) return
    const v = renderer.screenToWorld(renderer.width / 2, 0)
    for (let i = 0; i < 12; i++) {
      world.spawnRandomBody(v.x + (Math.random() - 0.5) * 400, v.y - 40 - i * 56)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-mark">⚙</div>
          <div>
            <h1>PHYS-X2D</h1>
            <p>从零实现的 2D 刚体物理引擎</p>
          </div>
        </header>

        <section className="panel">
          <h2>演示场景</h2>
          <div className="scene-list">
            {SCENES.map((s) => (
              <button
                key={s.id}
                className={`scene-btn ${s.id === sceneId ? 'active' : ''}`}
                onClick={() => setSceneId(s.id)}
                title={s.description}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="hint">{SCENES.find((s) => s.id === sceneId)?.description}</p>
        </section>

        <section className="panel">
          <h2>仿真控制</h2>
          <div className="btn-row">
            <button className="btn primary" onClick={togglePause}>
              {paused ? '▶ 继续' : '⏸ 暂停'}
            </button>
            <button className="btn" onClick={singleStep}>⏭ 单步</button>
            <button className="btn" onClick={resetView}>⤢ 视角</button>
          </div>
          <div className="btn-row">
            <button className={`btn ${spawnMode ? 'active' : ''}`} onClick={() => setSpawnMode((v) => !v)}>
              ➕ 生成模式
            </button>
            <button className="btn" onClick={dropRain}>🌧 下球</button>
            <button className="btn" onClick={clearDynamics}>🧹 清空</button>
          </div>
        </section>

        <section className="panel">
          <h2>物理参数</h2>
          <Slider label="重力" value={gravity} min={0} max={4000} step={50} onChange={setGravity} format={(v) => `${v}`} />
          <Slider label="时间倍率" value={timeScale} min={0.1} max={3} step={0.1} onChange={setTimeScale} format={(v) => `${v.toFixed(1)}×`} />
          <Slider label="速度迭代" value={velIters} min={1} max={64} step={1} onChange={setVelIters} format={(v) => `${v}`} />
          <Slider label="位置迭代" value={posIters} min={1} max={32} step={1} onChange={setPosIters} format={(v) => `${v}`} />
          <div className="field">
            <label>固定步长</label>
            <select value={fixedDt} onChange={(e) => setFixedDt(Number(e.target.value))}>
              <option value={1 / 60}>1/60 s</option>
              <option value={1 / 90}>1/90 s</option>
              <option value={1 / 120}>1/120 s</option>
              <option value={1 / 240}>1/240 s</option>
            </select>
          </div>
        </section>

        <section className="panel">
          <h2>调试叠加</h2>
          <div className="toggle-grid">
            <Toggle label="包围盒 AABB" checked={debug.aabb} onChange={(v) => setDebug((d) => ({ ...d, aabb: v }))} />
            <Toggle label="接触点" checked={debug.contacts} onChange={(v) => setDebug((d) => ({ ...d, contacts: v }))} />
            <Toggle label="法线" checked={debug.normals} onChange={(v) => setDebug((d) => ({ ...d, normals: v }))} />
            <Toggle label="速度向量" checked={debug.velocities} onChange={(v) => setDebug((d) => ({ ...d, velocities: v }))} />
            <Toggle label="关节" checked={debug.joints} onChange={(v) => setDebug((d) => ({ ...d, joints: v }))} />
          </div>
        </section>

        <section className="panel">
          <h2>实时统计</h2>
          <div className="stats-grid">
            <Stat label="FPS" value={fps} />
            <Stat label="刚体" value={stats.bodyCount} />
            <Stat label="动态" value={stats.dynamicCount} />
            <Stat label="接触" value={stats.contactCount} />
            <Stat label="候选对" value={stats.pairCount} />
            <Stat label="休眠" value={stats.sleepingCount} />
          </div>
        </section>

        <footer className="footer">
          纯 TypeScript 实现 · 无任何物理库
          <br />
          SAT 窄相 · 空间哈希广相 · 顺序冲量求解
        </footer>
      </aside>

      <main className="stage">
        <canvas ref={canvasRef} className="canvas" />
        <div className="stage-tip">
          左键拖拽刚体 · 滚轮缩放 · 右键平移 · 空白处拖拽 = 平移
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------- 小组件

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{props.label}</span>
        <span className="slider-value">{props.format(props.value)}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle ${props.checked ? 'on' : ''}`}
      onClick={() => props.onChange(!props.checked)}
      aria-pressed={props.checked}
    >
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {props.label}
    </button>
  )
}

function Stat(props: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{props.value}</span>
      <span className="stat-label">{props.label}</span>
    </div>
  )
}
