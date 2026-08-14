/**
 * 飞机对象的 R3F 组件：每渲染帧把物理引擎状态同步到模型
 * （位置/姿态/螺旋桨转速/起落架收放/软阴影），并切换第一/第三人称可见性。
 */
import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { buildAircraft } from './model'
import { flightEngine } from '../physics/engine'
import { terrainHeight } from '../world/heightfield'
import { useGameStore } from '../store/gameStore'

const UP = new THREE.Vector3(0, 1, 0)

export function FlightObject(): React.ReactElement {
  const meshes = useMemo(() => buildAircraft(), [])
  const propRef = useRef<THREE.Group | null>(null)
  const shadowMatRef = useRef<THREE.MeshBasicMaterial | null>(null)
  const view = useGameStore((s) => s.view)

  useLayoutEffect(() => {
    propRef.current = meshes.root.getObjectByName('propeller') as THREE.Group | null
    const shadow = meshes.root.getObjectByName('shadow') as THREE.Mesh | null
    if (shadow) shadowMatRef.current = shadow.material as THREE.MeshBasicMaterial
  }, [meshes])

  useFrame((_, delta) => {
    const s = flightEngine.state
    const root = meshes.root
    root.position.set(s.position.x, s.position.y, s.position.z)
    root.quaternion.set(s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w)

    // 螺旋桨转速
    if (propRef.current) {
      propRef.current.rotation.x += (s.rpm / 60) * Math.PI * 2 * Math.min(delta, 0.1)
    }

    // 起落架收放（枢轴旋转）
    const t = s.gearTransition
    meshes.gearPivots.mainL.rotation.x = t * Math.PI
    meshes.gearPivots.mainR.rotation.x = t * Math.PI
    meshes.gearPivots.nose.rotation.x = t * Math.PI

    // 软阴影：贴地、随高度淡出缩小
    const sh = meshes.shadow
    sh.position.set(s.position.x, terrainHeight(s.position.x, s.position.z) + 0.08, s.position.z)
    sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), UP)
    const fade = Math.max(0, 1 - Math.max(s.altitudeAGL, 0) / 160)
    sh.scale.setScalar(0.5 + fade * 0.9)
    if (shadowMatRef.current) shadowMatRef.current.opacity = fade * 0.32

    // 视角可见性：座舱视角显示内部构件，第三人称显示外部涂装
    const cockpit = view === 'cockpit'
    meshes.exterior.visible = !cockpit
    meshes.cockpit.visible = cockpit
    meshes.prop.visible = !cockpit
    meshes.gearPivots.nose.visible = !cockpit
    meshes.gearPivots.mainL.visible = !cockpit
    meshes.gearPivots.mainR.visible = !cockpit
    sh.visible = !cockpit
  })

  return <primitive object={meshes.root} />
}
