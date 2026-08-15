import { Vec2 } from '../math/Vec2'
import type { Body } from '../bodies/Body'
import { CircleShape, PolygonShape } from '../bodies/Shape'
import { Manifold, type ContactPoint } from './Manifold'

/** 穿透深度上限：防止深度穿透时产生爆炸性冲量 */
const MAX_PENETRATION = 2.5
/** 深度穿透容差 */
const EPS = 1e-3

/**
 * 窄相阶段：对广相给出的候选对做精确碰撞检测，
 * 输出接触流形（法线 + 1~2 个接触点）。
 *
 * 支持三类碰撞：
 *   圆 × 圆         — 距离检测
 *   圆 × 多边形     — 最接近边检测 + 最近点投影
 *   多边形 × 多边形 — SAT 分离轴定理 + 参考边/入射边裁剪
 *
 * 约定：流形法线从 bodyA 指向 bodyB。
 */
export function collide(a: Body, b: Body): Manifold | null {
  const shapeA = a.shape
  const shapeB = b.shape

  if (shapeA instanceof CircleShape && shapeB instanceof CircleShape) {
    return collideCircleCircle(a, b, shapeA, shapeB)
  }
  if (shapeA instanceof CircleShape && shapeB instanceof PolygonShape) {
    return collideCirclePolygon(a, b, shapeA, shapeB)
  }
  if (shapeA instanceof PolygonShape && shapeB instanceof CircleShape) {
    const m = collideCirclePolygon(b, a, shapeB, shapeA)
    if (!m) return null
    // 翻转法线，保持"A 指向 B"约定
    m.normal.scale(-1)
    return m
  }
  if (shapeA instanceof PolygonShape && shapeB instanceof PolygonShape) {
    return collidePolygonPolygon(a, b, shapeA, shapeB)
  }
  return null
}

// ---------------------------------------------------------------- 圆 × 圆

function collideCircleCircle(
  bodyA: Body,
  bodyB: Body,
  circleA: CircleShape,
  circleB: CircleShape,
): Manifold | null {
  const d = Vec2.sub(bodyB.position, bodyA.position)
  const rSum = circleA.radius + circleB.radius
  const distSq = d.lengthSq()
  if (distSq > rSum * rSum) return null

  const manifold = new Manifold(bodyA, bodyB)
  if (distSq < EPS * EPS) {
    // 圆心重合：取任意方向
    manifold.normal.set(0, 1)
    manifold.points.push(makePoint(bodyA.position.clone(), rSum, 'cc'))
  } else {
    const dist = Math.sqrt(distSq)
    manifold.normal.copy(d).scale(1 / dist)
    manifold.points.push(makePoint(
      Vec2.add(bodyA.position, Vec2.scale(manifold.normal, circleA.radius - rSum * 0.5)),
      rSum - dist,
      'cc',
    ))
  }
  finishManifold(manifold)
  return manifold
}

/** 根据法线补全切向（摩擦方向） */
function finishManifold(m: Manifold): void {
  m.tangent.set(-m.normal.y, m.normal.x)
}

// ------------------------------------------------------------ 圆 × 多边形

function collideCirclePolygon(
  circleBody: Body,
  polyBody: Body,
  circle: CircleShape,
  poly: PolygonShape,
): Manifold | null {
  // 圆心的局部坐标（相对多边形）
  const localCenter = polyBody.worldToLocal(circleBody.position)

  // 1) 找到圆心相对最深（分离量最大）的边
  let bestIndex = -1
  let bestSep = -Infinity
  for (let i = 0; i < poly.count; i++) {
    const s = Vec2.dot(poly.normals[i], Vec2.sub(localCenter, poly.vertices[i]))
    if (s > circle.radius) return null // 圆心在面外侧且超过半径，必不碰撞
    if (s > bestSep) {
      bestSep = s
      bestIndex = i
    }
  }

  // 2) 把圆心裁剪（投影）到参考边上，得到最近点
  const v1 = poly.vertices[bestIndex]
  const v2 = poly.vertices[(bestIndex + 1) % poly.count]
  const edge = Vec2.sub(v2, v1)
  let u = Vec2.dot(Vec2.sub(localCenter, v1), edge) / edge.lengthSq()
  u = Math.max(0, Math.min(1, u))
  const closestLocal = Vec2.add(v1, Vec2.scale(edge, u))

  const d = Vec2.sub(localCenter, closestLocal)
  const dist = d.length()

  const manifold = new Manifold(circleBody, polyBody)
  let normalLocal: Vec2
  let penetration: number

  if (dist < EPS) {
    // 圆心恰好在边上：用面的法线
    normalLocal = poly.normals[bestIndex]
    penetration = circle.radius - bestSep
  } else {
    normalLocal = Vec2.scale(d, 1 / dist)
    penetration = circle.radius - dist
  }

  // 局部法线 → 世界系（A=圆 → B=多边形）
  const c = Math.cos(polyBody.angle)
  const s = Math.sin(polyBody.angle)
  manifold.normal.set(
    c * normalLocal.x - s * normalLocal.y,
    s * normalLocal.x + c * normalLocal.y,
  )

  // 接触点：圆表面沿法线向内 penetration 处
  const point = Vec2.add(
    circleBody.position,
    Vec2.scale(manifold.normal, circle.radius - penetration),
  )
  manifold.points.push(makePoint(point, Math.min(penetration, MAX_PENETRATION), 'cp'))
  finishManifold(manifold)
  return manifold
}

