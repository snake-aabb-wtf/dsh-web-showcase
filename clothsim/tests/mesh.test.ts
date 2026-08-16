import { describe, expect, it } from 'vitest';
import { buildThickClothIndices, expandThickMesh } from '../src/render/mesh';

describe('buildThickClothIndices', () => {
  it('builds a closed slab topology for the 40x40 grid', () => {
    const { tri, line } = buildThickClothIndices(40, 40);
    const V = 41 * 41;
    // front + back layers (2 * 3200 tris) + rim (2*(cols+rows) quads)
    expect(tri.length).toBe(2 * 40 * 40 * 6 + 2 * (40 + 40) * 6); // 20160
    // mid-surface triangle edges for the wireframe
    expect(line.length).toBe(40 * 40 * 6); // 9600
    // every index must address a vertex in the two-layer slab
    for (const idx of tri) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(V * 2);
    }
  });

  it('produces valid rim indices for a 1x1 grid', () => {
    const { tri } = buildThickClothIndices(1, 1);
    const V = 4;
    expect(tri.length).toBe(2 * 1 * 1 * 6 + 2 * (1 + 1) * 6); // 36
    for (const idx of tri) {
      expect(idx).toBeLessThan(V * 2);
    }
  });

  it('rim references both layers of every perimeter vertex', () => {
    const { tri } = buildThickClothIndices(2, 3);
    const V = 3 * 4; // 12
    const rimStart = 2 * 3 * 2 * 6; // front + back tris
    const rim = tri.subarray(rimStart);
    expect(rim.length).toBe(2 * (2 + 3) * 6);

    const frontRefs = new Set<number>();
    const backRefs = new Set<number>();
    for (let i = 0; i < rim.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = rim[i + k];
        if (v < V) frontRefs.add(v);
        else backRefs.add(v - V);
      }
    }
    const cell = (i: number, j: number) => i * 3 + j;
    const perimeter = new Set<number>();
    for (let j = 0; j < 3; j++) {
      perimeter.add(cell(0, j));
      perimeter.add(cell(3, j));
    }
    for (let i = 0; i < 4; i++) {
      perimeter.add(cell(i, 0));
      perimeter.add(cell(i, 2)); // rightmost column of the 2x3 grid
    }
    expect(perimeter.size).toBe(10);
    for (const v of perimeter) {
      expect(frontRefs.has(v)).toBe(true);
      expect(backRefs.has(v)).toBe(true);
    }
  });
});

describe('expandThickMesh', () => {
  it('lays out vertices consistently with buildThickClothIndices (front=g, back=V+g)', () => {
    // Flat 3x3 grid (V=16), normals +z. Vertex 5 is interior (row 1, col 1).
    const positions = new Float32Array(16 * 3);
    const normals = new Float32Array(16 * 3);
    const colors = new Float32Array(16 * 3);
    for (let i = 0; i < 16; i++) {
      normals[i * 3 + 2] = 1;
    }
    const V = 16;
    const outP = new Float32Array(V * 2 * 3);
    const outN = new Float32Array(V * 2 * 3);
    const outC = new Float32Array(V * 2 * 3);
    const rim = new Uint16Array([0, 1, 1, 2, 2, 3, 3, 7, 7, 11, 11, 15, 15, 14, 14, 13, 13, 12, 12, 8, 8, 4, 4, 0]);
    expandThickMesh(outP, outN, outC, positions, normals, colors, rim, 0.1);

    // Front layer vertex g lives at index g → offset 3g (interior vertex 5).
    const f5 = 3 * 5;
    expect(outP[f5]).toBe(0);
    expect(outP[f5 + 1]).toBe(0);
    expect(outP[f5 + 2]).toBeCloseTo(0.05, 6); // +thickness/2
    expect(outN[f5 + 2]).toBe(1);

    // Back layer vertex g lives at index V+g → offset 3*(V+g).
    const b5 = 3 * (V + 5);
    expect(outP[b5]).toBe(0);
    expect(outP[b5 + 1]).toBe(0);
    expect(outP[b5 + 2]).toBeCloseTo(-0.05, 6); // -thickness/2
    expect(outN[b5 + 2]).toBe(-1); // back normals inverted
  });

  it('keeps rim normals in-plane for a flat cloth', () => {
    const V = 4;
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const colors = new Float32Array(12);
    const outP = new Float32Array(V * 2 * 3);
    const outN = new Float32Array(V * 2 * 3);
    const outC = new Float32Array(V * 2 * 3);
    const rim = new Uint16Array([0, 1, 1, 3, 3, 2, 2, 0]);
    expandThickMesh(outP, outN, outC, positions, normals, colors, rim, 0.1);
    // A rim vertex normal must lie in the cloth plane (z ≈ 0), not point at the viewer.
    expect(Math.abs(outN[2])).toBeLessThan(1e-6); // front vertex 0 (rim)
    expect(Math.abs(outN[3 * V + 2])).toBeLessThan(1e-6); // back vertex 0 (rim)
  });
});
