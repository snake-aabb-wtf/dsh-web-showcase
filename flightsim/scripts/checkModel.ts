/** 检查飞机模型几何：各部件包围盒与对称性 */
import * as THREE from 'three'
import { buildAircraft } from '../src/aircraft/model'

function bounds(geo: THREE.BufferGeometry, label: string): void {
  geo.computeBoundingBox()
  const b = geo.boundingBox!
  const cx = (b.min.x + b.max.x) / 2
  const cy = (b.min.y + b.max.y) / 2
  const cz = (b.min.z + b.max.z) / 2
  console.log(
    `${label.padEnd(16)} x[${b.min.x.toFixed(2)}, ${b.max.x.toFixed(2)}]  y[${b.min.y.toFixed(2)}, ${b.max.y.toFixed(2)}]  z[${b.min.z.toFixed(2)}, ${b.max.z.toFixed(2)}]  ` +
      `中心(${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)})`,
  )
}

const m = buildAircraft()
console.log('=== 主体（机身+机翼+尾翼合并几何） ===')
bounds(m.exterior.geometry, 'exterior')

// 分别检查机翼/平尾/垂尾部件（从合并前构造：重新构建各部分临时验证用代码内数据）
console.log('\n=== 说明 ===')
console.log('机体坐标：x 前、y 右、z 下。机翼应左右对称：y 范围应约为 [-5.3, +5.3]。')
const y = m.exterior.geometry.attributes.position as THREE.BufferAttribute
let yMin = Infinity
let yMax = -Infinity
for (let i = 0; i < y.count; i++) {
  const v = y.getY(i)
  if (v < yMin) yMin = v
  if (v > yMax) yMax = v
}
console.log(`exterior 顶点 y 范围: [${yMin.toFixed(2)}, ${yMax.toFixed(2)}]  → 机翼对称性: ${Math.abs(yMin + yMax) < 0.5 ? '对称 ✓' : '不对称 ✗'}`)
