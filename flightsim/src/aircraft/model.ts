/**
 * 程序化低多边形飞机模型（Cessna 172 风格高翼单发螺旋桨）。
 * 全部几何体本地生成；机身/机翼/尾翼合并为单一 BufferGeometry（顶点色绘制涂装），
 * 螺旋桨与起落架为独立网格（分别驱动旋转/收放动画）。
 *
 * 坐标系：与物理引擎一致 —— 机体坐标 x 前、y 右、z 下（three.js 物体局部系直接
 * 套用物理四元数即可，无需额外变换）。
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface AircraftMeshes {
  root: THREE.Group
  /** 外部涂装（合并几何体，第一人称时隐藏） */
  exterior: THREE.Mesh
  /** 旋转螺旋桨（+ 整流罩） */
  prop: THREE.Group
  /** 可收放起落架：三个枢轴组，按 gearTransition 旋转收放 */
  gearPivots: { nose: THREE.Group; mainL: THREE.Group; mainR: THREE.Group }
  /** 软阴影（贴地圆片） */
  shadow: THREE.Mesh
  /** 座舱内部（第一人称可见：仪表板框架、风挡支柱、机头整流罩、翼根） */
  cockpit: THREE.Group
}

const WHITE = new THREE.Color('#f0efe9')
const RED = new THREE.Color('#d02b2b')
const DARK = new THREE.Color('#3f4347')

/** 给几何体逐顶点着色（在几何体做任何变换之前调用） */
function paint(geo: THREE.BufferGeometry, colorFn: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    c.copy(colorFn(pos.getX(i), pos.getY(i), pos.getZ(i)))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

/** 机身轮廓（LatheGeometry 截面点：半径, 沿轴位置 x）——机身长 7.4 m */
function fuselageProfile(): THREE.Vector2[] {
  return [
    new THREE.Vector2(0.02, 3.6),
    new THREE.Vector2(0.26, 3.25),
    new THREE.Vector2(0.5, 2.7),
    new THREE.Vector2(0.64, 2.1),
    new THREE.Vector2(0.7, 1.3),
    new THREE.Vector2(0.72, 0.2),
    new THREE.Vector2(0.7, -0.9),
    new THREE.Vector2(0.6, -1.9),
    new THREE.Vector2(0.42, -2.8),
    new THREE.Vector2(0.22, -3.4),
    new THREE.Vector2(0.05, -3.8),
  ]
}

/** 翼型平面形状：x=弦向(机体x)，y=展向(机体y)，半翼展 5.3 m */
function wingShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(0.45, 0) // 翼根前缘
  s.lineTo(-1.1, 0) // 翼根后缘
  s.lineTo(-0.55, 5.3) // 翼尖后缘
  s.lineTo(0.35, 5.3) // 翼尖前缘
  s.closePath()
  return s
}

/** 平尾形状（半展 1.8 m） */
function hstabShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(0.12, 0)
  s.lineTo(-0.62, 0)
  s.lineTo(-0.32, 1.8)
  s.lineTo(0.02, 1.8)
  s.closePath()
  return s
}

/** 垂尾形状（x=弦向，y=高度方向） */
function vstabShape(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(0.12, 0)
  s.lineTo(-0.78, 0)
  s.lineTo(-0.38, 1.35)
  s.lineTo(0.22, 1.35)
  s.closePath()
  return s
}

/** 圆柱体连接两点的网格 */
function strutBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), mat)
  mesh.position.copy(a).add(dir.clone().multiplyScalar(0.5))
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return mesh
}

