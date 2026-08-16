/**
 * ClothRenderer — owns the WebGL2 context, camera, meshes and shaders.
 * Every frame it recomputes cloth normals (+strain heat colors), expands the
 * mid-surface into a thick slab, uploads the dynamic buffers and draws
 * cloth / sphere / ground / optional wireframe.
 */
import type { ClothEngine } from '../physics/engine';
import type { Cloth } from '../physics/cloth';
import { mat4Scale, mat4Translation, v3cross, type V3 } from '../physics/math';
import { OrbitCamera } from './camera';
import { hexToRgb } from './color';
import { getWebGL2Context, linkProgramWithUniforms } from './gl';
import {
  DynamicMesh,
  buildGroundGrid,
  buildSphere,
  buildThickClothIndices,
  createStaticMesh,
  expandThickMesh,
  type StaticMesh,
} from './mesh';
import { CLOTH_FRAG, CLOTH_VERT, FLAT_FRAG, FLAT_VERT, SPHERE_FRAG, SPHERE_VERT } from './shaders';

const LIGHT_DIR: V3 = [0.5, 0.9, 0.4]; // normalized in the constructor
const DEFAULT_CLOTH_COLOR: V3 = [0.36, 0.5, 0.82]; // fallback for invalid hex
const FOG_COLOR = new Float32Array([0.043, 0.058, 0.09]);
const FOG_START = 6.5;
const FOG_END = 15;

