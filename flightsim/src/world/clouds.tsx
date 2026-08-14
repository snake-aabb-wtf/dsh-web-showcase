/**
 * 程序化云：InstancedMesh 实例化低多边形云团（合并球体簇），
 * 单 draw call 渲染上百朵云，白色 Lambert 材质由雾自然衰减。
 */
import * as THREE from 'three'
import { useMemo } from 'react'
import { CLOUDS } from '../config/world'
import { mulberry32 } from '../utils/seededRandom'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

function buildCloudGeometry(): THREE.BufferGeometry {
  const puffs: THREE.BufferGeometry[] = []
  const base = new THREE.SphereGeometry(1, 8, 6)
  base.scale(1.15, 0.55, 1)
  puffs.push(base)
  for (const [dx, dy, dz, s] of [
    [0.9, 0.12, 0.3, 0.72],
    [-0.85, 0.1, -0.25, 0.66],
    [0.2, 0.28, -0.6, 0.8],
    [-0.25, 0.2, 0.65, 0.62],
  ] as const) {
    const p = new THREE.SphereGeometry(s, 7, 5)
    p.translate(dx, dy, dz)
    puffs.push(p)
  }
  const merged = mergeGeometries(puffs, false)!
  merged.computeVertexNormals()
  return merged
}

export function Clouds({ count }: { count: number }): React.ReactElement {
  const mesh = useMemo(() => {
    const geometry = buildCloudGeometry()
    const rand = mulberry32(2024)
    const m = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: '#ffffff' }), count)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const radius = CLOUDS.minRadius + rand() * (CLOUDS.maxRadius - CLOUDS.minRadius)
      const theta = rand() * Math.PI * 2
      dummy.position.set(
        Math.cos(theta) * radius,
        CLOUDS.minAlt + rand() * (CLOUDS.maxAlt - CLOUDS.minAlt),
        Math.sin(theta) * radius,
      )
      dummy.rotation.y = rand() * Math.PI * 2
      const s = CLOUDS.scaleMin + rand() * (CLOUDS.scaleMax - CLOUDS.scaleMin)
      dummy.scale.set(s, s * 0.55, s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    return m
  }, [count])

  return <primitive object={mesh} />
}