export function buildAircraft(): AircraftMeshes {
  const root = new THREE.Group()
  root.name = 'aircraft'

  // ---------------- 合并主体（机身+条纹+整流罩+机翼+尾翼） ----------------
  const parts: THREE.BufferGeometry[] = []

  const fuselage = new THREE.LatheGeometry(fuselageProfile(), 22)
  fuselage.rotateZ(-Math.PI / 2) // 旋转轴 Y → X（机头朝 +X）
  parts.push(
    paint(fuselage, () => WHITE).toNonIndexed(),
  )

  // 红色涂装条纹（两圈细环 + 尾锥），半径略大于机身避免共面闪烁
  // 注：ExtrudeGeometry 在 three r160 中本就无 index，Lathe 部分统一转非索引以便合并
  const stripeRing = (r: number, x0: number, x1: number): THREE.BufferGeometry => {
    const g = new THREE.LatheGeometry([new THREE.Vector2(r, x0), new THREE.Vector2(r, x1)], 22)
    g.rotateZ(-Math.PI / 2)
    return g.toNonIndexed()
  }
  parts.push(paint(stripeRing(0.74, 1.7, 2.15), () => RED))
  parts.push(paint(stripeRing(0.74, -2.35, -2.0), () => RED))
  parts.push(paint(stripeRing(0.66, -3.35, -3.05), () => RED))

  // 发动机整流罩（深灰）
  const cowl = new THREE.LatheGeometry(
    [new THREE.Vector2(0.62, 2.35), new THREE.Vector2(0.56, 2.65), new THREE.Vector2(0.44, 2.95), new THREE.Vector2(0.3, 3.25)],
    22,
  )
  cowl.rotateZ(-Math.PI / 2)
  parts.push(paint(cowl, () => DARK).toNonIndexed())

  // 机翼（高翼，上反角 2.5°，整体半展 5.3 m）
  const wing = new THREE.ExtrudeGeometry(wingShape(), { depth: 0.13, bevelEnabled: false, steps: 1 })
  parts.push(
    paint(wing, (_x, y) => (Math.abs(y) > 4.7 ? RED : WHITE)),
  )
  wing.rotateX(-0.0436) // 上反角（翼尖抬起 = z 负方向）
  wing.translate(-0.3, 0, -0.7) // 翼根前缘至 x=0.15，高翼位置

  // 平尾
  const hstab = new THREE.ExtrudeGeometry(hstabShape(), { depth: 0.07, bevelEnabled: false, steps: 1 })
  parts.push(
    paint(hstab, (_x, y) => (Math.abs(y) > 1.55 ? RED : WHITE)),
  )
  hstab.translate(-3.35, 0, -0.05)

  // 垂尾（含红色方向舵）
  const vstab = new THREE.ExtrudeGeometry(vstabShape(), { depth: 0.08, bevelEnabled: false, steps: 1 })
  parts.push(
    paint(vstab, (_x, y) => (y > 1.0 ? RED : WHITE)),
  )
  vstab.rotateX(-Math.PI / 2) // 形状 Y（高度）→ 机体 -Z（上）
  vstab.translate(-3.42, 0, -0.2)

  const bodyGeo = mergeGeometries(parts, false)!
  bodyGeo.computeVertexNormals()
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })
  const exterior = new THREE.Mesh(bodyGeo, bodyMat)
  root.add(exterior)

  // 机翼支撑杆（独立网格，深色）
  const strutMat = new THREE.MeshLambertMaterial({ color: '#2f3236' })
  for (const side of [-1, 1]) {
    root.add(
      strutBetween(
        new THREE.Vector3(-0.2, 0.85 * side, 0.4),
        new THREE.Vector3(-0.45, 1.6 * side, -0.6),
        0.045,
        strutMat,
      ),
    )
  }

  // ---------------- 螺旋桨（独立旋转组，root 子节点） ----------------
  const prop = new THREE.Group()
  prop.name = 'propeller'
  prop.position.set(3.42, 0, 0)
  const bladeMat = new THREE.MeshLambertMaterial({ color: '#20232a' })
  for (const side of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 1.8, 0.028), bladeMat)
    blade.position.set(0, 0.9 * side, 0)
    prop.add(blade)
  }
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 14), new THREE.MeshLambertMaterial({ color: '#c8302e' }))
  spinner.rotation.z = -Math.PI / 2 // 锥尖朝 +X
  spinner.position.set(0.14, 0, 0)
  prop.add(spinner)
  const backplate = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), new THREE.MeshLambertMaterial({ color: '#2c2f36' }))
  backplate.rotation.y = Math.PI / 2
  prop.add(backplate)
  root.add(prop)

  // ---------------- 起落架（可收放，三个枢轴组） ----------------
  const gearMat = new THREE.MeshLambertMaterial({ color: '#3a3e45' })
  const wheelMat = new THREE.MeshLambertMaterial({ color: '#16181c' })

  const makeGear = (
    pivot: THREE.Vector3,
    wheelLocal: THREE.Vector3,
  ): THREE.Group => {
    const g = new THREE.Group()
    g.position.copy(pivot)
    const strut = strutBetween(new THREE.Vector3(0, 0, 0), wheelLocal, 0.035, gearMat)
    g.add(strut)
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14), wheelMat)
    wheel.position.copy(wheelLocal)
    g.add(wheel)
    return g
  }

  const mainL = makeGear(new THREE.Vector3(-0.32, -0.78, 0.35), new THREE.Vector3(0, -0.77, 0.48))
  const mainR = makeGear(new THREE.Vector3(-0.32, 0.78, 0.35), new THREE.Vector3(0, 0.77, 0.48))
  const nose = makeGear(new THREE.Vector3(0.95, 0, 0.35), new THREE.Vector3(0, 0, 0.48))
  root.add(mainL, mainR, nose)

  // ---------------- 软阴影 ----------------
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.5, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  )
  shadow.name = 'shadow'
  shadow.rotation.x = -Math.PI / 2
  root.add(shadow)

  // ---------------- 座舱内部（第一人称可见） ----------------
  const cockpit = new THREE.Group()
  const dashMat = new THREE.MeshLambertMaterial({ color: '#15171c' })
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.3, 0.07), dashMat)
  dash.position.set(0.72, 0, -0.5)
  cockpit.add(dash)

  // 风挡立柱 + 顶梁
  const pillarMat = new THREE.MeshLambertMaterial({ color: '#1c1e24' })
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.52), pillarMat)
    p.position.set(0.6, 0.42 * side, -0.64)
    cockpit.add(p)
  }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.92, 0.035), pillarMat)
  topBar.position.set(0.6, 0, -0.9)
  cockpit.add(topBar)

  // 机头整流罩（上半圆柱）与鼻锥
  const cowlMat = new THREE.MeshLambertMaterial({ color: '#3f4347' })
  const noseCowl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.52, 1.5, 16, 1, true, Math.PI / 2, Math.PI), cowlMat)
  noseCowl.rotation.z = -Math.PI / 2
  noseCowl.position.set(1.55, 0, -0.04)
  cockpit.add(noseCowl)
  const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.95, 16), cowlMat)
  noseCone.rotation.z = -Math.PI / 2
  noseCone.position.set(2.35, 0, -0.04)
  cockpit.add(noseCone)

  // 翼根（驾驶舱前缘可见的高翼根部）
  const wingRoot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.1, 0.45), new THREE.MeshLambertMaterial({ color: '#e8e6df' }))
  wingRoot.position.set(0.1, 0, -0.62)
  cockpit.add(wingRoot)

  // 座舱侧窗框（左右两条深色边）
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.03), pillarMat)
    rail.position.set(0.72, 0.46 * side, -0.52)
    cockpit.add(rail)
  }

  root.add(cockpit)

  return { root, exterior, prop, gearPivots: { nose, mainL, mainR }, shadow, cockpit }
}
