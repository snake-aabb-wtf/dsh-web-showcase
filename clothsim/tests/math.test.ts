import { describe, expect, it } from 'vitest';
import {
  mat4Identity,
  mat4Invert,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  mat4Transform,
  unprojectRay,
  v3dot,
  v3len,
  v3normalize,
} from '../src/physics/math';

function approxEqual(a: number, b: number, eps = 1e-5): boolean {
  return Math.abs(a - b) <= eps;
}

describe('mat4', () => {
  it('multiplying by identity is a no-op', () => {
    const a = new Float32Array(16);
    mat4Perspective(a, Math.PI / 3, 1.6, 0.1, 100);
    const id = new Float32Array(16);
    mat4Identity(id);
    const out = new Float32Array(16);
    mat4Multiply(out, a, id);
    for (let i = 0; i < 16; i++) expect(out[i]).toBeCloseTo(a[i], 6);
  });

  it('inverse round-trips to identity', () => {
    const m = new Float32Array(16);
    mat4Perspective(m, Math.PI / 4, 1.777, 0.1, 50);
    const inv = new Float32Array(16);
    expect(mat4Invert(inv, m)).toBe(true);
    const prod = new Float32Array(16);
    mat4Multiply(prod, m, inv);
    const id = new Float32Array(16);
    mat4Identity(id);
    for (let i = 0; i < 16; i++) expect(prod[i]).toBeCloseTo(id[i], 5);
  });

  it('invert of a look-at matrix is well-formed', () => {
    const view = new Float32Array(16);
    mat4LookAt(view, [2, 1, 3], [0, 0, 0], [0, 1, 0]);
    const inv = new Float32Array(16);
    expect(mat4Invert(inv, view)).toBe(true);
    const prod = new Float32Array(16);
    mat4Multiply(prod, view, inv);
    const id = new Float32Array(16);
    mat4Identity(id);
    for (let i = 0; i < 16; i++) expect(prod[i]).toBeCloseTo(id[i], 5);
  });

  it('transforms a point with w=1', () => {
    const m = new Float32Array(16);
    mat4LookAt(m, [0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const out = new Float32Array(4);
    mat4Transform(out, m, [0, 0, 0], 1);
    expect(out[3]).toBeCloseTo(1, 6);
    expect(out[2]).toBeCloseTo(-5, 5); // origin is 5 units in front of the camera
  });
});

describe('unprojectRay', () => {
  it('produces a normalized direction', () => {
    const proj = new Float32Array(16);
    mat4Perspective(proj, Math.PI / 3, 1.6, 0.1, 100);
    const view = new Float32Array(16);
    mat4LookAt(view, [0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const vp = new Float32Array(16);
    mat4Multiply(vp, proj, view);
    const inv = new Float32Array(16);
    mat4Invert(inv, vp);
    const origin = new Float32Array(3);
    const dir = new Float32Array(3);
    unprojectRay(inv, 0, 0, origin, dir);
    expect(approxEqual(v3len(dir), 1, 1e-6)).toBe(true);
    expect(v3dot(dir, [0, 0, -1])).toBeGreaterThan(0.99); // center ray points at -z
  });
});

describe('v3normalize', () => {
  it('normalizes and preserves direction', () => {
    const out = new Float32Array(3);
    v3normalize(out, [0, 3, 4]);
    expect(approxEqual(v3len(out), 1, 1e-6)).toBe(true);
    expect(out[2]).toBeCloseTo(0.8, 6);
  });
});
