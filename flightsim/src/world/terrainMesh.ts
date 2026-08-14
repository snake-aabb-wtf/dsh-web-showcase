/**
 * 程序化地形网格：由 heightfield 高度场生成顶点，顶点色按海拔/坡度着色
 * （草地 → 岩石 → 雪线），平面着色降低绘制开销（单 draw call，无纹理采样）。
 */
import * as THREE from 'three'
import { TERRAIN_SIZE } from '../config/world'
import { terrainHeight } from './heightfield'
import { mulberry32 } from '../utils/seededRandom'

const GRASS = new THREE.Color('#79a05b')
const GRASS_DARK = new THREE.Color('#5f8448')
const DIRT = new THREE.Color('#8a7a54')
const ROCK = new THREE.Color('#8f8f8c')
const SNOW = new THREE.Color('#eef2f5')

export function buildTerrainGeometry(segments: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position as THREE.BufferAttribute
  const rand = mulberry32(42)
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const t = new THREE.Color()

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)

    // 顶点色：海拔与确定性噪声混合
    const n = rand()
    c.copy(GRASS).lerp(GRASS_DARK, n * 0.5)
    if (h > 30) {
      c.lerp(ROCK, Math.min(1, (h - 30) / 18))
    } else if (h > 12) {
      c.lerp(DIRT, ((h - 12) / 18) * 0.35)
    }
    if (h > 52) {
      c.lerp(SNOW, Math.min(1, (h - 52) / 10))
    }
    // 跑道附近（低海拔平坦区）草色更亮，形成"机场绿地"观感
    if (Math.abs(z) < 90 && Math.abs(x) < 1400) {
      t.set('#8fae6d')
      c.lerp(t, 0.55)
    }
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

export function buildTerrainMaterial(): THREE.Material {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
}
