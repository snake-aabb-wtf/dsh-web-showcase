/**
 * 程序化树木：InstancedMesh 实例化（树干圆柱 + 树冠圆锥，合并几何体），
 * 依据地形高度/坡度/跑道净空区确定性分布，单 draw call。
 */
import * as THREE from 'three'
import { useMemo } from 'react'
import { APRON, RUNWAY, TAXIWAY, TREES } from '../config/world'
import { mulberry32 } from '../utils/seededRandom'
import { terrainHeight, terrainNormal } from './heightfield'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

function buildTreeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.17, 1.4, 5)
  trunk.translate(0, 0.7, 0)
  const crown = new THREE.ConeGeometry(0.95, 2.6, 7)
  crown.translate(0, 2.7, 0)
  return mergeGeometries([trunk, crown], false)!
}

function isClearZone(x: number, z: number): boolean {
  // 跑道净空
  if (Math.abs(z) < RUNWAY.halfWidth + RUNWAY.shoulder + 40 && Math.abs(x) < RUNWAY.halfLength + 40) return false
  // 滑行道净空
  if (
    z > TAXIWAY.from.z - 20 &&
    z < TAXIWAY.to.z + 20 &&
    Math.abs(x - (TAXIWAY.from.x + ((TAXIWAY.to.x - TAXIWAY.from.x) * (z - TAXIWAY.from.z)) / (TAXIWAY.to.z - TAXIWAY.from.z))) < TAXIWAY.halfWidth + 25
  ) {
    return false
  }
  // 机坪净空
  if (Math.abs(x - APRON.center.x) < APRON.halfW + 25 && Math.abs(z - APRON.center.z) < APRON.halfH + 25) return false
  return true
}

export function Trees({ count }: { count: number }): React.ReactElement {
  const mesh = useMemo(() => {
    const geometry = buildTreeGeometry()
    const rand = mulberry32(777)
    const mat = new THREE.MeshLambertMaterial({ color: '#3f7a3a' })
    const m = new THREE.InstancedMesh(geometry, mat, count)
    const dummy = new THREE.Object3D()
    let placed = 0
    let guard = 0
    while (placed < count && guard < count * 40) {
      guard += 1
      const x = (rand() * 2 - 1) * TREES.maxRadius
      const z = (rand() * 2 - 1) * TREES.maxRadius
      const h = terrainHeight(x, z)
      if (h < TREES.minAlt || h > TREES.maxAlt) continue
      if (Math.hypot(x, z) > TREES.maxRadius) continue
      if (!isClearZone(x, z)) continue
      const n = terrainNormal(x, z)
      if (n.y < 0.82) continue // 坡度过滤
      const s = 0.7 + rand() * 1.1
      dummy.position.set(x, h, z)
      dummy.rotation.y = rand() * Math.PI * 2
      dummy.scale.set(s, s, s)
      dummy.updateMatrix()
      m.setMatrixAt(placed, dummy.matrix)
      placed += 1
    }
    m.count = placed
    m.instanceMatrix.needsUpdate = true
    return m
  }, [count])

  return <primitive object={mesh} />
}
