/**
 * 程序化跑道/滑行道/机坪：沥青面 + Canvas 2D 绘制的道面标记贴图
 * （边线、中心虚线、入口斑马线、跑道编号 09/27、接地带标记），全部本地生成，无外部贴图。
 */
import * as THREE from 'three'
import { APRON, RUNWAY, TAXIWAY } from '../config/world'

/** 生成跑道标记贴图（Canvas 2D，2048×64，覆盖 2100 m 跑道） */
function createRunwayMarkingTexture(): THREE.CanvasTexture {
  const W = 2048
  const H = 64
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, W, H)

  const m2px = W / (RUNWAY.halfLength * 2) // 米 → 像素
  const runW = RUNWAY.halfWidth * m2px * 2 // 跑道宽对应的像素

  ctx.fillStyle = 'rgba(255,255,255,0.92)'

  // 两侧边线（跑道边缘内侧 0.8 m，宽 1 m）
  const edge = (1.2 + RUNWAY.halfWidth - 0.5) * m2px
  ctx.fillRect(0, (runW - edge) - 2, W, 4)
  ctx.fillRect(0, edge, W, 4)

  // 中心虚线：30 m 亮 25 m 暗
  const dashLen = 30 * m2px
  const gapLen = 25 * m2px
  const center = runW / 2
  for (let x = 0; x < W; x += dashLen + gapLen) {
    ctx.fillRect(x, center - 1.5, Math.min(dashLen, W - x), 3)
  }

  // 入口斑马线（两端各 8 条）
  const barLen = 6 * m2px
  for (const end of [0, W]) {
    const sign = end === 0 ? 1 : -1
    for (let i = 0; i < 8; i++) {
      const x0 = end + sign * (6 * m2px + i * (barLen + 1.2 * m2px))
      ctx.fillRect(Math.min(x0, end + sign * 6 * m2px), center - 12, 4, 24)
    }
  }

  // 跑道编号：东端 "09"（朝东降落侧正立），西端 "27"（旋转 180°）
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  const numY = center + 0.5
  ctx.fillText('09', W - 70, numY)
  ctx.save()
  ctx.translate(70, numY)
  ctx.rotate(Math.PI)
  ctx.fillText('27', 0, 0)
  ctx.restore()

  // 接地带标记（每端 3 组 × 2 侧）
  for (const end of [0, W]) {
    const sign = end === 0 ? 1 : -1
    for (let i = 0; i < 3; i++) {
      const x0 = end + sign * (60 * m2px + i * 45 * m2px)
      const xx = Math.min(x0, end + sign * 60 * m2px)
      for (const side of [-1, 1]) {
        ctx.fillRect(xx, center + side * 9, 5, 2.4)
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** 滑行道中心虚线贴图 */
function createTaxiwayTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(255,230,90,0.9)'
  const dash = 26
  const gap = 22
  for (let y = 0; y < 256; y += dash + gap) {
    ctx.fillRect(29, y, 6, dash)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 构建跑道 + 滑行道 + 机坪（一个 Group，全部为程序化平面） */
export function buildRunway(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'runway'

  // 跑道道面（含道肩）
  const runwayGeo = new THREE.PlaneGeometry(RUNWAY.halfLength * 2, RUNWAY.halfWidth * 2 + RUNWAY.shoulder * 2)
  const asphalt = new THREE.MeshLambertMaterial({ color: '#3a3d42' })
  const runway = new THREE.Mesh(runwayGeo, asphalt)
  runway.rotation.x = -Math.PI / 2
  runway.position.set(0, 0.015, 0)
  g.add(runway)

  // 道面标记（略高于道面）
  const markingGeo = new THREE.PlaneGeometry(RUNWAY.halfLength * 2, RUNWAY.halfWidth * 2)
  const markingMat = new THREE.MeshLambertMaterial({ map: createRunwayMarkingTexture(), transparent: true })
  const marking = new THREE.Mesh(markingGeo, markingMat)
  marking.rotation.x = -Math.PI / 2
  marking.position.set(0, 0.02, 0)
  g.add(marking)

  // 滑行道（自跑道东端向 +Z 延伸到机坪）
  const tLen = Math.hypot(TAXIWAY.to.x - TAXIWAY.from.x, TAXIWAY.to.z - TAXIWAY.from.z)
  const taxiGeo = new THREE.PlaneGeometry(TAXIWAY.halfWidth * 2, tLen)
  const taxi = new THREE.Mesh(taxiGeo, new THREE.MeshLambertMaterial({ color: '#4a4d52' }))
  taxi.rotation.x = -Math.PI / 2
  taxi.rotation.z = -Math.atan2(TAXIWAY.to.z - TAXIWAY.from.z, TAXIWAY.to.x - TAXIWAY.from.x)
  taxi.position.set((TAXIWAY.from.x + TAXIWAY.to.x) / 2, 0.025, (TAXIWAY.from.z + TAXIWAY.to.z) / 2)
  g.add(taxi)

  // 滑行道中心线
  const taxiLineGeo = new THREE.PlaneGeometry(1.6, tLen - 6)
  const taxiLine = new THREE.Mesh(taxiLineGeo, new THREE.MeshLambertMaterial({ map: createTaxiwayTexture(), transparent: true }))
  taxiLine.rotation.x = -Math.PI / 2
  taxiLine.rotation.z = -Math.atan2(TAXIWAY.to.z - TAXIWAY.from.z, TAXIWAY.to.x - TAXIWAY.from.x)
  taxiLine.position.set((TAXIWAY.from.x + TAXIWAY.to.x) / 2, 0.03, (TAXIWAY.from.z + TAXIWAY.to.z) / 2)
  g.add(taxiLine)

  // 机坪
  const apronGeo = new THREE.PlaneGeometry(APRON.halfW * 2, APRON.halfH * 2)
  const apron = new THREE.Mesh(apronGeo, new THREE.MeshLambertMaterial({ color: '#50545a' }))
  apron.rotation.x = -Math.PI / 2
  apron.position.set(APRON.center.x, 0.03, APRON.center.z)
  g.add(apron)

  // 机坪边框线
  const borderGeo = new THREE.EdgesGeometry(apronGeo)
  const border = new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({ color: 0xd8d8d0 }))
  border.position.copy(apron.position)
  border.rotation.copy(apron.rotation)
  border.position.y = 0.035
  g.add(border)

  // 跑道两端 T 字标识（视觉参照）
  for (const end of [-1, 1]) {
    const tMark = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.02, 2),
      new THREE.MeshLambertMaterial({ color: '#e8e8e0' }),
    )
    tMark.position.set(end * (RUNWAY.halfLength - 14), 0.025, 0)
    g.add(tMark)
  }

  return g
}
