/**
 * 相机：第三人称平滑跟随（指数阻尼）与第一人称座舱（姿态直接跟随，带轻微平滑）。
 */
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { flightEngine } from '../physics/engine'
import { useGameStore } from '../store/gameStore'
import { damp } from '../utils/math'

// 飞行员眼位（机体坐标）：抬高并微前移至座舱机头整流罩顶之上，
// 使机头实体落在视野下部（真实座舱"透过风挡看机头"的观感），避免遮挡正前方。
const EYE_OFFSET = new THREE.Vector3(0.36, 0, -0.64)

// 相机朝向偏置：three.js 相机视线沿局部 -Z，而飞机"前"沿机体 +X。
// 用基向量构造 body→camera 旋转：相机右→机体右、相机上→机体上、相机后→机体后，
// 使相机视线对齐机头方向且上下/左右不颠倒。
const CAMERA_BODY_TO_CAM = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0), // 相机右 → 机体右
    new THREE.Vector3(0, 0, -1), // 相机上 → 机体上
    new THREE.Vector3(-1, 0, 0), // 相机后 → 机体后
  ),
)
const CAMERA_TARGET_Q = new THREE.Quaternion() // 复用临时对象，避免每帧分配

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
      // 姿态 = 飞机姿态 ⊗ 相机偏置（机头 +X → 相机视线 -Z），轻微指数平滑
      CAMERA_TARGET_Q.multiplyQuaternions(q, CAMERA_BODY_TO_CAM)
      camera.quaternion.slerp(CAMERA_TARGET_Q, 1 - Math.exp(-14 * Math.min(delta, 0.1)))
      cam.fov = damp(cam.fov, 78, 4, delta)
      cam.updateProjectionMatrix()

      // 供测试探针断言相机朝向（视线应水平指向机头方向）
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      const w = window as unknown as { __camDir?: { x: number; y: number; z: number } }
      w.__camDir = { x: dir.x, y: dir.y, z: dir.z }
    }
  })

  return null
}
