/**
 * ClothEngine — Position-Based Dynamics solver.
 *
 * Per substep:
 *   1. integrate   : gravity / wind / damping, advance positions (explicit Euler)
 *   2. solve       : project distance constraints (structural / shear / bending), tearing
 *   3. collide     : sphere + floor
 *   4. applyGrab   : hard-position the grabbed particle cluster to the mouse ray
 *   5. finalize    : recover velocities from position deltas (PBD)
 *
 * The engine is pure TypeScript — no DOM — so it can be unit-tested in Node.
 */
import { Cloth, KIND_BENDING, type ClothConfig, type PinMode } from './cloth';

export interface SimParams {
  gravity: number;
  windStrength: number;
  windAngleDeg: number; // wind direction in the xz plane
  stiffness: number; // 0..1 constraint compliance factor
  iterations: number; // PBD solver iterations per substep
  damping: number; // per-second velocity damping
  tearThreshold: number; // strain (length/rest) at which structural+shear constraints break
  tearingEnabled: boolean;
  grabRadius: number; // world-space radius of the grabbed cluster
  sphereEnabled: boolean;
  sphereRadius: number;
  restitution: number; // bounce factor for sphere & floor
  friction: number; // 0..1 tangential friction at sphere/floor contact (cloth grip)
  floorEnabled: boolean;
  // Rendering-only knobs (consumed by the renderer, ignored by the solver):
  clothColor: string; // hex base color of the cloth (checker secondary derived)
  thickness: number; // visual slab half-depth (render only)
  opacity: number; // 0..1 cloth opacity (render only)
  showWireframe: boolean;
  colorMode: 'checker' | 'strain';
}

export const defaultParams: SimParams = {
  gravity: 9.8,
  windStrength: 4,
  windAngleDeg: 45,
  stiffness: 1,
  iterations: 6,
  damping: 0.06,
  tearThreshold: 1.6,
  tearingEnabled: false,
  grabRadius: 0.12,
  sphereEnabled: true,
  sphereRadius: 0.45,
  restitution: 0.25,
  friction: 0.55,
  floorEnabled: true,
  clothColor: '#5c80d1',
  opacity: 1,
  thickness: 0.03,
  showWireframe: false,
  colorMode: 'checker',
};

interface GrabItem {
  index: number;
  weight: number; // 1 at the anchor, falling to 0 at grabRadius
  ox: number;
  oy: number;
  oz: number; // offset from the anchor at grab time
  px: number;
  py: number;
  pz: number; // previous desired position (drives drag velocity)
}

interface GrabState {
  planeNx: number;
  planeNy: number;
  planeNz: number;
  planePx: number;
  planePy: number;
  planePz: number;
  rayOx: number;
  rayOy: number;
  rayOz: number;
  rayDx: number;
  rayDy: number;
  rayDz: number;
  items: GrabItem[];
}

interface SphereGrabState {
  planeNx: number;
  planeNy: number;
  planeNz: number;
  planePx: number;
  planePy: number;
  planePz: number;
}

export class ClothEngine {
  readonly cloth: Cloth;
  params: SimParams = { ...defaultParams };

  readonly spherePos = new Float32Array(3);
  readonly floorY: number;

  time = 0;

  private readonly sphereVel = new Float32Array(3);
  private readonly defaultSpherePos = new Float32Array([0, -0.35, 0.4]);
  private grab: GrabState | null = null;
  private sphereGrab: SphereGrabState | null = null;
  private readonly savedMasses: Float32Array;

  constructor(config: ClothConfig, pinMode: PinMode = 'corners') {
    this.cloth = new Cloth(config, pinMode);
    this.savedMasses = new Float32Array(this.cloth.vertexCount);
    this.floorY = -config.height / 2 + 0.08;
    this.spherePos.set(this.defaultSpherePos);
  }

  rebuild(pinMode: PinMode): void {
    this.cloth.rebuild(pinMode);
    this.spherePos.set(this.defaultSpherePos);
    this.sphereVel.fill(0);
    this.grab = null;
    this.sphereGrab = null;
    this.time = 0;
  }

  step(dt: number, substeps = 3): void {
    const h = dt / substeps;
    this.time += dt;
    for (let s = 0; s < substeps; s++) {
      this.integrate(h);
      this.solveConstraints();
      if (this.params.sphereEnabled || this.params.floorEnabled) this.collide(h);
      this.applyGrab(h);
      this.finalizeVelocities(h);
    }
  }

