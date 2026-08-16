/**
 * Mesh buffers. The cloth uses a DynamicMesh (positions/normals/colors updated
 * every frame); the sphere and ground grid use static meshes.
 */

export interface StaticMesh {
  vao: WebGLVertexArrayObject;
  count: number;
  mode: number;
}

export function createStaticMesh(
  gl: WebGL2RenderingContext,
  positions: Float32Array,
  normals: Float32Array | null,
  indices: Uint16Array | Uint32Array,
  mode: number = gl.TRIANGLES,
): StaticMesh {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Failed to create VAO');
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  if (normals) {
    const nBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuf);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  }

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, count: indices.length, mode };
}

/** Vertex buffer whose attributes are rewritten every frame. */
export class DynamicMesh {
  readonly vao: WebGLVertexArrayObject;
  readonly indexCount: number;

  private readonly posBuffer: WebGLBuffer;
  private readonly normalBuffer: WebGLBuffer;
  private readonly colorBuffer: WebGLBuffer;
  private readonly triIbo: WebGLBuffer;
  private readonly lineIbo: WebGLBuffer | null;
  private readonly lineCount: number;

  constructor(gl: WebGL2RenderingContext, maxVertices: number, triIndices: Uint16Array, lineIndices?: Uint16Array) {
    this.indexCount = triIndices.length;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    this.vao = vao;
    gl.bindVertexArray(vao);

    const strideBytes = maxVertices * 3 * 4;

    this.posBuffer = this.makeBuffer(gl, strideBytes);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.normalBuffer = this.makeBuffer(gl, strideBytes);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    this.colorBuffer = this.makeBuffer(gl, strideBytes);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triIndices, gl.STATIC_DRAW);
    this.triIbo = ibo;

    if (lineIndices) {
      const libo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, libo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndices, gl.STATIC_DRAW);
      this.lineIbo = libo;
      this.lineCount = lineIndices.length;
    } else {
      this.lineIbo = null;
      this.lineCount = 0;
    }

    gl.bindVertexArray(null);
  }

  update(gl: WebGL2RenderingContext, positions: Float32Array, normals: Float32Array, colors: Float32Array): void {
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, normals);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
    gl.bindVertexArray(null);
  }

  draw(gl: WebGL2RenderingContext, mode: number): void {
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIbo);
    gl.drawElements(mode, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  /** Draw the optional line index set (used for the wireframe overlay). */
  drawLines(gl: WebGL2RenderingContext): void {
    if (!this.lineIbo) return;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIbo);
    gl.drawElements(gl.LINES, this.lineCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  private makeBuffer(gl: WebGL2RenderingContext, byteSize: number): WebGLBuffer {
    const buf = gl.createBuffer();
    if (!buf) throw new Error('Failed to create buffer');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, byteSize, gl.DYNAMIC_DRAW);
    return buf;
  }
}

// ---------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------

export interface SphereGeometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint16Array;
}

/** Unit UV sphere (radius 1); scale via the model matrix. */
export function buildSphere(segments = 28, rings = 16): SphereGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const x = sp * Math.cos(theta);
      const y = cp;
      const z = sp * Math.sin(theta);
      positions.push(x, y, z);
      normals.push(x, y, z);
    }
  }
  const stride = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

/** Grid of line segments in the xz plane at height y. */
export function buildGroundGrid(y: number, half = 4, lines = 21): { positions: Float32Array; indices: Uint16Array } {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let k = 0; k < lines; k++) {
    const t = -half + (2 * half * k) / (lines - 1);
    const base = positions.length / 3;
    positions.push(t, y, -half, t, y, half); // line along z
    indices.push(base, base + 1);
    const base2 = positions.length / 3;
    positions.push(-half, y, t, half, y, t); // line along x
    indices.push(base2, base2 + 1);
  }
  return { positions: new Float32Array(positions), indices: new Uint16Array(indices) };
}

/**
 * Build index buffers for a visually thick cloth slab.
 *
 * Vertex layout: grid vertex g occupies index g (front layer) and V+g (back layer),
 * where V = (cols+1)*(rows+1). The renderer offsets each layer by ±thickness/2 along
 * the surface normal. `tri` covers front + back layers plus perimeter rim quads;
 * `line` covers the mid-surface triangle edges for the wireframe overlay.
 */