// ------------------------------------------------------ 多边形 × 多边形

function collidePolygonPolygon(
  bodyA: Body,
  bodyB: Body,
  polyA: PolygonShape,
  polyB: PolygonShape,
): Manifold | null {
  // 1) SAT：对 A 的每个面求 B 的最小分离量，取最大者（最接近的面）
  const { separation: sepAB, index: refIndexA } = findMaxSeparation(polyA, bodyA, polyB, bodyB)
  if (sepAB > 0) return null
  const { separation: sepBA, index: refIndexB } = findMaxSeparation(polyB, bodyB, polyA, bodyA)
  if (sepBA > 0) return null

  // 2) 参考多边形 = 分离量更大（更浅）的那个面所在的多边形
  const tol = 0.02
  let refPoly: PolygonShape
  let refBody: Body
  let refIndex: number
  let incPoly: PolygonShape
  let incBody: Body
  let flip: 0 | 1

  if (sepBA > sepAB + tol) {
    // B 的面更接近分离 → B 为参考
    refPoly = polyB
    refBody = bodyB
    refIndex = refIndexB
    incPoly = polyA
    incBody = bodyA
    flip = 1
  } else {
    refPoly = polyA
    refBody = bodyA
    refIndex = refIndexA
    incPoly = polyB
    incBody = bodyB
    flip = 0
  }

  // 3) 找入射边：法线与参考法线最反平行的边
  const refNormalLocal = refPoly.normals[refIndex]
  const refNormalWorld = rotateLocal(refNormalLocal, refBody.angle)
  const incIndex = findIncidentEdge(refNormalLocal, incPoly, incBody, refBody)

  // 入射边两个顶点（世界系）
  const v11 = refBody.localToWorld(refPoly.vertices[refIndex])
  const v12 = refBody.localToWorld(refPoly.vertices[(refIndex + 1) % refPoly.count])
  const incV1 = incBody.localToWorld(incPoly.vertices[incIndex])
  const incV2 = incBody.localToWorld(incPoly.vertices[(incIndex + 1) % incPoly.count])

  // 4) 用参考边的两侧裁剪平面裁剪入射边（外扩一点避免共面浮点误差）
  const sideOffset = 0.002
  const tangentLocal = Vec2.sub(refPoly.vertices[(refIndex + 1) % refPoly.count], refPoly.vertices[refIndex])
  const tangentWorld = rotateLocal(tangentLocal, refBody.angle).normalize()
  const normalWorld = refNormalWorld

  // 侧平面法线：±tangent（垂直参考边）
  const clipped1 = clipSegment(incV1, incV2, Vec2.scale(tangentWorld, -1), -Vec2.dot(tangentWorld, v11) - sideOffset)
  if (clipped1.length === 0) return null
  const clipped2 = clipSegment(clipped1[0].v, clipped1[1].v, tangentWorld, Vec2.dot(tangentWorld, v12) - sideOffset)
  if (clipped2.length === 0) return null

  // 5) 保留参考面内侧（法线负侧）的点，生成接触点
  const manifold = new Manifold(bodyA, bodyB)
  const refPlaneOffset = Vec2.dot(normalWorld, v11)

  for (const { v, origin } of clipped2) {
    const separation = Vec2.dot(normalWorld, v) - refPlaneOffset
    if (separation <= 0) {
      const penetration = Math.min(-separation, MAX_PENETRATION)
      const id = `p${flip}:${refIndex}:${incIndex}:${origin}`
      manifold.points.push({ position: v, penetration, normalImpulse: 0, tangentImpulse: 0, id })
    }
  }

  if (manifold.count === 0) return null

  // 法线必须从 A 指向 B
  if (flip === 1) {
    // 参考是 B：参考法线指向 A 的反方向，需要翻转 → 从 A 指向 B
    manifold.normal.copy(normalWorld).scale(-1)
  } else {
    manifold.normal.copy(normalWorld)
  }
  finishManifold(manifold)
  return manifold
}