  get isGrabbing(): boolean {
    return this.grab !== null;
  }

  get grabSize(): number {
    return this.grab ? this.grab.items.length : 0;
  }

  // -------------------------------------------------------------------------
  // Drag API
  // -------------------------------------------------------------------------

  /** Pick the particle closest to `point` (used after ray-triangle picking). */
  findClosestParticle(x: number, y: number, z: number): number {
    const p = this.cloth.positions;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.cloth.vertexCount; i++) {
      const dx = p[i * 3] - x;
      const dy = p[i * 3 + 1] - y;
      const dz = p[i * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Begin dragging a cluster of particles around `anchor`.
   * `planeN` is the camera forward at grab time; the cluster is constrained to the
   * plane through the anchor perpendicular to it (so the cloth can't fly at the camera).
   */
  beginClothDrag(anchor: number, rayO: Float32Array, rayD: Float32Array, planeN: Float32Array): boolean {
    const p = this.cloth.positions;
    const im = this.cloth.inverseMasses;
    const R = this.params.grabRadius;
    const ax = p[anchor * 3];
    const ay = p[anchor * 3 + 1];
    const az = p[anchor * 3 + 2];

    const items: GrabItem[] = [];
    for (let i = 0; i < this.cloth.vertexCount; i++) {
      if (i !== anchor && this.cloth.isPinned(i)) continue; // keep real pins fixed
      const dx = p[i * 3] - ax;
      const dy = p[i * 3 + 1] - ay;
      const dz = p[i * 3 + 2] - az;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= R) {
        items.push({
          index: i,
          weight: 1 - d / R,
          ox: dx,
          oy: dy,
          oz: dz,
          px: p[i * 3],
          py: p[i * 3 + 1],
          pz: p[i * 3 + 2],
        });
      }
    }
    if (items.length === 0) return false;

    for (const it of items) {
      this.savedMasses[it.index] = im[it.index];
      im[it.index] = 0; // becomes an immovable anchor for the solver
    }
    this.grab = {
      planeNx: planeN[0],
      planeNy: planeN[1],
      planeNz: planeN[2],
      planePx: ax,
      planePy: ay,
      planePz: az,
      rayOx: rayO[0],
      rayOy: rayO[1],
      rayOz: rayO[2],
      rayDx: rayD[0],
      rayDy: rayD[1],
      rayDz: rayD[2],
      items,
    };
    return true;
  }

  updateDragRay(rayO: Float32Array, rayD: Float32Array): void {
    if (!this.grab) return;
    this.grab.rayOx = rayO[0];
    this.grab.rayOy = rayO[1];
    this.grab.rayOz = rayO[2];
    this.grab.rayDx = rayD[0];
    this.grab.rayDy = rayD[1];
    this.grab.rayDz = rayD[2];
  }

  endClothDrag(): void {
    if (!this.grab) return;
    const im = this.cloth.inverseMasses;
    for (const it of this.grab.items) im[it.index] = this.savedMasses[it.index];
    this.grab = null;
  }

  beginSphereDrag(rayO: Float32Array, rayD: Float32Array, planeN: Float32Array): void {
    this.sphereGrab = {
      planeNx: planeN[0],
      planeNy: planeN[1],
      planeNz: planeN[2],
      planePx: this.spherePos[0],
      planePy: this.spherePos[1],
      planePz: this.spherePos[2],
    };
    void rayO;
    void rayD;
  }

  updateSphereDrag(rayO: Float32Array, rayD: Float32Array, dt: number): void {
    const g = this.sphereGrab;
    if (!g) return;
    const denom = rayD[0] * g.planeNx + rayD[1] * g.planeNy + rayD[2] * g.planeNz;
    if (Math.abs(denom) < 1e-8) return;
    const t =
      ((g.planePx - rayO[0]) * g.planeNx + (g.planePy - rayO[1]) * g.planeNy + (g.planePz - rayO[2]) * g.planeNz) / denom;
    const tx = rayO[0] + rayD[0] * t;
    const ty = rayO[1] + rayD[1] * t;
    const tz = rayO[2] + rayD[2] * t;
    this.sphereVel[0] = (tx - this.spherePos[0]) / dt;
    this.sphereVel[1] = (ty - this.spherePos[1]) / dt;
    this.sphereVel[2] = (tz - this.spherePos[2]) / dt;
    this.spherePos[0] = tx;
    this.spherePos[1] = ty;
    this.spherePos[2] = tz;
  }

  endSphereDrag(): void {
    this.sphereGrab = null;
    this.sphereVel.fill(0);
  }

  // -------------------------------------------------------------------------
  // Solver
  // -------------------------------------------------------------------------

  private integrate(h: number): void {
    const { positions: p, prevPositions: pp, velocities: v, inverseMasses: im, strain: st } = this.cloth;
    const n = this.cloth.vertexCount;
    const { gravity: g, damping: damp, windStrength: ws, windAngleDeg: windAngle } = this.params;

    let wdx = Math.cos((windAngle * Math.PI) / 180);
    let wdy = 0.35;
    let wdz = Math.sin((windAngle * Math.PI) / 180);
    const wl = Math.sqrt(wdx * wdx + wdy * wdy + wdz * wdz) || 1;
    wdx /= wl;
    wdy /= wl;
    wdz /= wl;

    const t = this.time;
    for (let i = 0; i < n; i++) {
      st[i] = 0;
      if (im[i] === 0) continue; // pinned or grabbed
      const i3 = i * 3;
      let vx = v[i3];
      let vy = v[i3 + 1];
      let vz = v[i3 + 2];

      vy -= g * h;

      if (ws > 0) {
        // Spatial + temporal noise gives the cloth a natural flutter.
        const f = 0.6 + 0.4 * Math.sin(t * 2.1 + p[i3] * 1.7 + p[i3 + 1] * 2.3 + p[i3 + 2] * 0.9);
        vx += wdx * ws * f * h;
        vy += wdy * ws * f * h;
        vz += wdz * ws * f * h;
      }

      const d = 1 - damp * h;
      vx *= d;
      vy *= d;
      vz *= d;

      v[i3] = vx;
      v[i3 + 1] = vy;
      v[i3 + 2] = vz;
      pp[i3] = p[i3];
      pp[i3 + 1] = p[i3 + 1];
      pp[i3 + 2] = p[i3 + 2];
      p[i3] += vx * h;
      p[i3 + 1] += vy * h;
      p[i3 + 2] += vz * h;
    }
  }

  private solveConstraints(): void {
    const { positions: p, inverseMasses: im, strain: st } = this.cloth;
    const { constraints } = this.cloth;
    const { stiffness, iterations, tearingEnabled, tearThreshold } = this.params;

    for (let it = 0; it < iterations; it++) {
      for (let c = 0; c < constraints.length; c++) {
        const con = constraints[c];
        if (!con.active) continue;
        const a = con.a;
        const b = con.b;
        const i3 = a * 3;
        const j3 = b * 3;
        const dx = p[j3] - p[i3];
        const dy = p[j3 + 1] - p[i3 + 1];
        const dz = p[j3 + 2] - p[i3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-12) continue;
        const dist = Math.sqrt(d2);
        const strainRatio = dist / con.rest;

        if (it === 0) {
          if (strainRatio > st[a]) st[a] = strainRatio;
          if (strainRatio > st[b]) st[b] = strainRatio;
        }

        if (tearingEnabled && con.kind !== KIND_BENDING && strainRatio > tearThreshold) {
          con.active = false;
          continue;
        }

        const w1 = im[a];
        const w2 = im[b];
        const wsum = w1 + w2;
        if (wsum === 0) continue;

        const cval = dist - con.rest;
        if (cval === 0) continue;

        const s = (cval / (wsum * dist)) * stiffness;
        const k1 = w1 * s;
        const k2 = w2 * s;
        // d points a→b; a stretched pair must move toward each other.
        p[i3] += dx * k1;
        p[i3 + 1] += dy * k1;
        p[i3 + 2] += dz * k1;
        p[j3] -= dx * k2;
        p[j3 + 1] -= dy * k2;
        p[j3 + 2] -= dz * k2;
      }
    }
  }

  private collide(h: number): void {
    const { positions: p, prevPositions: pp, inverseMasses: im } = this.cloth;
    const n = this.cloth.vertexCount;
    const { sphereEnabled, sphereRadius: r, restitution: rest, floorEnabled, friction } = this.params;
    const fric = Math.min(1, Math.max(0, friction));
    const sx = this.spherePos[0];
    const sy = this.spherePos[1];
    const sz = this.spherePos[2];
    const svx = this.sphereVel[0];
    const svy = this.sphereVel[1];
    const svz = this.sphereVel[2];

    for (let i = 0; i < n; i++) {
      if (im[i] === 0) continue; // pinned / grabbed particles are mouse-controlled
      const i3 = i * 3;
      const px = p[i3];
      const py = p[i3 + 1];
      const pz = p[i3 + 2];

      if (sphereEnabled) {
        const dx = px - sx;
        const dy = py - sy;
        const dz = pz - sz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r && d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const nz = dz / d;
          const pen = r - d;
          p[i3] = px + nx * pen;
          p[i3 + 1] = py + ny * pen;
          p[i3 + 2] = pz + nz * pen;
          // Relative velocity at the contact point: normal bounce + tangential friction,
          // so the cloth grips the sphere and drapes instead of sliding off.
          let vx = (p[i3] - pp[i3]) / h;
          let vy = (p[i3 + 1] - pp[i3 + 1]) / h;
          let vz = (p[i3 + 2] - pp[i3 + 2]) / h;
          let rvx = vx - svx;
          let rvy = vy - svy;
          let rvz = vz - svz;
          const vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            const j = -(1 + rest) * vn;
            rvx += j * nx;
            rvy += j * ny;
            rvz += j * nz;
          }
          const vn2 = rvx * nx + rvy * ny + rvz * nz;
          const tx = rvx - vn2 * nx;
          const ty = rvy - vn2 * ny;
          const tz = rvz - vn2 * nz;
          rvx -= tx * fric;
          rvy -= ty * fric;
          rvz -= tz * fric;
          vx = rvx + svx;
          vy = rvy + svy;
          vz = rvz + svz;
          pp[i3] = p[i3] - vx * h;
          pp[i3 + 1] = p[i3 + 1] - vy * h;
          pp[i3 + 2] = p[i3 + 2] - vz * h;
        }
      }

      if (floorEnabled && p[i3 + 1] < this.floorY) {
        p[i3 + 1] = this.floorY;
        let vy = (p[i3 + 1] - pp[i3 + 1]) / h;
        if (vy < 0) vy = -vy * rest;
        const vx = (p[i3] - pp[i3]) / h;
        const vz = (p[i3 + 2] - pp[i3 + 2]) / h;
        pp[i3] = p[i3] - vx * (1 - fric) * h;
        pp[i3 + 1] = p[i3 + 1] - vy * h;
        pp[i3 + 2] = p[i3 + 2] - vz * (1 - fric) * h;
      }
    }
  }