export function buildThickClothIndices(cols: number, rows: number): { tri: Uint16Array; line: Uint16Array } {
  const V = (cols + 1) * (rows + 1);
  const tri = new Uint16Array(rows * cols * 12 + (2 * (cols + rows)) * 6);
  const cell = (i: number, j: number) => i * (cols + 1) + j;
  let k = 0;

  // Front layer (grid indices as-is).
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = cell(i, j);
      const b = cell(i + 1, j);
      const c = cell(i + 1, j + 1);
      const d = cell(i, j + 1);
      tri[k++] = a;
      tri[k++] = b;
      tri[k++] = c;
      tri[k++] = a;
      tri[k++] = c;
      tri[k++] = d;
    }
  }

  // Back layer (offset V, reversed winding).
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = V + cell(i, j);
      const b = V + cell(i + 1, j);
      const c = V + cell(i + 1, j + 1);
      const d = V + cell(i, j + 1);
      tri[k++] = a;
      tri[k++] = c;
      tri[k++] = b;
      tri[k++] = a;
      tri[k++] = d;
      tri[k++] = c;
    }
  }

  // Perimeter rim quads: front(a)-front(b)-back(b)-back(a).
  const addQuad = (a: number, b: number) => {
    tri[k++] = a;
    tri[k++] = b;
    tri[k++] = V + b;
    tri[k++] = a;
    tri[k++] = V + b;
    tri[k++] = V + a;
  };
  for (let j = 0; j < cols; j++) addQuad(cell(0, j), cell(0, j + 1)); // top edge
  for (let j = 0; j < cols; j++) addQuad(cell(rows, j), cell(rows, j + 1)); // bottom edge
  for (let i = 0; i < rows; i++) addQuad(cell(i, 0), cell(i + 1, 0)); // left edge
  for (let i = 0; i < rows; i++) addQuad(cell(i, cols), cell(i + 1, cols)); // right edge

  // Mid-surface triangle edges for wireframe lines.
  const line = new Uint16Array(rows * cols * 6);
  let l = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = cell(i, j);
      const b = cell(i + 1, j);
      const c = cell(i + 1, j + 1);
      const d = cell(i, j + 1);
      line[l++] = a;
      line[l++] = b;
      line[l++] = b;
      line[l++] = c;
      line[l++] = c;
      line[l++] = a;
      line[l++] = a;
      line[l++] = c;
      line[l++] = c;
      line[l++] = d;
      line[l++] = d;
      line[l++] = a;
    }
  }


  return { tri, line };
}

/**
 * Expand a mid-surface grid into a two-layer slab whose vertex layout matches
 * buildThickClothIndices: front-layer vertex g lives at index g, back-layer at
 * index V+g (V = grid vertex count). Writes into the provided out buffers so the
 * renderer can reuse them every frame (zero per-frame allocation).
 */
export function expandThickMesh(
  outPositions: Float32Array,
  outNormals: Float32Array,
  outColors: Float32Array,
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
  rimSegments: Uint16Array,
  thickness: number,
): void {
  const V = positions.length / 3;
  const half = thickness / 2;
  for (let i = 0; i < V; i++) {
    const i3 = i * 3;
    const f = i3;
    const b = (V + i) * 3;
    const nx = normals[i3];
    const ny = normals[i3 + 1];
    const nz = normals[i3 + 2];
    outPositions[f] = positions[i3] + nx * half;
    outPositions[f + 1] = positions[i3 + 1] + ny * half;
    outPositions[f + 2] = positions[i3 + 2] + nz * half;
    outPositions[b] = positions[i3] - nx * half;
    outPositions[b + 1] = positions[i3 + 1] - ny * half;
    outPositions[b + 2] = positions[i3 + 2] - nz * half;
    outNormals[f] = nx;
    outNormals[f + 1] = ny;
    outNormals[f + 2] = nz;
    outNormals[b] = -nx;
    outNormals[b + 1] = -ny;
    outNormals[b + 2] = -nz;
    outColors[f] = colors[i3];
    outColors[f + 1] = colors[i3 + 1];
    outColors[f + 2] = colors[i3 + 2];
    outColors[b] = colors[i3];
    outColors[b + 1] = colors[i3 + 1];
    outColors[b + 2] = colors[i3 + 2];
  }
  // Outward rim normals along the perimeter.
  for (let s = 0; s < rimSegments.length; s += 2) {
    const a = rimSegments[s];
    const b = rimSegments[s + 1];
    const tx = positions[b * 3] - positions[a * 3];
    const ty = positions[b * 3 + 1] - positions[a * 3 + 1];
    const tz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    const na = normals[a * 3];
    const nb = normals[a * 3 + 1];
    const nc = normals[a * 3 + 2];
    let rx = (ty / tl) * nc - (tz / tl) * nb;
    let ry = (tz / tl) * na - (tx / tl) * nc;
    let rz = (tx / tl) * nb - (ty / tl) * na;
    const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    rx /= rl;
    ry /= rl;
    rz /= rl;
    for (const g of [a, b]) {
      const f = g * 3;
      const bk = (V + g) * 3;
      outNormals[f] = rx;
      outNormals[f + 1] = ry;
      outNormals[f + 2] = rz;
      outNormals[bk] = rx;
      outNormals[bk + 1] = ry;
      outNormals[bk + 2] = rz;
    }
  }
}
