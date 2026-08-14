/**
 * 环境场景装配：天空、光照、雾、地形、跑道、云、树。
 * 画质档位影响云/树数量（低画质减半），雾与地形分辨率不变。
 */
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { CLOUDS, FOG, SUN_DIR, TERRAIN_SEGMENTS, TREES } from '../config/world'
import { useGameStore } from '../store/gameStore'
import { buildTerrainGeometry, buildTerrainMaterial } from './terrainMesh'
import { buildRunway } from './runway'
import { SkyDome } from './sky'
import { Clouds } from './clouds'
import { Trees } from './trees'

export function Environment(): React.ReactElement {
  const quality = useGameStore((s) => s.settings.quality)
  const { scene } = useThree()

  // 雾（大气透视）：颜色与天空地平线一致
  useEffect(() => {
    const fog = new THREE.Fog(FOG.color, FOG.near, FOG.far)
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene])

  const terrain = useMemo(() => {
    const geo = buildTerrainGeometry(TERRAIN_SEGMENTS[quality])
    const mesh = new THREE.Mesh(geo, buildTerrainMaterial())
    mesh.frustumCulled = false
    return mesh
  }, [quality])

  const runway = useMemo(() => buildRunway(), [])

  const sun = useMemo(() => new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).multiplyScalar(1600), [])

  return (
    <group>
      <SkyDome />
      <primitive object={terrain} />
      <primitive object={runway} />
      <Clouds count={CLOUDS.count[quality]} />
      <Trees count={TREES.count[quality]} />
      <hemisphereLight args={['#bdd4ff', '#5c6b4a', 0.85]} />
      <directionalLight color="#fff1d6" intensity={1.4} position={[sun.x, sun.y, sun.z]} />
    </group>
  )
}
