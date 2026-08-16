/**
 * Minimal 3D math helpers (no allocations in hot paths — results written to `out`).
 * Matrices are column-major Float32Array(16), compatible with WebGL uniforms.
 */

/** A mutable 3-component vector: number[] or Float32Array. */
export type V3 = {
  [index: number]: number;
  length: number;
};

export function v3set(out: V3, x: number, y: number, z: number): void {
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

export function v3copy(out: V3, a: V3): void {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
}

export function v3add(out: V3, a: V3, b: V3): void {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
}

export function v3sub(out: V3, a: V3, b: V3): void {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
}

export function v3scale(out: V3, a: V3, s: number): void {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  out[2] = a[2] * s;
}

export function v3dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function v3cross(out: V3, a: V3, b: V3): void {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

export function v3len(a: V3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function v3dist(a: V3, b: V3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Normalize in place; if length is ~0, leaves the vector untouched. Returns the old length. */
export function v3normalize(out: V3, a: V3): number {
  const len = v3len(a);
  if (len > 1e-12) {
    const inv = 1 / len;
    out[0] = a[0] * inv;
    out[1] = a[1] * inv;
    out[2] = a[2] * inv;
  }
  return len;
}

// ---------------------------------------------------------------------------
// mat4 (column-major)
// ---------------------------------------------------------------------------

export function mat4Identity(out: Float32Array): void {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
}

export function mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array): void {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
}

export function mat4Perspective(out: Float32Array, fovyRad: number, aspect: number, near: number, far: number): void {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
}

export function mat4LookAt(out: Float32Array, eye: V3, center: V3, up: V3): void {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1;
}

/** General 4x4 inverse. Returns false (and leaves `out` untouched) when singular. */
export function mat4Invert(out: Float32Array, m: Float32Array): boolean {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return false;
  det = 1 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return true;
}

/** out = m * v (homogeneous 4-vector); out[3] holds w. */
export function mat4Transform(out: Float32Array, m: Float32Array, v: V3, w: number): void {
  out[0] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w;
  out[1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w;
  out[2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w;
  out[3] = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * w;
}

export function mat4Translation(out: Float32Array, x: number, y: number, z: number): void {
  mat4Identity(out);
  out[12] = x;
  out[13] = y;
  out[14] = z;
}

export function mat4Scale(out: Float32Array, m: Float32Array, sx: number, sy: number, sz: number): void {
  out[0] = m[0] * sx; out[1] = m[1] * sx; out[2] = m[2] * sx; out[3] = m[3] * sx;
  out[4] = m[4] * sy; out[5] = m[5] * sy; out[6] = m[6] * sy; out[7] = m[7] * sy;
  out[8] = m[8] * sz; out[9] = m[9] * sz; out[10] = m[10] * sz; out[11] = m[11] * sz;
  out[12] = m[12]; out[13] = m[13]; out[14] = m[14]; out[15] = m[15];
}

/**
 * Build a world-space ray from NDC coordinates using the inverse view-projection matrix.
 * ndcX/ndcY ∈ [-1, 1] (origin bottom-left).
 */
export function unprojectRay(invViewProj: Float32Array, ndcX: number, ndcY: number, outOrigin: Float32Array, outDir: Float32Array): void {
  const near = new Float32Array(4);
  const far = new Float32Array(4);
  mat4Transform(near, invViewProj, [ndcX, ndcY, -1, 1] as V3, 1);
  mat4Transform(far, invViewProj, [ndcX, ndcY, 1, 1] as V3, 1);
  const nw = near[3] || 1;
  const fw = far[3] || 1;
  outOrigin[0] = near[0] / nw;
  outOrigin[1] = near[1] / nw;
  outOrigin[2] = near[2] / nw;
  outDir[0] = far[0] / fw - outOrigin[0];
  outDir[1] = far[1] / fw - outOrigin[1];
  outDir[2] = far[2] / fw - outOrigin[2];
  v3normalize(outDir, outDir);
}
