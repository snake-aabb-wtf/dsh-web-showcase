import type { SimParams } from '../physics/engine';
import type { PinMode } from '../physics/cloth';

interface Stats {
  fps: number;
  grabbed: number;
  constraints: number;
  particles: number;
  pinned: number;
}

export type GestureStatus = 'idle' | 'starting' | 'on' | 'error';

interface Props {
  params: SimParams;
  onChange: (p: SimParams) => void;
  pinMode: PinMode;
  onPinMode: (m: PinMode) => void;
  onReset: () => void;
  stats: Stats;
  gestureOn: boolean;
  gestureStatus: GestureStatus;
  gestureError: string | null;
  onToggleGesture: (on: boolean) => void;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}

function Slider({ label, value, min, max, step, onChange, fmt }: SliderProps) {
  return (
    <label className="ctl">
      <span className="ctl-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="ctl-value">{fmt ? fmt(value) : value.toFixed(2)}</span>
    </label>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="ctl ctl-toggle">
      <span className="ctl-label">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

const CLOTH_SWATCHES = ['#5c80d1', '#e05c5c', '#58b368', '#c9a24b', '#9b6fd8', '#d8739f', '#3d9970', '#e8e8f0'];

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <label className="ctl ctl-color">
      <span className="ctl-label">{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const PIN_LABELS: Record<PinMode, string> = {
  corners: '两顶角',
  topEdge: '上边整排',
  free: '自由',
};

export function ControlPanel({ params, onChange, pinMode, onPinMode, onReset, stats, gestureOn, gestureStatus, gestureError, onToggleGesture }: Props) {
  const set = <K extends keyof SimParams>(key: K, value: SimParams[K]) => onChange({ ...params, [key]: value });

  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="panel-title">控制面板</span>
        <span className="fps-badge">{stats.fps} FPS</span>
      </div>

      <Section title="物理参数">
        <Slider label="重力" value={params.gravity} min={0} max={30} step={0.1} onChange={(v) => set('gravity', v)} fmt={(v) => `${v.toFixed(1)} m/s²`} />
        <Slider label="刚度" value={params.stiffness} min={0.1} max={1} step={0.01} onChange={(v) => set('stiffness', v)} />
        <Slider label="求解迭代" value={params.iterations} min={1} max={20} step={1} onChange={(v) => set('iterations', v)} fmt={(v) => `${v}`} />
        <Slider label="阻尼" value={params.damping} min={0} max={0.5} step={0.01} onChange={(v) => set('damping', v)} />
      </Section>

      <Section title="环境">
        <Toggle label="风场" checked={params.windStrength > 0} onChange={(v) => set('windStrength', v ? 4 : 0)} />
        <Slider label="风速" value={params.windStrength} min={0} max={20} step={0.5} onChange={(v) => set('windStrength', v)} />
        <Slider label="风向" value={params.windAngleDeg} min={0} max={360} step={1} onChange={(v) => set('windAngleDeg', v)} fmt={(v) => `${Math.round(v)}°`} />
        <Toggle label="球体碰撞" checked={params.sphereEnabled} onChange={(v) => set('sphereEnabled', v)} />
        <Slider label="球面摩擦" value={params.friction} min={0} max={1} step={0.05} onChange={(v) => set('friction', v)} />
        <Toggle label="地面" checked={params.floorEnabled} onChange={(v) => set('floorEnabled', v)} />
      </Section>

      <Section title="撕裂">
        <Toggle label="启用撕裂" checked={params.tearingEnabled} onChange={(v) => set('tearingEnabled', v)} />
        <Slider label="撕裂阈值" value={params.tearThreshold} min={1.1} max={2.5} step={0.05} onChange={(v) => set('tearThreshold', v)} fmt={(v) => `${v.toFixed(2)}×`} />
      </Section>

      <Section title="手势控制">
        <Toggle label="摄像头手势" checked={gestureOn} onChange={(v) => onToggleGesture(v)} />
        {gestureStatus === 'starting' && <div className="gesture-msg">正在初始化模型…</div>}
        {gestureStatus === 'error' && <div className="gesture-msg error">{gestureError ?? '未知错误'}</div>}
        {gestureStatus === 'on' && <div className="gesture-msg ok">已启动：捏合抓取布料 · 双指缩放 · 张开释放</div>}
      </Section>

      <Section title="交互">
        <Slider label="抓取半径" value={params.grabRadius} min={0.02} max={0.4} step={0.01} onChange={(v) => set('grabRadius', v)} />
      </Section>

      <Section title="显示">
        <Toggle label="线框叠加" checked={params.showWireframe} onChange={(v) => set('showWireframe', v)} />
        <Toggle label="应变热力图" checked={params.colorMode === 'strain'} onChange={(v) => set('colorMode', v ? 'strain' : 'checker')} />
        <Slider label="布料厚度" value={params.thickness} min={0} max={0.12} step={0.005} onChange={(v) => set('thickness', v)} fmt={(v) => `${v.toFixed(3)}m`} />
        <Slider label="布料透明度" value={params.opacity} min={0.3} max={1} step={0.01} onChange={(v) => set('opacity', v)} fmt={(v) => `${Math.round(v * 100)}%`} />
      </Section>

      <Section title="布料">
        <ColorField label="材质颜色" value={params.clothColor} onChange={(v) => set('clothColor', v)} />
        <div className="swatches">
          {CLOTH_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={c.toLowerCase() === params.clothColor.toLowerCase() ? 'swatch active' : 'swatch'}
              style={{ background: c }}
              onClick={() => set('clothColor', c)}
              aria-label={`布料颜色 ${c}`}
            />
          ))}
        </div>
        <label className="ctl">
          <span className="ctl-label">固定模式</span>
          <select value={pinMode} onChange={(e) => onPinMode(e.target.value as PinMode)}>
            {(Object.keys(PIN_LABELS) as PinMode[]).map((m) => (
              <option key={m} value={m}>
                {PIN_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={onReset}>
          重置布料
        </button>
      </Section>

      <div className="stats">
        <span>粒子 {stats.particles}</span>
        <span>固定 {stats.pinned}</span>
        <span>约束 {stats.constraints}</span>
        {stats.grabbed > 0 && <span className="accent">抓取 {stats.grabbed}</span>}
      </div>
    </aside>
  );
}