  private applyGrab(_h: number): void {
    const g = this.grab;
    if (!g) return;
    const p = this.cloth.positions;
    const pp = this.cloth.prevPositions;

    const denom = g.rayDx * g.planeNx + g.rayDy * g.planeNy + g.rayDz * g.planeNz;
    if (Math.abs(denom) < 1e-8) return;
    const t =
      ((g.planePx - g.rayOx) * g.planeNx + (g.planePy - g.rayOy) * g.planeNy + (g.planePz - g.rayOz) * g.planeNz) / denom;
    const tx = g.rayOx + g.rayDx * t;
    const ty = g.rayOy + g.rayDy * t;
    const tz = g.rayOz + g.rayDz * t;

    for (const it of g.items) {
      const i3 = it.index * 3;
      const dx = tx + it.ox - p[i3];
      const dy = ty + it.oy - p[i3 + 1];
      const dz = tz + it.oz - p[i3 + 2];
      const k = 0.2 + 0.8 * it.weight;
      p[i3] += dx * k;
      p[i3 + 1] += dy * k;
      p[i3 + 2] += dz * k;

      // Velocity follows the mouse: v = (desired - prevDesired) / h
      const mdx = tx + it.ox - it.px;
      const mdy = ty + it.oy - it.py;
      const mdz = tz + it.oz - it.pz;
      pp[i3] = p[i3] - mdx;
      pp[i3 + 1] = p[i3 + 1] - mdy;
      pp[i3 + 2] = p[i3 + 2] - mdz;
      it.px = tx + it.ox;
      it.py = ty + it.oy;
      it.pz = tz + it.oz;
    }
  }

  private finalizeVelocities(h: number): void {
    const { positions: p, prevPositions: pp, velocities: v } = this.cloth;
    const n = this.cloth.vertexCount;
    const invH = 1 / h;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      v[i3] = (p[i3] - pp[i3]) * invH;
      v[i3 + 1] = (p[i3 + 1] - pp[i3 + 1]) * invH;
      v[i3 + 2] = (p[i3 + 2] - pp[i3 + 2]) * invH;
    }
  }
}
