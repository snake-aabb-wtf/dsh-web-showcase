/**
 * 程序化天空：大球体上的渐变着色器（天顶→地平线→地平线以下），
 * 叠加太阳光斑与暖色辉光，配合场景雾实现大气透视。无外部贴图。
 */
import * as THREE from 'three'
import { useMemo } from 'react'
import { SUN_DIR } from '../config/world'

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 groundColor;
  uniform vec3 sunDir;
  varying vec3 vWorldPos;

  void main() {
    vec3 dir = normalize(vWorldPos);
    float h = dir.y;

    // 天顶到地平线的渐变
    vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.45));
    // 地平线以下的雾霾渐变
    col = mix(col, groundColor, smoothstep(0.0, -0.3, h));

    // 太阳：锐利光斑 + 大范围辉光
    float sd = max(dot(dir, sunDir), 0.0);
    col += vec3(1.0, 0.97, 0.9) * (pow(sd, 900.0) * 3.2 + pow(sd, 10.0) * 0.28);
    // 太阳附近天光暖化
    col = mix(col, vec3(1.0, 0.82, 0.62), pow(sd, 4.0) * 0.14 * smoothstep(0.0, 0.2, h));

    gl_FragColor = vec4(col, 1.0);
  }
`

export function SkyDome(): React.ReactElement {
  const uniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color('#3d6fd8') },
      horizonColor: { value: new THREE.Color('#c9d6e2') },
      groundColor: { value: new THREE.Color('#b8c2b0') },
      sunDir: { value: new THREE.Vector3(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).normalize() },
    }),
    [],
  )
  return (
    <mesh renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[13000, 32, 16]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
