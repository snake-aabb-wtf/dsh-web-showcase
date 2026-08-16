/**
 * Ray picking helpers — pure math, shared by pointer interaction.
 */
import { Cloth } from './cloth';
import type { V3 } from './math';

/** Ray-sphere intersection. Returns the nearest t >= 0, or null. */
export function raySphere(ro: V3, rd: V3, center: V3, radius: number): number | null {
  const ox = ro[0] - center[0];
  const oy = ro[1] - center[1];
  const oz = ro[2] - center[2];
  const b = ox * rd[0] + oy * rd[1] + oz * rd[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  if (t1 >= 0) return t1;
  const t2 = -b + sq;
  return t2 >= 0 ? t2 : null;
}

/** Möller–Trumbore, double-sided. Returns t or null. */
export function rayTriangle(ro: V3, rd: V3, v0: V3, v1: V3, v2: V3): number | null {
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0];
  const e2y = v2[1] - v0[1];
  const e2z = v2[2] - v0[2];

  const hx = rd[1] * e2z - rd[2] * e2y;
  const hy = rd[2] * e2x - rd[0] * e2z;
  const hz = rd[0] * e2y - rd[1] * e2x;
  const a = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(a) < 1e-9) return null;
  const f = 1 / a;

  const sx = ro[0] - v0[0];
  const sy = ro[1] - v0[1];
  const sz = ro[2] - v0[2];
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return null;

  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (rd[0] * qx + rd[1] * qy + rd[2] * qz);
  if (v < 0 || u + v > 1) return null;

  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return t >= 1e-6 ? t : null;
}

export interface ClothHit {
  px: number;
  py: number;
  pz: number;
  t: number;
}

/** Ray vs cloth triangles (same winding as the renderer). Returns nearest hit or null. */
export function pickCloth(cloth: Cloth, ro: V3, rd: V3): ClothHit | null {
  const p = cloth.positions;
  let best: ClothHit | null = null;
  for (let i = 0; i < cloth.rows; i++) {
    for (let j = 0; j < cloth.cols; j++) {
      const a = cloth.index(i, j) * 3;
      const b = cloth.index(i + 1, j) * 3;
      const c = cloth.index(i + 1, j + 1) * 3;
      const d = cloth.index(i, j + 1) * 3;
      const pa: V3 = [p[a], p[a + 1], p[a + 2]];
      const pb: V3 = [p[b], p[b + 1], p[b + 2]];
      const pc: V3 = [p[c], p[c + 1], p[c + 2]];
      const pd: V3 = [p[d], p[d + 1], p[d + 2]];

      const t1 = rayTriangle(ro, rd, pa, pb, pc);
      if (t1 !== null && (best === null || t1 < best.t)) best = { px: ro[0] + rd[0] * t1, py: ro[1] + rd[1] * t1, pz: ro[2] + rd[2] * t1, t: t1 };
      const t2 = rayTriangle(ro, rd, pa, pc, pd);
      if (t2 !== null && (best === null || t2 < best.t)) best = { px: ro[0] + rd[0] * t2, py: ro[1] + rd[1] * t2, pz: ro[2] + rd[2] * t2, t: t2 };
    }
  }
  return best;
}
