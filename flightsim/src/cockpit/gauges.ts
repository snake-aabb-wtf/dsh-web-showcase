/**
 * 六个座舱仪表的 Canvas 2D 绘制函数（纯函数，指针动画由外层组件做指数平滑）。
 * 仪表：空速表 ASI、高度表、姿态仪、航向指示器、升降速度表 VSI、发动机转速表。
 * 读数值与物理引擎状态实时一致（单位换算见 utils/format.ts）。
 */
export type GaugeCtx = CanvasRenderingContext2D

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

/** 表盘底（外圈、深色表底、玻璃高光） */
function drawFace(ctx: GaugeCtx, size: number, label: string): void {
  const c = size / 2
  const r = size / 2 - 3
  // 外圈
  const ring = ctx.createRadialGradient(c - r * 0.3, c - r * 0.3, r * 0.6, c, c, r)
  ring.addColorStop(0, '#8f959d')
  ring.addColorStop(1, '#3a3f46')
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.fillStyle = ring
  ctx.fill()
  // 表底
  const face = ctx.createRadialGradient(c - r * 0.35, c - r * 0.35, r * 0.1, c, c, r * 0.95)
  face.addColorStop(0, '#1c2026')
  face.addColorStop(1, '#0d0f13')
  ctx.beginPath()
  ctx.arc(c, c, r - 4, 0, Math.PI * 2)
  ctx.fillStyle = face
  ctx.fill()
  // 玻璃高光
  ctx.beginPath()
  ctx.arc(c, c, r - 4, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(c - r * 0.3, c - r * 0.42, r * 0.42, r * 0.24, -0.6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fill()
  // 标签
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, c, size - 10)
}

/** 刻度环（按"每档多少值"绘制，供各表复用） */
function drawTicks2(
  ctx: GaugeCtx,
  size: number,
  fromDeg: number,
  toDeg: number,
  vmin: number,
  vmax: number,
  minorStep: number,
  majorStep: number,
  labelStep: number,
  labelFn: (v: number) => string,
): void {
  const c = size / 2
  const rOut = size / 2 - 13
  const rInMinor = rOut - 4
  const rInMajor = rOut - 8
  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(240,240,240,0.9)'
  const span = toDeg - fromDeg
  for (let v = vmin; v <= vmax + 1e-6; v += minorStep) {
    const frac = (v - vmin) / (vmax - vmin)
    const deg = fromDeg + span * frac
    const isMajor = Math.abs((v - vmin) / majorStep - Math.round((v - vmin) / majorStep)) < 1e-6
    const p1 = polar(c, c, isMajor ? rInMajor : rInMinor, deg)
    const p2 = polar(c, c, rOut, deg)
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = 'bold 11px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let v = vmin; v <= vmax + 1e-6; v += labelStep) {
    const frac = (v - vmin) / (vmax - vmin)
    const deg = fromDeg + span * frac
    const p = polar(c, c, rOut - 14, deg)
    ctx.fillText(labelFn(v), p.x, p.y)
  }
}

/** 彩色弧带（如空速表的绿/黄/红弧） */
function drawArcBand(ctx: GaugeCtx, size: number, fromDeg: number, toDeg: number, color: string): void {
  const c = size / 2
  ctx.beginPath()
  ctx.arc(c, c, size / 2 - 8, ((fromDeg - 90) * Math.PI) / 180, ((toDeg - 90) * Math.PI) / 180)
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.stroke()
}

/** 指针 */
function drawNeedle(ctx: GaugeCtx, size: number, angleDeg: number, color = '#e8e8e2', lenRatio = 0.62): void {
  const c = size / 2
  const p = polar(c, c, (size / 2 - 16) * lenRatio, angleDeg)
  ctx.beginPath()
  ctx.moveTo(c, c)
  ctx.lineTo(p.x, p.y)
  ctx.strokeStyle = color
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.stroke()
  // 轴帽
  ctx.beginPath()
  ctx.arc(c, c, 3.4, 0, Math.PI * 2)
  ctx.fillStyle = '#9aa0a8'
  ctx.fill()
}

/** 数字读数框 */
function drawReadout(ctx: GaugeCtx, size: number, text: string, color = '#ffd9a0'): void {
  const c = size / 2
  const w = size * 0.62
  const h = size * 0.16
  ctx.fillStyle = '#050607'
  ctx.fillRect(c - w / 2, size - h - 6, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(c - w / 2, size - h - 6, w, h)
  ctx.fillStyle = color
  ctx.font = `bold ${Math.round(h * 0.72)}px "Consolas", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, c, size - h / 2 - 5)
}

// ---------------- 空速表 ----------------
export function drawASI(ctx: GaugeCtx, size: number, knots: number): void {
  drawFace(ctx, size, '空速')
  const clampV = Math.max(0, Math.min(160, knots))
  const ang = (v: number) => 140 + (v / 160) * 260
  drawArcBand(ctx, size, ang(47), ang(105), '#5cbf6a')
  drawArcBand(ctx, size, ang(105), ang(155), '#e8c33a')
  drawArcBand(ctx, size, ang(155), ang(160), '#e04a3a')
  drawTicks2(ctx, size, 140, 400, 0, 160, 10, 20, 20, (v) => String(v))
  drawNeedle(ctx, size, ang(clampV))
  drawReadout(ctx, size, `${Math.round(knots)} kt`)
}

// ---------------- 高度表 ----------------
export function drawAltimeter(ctx: GaugeCtx, size: number, feet: number): void {
  drawFace(ctx, size, '高度 (ft)')
  const f = Math.max(0, feet)
  drawTicks2(ctx, size, 140, 400, 0, 10000, 500, 1000, 2000, (v) => String(v / 1000))
  // 主指针：1000 ft/圈；副指针：100 ft/圈
  const mainAng = 140 + ((f % 1000) / 1000) * 260
  const subAng = 140 + ((f % 100) / 100) * 260
  drawNeedle(ctx, size, mainAng, '#ffffff', 0.62)
  drawNeedle(ctx, size, subAng, '#ff9a5c', 0.5)
  drawReadout(ctx, size, `${Math.round(f)} ft`)
}

// ---------------- 姿态仪 ----------------
export function drawAttitude(ctx: GaugeCtx, size: number, pitchDeg: number, rollDeg: number): void {
  drawFace(ctx, size, '姿态')
  const c = size / 2
  const r = size / 2 - 12
  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.translate(c, c)
  ctx.rotate((-rollDeg * Math.PI) / 180)
  const pxPerDeg = r / 45
  const yOff = pitchDeg * pxPerDeg // 抬头 → 地平线下移
  ctx.translate(0, yOff)
  // 天地
  ctx.fillStyle = '#2f5fb0'
  ctx.fillRect(-r * 2, -r * 2 - 200, r * 4, r * 2 + 200)
  ctx.fillStyle = '#8a6a3e'
  ctx.fillRect(-r * 2, 0, r * 4, r * 2 + 200)
  // 俯仰阶梯线
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.6
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const p of [10, 20, 30, 40]) {
    for (const sign of [1, -1]) {
      const y = sign * p * pxPerDeg
      const half = p === 10 ? 18 : p === 20 ? 26 : 34
      ctx.beginPath()
      ctx.moveTo(-half, y)
      ctx.lineTo(half, y)
      ctx.stroke()
      ctx.fillText(`${sign * p}°`, -half - 4, y)
    }
  }
  // 地平线
  ctx.beginPath()
  ctx.moveTo(-r * 2, 0)
  ctx.lineTo(r * 2, 0)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
  // 固定机翼符号 + 滚转刻度
  ctx.strokeStyle = '#ffd23e'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(c - 26, c + 2)
  ctx.lineTo(c - 8, c - 4)
  ctx.lineTo(c + 8, c - 4)
  ctx.lineTo(c + 26, c + 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 1.6
  for (const deg of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    if (deg === 0) continue
    const p = polar(c, c - r + 8, r - 6, 180 - deg)
    const p2 = polar(c, c - r + 8, r - 13, 180 - deg)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }
  // 顶部固定三角
  ctx.fillStyle = '#ffd23e'
  ctx.beginPath()
  ctx.moveTo(c, c - r + 2)
  ctx.lineTo(c - 5, c - r + 12)
  ctx.lineTo(c + 5, c - r + 12)
  ctx.closePath()
  ctx.fill()
}

// ---------------- 航向指示器 ----------------
export function drawHeading(ctx: GaugeCtx, size: number, headingDeg: number): void {
  drawFace(ctx, size, '航向')
  const c = size / 2
  const r = size / 2 - 14
  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.translate(c, c)
  ctx.rotate((-headingDeg * Math.PI) / 180)
  ctx.strokeStyle = 'rgba(240,240,240,0.9)'
  ctx.fillStyle = 'rgba(240,240,240,0.9)'
  ctx.lineWidth = 1.4
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let h = 0; h < 360; h += 5) {
    const a = (h * Math.PI) / 180
    const major = h % 30 === 0
    const p1 = { x: Math.sin(a) * (r - (major ? 10 : 6)), y: -Math.cos(a) * (r - (major ? 10 : 6)) }
    const p2 = { x: Math.sin(a) * r, y: -Math.cos(a) * r }
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    if (major) {
      const lp = { x: Math.sin(a) * (r - 20), y: -Math.cos(a) * (r - 20) }
      ctx.fillText(String(h === 0 ? 360 : h), lp.x, lp.y)
    }
  }
  ctx.restore()
  // 固定游标（顶部）
  ctx.fillStyle = '#ffd23e'
  ctx.beginPath()
  ctx.moveTo(c, c - r - 2)
  ctx.lineTo(c - 5, c - r + 6)
  ctx.lineTo(c + 5, c - r + 6)
  ctx.closePath()
  ctx.fill()
  drawReadout(ctx, size, `${Math.round(headingDeg) % 360}°`)
}

// ---------------- 升降速度表 ----------------
export function drawVSI(ctx: GaugeCtx, size: number, fpm: number): void {
  drawFace(ctx, size, '升降率 ft/min')
  const clampV = Math.max(-2000, Math.min(2000, fpm))
  const ang = (v: number) => 180 - (v / 2000) * 150
  drawTicks2(ctx, size, 330, 30, -2000, 2000, 250, 500, 500, (v) => String(v / 100))
  drawNeedle(ctx, size, ang(clampV))
  drawReadout(ctx, size, `${fpm > 0 ? '+' : ''}${Math.round(fpm)}`)
}

// ---------------- 发动机转速表 ----------------
export function drawTach(ctx: GaugeCtx, size: number, rpm: number): void {
  drawFace(ctx, size, '转速 RPM')
  const clampV = Math.max(0, Math.min(3000, rpm))
  const ang = (v: number) => 140 + (v / 3000) * 250
  drawArcBand(ctx, size, ang(2700), ang(3000), '#e04a3a')
  drawTicks2(ctx, size, 140, 390, 0, 3000, 250, 500, 500, (v) => String(v / 100))
  drawNeedle(ctx, size, ang(clampV))
  drawReadout(ctx, size, `${Math.round(clampV)}`)
}
