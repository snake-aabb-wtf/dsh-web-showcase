/**
 * Cloth topology: a grid of particles connected by distance constraints.
 * Pure data + topology — no integration or solver logic here.
 */

export type PinMode = 'corners' | 'topEdge' | 'free';

export const KIND_STRUCTURAL = 0;
export const KIND_SHEAR = 1;
export const KIND_BENDING = 2;

export interface Constraint {
  a: number; // particle index
  b: number; // particle index
  rest: number; // rest length in world units
  kind: number; // KIND_*
  active: boolean;
}

export interface ClothConfig {
  cols: number; // cells along x
  rows: number; // cells along y
  width: number; // world width (x)
  height: number; // world height (y)
}

export class Cloth {
  readonly cols: number;
  readonly rows: number;
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly vertexCount: number;

  readonly positions: Float32Array; // xyz per vertex
  readonly prevPositions: Float32Array; // previous-frame xyz (PBD)
  readonly velocities: Float32Array; // xyz per vertex
  readonly inverseMasses: Float32Array; // 0 = pinned / dragged
  readonly strain: Float32Array; // per-vertex max strain, reset every step

  constraints: Constraint[] = [];

  private readonly basePositions: Float32Array;
  private readonly pinFlags: Uint8Array;

  constructor(config: ClothConfig, pinMode: PinMode) {
    this.cols = config.cols;
    this.rows = config.rows;
    this.width = config.width;
    this.height = config.height;
    this.cellSize = config.width / config.cols;

    this.vertexCount = (this.cols + 1) * (this.rows + 1);
    this.positions = new Float32Array(this.vertexCount * 3);
    this.prevPositions = new Float32Array(this.vertexCount * 3);
    this.velocities = new Float32Array(this.vertexCount * 3);
    this.inverseMasses = new Float32Array(this.vertexCount);
    this.strain = new Float32Array(this.vertexCount);
    this.basePositions = new Float32Array(this.vertexCount * 3);
    this.pinFlags = new Uint8Array(this.vertexCount);

    this.layoutVertices();
    this.buildConstraints();
    this.applyPinMode(pinMode);
  }

  /** Vertex index for grid cell (row i along -y, column j along +x). */
  index(i: number, j: number): number {
    return i * (this.cols + 1) + j;
  }

  /** Reset positions/velocities/constraints to the initial state. */
  rebuild(pinMode: PinMode): void {
    this.positions.set(this.basePositions);
    this.prevPositions.set(this.basePositions);
    this.velocities.fill(0);
    this.strain.fill(0);
    for (const c of this.constraints) c.active = true;
    this.applyPinMode(pinMode);
  }

  get pinnedCount(): number {
    let n = 0;
    for (let i = 0; i < this.pinFlags.length; i++) if (this.pinFlags[i]) n++;
    return n;
  }

  isPinned(i: number): boolean {
    return this.pinFlags[i] === 1;
  }

  get activeConstraintCount(): number {
    let n = 0;
    for (const c of this.constraints) if (c.active) n++;
    return n;
  }

  // -------------------------------------------------------------------------

  private layoutVertices(): void {
    const cell = this.cellSize;
    const x0 = -this.width / 2;
    const y0 = this.height / 2; // top edge
    let k = 0;
    for (let i = 0; i <= this.rows; i++) {
      const y = y0 - i * cell;
      for (let j = 0; j <= this.cols; j++) {
        const x = x0 + j * cell;
        this.positions[k] = x;
        this.positions[k + 1] = y;
        this.positions[k + 2] = 0;
        k += 3;
      }
    }
    this.basePositions.set(this.positions);
    this.prevPositions.set(this.positions);
  }

  private buildConstraints(): void {
    const cell = this.cellSize;
    const diag = cell * Math.SQRT2;
    const bend = cell * 2;

    // Structural: horizontal + vertical neighbors.
    for (let i = 0; i <= this.rows; i++) {
      for (let j = 0; j <= this.cols; j++) {
        const v = this.index(i, j);
        if (j < this.cols) this.constraints.push({ a: v, b: this.index(i, j + 1), rest: cell, kind: KIND_STRUCTURAL, active: true });
        if (i < this.rows) this.constraints.push({ a: v, b: this.index(i + 1, j), rest: cell, kind: KIND_STRUCTURAL, active: true });
      }
    }

    // Shear: the two diagonals of every cell.
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const tl = this.index(i, j);
        const br = this.index(i + 1, j + 1);
        const bl = this.index(i + 1, j);
        const tr = this.index(i, j + 1);
        this.constraints.push({ a: tl, b: br, rest: diag, kind: KIND_SHEAR, active: true });
        this.constraints.push({ a: bl, b: tr, rest: diag, kind: KIND_SHEAR, active: true });
      }
    }

    // Bending: skip-one neighbors (virtual, resist folding; never tear).
    for (let i = 0; i <= this.rows; i++) {
      for (let j = 0; j <= this.cols; j++) {
        const v = this.index(i, j);
        if (j + 2 <= this.cols) this.constraints.push({ a: v, b: this.index(i, j + 2), rest: bend, kind: KIND_BENDING, active: true });
        if (i + 2 <= this.rows) this.constraints.push({ a: v, b: this.index(i + 2, j), rest: bend, kind: KIND_BENDING, active: true });
      }
    }
  }

  private applyPinMode(mode: PinMode): void {
    this.pinFlags.fill(0);
    if (mode === 'corners') {
      this.pinFlags[this.index(0, 0)] = 1;
      this.pinFlags[this.index(0, this.cols)] = 1;
    } else if (mode === 'topEdge') {
      for (let j = 0; j <= this.cols; j++) this.pinFlags[this.index(0, j)] = 1;
    }
    // 'free': no pins.
    for (let i = 0; i < this.vertexCount; i++) {
      this.inverseMasses[i] = this.pinFlags[i] ? 0 : 1;
    }
  }
}