// ---------------------------------------------------------------- 工具

/** 求 poly1 相对 poly2 的最大分离量所在的面索引 */
function findMaxSeparation(
  poly1: PolygonShape,
  body1: Body,
  poly2: PolygonShape,
  body2: Body,
): { separation: number; index: number } {
  let bestIndex = 0
  let bestSep = -Infinity
  // 把 poly2 顶点变换到 poly1 的局部系，一次旋转矩阵计算代替逐顶点两次变换
  const cos1 = Math.cos(body1.angle)
  const sin1 = Math.sin(body1.angle)
  const cos2 = Math.cos(body2.angle)
  const sin2 = Math.sin(body2.angle)
  const relCos = cos2 * cos1 + sin2 * sin1
  const relSin = sin2 * cos1 - cos2 * sin1
  // poly2 质心在 poly1 局部系中的位置
  const dx = body2.position.x - body1.position.x
  const dy = body2.position.y - body1.position.y
  const cLocalX = cos1 * dx + sin1 * dy
  const cLocalY = -sin1 * dx + cos1 * dy

  for (let i = 0; i < poly1.count; i++) {
    const n = poly1.normals[i]
    const v = poly1.vertices[i]
    let minS = Infinity
    for (let j = 0; j < poly2.count; j++) {
      const w = poly2.vertices[j]
      // poly2 顶点 → poly1 局部系
      const x = relCos * w.x - relSin * w.y + cLocalX
      const y = relSin * w.x + relCos * w.y + cLocalY
      const s = n.x * (x - v.x) + n.y * (y - v.y)
      if (s < minS) minS = s
    }
    if (minS > bestSep) {
      bestSep = minS
      bestIndex = i
    }
  }
  return { separation: bestSep, index: bestIndex }
}

/** 找入射边：poly2 中法线与参考法线最反平行（点积最小）的边 */
function findIncidentEdge(
  refNormalLocal: Vec2,
  incPoly: PolygonShape,
  incBody: Body,
  refBody: Body,
): number {
  // 参考法线变换到入射多边形的局部系
  const relAngle = refBody.angle - incBody.angle
  const c = Math.cos(relAngle)
  const s = Math.sin(relAngle)
  const nLocal = new Vec2(c * refNormalLocal.x - s * refNormalLocal.y, s * refNormalLocal.x + c * refNormalLocal.y)

  let best = 0
  let bestDot = Infinity
  for (let i = 0; i < incPoly.count; i++) {
    const d = Vec2.dot(incPoly.normals[i], nLocal)
    if (d < bestDot) {
      bestDot = d
      best = i
    }
  }
  return best
}

/** 带来源标记的裁剪点（origin: 0/1 = 入射边端点，-1 = 交点） */
interface ClippedPoint {
  v: Vec2
  origin: number
}

/** 把线段 [v1, v2] 裁剪到平面 (n · x <= offset) 内侧 */
function clipSegment(v1: Vec2, v2: Vec2, n: Vec2, offset: number): ClippedPoint[] {
  const out: ClippedPoint[] = []
  const d1 = Vec2.dot(n, v1) - offset
  const d2 = Vec2.dot(n, v2) - offset
  if (d1 <= 0) out.push({ v: v1, origin: 0 })
  if (d2 <= 0) out.push({ v: v2, origin: 1 })
  if (d1 * d2 < 0) {
    // 一个端点在内、一个在外：求交点（来源取内侧端点）
    const t = d1 / (d1 - d2)
    const inside = d1 <= 0 ? 0 : 1
    out.push({ v: new Vec2(v1.x + t * (v2.x - v1.x), v1.y + t * (v2.y - v1.y)), origin: inside })
  }
  return out
}

function rotateLocal(v: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return new Vec2(c * v.x - s * v.y, s * v.x + c * v.y)
}

function makePoint(position: Vec2, penetration: number, id: string): ContactPoint {
  return { position, penetration, normalImpulse: 0, tangentImpulse: 0, id }
}
