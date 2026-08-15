import { World } from '../engine/World'
import { Body } from '../engine/bodies/Body'
import { CircleShape, PolygonShape } from '../engine/bodies/Shape'
import { DistanceJoint } from '../engine/dynamics/Joints'
import { Vec2 } from '../engine/math/Vec2'

export interface Scene {
  id: string
  name: string
  description: string
  /** 场景的世界范围（用于相机对焦） */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** 场景级求解迭代声明（缺省用 World 默认 8/3）。
   *  长关节链（如 22 节链条）的约束求解按链逐级传导，迭代不足时链尾会缓慢拉长（漏沙），
   *  需要更多速度迭代；普通场景 8/3 足够。 */
  velocityIterations?: number
  positionIterations?: number
  build: (world: World) => void
}

// ---------------------------------------------------------------- 辅助

interface BodyOpts {
  hue?: number
  restitution?: number
  friction?: number
  density?: number
  angle?: number
  static?: boolean
}

function makeBox(world: World, x: number, y: number, hx: number, hy: number, opts: BodyOpts = {}): Body {
  const body = new Body(PolygonShape.box(hx, hy))
  body.setPosition(x, y).setAngle(opts.angle ?? 0)
  body.hue = opts.hue ?? 210
  body.restitution = opts.restitution ?? 0.15
  body.friction = opts.friction ?? 0.55
  if (opts.static) body.setType('static')
  if (opts.density !== undefined) body.updateMassData(opts.density)
  world.addBody(body)
  return body
}

function makeCircle(world: World, x: number, y: number, r: number, opts: BodyOpts = {}): Body {
  const body = new Body(new CircleShape(r))
  body.setPosition(x, y)
  body.hue = opts.hue ?? 190
  body.restitution = opts.restitution ?? 0.25
  body.friction = opts.friction ?? 0.4
  if (opts.static) body.setType('static')
  if (opts.density !== undefined) body.updateMassData(opts.density)
  world.addBody(body)
  return body
}

function makePoly(world: World, x: number, y: number, vertices: Vec2[], opts: BodyOpts = {}): Body {
  const body = new Body(PolygonShape.fromVertices(vertices))
  body.setPosition(x, y).setAngle(opts.angle ?? 0)
  body.hue = opts.hue ?? 260
  body.restitution = opts.restitution ?? 0.2
  body.friction = opts.friction ?? 0.55
  if (opts.static) body.setType('static')
  world.addBody(body)
  return body
}

/** 半开区间均匀随机 */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** 世界地面：左右两侧 + 底部 */
function buildArena(world: World): void {
  makeBox(world, -520, 250, 20, 400, { static: true })
  makeBox(world, 520, 250, 20, 400, { static: true })
  makeBox(world, 0, 640, 560, 20, { static: true })
}

// ---------------------------------------------------------------- 场景

const stacking: Scene = {
  id: 'stack',
  name: '堆叠金字塔',
  description: '经典压力测试：顺序冲量求解器能否稳住 5 层砖墙？拖动最底层试试。',
  bounds: { minX: -260, minY: -160, maxX: 260, maxY: 660 },
  build(world) {
    buildArena(world)
    makeBox(world, 0, 622, 540, 16, { static: true, hue: 210 })

    // 金字塔：从下往上
    const rows = 6
    for (let row = 0; row < rows; row++) {
      const n = rows - row
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 54
        const y = 580 - row * 54
        makeBox(world, x, y, 24, 24, { hue: 210 + row * 12, density: 1 })
      }
    }
  },
}

const ballPit: Scene = {
  id: 'balls',
  name: '球坑',
  description: '不同半径、不同弹性的圆。观察恢复系数混合规则（取大值）。',
  bounds: { minX: -260, minY: -260, maxX: 260, maxY: 660 },
  build(world) {
    buildArena(world)
    // 漏斗（上宽下窄）
    makePoly(
      world,
      -140, 300,
      [new Vec2(-140, 240), new Vec2(-20, 240), new Vec2(-40, 380), new Vec2(-240, 380)],
      { static: true, hue: 280 },
    )
    makePoly(
      world,
      140, 300,
      [new Vec2(140, 240), new Vec2(20, 240), new Vec2(40, 380), new Vec2(240, 380)],
      { static: true, hue: 280 },
    )
    // V 形收集盆（接住从漏斗口落下的球）
    makeBox(world, -40, 450, 90, 10, { static: true, hue: 280, angle: 0.55 })
    makeBox(world, 40, 450, 90, 10, { static: true, hue: 280, angle: -0.55 })
    // 斜坡（把球送进漏斗）
    makeBox(world, -260, 130, 90, 10, { static: true, hue: 200, angle: -0.5 })
    makeBox(world, 260, 130, 90, 10, { static: true, hue: 200, angle: 0.5 })

    for (let i = 0; i < 26; i++) {
      const r = rand(10, 26)
      makeCircle(world, rand(-300, 300), rand(-240, -40), r, {
        hue: rand(0, 360),
        restitution: rand(0.2, 0.9),
        friction: rand(0.1, 0.6),
        density: 1,
      })
    }
  },
}

