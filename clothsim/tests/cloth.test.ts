import { describe, expect, it } from 'vitest';
import { Cloth, KIND_BENDING, KIND_SHEAR, KIND_STRUCTURAL } from '../src/physics/cloth';

const cfg = { cols: 40, rows: 40, width: 3, height: 3 };

describe('Cloth topology', () => {
  it('builds the expected vertex and constraint counts', () => {
    const cloth = new Cloth(cfg, 'corners');
    expect(cloth.vertexCount).toBe(41 * 41); // 1681
    const structural = cloth.constraints.filter((c) => c.kind === KIND_STRUCTURAL).length;
    const shear = cloth.constraints.filter((c) => c.kind === KIND_SHEAR).length;
    const bending = cloth.constraints.filter((c) => c.kind === KIND_BENDING).length;
    expect(structural).toBe(40 * 41 * 2); // 3280
    expect(shear).toBe(2 * 40 * 40); // 3200
    expect(bending).toBe(41 * 39 * 2); // (rows+1)*(cols-1) + (cols+1)*(rows-1)
    expect(cloth.constraints.length).toBe(structural + shear + bending);
  });

  it('uses correct rest lengths', () => {
    const cloth = new Cloth(cfg, 'corners');
    const cell = 3 / 40;
    for (const c of cloth.constraints) {
      if (c.kind === KIND_STRUCTURAL) expect(c.rest).toBeCloseTo(cell, 10);
      if (c.kind === KIND_SHEAR) expect(c.rest).toBeCloseTo(cell * Math.SQRT2, 10);
      if (c.kind === KIND_BENDING) expect(c.rest).toBeCloseTo(cell * 2, 10);
    }
  });

  it('lays out the grid centered at origin, top edge at +height/2', () => {
    const cloth = new Cloth(cfg, 'corners');
    const tl = cloth.positions.subarray(cloth.index(0, 0) * 3, cloth.index(0, 0) * 3 + 3);
    const br = cloth.positions.subarray(cloth.index(40, 40) * 3, cloth.index(40, 40) * 3 + 3);
    expect(tl[0]).toBeCloseTo(-1.5, 6);
    expect(tl[1]).toBeCloseTo(1.5, 6);
    expect(br[0]).toBeCloseTo(1.5, 6);
    expect(br[1]).toBeCloseTo(-1.5, 6);
  });

  it('pins exactly two top corners in corners mode', () => {
    const cloth = new Cloth(cfg, 'corners');
    expect(cloth.pinnedCount).toBe(2);
    expect(cloth.inverseMasses[cloth.index(0, 0)]).toBe(0);
    expect(cloth.inverseMasses[cloth.index(0, 40)]).toBe(0);
    expect(cloth.inverseMasses[cloth.index(1, 1)]).toBe(1);
  });

  it('pins the whole top edge in topEdge mode and nothing in free mode', () => {
    const cloth = new Cloth(cfg, 'topEdge');
    expect(cloth.pinnedCount).toBe(41);
    const free = new Cloth(cfg, 'free');
    expect(free.pinnedCount).toBe(0);
  });

  it('rebuild restores constraints and positions', () => {
    const cloth = new Cloth(cfg, 'corners');
    cloth.constraints[0].active = false;
    cloth.positions[0] += 5;
    cloth.rebuild('corners');
    expect(cloth.constraints[0].active).toBe(true);
    expect(cloth.positions[0]).toBeCloseTo(cloth.index(0, 0) === 0 ? -1.5 : 0, 6);
  });
});
