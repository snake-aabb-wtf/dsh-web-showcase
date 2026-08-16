/**
 * OrbitCamera — yaw/pitch/distance around a target, with view/projection
 * matrices and world-space ray unprojection for picking.
 */
import {
  mat4Invert,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  unprojectRay,
  v3cross,
  v3normalize,
  v3sub,
  type V3,
} from '../physics/math';

const UP: V3 = [0, 1, 0];

export class OrbitCamera {
  readonly target = new Float32Array(3);
  readonly eye = new Float32Array(3);

  yaw = 0.55;
  pitch = 0.32;
  distance = 4.3;
  fov = (55 * Math.PI) / 180;
  near = 0.05;
  far = 80;
  aspect = 1;

  readonly view = new Float32Array(16);
  readonly proj = new Float32Array(16);
  readonly viewProj = new Float32Array(16);
  readonly invViewProj = new Float32Array(16);

  private readonly forward = new Float32Array(3);
  private readonly right = new Float32Array(3);
  private readonly up2 = new Float32Array(3);
  private readonly tmp = new Float32Array(3);

  constructor(target: V3 = [0, 0.2, 0]) {
    this.target.set(target);
  }

  /** Recompute matrices from the current orbit parameters. */
  update(): void {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    this.eye[0] = this.target[0] + this.distance * cp * sy;
    this.eye[1] = this.target[1] + this.distance * sp;
    this.eye[2] = this.target[2] + this.distance * cp * cy;

    mat4LookAt(this.view, this.eye, this.target, UP);
    mat4Perspective(this.proj, this.fov, this.aspect, this.near, this.far);
    mat4Multiply(this.viewProj, this.proj, this.view);
    mat4Invert(this.invViewProj, this.viewProj);

    v3sub(this.tmp, this.target, this.eye);
    v3normalize(this.forward, this.tmp);
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.005;
    this.pitch = Math.min(1.45, Math.max(-1.45, this.pitch + dy * 0.005));
  }

  zoom(factor: number): void {
    this.distance = Math.min(20, Math.max(0.8, this.distance * factor));
  }

  /** Pan the target along the camera's right/up axes (pixel deltas). */
  pan(dxPx: number, dyPx: number, viewHeight: number): void {
    const worldPerPixel = (2 * this.distance * Math.tan(this.fov / 2)) / Math.max(1, viewHeight);
    v3cross(this.right, this.forward, UP);
    v3normalize(this.right, this.right);
    v3cross(this.up2, this.right, this.forward);
    this.target[0] -= this.right[0] * dxPx * worldPerPixel;
    this.target[1] -= this.right[1] * dxPx * worldPerPixel;
    this.target[2] -= this.right[2] * dxPx * worldPerPixel;
    this.target[0] += this.up2[0] * dyPx * worldPerPixel;
    this.target[1] += this.up2[1] * dyPx * worldPerPixel;
    this.target[2] += this.up2[2] * dyPx * worldPerPixel;
  }

  /** Build a world ray from CSS-pixel coordinates (origin bottom-left). */
  rayFromPixel(px: number, py: number, w: number, h: number, outOrigin: Float32Array, outDir: Float32Array): void {
    const ndcX = (px / w) * 2 - 1;
    const ndcY = 1 - (py / h) * 2;
    unprojectRay(this.invViewProj, ndcX, ndcY, outOrigin, outDir);
  }

  /** Copy the camera forward (view) direction into `out`. */
  getForward(out: Float32Array): void {
    out.set(this.forward);
  }

  getEye(out: Float32Array): void {
    out.set(this.eye);
  }
}