const domino: Scene = {
  id: 'domino',
  name: '多米诺',
  description: '连锁反应：一颗小球推倒一整排骨牌。骨牌用细长矩形近似。',
  bounds: { minX: -300, minY: -100, maxX: 300, maxY: 660 },
  build(world) {
    buildArena(world)
    makeBox(world, 0, 622, 560, 16, { static: true })

    // 骨牌阵
    const n = 18
    for (let i = 0; i < n; i++) {
      const x = -240 + i * 28
      makeBox(world, x, 576, 6, 30, { hue: 40 + i * 4, restitution: 0.05, friction: 0.7 })
    }
    // 斜坡（右端低，球滚向骨牌）
    makeBox(world, -300, 582, 26, 18, { static: true, hue: 200, angle: 0.28 })
    // 触发球
    makeCircle(world, -292, 520, 20, { hue: 160, restitution: 0.55, friction: 0.25 })
  },
}

const chain: Scene = {
  id: 'chain',
  name: '链条摆锤',
  description: '距离关节（DistanceJoint）串联的链条 + 摆锤。按住摆锤甩起来！',
  bounds: { minX: -320, minY: -200, maxX: 320, maxY: 660 },
  velocityIterations: 40,
  positionIterations: 24,
  build(world) {
    buildArena(world)
    makeBox(world, 0, 622, 560, 16, { static: true })

    // 天花板锚点（静态刚体）
    const anchor = makeBox(world, 0, -180, 8, 8, { static: true })

    // 链节：细长小盒，DistanceJoint 首尾相连
    const links: Body[] = []
    const n = 22
    for (let i = 0; i < n; i++) {
      const link = makeBox(world, 0, -140 + i * 22, 8, 10, {
        hue: 30 + i * 2,
        friction: 0.3,
        density: 1.2,
      })
      links.push(link)
    }
    for (let i = 0; i < n; i++) {
      const a = i === 0 ? anchor : links[i - 1]
      const b = links[i]
      // 锚点 = 两端刚体各自中心（此前误用固定坐标 (0,-172)，导致除首关节外全部连错）
      const joint = new DistanceJoint(a, b, a.position.clone(), b.position.clone())
      world.addJoint(joint)
    }

    // 末端摆锤
    const hammer = makeCircle(world, 0, 360, 26, { hue: 200, restitution: 0.4, friction: 0.3, density: 2 })
    const last = links[n - 1]
    world.addJoint(new DistanceJoint(last, hammer, new Vec2(0, -140 + n * 22 - 22), new Vec2(0, 360)))

    // 侧边的一串珠子
    const anchor2 = makeBox(world, 300, -180, 8, 8, { static: true })
    const beads: Body[] = []
    const m = 14
    for (let i = 0; i < m; i++) {
      beads.push(makeCircle(world, 300, -120 + i * 26, 12, { hue: 270 + i * 5, friction: 0.2, density: 1.4 }))
    }
    for (let i = 0; i < m; i++) {
      const a = i === 0 ? anchor2 : beads[i - 1]
      // 锚点 = 两端刚体各自中心（此前误用固定坐标 (300,-180)，导致除首关节外全部连错）
      world.addJoint(new DistanceJoint(a, beads[i], a.position.clone(), beads[i].position.clone()))
    }
  },
}