export class ClothRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly camera = new OrbitCamera();

  private readonly clothMesh: DynamicMesh;
  private readonly sphereMesh: StaticMesh;
  private readonly groundMesh: StaticMesh;
  private readonly groundY: number;

  private readonly clothProg: WebGLProgram;
  private readonly clothU: Record<string, WebGLUniformLocation | null>;
  private readonly sphereProg: WebGLProgram;
  private readonly sphereU: Record<string, WebGLUniformLocation | null>;
  private readonly flatProg: WebGLProgram;
  private readonly flatU: Record<string, WebGLUniformLocation | null>;

  private readonly normals: Float32Array;
  private readonly colors: Float32Array;
  private readonly thickPos: Float32Array;
  private readonly thickNormals: Float32Array;
  private readonly thickColors: Float32Array;
  private readonly rimSegments: Uint16Array;
  private cameraBackground = false; // transparent clear + fog off for the camera video

  private readonly lightDir = new Float32Array(3);

  private readonly tmpA = new Float32Array(3);
  private readonly tmpB = new Float32Array(3);
  private readonly tmpC = new Float32Array(3);
  private readonly model = new Float32Array(16);
  private readonly trans = new Float32Array(16);

  constructor(canvas: HTMLCanvasElement, cols: number, rows: number, floorY: number) {
    const gl = getWebGL2Context(canvas);
    if (!gl) throw new Error('WebGL2 不可用：请使用支持 WebGL2 的现代浏览器。');
    this.gl = gl;

    const lightLen = Math.hypot(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
    this.lightDir[0] = LIGHT_DIR[0] / lightLen;
    this.lightDir[1] = LIGHT_DIR[1] / lightLen;
    this.lightDir[2] = LIGHT_DIR[2] / lightLen;

    // Cloth dynamic mesh — front/back layers + rim for visual thickness.
    const V = (cols + 1) * (rows + 1);
    const thick = buildThickClothIndices(cols, rows);
    this.clothMesh = new DynamicMesh(gl, V * 2, thick.tri, thick.line);
    this.normals = new Float32Array(V * 3);
    this.colors = new Float32Array(V * 3);
    this.thickPos = new Float32Array(V * 2 * 3);
    this.thickNormals = new Float32Array(V * 2 * 3);
    this.thickColors = new Float32Array(V * 2 * 3);
    this.rimSegments = this.buildRimSegments(cols, rows);

    const sphere = buildSphere();
    this.sphereMesh = createStaticMesh(gl, sphere.positions, sphere.normals, sphere.indices);

    this.groundY = floorY;
    const grid = buildGroundGrid(this.groundY);
    this.groundMesh = createStaticMesh(gl, grid.positions, null, grid.indices, gl.LINES);

    const clothLink = linkProgramWithUniforms(gl, CLOTH_VERT, CLOTH_FRAG, [
      'uProj', 'uView', 'uLightDir', 'uViewPos', 'uBaseColor', 'uColor2', 'uUseVertexColor', 'uFogColor', 'uFogStart', 'uFogEnd', 'uOpacity',
    ]);
    this.clothProg = clothLink.program;
    this.clothU = clothLink.uniforms;

    const sphereLink = linkProgramWithUniforms(gl, SPHERE_VERT, SPHERE_FRAG, [
      'uProj', 'uView', 'uModel', 'uLightDir', 'uViewPos', 'uColor', 'uFogColor', 'uFogStart', 'uFogEnd',
    ]);
    this.sphereProg = sphereLink.program;
    this.sphereU = sphereLink.uniforms;

    const flatLink = linkProgramWithUniforms(gl, FLAT_VERT, FLAT_FRAG, ['uProj', 'uView', 'uColor']);
    this.flatProg = flatLink.program;
    this.flatU = flatLink.uniforms;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Toggle transparent clear + fog-off so the camera video shows through. */
  setCameraBackground(on: boolean): void {
    this.cameraBackground = on;
  }

  /** gl.viewport in buffer pixels; camera.aspect in CSS pixels. */
  resize(bufferWidth: number, bufferHeight: number, cssWidth: number, cssHeight: number): void {
    this.gl.viewport(0, 0, bufferWidth, bufferHeight);
    this.camera.aspect = cssWidth / Math.max(1, cssHeight);
  }

  render(engine: ClothEngine): void {
    const gl = this.gl;
    this.camera.update();

    if (this.cameraBackground) {
      gl.clearColor(0, 0, 0, 0);
    } else {
      gl.clearColor(FOG_COLOR[0], FOG_COLOR[1], FOG_COLOR[2], 1);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.computeNormals(engine.cloth);
    this.computeColors(engine);
    this.buildThickMesh(engine.cloth, engine.params.thickness);
    this.clothMesh.update(gl, this.thickPos, this.thickNormals, this.thickColors);

    // --- Cloth -------------------------------------------------------------
    gl.useProgram(this.clothProg);
    gl.uniformMatrix4fv(this.clothU.uProj, false, this.camera.proj);
    gl.uniformMatrix4fv(this.clothU.uView, false, this.camera.view);
    gl.uniform3fv(this.clothU.uLightDir, this.lightDir);
    gl.uniform3fv(this.clothU.uViewPos, this.camera.eye);
    const base = hexToRgb(engine.params.clothColor) ?? DEFAULT_CLOTH_COLOR;
    gl.uniform3f(this.clothU.uBaseColor, base[0], base[1], base[2]);
    gl.uniform3f(this.clothU.uColor2, base[0] * 0.62, base[1] * 0.62, base[2] * 0.62);
    gl.uniform1f(this.clothU.uUseVertexColor, engine.params.colorMode === 'strain' ? 1 : 0);
    gl.uniform3fv(this.clothU.uFogColor, FOG_COLOR);
    gl.uniform1f(this.clothU.uFogStart, this.cameraBackground ? 100 : FOG_START);
    gl.uniform1f(this.clothU.uFogEnd, this.cameraBackground ? 200 : FOG_END);
    gl.uniform1f(this.clothU.uOpacity, engine.params.opacity);
    this.clothMesh.draw(gl, gl.TRIANGLES);

    // --- Sphere ------------------------------------------------------------
    if (engine.params.sphereEnabled) {
      gl.useProgram(this.sphereProg);
      gl.uniformMatrix4fv(this.sphereU.uProj, false, this.camera.proj);
      gl.uniformMatrix4fv(this.sphereU.uView, false, this.camera.view);
      mat4Translation(this.trans, engine.spherePos[0], engine.spherePos[1], engine.spherePos[2]);
      mat4Scale(this.model, this.trans, engine.params.sphereRadius, engine.params.sphereRadius, engine.params.sphereRadius);
      gl.uniformMatrix4fv(this.sphereU.uModel, false, this.model);
      gl.uniform3fv(this.sphereU.uLightDir, this.lightDir);
      gl.uniform3fv(this.sphereU.uViewPos, this.camera.eye);
      gl.uniform3f(this.sphereU.uColor, 0.93, 0.42, 0.34);
      gl.uniform3fv(this.sphereU.uFogColor, FOG_COLOR);
      gl.uniform1f(this.sphereU.uFogStart, FOG_START);
      gl.uniform1f(this.sphereU.uFogEnd, FOG_END);
      gl.bindVertexArray(this.sphereMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.sphereMesh.count, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    }

    // --- Ground grid ---------------------------------------------------------
    gl.useProgram(this.flatProg);
    gl.uniformMatrix4fv(this.flatU.uProj, false, this.camera.proj);
    gl.uniformMatrix4fv(this.flatU.uView, false, this.camera.view);
    gl.uniform4f(this.flatU.uColor, 0.45, 0.52, 0.66, 0.4);
    gl.bindVertexArray(this.groundMesh.vao);
    gl.drawElements(gl.LINES, this.groundMesh.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    // --- Wireframe overlay ----------------------------------------------------
    if (engine.params.showWireframe) {
      gl.uniform4f(this.flatU.uColor, 0.85, 0.92, 1.0, 0.55);
      this.clothMesh.drawLines(gl);
    }
  }

  /** Perimeter segments (grid index pairs) — static topology, computed once. */
  private buildRimSegments(cols: number, rows: number): Uint16Array {
    const segs: number[] = [];
    const cell = (i: number, j: number) => i * (cols + 1) + j;
    for (let j = 0; j < cols; j++) segs.push(cell(0, j), cell(0, j + 1)); // top
    for (let j = 0; j < cols; j++) segs.push(cell(rows, j), cell(rows, j + 1)); // bottom
    for (let i = 0; i < rows; i++) segs.push(cell(i, 0), cell(i + 1, 0)); // left
    for (let i = 0; i < rows; i++) segs.push(cell(i, cols), cell(i + 1, cols)); // right
    return new Uint16Array(segs);
  }

  /** Expand the mid-surface into the thick two-layer slab (see expandThickMesh). */
  private buildThickMesh(cloth: Cloth, thickness: number): void {
    expandThickMesh(
      this.thickPos,
      this.thickNormals,
      this.thickColors,
      cloth.positions,
      this.normals,
      this.colors,
      this.rimSegments,
      thickness,
    );
  }

  private computeNormals(cloth: Cloth): void {
    const p = cloth.positions;
    const n = this.normals;
    n.fill(0);
    const cols = cloth.cols;
    const rows = cloth.rows;
    const A = this.tmpA;
    const B = this.tmpB;
    const C = this.tmpC;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = cloth.index(i, j) * 3;
        const b = cloth.index(i + 1, j) * 3;
        const c = cloth.index(i + 1, j + 1) * 3;
        const d = cloth.index(i, j + 1) * 3;

        // triangle (a, b, c)
        A[0] = p[b] - p[a]; A[1] = p[b + 1] - p[a + 1]; A[2] = p[b + 2] - p[a + 2];
        B[0] = p[c] - p[a]; B[1] = p[c + 1] - p[a + 1]; B[2] = p[c + 2] - p[a + 2];
        v3cross(C, A, B);
        n[a] += C[0]; n[a + 1] += C[1]; n[a + 2] += C[2];
        n[b] += C[0]; n[b + 1] += C[1]; n[b + 2] += C[2];
        n[c] += C[0]; n[c + 1] += C[1]; n[c + 2] += C[2];

        // triangle (a, c, d)
        A[0] = p[c] - p[a]; A[1] = p[c + 1] - p[a + 1]; A[2] = p[c + 2] - p[a + 2];
        B[0] = p[d] - p[a]; B[1] = p[d + 1] - p[a + 1]; B[2] = p[d + 2] - p[a + 2];
        v3cross(C, A, B);
        n[a] += C[0]; n[a + 1] += C[1]; n[a + 2] += C[2];
        n[c] += C[0]; n[c + 1] += C[1]; n[c + 2] += C[2];
        n[d] += C[0]; n[d + 1] += C[1]; n[d + 2] += C[2];
      }
    }

    const vertexCount = cloth.vertexCount;
    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      const nx = n[i3];
      const ny = n[i3 + 1];
      const nz = n[i3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-9) {
        n[i3] = nx / len;
        n[i3 + 1] = ny / len;
        n[i3 + 2] = nz / len;
      } else {
        n[i3] = 0;
        n[i3 + 1] = 0;
        n[i3 + 2] = 1;
      }
    }
  }

  private computeColors(engine: ClothEngine): void {
    const c = this.colors;
    if (engine.params.colorMode !== 'strain') {
      c.fill(0);
      return;
    }
    const strain = engine.cloth.strain;
    const range = Math.max(engine.params.tearThreshold - 1, 0.001);
    for (let i = 0; i < engine.cloth.vertexCount; i++) {
      const t = Math.min(1, Math.max(0, (strain[i] - 1) / range));
      const i3 = i * 3;
      c[i3] = 0.32 + (0.95 - 0.32) * t;
      c[i3 + 1] = 0.44 * (1 - t) + 0.25 * t;
      c[i3 + 2] = 0.78 * (1 - t) + 0.12 * t;
    }
  }
}
