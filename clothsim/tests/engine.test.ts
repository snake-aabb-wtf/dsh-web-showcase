import { describe, expect, it } from 'vitest';
import { ClothEngine } from '../src/physics/engine';
import { KIND_STRUCTURAL } from '../src/physics/cloth';

function smallEngine(pinMode: 'corners' | 'topEdge' | 'free' = 'free') {
  const e = new ClothEngine({ cols: 1, rows: 1, width: 1.5, height: 1.5 }, pinMode);
  // Deterministic, gravity-free config for most unit tests.
  Object.assign(e.params, {
    gravity: 0,
    windStrength: 0,
    damping: 0,
    stiffness: 1,
    iterations: 50,
    sphereEnabled: false,
    floorEnabled: false,
  });
  return e;
}

describe('ClothEngine — PBD core', () => {
  it('converges a stretched pair of particles to rest length', () => {
    const e = smallEngine('free');
    const { positions: p, inverseMasses: im, constraints } = e.cloth;
    // Keep only the structural constraint between particles 0 and 1, pin everything else.
    for (const c of constraints) c.active = c.a === 0 && c.b === 1;
    im.fill(0);
    im[0] = 1;
    im[1] = 1;
    p[0] = 0;
    p[1] = 0;
    p[2] = 0;
    p[3] = 3;
    p[4] = 0;
    p[5] = 0;

    e.step(1 / 60, 1);

    const dx = p[3] - p[0];
    const dy = p[4] - p[1];
    const dz = p[5] - p[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(dist).toBeCloseTo(1.5, 3); // rest length of one cell
  });

  it('applies gravity as explicit Euler (delta = -g*h^2)', () => {
    const e = smallEngine('free');
    e.params.gravity = 9.8;
    const y0 = e.cloth.positions[1];
    e.step(1 / 60, 1);
    const h = 1 / 60;
    expect(e.cloth.positions[1] - y0).toBeCloseTo(-9.8 * h * h, 6);
  });

  it('keeps pinned particles perfectly fixed', () => {
    const e = new ClothEngine({ cols: 2, rows: 2, width: 3, height: 3 }, 'corners');
    Object.assign(e.params, { gravity: 9.8, windStrength: 0, damping: 0, sphereEnabled: false, floorEnabled: false, iterations: 6 });
    const p0 = [...e.cloth.positions.subarray(0, 3)];
    const p2 = [...e.cloth.positions.subarray(2 * 3, 2 * 3 + 3)];
    for (let i = 0; i < 60; i++) e.step(1 / 60, 3);
    expect(e.cloth.positions[0]).toBeCloseTo(p0[0], 10);
    expect(e.cloth.positions[1]).toBeCloseTo(p0[1], 10);
    expect(e.cloth.positions[2 * 3]).toBeCloseTo(p2[0], 10);
    expect(e.cloth.positions[2 * 3 + 1]).toBeCloseTo(p2[1], 10);
  });

  it('deactivates over-strained structural constraints when tearing is on', () => {
    const e = smallEngine('free');
    Object.assign(e.params, { tearingEnabled: true, tearThreshold: 1.6, iterations: 1 });
    e.cloth.positions[0] = 0;
    e.cloth.positions[1] = 0;
    e.cloth.positions[2] = 0;
    e.cloth.positions[3] = 4; // strain 4/1.5 = 2.67 > 1.6
    e.cloth.positions[4] = 0;
    e.cloth.positions[5] = 0;
    e.step(1 / 60, 1);
    const c = e.cloth.constraints.find((x) => x.a === 0 && x.b === 1 && x.kind === KIND_STRUCTURAL);
    expect(c).toBeDefined();
    expect(c!.active).toBe(false);
  });

  it('does not tear when tearing is disabled', () => {
    const e = smallEngine('free');
    Object.assign(e.params, { tearingEnabled: false, iterations: 1 });
    e.cloth.positions[3] = 4;
    e.step(1 / 60, 1);
    const c = e.cloth.constraints.find((x) => x.a === 0 && x.b === 1 && x.kind === KIND_STRUCTURAL);
    expect(c!.active).toBe(true);
  });

  it('pushes particles out of the sphere', () => {
    const e = smallEngine('free');
    Object.assign(e.params, { sphereEnabled: true, sphereRadius: 0.5, restitution: 0.25 });
    e.spherePos.set([0, 0, 0]);
    e.cloth.positions[0] = 0.2;
    e.cloth.positions[1] = 0;
    e.cloth.positions[2] = 0;
    e.step(1 / 60, 1);
    const x = e.cloth.positions[0];
    const y = e.cloth.positions[1];
    const z = e.cloth.positions[2];
    const d = Math.sqrt(x * x + y * y + z * z);
    expect(d).toBeGreaterThanOrEqual(0.5 - 1e-4);
  });

  it('clamps to the floor', () => {
    const e = smallEngine('free');
    Object.assign(e.params, { floorEnabled: true, gravity: 9.8, damping: 0 });
    e.cloth.positions[1] = -10; // far below the floor
    e.step(1 / 60, 1);
    expect(e.cloth.positions[1]).toBeGreaterThanOrEqual(e.floorY - 1e-6);
  });

  it('applies tangential friction at floor contact', () => {
    const e = smallEngine('free');
    Object.assign(e.params, { floorEnabled: true, friction: 0.5, gravity: 0, damping: 0 });
    for (const c of e.cloth.constraints) c.active = false;
    const h = 1 / 60;
    e.cloth.positions[1] = e.floorY - 0.001; // 1 mm below the floor
    e.cloth.velocities[0] = 2; // tangential (x)
    e.step(h, 1);
    const v = e.cloth.velocities;
    expect(v[0]).toBeCloseTo(2 * (1 - 0.5), 4); // tangential speed halved by friction
    expect(v[1]).toBeGreaterThanOrEqual(0); // pushed out of the floor, no downward motion
  });

  it('clothes with pinned corners stay stable under wind (smoke test)', () => {
    const e = new ClothEngine({ cols: 12, rows: 12, width: 3, height: 3 }, 'corners');
    Object.assign(e.params, {
      gravity: 9.8,
      windStrength: 6,
      damping: 0.06,
      iterations: 6,
      sphereEnabled: true,
      floorEnabled: true,
      tearingEnabled: false,
    });
    const pin0 = [...e.cloth.positions.subarray(0, 3)];
    for (let i = 0; i < 300; i++) e.step(1 / 60, 3);
    for (let i = 0; i < e.cloth.positions.length; i++) {
      expect(Number.isFinite(e.cloth.positions[i])).toBe(true);
      expect(Math.abs(e.cloth.positions[i])).toBeLessThan(20);
    }
    expect(e.cloth.positions[0]).toBeCloseTo(pin0[0], 8);
    expect(e.cloth.positions[1]).toBeCloseTo(pin0[1], 8);
  });
});

describe('ClothEngine — dragging', () => {
  it('moves the grabbed cluster to the mouse ray target and restores masses', () => {
    const e = new ClothEngine({ cols: 2, rows: 2, width: 3, height: 3 }, 'corners');
    Object.assign(e.params, { grabRadius: 10, gravity: 0, windStrength: 0, damping: 0, sphereEnabled: false, floorEnabled: false, iterations: 6 });
    const anchor = e.cloth.index(0, 1); // top-middle, free particle
    const planeN = new Float32Array([0, 0, 1]);
    const rayO = new Float32Array([-3, 0, -5]);
    const rayD = new Float32Array([0.5, 0, 1]);
    const dlen = Math.hypot(rayD[0], rayD[1], rayD[2]);
    rayD[0] /= dlen;
    rayD[1] /= dlen;
    rayD[2] /= dlen;

    expect(e.beginClothDrag(anchor, rayO, rayD, planeN)).toBe(true);
    expect(e.isGrabbing).toBe(true);
    expect(e.cloth.inverseMasses[anchor]).toBe(0);

    e.step(1 / 60, 1);

    // Ray hits plane z=0 at (-0.5, 0, 0); anchor weight is 1 → hard pin.
    expect(e.cloth.positions[anchor * 3]).toBeCloseTo(-0.5, 4);
    expect(e.cloth.positions[anchor * 3 + 2]).toBeCloseTo(0, 4);

    e.endClothDrag();
    expect(e.isGrabbing).toBe(false);
    expect(e.cloth.inverseMasses[anchor]).toBe(1);
  });

  it('findClosestParticle returns the nearest vertex', () => {
    const e = smallEngine('free');
    expect(e.findClosestParticle(-0.8, 0.8, 0)).toBe(e.cloth.index(0, 0));
  });
});