const seesaw: Scene = {
  id: 'seesaw',
  name: '跷跷板',
  description: '单个接触点支撑 + 摩擦的经典演示。往两边扔球保持平衡。',
  bounds: { minX: -360, minY: -180, maxX: 360, maxY: 660 },
  build(world) {
    buildArena(world)
    makeBox(world, 0, 622, 560, 16, { static: true })

    // 三角支点：顶点在上（y=500），板子底边正好搭在顶点上，可以自由摆动
    // 注意：makePoly 的位置是质心（三角形质心 = (0,540)），顶点世界坐标 = 位置 + 局部顶点
    makePoly(
      world,
      0, 540,
      [new Vec2(-34, 560), new Vec2(0, 500), new Vec2(34, 560)],
      { static: true, hue: 300 },
    )
    // 板子：底边（y=500）与支点顶点共面，形成单点支撑
    makeBox(world, 0, 490, 200, 10, { hue: 50, friction: 0.6, restitution: 0, density: 1.5 })

    // 一批球
    for (let i = 0; i < 18; i++) {
      makeCircle(world, rand(-200, 200), rand(-160, -60), rand(12, 22), {
        hue: Math.random() < 0.5 ? 160 : 320,
        restitution: 0.3,
        friction: 0.5,
      })
    }
  },
}

const wreckingBall: Scene = {
  id: 'wreck',
  name: '撞球吊锤',
  description: '摆锤自由落下砸碎砖墙。绳索半径经过计算，保证锤子正好撞到墙。',
  bounds: { minX: -380, minY: -240, maxX: 380, maxY: 660 },
  build(world) {
    buildArena(world)
    makeBox(world, 0, 622, 560, 16, { static: true })

    // 砖墙（7 行 × 5 列，交错堆叠），左边缘 x=142
    const wallX = 210
    const rows = 7
    for (let row = 0; row < rows; row++) {
      const n = row % 2 === 0 ? 5 : 4
      for (let i = 0; i < n; i++) {
        const x = wallX + (i - (n - 1) / 2) * 34 + (row % 2 === 0 ? 0 : 17)
        makeBox(world, x, 592 - row * 30, 16, 14, { hue: 12, friction: 0.6, restitution: 0.1 })
      }
    }

    // 吊锤：支点 (-60, 300)，绳长 268，锤心半径 36
    // 圆方程 (x+60)² + (y-300)² = 268² 在 x=142 处 y≈476 —— 正好扫过墙的左边缘
    const pivot = makeBox(world, -60, 300, 10, 10, { static: true })
    const ball = makeCircle(world, 129.5, 110.5, 36, { hue: 220, restitution: 0.3, friction: 0.2, density: 2.5 })
    world.addJoint(new DistanceJoint(pivot, ball, new Vec2(-60, 300), new Vec2(129.5, 110.5)))
  },
}

const mixed: Scene = {
  id: 'mixed',
  name: '形状大杂烩',
  description: '圆、矩形、三角形、五边形……SAT 对所有凸多边形一视同仁。',
  bounds: { minX: -320, minY: -260, maxX: 320, maxY: 660 },
  build(world) {
    buildArena(world)
    makeBox(world, 0, 622, 560, 16, { static: true })

    for (let i = 0; i < 40; i++) {
      const roll = Math.random()
      const x = rand(-320, 320)
      const y = rand(-240, -60)
      const hue = rand(0, 360)
      if (roll < 0.3) {
        makeCircle(world, x, y, rand(10, 24), { hue, restitution: rand(0.1, 0.5) })
      } else if (roll < 0.55) {
        makeBox(world, x, y, rand(12, 28), rand(12, 28), { hue, angle: rand(0, Math.PI), restitution: rand(0.1, 0.4) })
      } else if (roll < 0.75) {
        const hx = rand(14, 26)
        const hy = rand(14, 26)
        makePoly(
          world, x, y,
          [new Vec2(-hx, -hy), new Vec2(hx, -hy), new Vec2(0, hy * 1.3)],
          { hue, restitution: rand(0.1, 0.4), angle: rand(0, Math.PI) },
        )
      } else {
        const sides = 5 + Math.floor(rand(0, 3))
        const body = new Body(PolygonShape.regularPolygon(sides, rand(12, 22)))
        body.setPosition(x, y).setAngle(rand(0, Math.PI))
        body.hue = hue
        body.restitution = rand(0.1, 0.4)
        world.addBody(body)
      }
    }
  },
}

export const SCENES: Scene[] = [stacking, ballPit, domino, chain, seesaw, wreckingBall, mixed]
