import { useEffect, useRef, useState } from 'react';
import './App.css';
import { ClothEngine, defaultParams, type SimParams } from './physics/engine';
import type { PinMode } from './physics/cloth';
import { pickCloth, raySphere } from './physics/picking';
import { ClothRenderer } from './render/renderer';
import { ControlPanel } from './ui/ControlPanel';
import { HandTracker } from './gesture/handTracker';
import {
  GestureAnalyzer,
  buildHandData,
  mapLandmarkToCanvas,
  type HandScreenData,
  type ScreenPoint,
} from './gesture/gesture';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const CLOTH_CONFIG = { cols: 40, rows: 40, width: 3, height: 3 };
const SUBSTEPS = 3;

// MediaPipe hand landmark indices.
const LANDMARK_WRIST = 0;
const LANDMARK_THUMB_TIP = 4;
const LANDMARK_INDEX_TIP = 8;
const LANDMARK_MIDDLE_MCP = 9;

type DragMode = 'orbit' | 'pan' | 'cloth' | 'sphere' | null;
type GestureStatus = 'idle' | 'starting' | 'on' | 'error';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ClothEngine | null>(null);
  const rendererRef = useRef<ClothRenderer | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const analyzerRef = useRef<GestureAnalyzer | null>(null);
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dragRef = useRef<{ mode: DragMode; lastX: number; lastY: number }>({ mode: null, lastX: 0, lastY: 0 });

  const [params, setParams] = useState<SimParams>({ ...defaultParams });
  const [pinMode, setPinMode] = useState<PinMode>('corners');
  const [stats, setStats] = useState({ fps: 0, grabbed: 0, constraints: 0, particles: 0, pinned: 0 });
  const [glError, setGlError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'pointer'>('grab');
  const [gestureOn, setGestureOn] = useState(false);
  const [gestureStatus, setGestureStatus] = useState<GestureStatus>('idle');
  const [gestureError, setGestureError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Shared interaction primitives (mouse AND gestures funnel through these)
  // -------------------------------------------------------------------------
  const rayFromClient = (clientX: number, clientY: number): { ro: Float32Array; rd: Float32Array } => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    const ro = new Float32Array(3);
    const rd = new Float32Array(3);
    if (canvas && renderer) {
      const rect = canvas.getBoundingClientRect();
      renderer.camera.rayFromPixel(clientX - rect.left, clientY - rect.top, rect.width, rect.height, ro, rd);
    }
    return { ro, rd };
  };

  /** Sphere then cloth pick; begin a grab. Returns true if something was grabbed. */
  const tryGrab = (clientX: number, clientY: number): boolean => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!engine || !renderer) return false;
    const { ro, rd } = rayFromClient(clientX, clientY);
    const camFwd = new Float32Array(3);
    renderer.camera.getForward(camFwd);
    if (engine.params.sphereEnabled) {
      const t = raySphere(ro, rd, engine.spherePos, engine.params.sphereRadius);
      if (t !== null) {
        engine.beginSphereDrag(ro, rd, camFwd);
        dragRef.current = { mode: 'sphere', lastX: 0, lastY: 0 };
        return true;
      }
    }
    const hit = pickCloth(engine.cloth, ro, rd);
    if (hit) {
      const idx = engine.findClosestParticle(hit.px, hit.py, hit.pz);
      if (idx >= 0 && engine.beginClothDrag(idx, ro, rd, camFwd)) {
        dragRef.current = { mode: 'cloth', lastX: 0, lastY: 0 };
        return true;
      }
    }
    return false;
  };

  /** Follow an active cloth/sphere grab with the pointer at (clientX, clientY). */
  const moveGrab = (clientX: number, clientY: number): void => {
    const engine = engineRef.current;
    if (!engine) return;
    const mode = dragRef.current.mode;
    if (mode !== 'cloth' && mode !== 'sphere') return;
    const { ro, rd } = rayFromClient(clientX, clientY);
    if (mode === 'cloth') engine.updateDragRay(ro, rd);
    else engine.updateSphereDrag(ro, rd, 1 / 60);
  };

  const endDrag = (): void => {
    engineRef.current?.endClothDrag();
    engineRef.current?.endSphereDrag();
    dragRef.current = { mode: null, lastX: 0, lastY: 0 };
    setCursor('grab');
  };

  // -------------------------------------------------------------------------
  // Init engine + renderer + animation loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: ClothEngine;
    let renderer: ClothRenderer;
    try {
      engine = new ClothEngine(CLOTH_CONFIG, 'corners');
      renderer = new ClothRenderer(canvas, CLOTH_CONFIG.cols, CLOTH_CONFIG.rows, engine.floorY);
    } catch (err) {
      setGlError(err instanceof Error ? err.message : String(err));
      return;
    }
    engineRef.current = engine;
    rendererRef.current = renderer;
    (window as unknown as Record<string, unknown>).__clothSim = { engine };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = Math.max(1, canvas.clientWidth);
      const cssH = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      renderer.resize(canvas.width, canvas.height, cssW, cssH);
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.width = Math.round(cssW * dpr);
        overlay.height = Math.round(cssH * dpr);
        const octx = overlay.getContext('2d');
        octx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        overlayCtxRef.current = octx;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsTimer = last;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      engine.step(dt, SUBSTEPS);
      renderer.render(engine);
      frames++;
      if (now - fpsTimer >= 500) {
        const fps = Math.round((frames * 1000) / (now - fpsTimer));
        frames = 0;
        fpsTimer = now;
        setStats({
          fps,
          grabbed: engine.grabSize,
          constraints: engine.cloth.activeConstraintCount,
          particles: engine.cloth.vertexCount,
          pinned: engine.cloth.pinnedCount,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // Keep engine params in sync with the panel.
  useEffect(() => {
    if (engineRef.current) Object.assign(engineRef.current.params, params);
  }, [params]);

  // Camera background → transparent clear + fog off.
  useEffect(() => {
    rendererRef.current?.setCameraBackground(gestureOn);
  }, [gestureOn]);

  // -------------------------------------------------------------------------
  // Mouse / pointer interaction
  // -------------------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || e.button === 2) {
      dragRef.current = { mode: 'pan', lastX: e.clientX, lastY: e.clientY };
      return;
    }
    if (e.button !== 0) return;

    if (tryGrab(e.clientX, e.clientY)) {
      setCursor('grabbing');
      return;
    }
    dragRef.current = { mode: 'orbit', lastX: e.clientX, lastY: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!engine || !renderer) return;
    const drag = dragRef.current;

    if (drag.mode === 'orbit') {
      renderer.camera.orbit(e.clientX - drag.lastX, e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }
    if (drag.mode === 'pan') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) renderer.camera.pan(e.clientX - drag.lastX, e.clientY - drag.lastY, rect.height);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }

    if (drag.mode === 'cloth' || drag.mode === 'sphere') {
      moveGrab(e.clientX, e.clientY);
      return;
    }

    // Hover cursor feedback when idle.
    const { ro, rd } = rayFromClient(e.clientX, e.clientY);
    let over = false;
    if (engine.params.sphereEnabled && raySphere(ro, rd, engine.spherePos, engine.params.sphereRadius) !== null) over = true;
    else if (pickCloth(engine.cloth, ro, rd)) over = true;
    setCursor(over ? 'pointer' : 'grab');
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    rendererRef.current?.camera.zoom(Math.exp(-e.deltaY * 0.0012));
  };

  // -------------------------------------------------------------------------
  // Hand gesture control
  // -------------------------------------------------------------------------
  const drawOverlay = (handPoints: ScreenPoint[][], pinching: boolean, pinchAt: ScreenPoint | null) => {
    const overlay = overlayRef.current;
    const ctx = overlayCtxRef.current;
    if (!overlay || !ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (handPoints.length === 0) return;

    for (const pts of handPoints) {
      // Fingertip dots.
      ctx.fillStyle = 'rgba(123, 176, 255, 0.95)';
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Thumb-index connector (the pinch pair).
      if (pts[LANDMARK_THUMB_TIP] && pts[LANDMARK_INDEX_TIP]) {
        ctx.strokeStyle = 'rgba(123, 176, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pts[LANDMARK_THUMB_TIP].x, pts[LANDMARK_THUMB_TIP].y);
        ctx.lineTo(pts[LANDMARK_INDEX_TIP].x, pts[LANDMARK_INDEX_TIP].y);
        ctx.stroke();
      }
    }
    // Grab indicator ring at the active pinch point.
    if (pinching && pinchAt) {
      ctx.strokeStyle = '#ff6b5e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pinchAt.x, pinchAt.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 107, 94, 0.25)';
      ctx.beginPath();
      ctx.arc(pinchAt.x, pinchAt.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const handleGestureFrame = (hands: NormalizedLandmark[][] | null) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    const screenHands: HandScreenData[] = [];
    const handPoints: ScreenPoint[][] = [];
    if (hands) {
      for (const hand of hands) {
        const lm = (i: number): ScreenPoint | null =>
          hand[i] ? mapLandmarkToCanvas(hand[i].x, hand[i].y, vw, vh, cw, ch, true) : null;
        const pts: ScreenPoint[] = [];
        for (let i = 0; i < hand.length; i++) {
          const p = lm(i);
          if (p) pts.push(p);
        }
        handPoints.push(pts);
        const data = buildHandData(lm(LANDMARK_THUMB_TIP), lm(LANDMARK_INDEX_TIP), lm(LANDMARK_WRIST), lm(LANDMARK_MIDDLE_MCP));
        if (data) screenHands.push(data);
      }
    }

    const analyzer = analyzerRef.current;
    let pinching = false;
    let pinchAt: ScreenPoint | null = null;
    if (analyzer) {
      for (const ev of analyzer.analyze(screenHands)) {
        if (ev.type === 'pinch-start') {
          if (tryGrab(ev.x, ev.y)) setCursor('grabbing');
        } else if (ev.type === 'pinch-move') {
          moveGrab(ev.x, ev.y);
        } else if (ev.type === 'pinch-end') {
          endDrag();
        } else if (ev.type === 'zoom') {
          rendererRef.current?.camera.zoom(ev.factor);
        }
      }
      pinching = analyzer.isPinching;
      if (pinching && screenHands[0]) pinchAt = screenHands[0].pinchPoint;
    }
    drawOverlay(handPoints, pinching, pinchAt);
  };

  // Keep the latest frame handler in a ref so the tracker always calls fresh code.
  const frameHandlerRef = useRef(handleGestureFrame);
  frameHandlerRef.current = handleGestureFrame;

  const toggleGesture = async (on: boolean) => {
    if (on) {
      setGestureOn(true);
      setGestureStatus('starting');
      setGestureError(null);
      try {
        const tracker = await HandTracker.create();
        tracker.onFrame = (hands) => frameHandlerRef.current(hands);
        tracker.onError = (msg) => {
          setGestureError(msg);
          setGestureStatus('error');
          setGestureOn(false);
        };
        await tracker.start(videoRef.current!);
        trackerRef.current = tracker;
        analyzerRef.current = new GestureAnalyzer();
        setGestureStatus('on');
      } catch (err) {
        setGestureError(err instanceof Error ? err.message : String(err));
        setGestureStatus('error');
        setGestureOn(false);
      }
    } else {
      trackerRef.current?.dispose();
      trackerRef.current = null;
      analyzerRef.current = null;
      setGestureStatus('idle');
      setGestureOn(false);
    }
  };

  // Release the camera when the app unmounts.
  useEffect(() => {
    return () => {
      trackerRef.current?.dispose();
      trackerRef.current = null;
    };
  }, []);

  const handleReset = () => engineRef.current?.rebuild(pinMode);

  const handlePinMode = (mode: PinMode) => {
    setPinMode(mode);
    engineRef.current?.rebuild(mode);
  };

  return (
    <div className="app">
      <video ref={videoRef} className={gestureOn ? 'camera-bg visible' : 'camera-bg'} playsInline muted />
      <canvas
        ref={canvasRef}
        className="viewport"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      />
      <canvas ref={overlayRef} className="hand-overlay" />

      <header className="titlebar">
        <h1>布料物理仿真</h1>
        <p>
          PBD 位置动力学 · 原生 WebGL2 · React <span className="dim">· 40×40 网格 · 1681 粒子 · 9678 约束</span>
        </p>
        <div className="hints">
          左键拖拽布料 · 空白处旋转 · 滚轮缩放 · 右键平移 · 手势模式：捏合抓取 · 双指缩放
        </div>
      </header>

      <ControlPanel
        params={params}
        onChange={setParams}
        pinMode={pinMode}
        onPinMode={handlePinMode}
        onReset={handleReset}
        stats={stats}
        gestureOn={gestureOn}
        gestureStatus={gestureStatus}
        gestureError={gestureError}
        onToggleGesture={toggleGesture}
      />

      {glError && (
        <div className="gl-error">
          <strong>无法启动渲染</strong>
          <span>{glError}</span>
        </div>
      )}
    </div>
  );
}
