/**
 * 相机：第三人称平滑跟随（指数阻尼）与第一人称座舱（姿态直接跟随，带轻微平滑）。
 */
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { flightEngine } from '../physics/engine'
import { useGameStore } from '../store/gameStore'
import { damp } from '../utils/math'

const EYE_OFFSET = new THREE.Vector3(0.32, 0, -0.55) // 飞行员眼位（机体坐标）

export function CameraRig(): React.ReactElement | null {
  const view = useGameStore((s) => s.view)
  const cameraSmooth = useGameStore((s) => s.settings.cameraSmooth)
  const smoothPos = useRef(new THREE.Vector3())
  const smoothLook = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const lastView = useRef(view)

  // 切换视角时重置平滑状态，避免镜头"飞越"
  useEffect(() => {
    initialized.current = false
    lastView.current = view
  }, [view])

  useFrame(({ camera }, delta) => {
    const cam = camera as THREE.PerspectiveCamera
    const s = flightEngine.state
    const q = new THREE.Quaternion(s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w)
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(q)

    if (view === 'chase') {
      const targetPos = new THREE.Vector3(s.position.x, s.position.y, s.position.z)
        .addScaledVector(fwd, -10.5)
        .add(new THREE.Vector3(0, 3.6, 0))
      const lookTarget = new THREE.Vector3(s.position.x, s.position.y, s.position.z)
        .addScaledVector(fwd, 9)
        .add(new THREE.Vector3(0, 1.5, 0))

      if (!initialized.current) {
        smoothPos.current.copy(targetPos)
        smoothLook.current.copy(lookTarget)
        initialized.current = true
      }
      const lambda = 2.2 + cameraSmooth * 6.5
      const k = 1 - Math.exp(-lambda * Math.min(delta, 0.1))
      smoothPos.current.lerp(targetPos, k)
      smoothLook.current.lerp(lookTarget, k)
      camera.position.copy(smoothPos.current)
      camera.lookAt(smoothLook.current)
      cam.fov = damp(cam.fov, 62, 4, delta)
      cam.updateProjectionMatrix()
    } else {
      // 座舱视角：眼位 = 机体坐标眼位旋转 + 机体重心位置
      const eye = EYE_OFFSET.clone().applyQuaternion(q).add(new THREE.Vector3(s.position.x, s.position.y, s.position.z))
      camera.position.copy(eye)
      // 姿态直接跟随（轻微指数平滑，避免高频抖动）
      camera.quaternion.slerp(q, 1 - Math.exp(-14 * Math.min(delta, 0.1)))
      cam.fov = damp(cam.fov, 78, 4, delta)
      cam.updateProjectionMatrix()
    }
  })

  return null
}
