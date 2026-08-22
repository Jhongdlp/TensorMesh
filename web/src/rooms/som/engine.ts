/** Sala 03 — Mapas Autoorganizados (SOM).
 *
 *  Motor WebGPU de cálculo en paralelo y renderizado 3D de la red neuronal.
 *  Hereda la cámara y los controles de interacción orbitales de la galaxia.
 */

import { OrbitCamera } from "../../galaxy/gpu/camera";
import { SHAPES, GRID_RES, SAMPLE_COUNT } from "./math.mjs";
import somComputeWGSL from "./som_compute.wgsl?raw";
import somRenderWGSL from "./som_render.wgsl?raw";

export const TOTAL_STEPS = 30000;
const STEPS_PER_FRAME_DEFAULT = 8;

export interface Options {
  shapeIdx: number;     // Índice de la figura objetivo (SHAPES)
  toroidal: boolean;    // Red toroidal o plana
  stepsPerFrame: number;// Pasos de entrenamiento por frame (1 a 64)
  running: boolean;     // Simulación activa
  mode: number;         // 0 = color topológico, 1 = color por altura
  showTarget: boolean;  // Mostrar u ocultar los puntos objetivo
  eta0: number;         // Tasa de aprendizaje inicial
  sigma0: number;       // Radio de vecindad inicial
  alpha: number;        // Opacidad de la malla
  bright: number;       // Brillo de los puntos objetivo
}

export const DEFAULTS: Options = {
  shapeIdx: 0,
  toroidal: false,
  stepsPerFrame: STEPS_PER_FRAME_DEFAULT,
  running: true,
  mode: 0,
  showTarget: true,
  eta0: 0.3,
  sigma0: 32.0,
  alpha: 0.75,
  bright: 0.8,
};

export interface Stats {
  fps: number;
  steps: number;
  eta: number;
  sigma: number;
  done: boolean;
}

export async function gpuAvailable(): Promise<GPUDevice | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  if (/firefox/i.test(navigator.userAgent)) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    return await adapter.requestDevice();
  } catch {
    return null;
  }
}

export class SomEngine {
  readonly camera = new OrbitCamera();
  readonly stats: Stats = { fps: 0, steps: 0, eta: DEFAULTS.eta0, sigma: DEFAULTS.sigma0, done: false };
  opts: Options = { ...DEFAULTS };

  private ctx: GPUCanvasContext;
  private fmt: GPUTextureFormat;
  private raf = 0;
  private steps = 0;
  private lastAt = 0;
  private dirty = true;
  private pending = 0;
  private homeDist = 0;

  // Recursos WebGPU
  private uniBuffer: GPUBuffer;
  private weightsBuffer: GPUBuffer;
  private targetsBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;
  private depthTex: GPUTexture | null = null;

  // Pipelines
  private initPipeline: GPUComputePipeline;
  private trainPipeline: GPUComputePipeline;
  private gridPipeline: GPURenderPipeline;
  private targetPipeline: GPURenderPipeline;

  // BindGroups
  private computeBG: GPUBindGroup;
  private renderBG: GPUBindGroup;

  constructor(
    private device: GPUDevice,
    private canvas: HTMLCanvasElement,
    opts?: Partial<Options>
  ) {
    Object.assign(this.opts, opts);
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.fmt, alphaMode: "opaque" });

    const totalNodes = GRID_RES * GRID_RES;
    const S = GPUBufferUsage.STORAGE;
    const CD = GPUBufferUsage.COPY_DST;
    const U = GPUBufferUsage.UNIFORM;
    const I = GPUBufferUsage.INDEX;

    // 1. Crear Buffers
    this.uniBuffer = device.createBuffer({ size: 256, usage: U | CD });
    this.weightsBuffer = device.createBuffer({ size: totalNodes * 16, usage: S | CD | GPUBufferUsage.COPY_SRC });
    this.targetsBuffer = device.createBuffer({ size: SAMPLE_COUNT * 16, usage: S | CD });

    // Generar índices para dibujar la grilla SOM (tamaño máximo reservado para toroidal: 16.384 índices = 32.768 bytes)
    const maxIndices = GRID_RES * GRID_RES * 4; // 16384
    this.indexBuffer = device.createBuffer({
      size: maxIndices * 2,
      usage: I | CD,
    });
    this.updateIndexBuffer();

    // 2. Compilar Shaders y crear BindGroupLayouts explícitos
    const computeModule = device.createShaderModule({ code: somComputeWGSL });
    const renderModule = device.createShaderModule({ code: somRenderWGSL });

    const computeBGLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      ],
    });
    const computePipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [computeBGLayout],
    });

    const renderBGLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });
    const renderPipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [renderBGLayout],
    });

    this.initPipeline = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: { module: computeModule, entryPoint: "init" },
    });

    this.trainPipeline = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: { module: computeModule, entryPoint: "train" },
    });

    // Pipeline para dibujar la grilla (líneas con mezcla aditiva suave)
    this.gridPipeline = device.createRenderPipeline({
      layout: renderPipelineLayout,
      vertex: { module: renderModule, entryPoint: "vsGrid" },
      fragment: {
        module: renderModule,
        entryPoint: "fsGrid",
        targets: [{
          format: this.fmt,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          }
        }]
      },
      primitive: { topology: "line-list" },
      depthStencil: { format: "depth16unorm", depthWriteEnabled: true, depthCompare: "less" },
    });

    // Pipeline para dibujar las muestras objetivo
    this.targetPipeline = device.createRenderPipeline({
      layout: renderPipelineLayout,
      vertex: { module: renderModule, entryPoint: "vsTarget" },
      fragment: {
        module: renderModule,
        entryPoint: "fsTarget",
        targets: [{
          format: this.fmt,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          }
        }]
      },
      primitive: { topology: "triangle-list" },
      depthStencil: { format: "depth16unorm", depthWriteEnabled: false, depthCompare: "less" },
    });

    // 3. Crear BindGroups
    this.computeBG = device.createBindGroup({
      layout: computeBGLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniBuffer } },
        { binding: 1, resource: { buffer: this.weightsBuffer } },
        { binding: 2, resource: { buffer: this.targetsBuffer } },
      ],
    });

    this.renderBG = device.createBindGroup({
      layout: renderBGLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniBuffer } },
        { binding: 1, resource: { buffer: this.weightsBuffer } },
        { binding: 2, resource: { buffer: this.targetsBuffer } },
      ],
    });

    // 4. Inicializar datos de la grilla (SOM) y puntos objetivos
    this.initGrid();
    this.loadShape(this.opts.shapeIdx, true);

    // 5. Configurar Cámara
    this.camera.theta = 0.6;
    this.camera.phi = 0.78;
    this.camera.frame(2.2);
    this.homeDist = this.camera.distance;
    this.camera.attach(canvas);

    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------- Métodos de Control

  initGrid() {
    const b = new ArrayBuffer(256);
    const u = new Uint32Array(b);
    u[23] = GRID_RES; // offset 23 = gridRes
    this.device.queue.writeBuffer(this.uniBuffer, 0, b);

    const enc = this.device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(this.initPipeline);
    cp.setBindGroup(0, this.computeBG);
    cp.dispatchWorkgroups(Math.ceil((GRID_RES * GRID_RES) / 256));
    cp.end();
    this.device.queue.submit([enc.finish()]);

    this.steps = 0;
    this.stats.steps = 0;
    this.stats.done = false;
    this.dirty = true;
  }

  loadShape(idx: number, initial = false) {
    this.opts.shapeIdx = idx;
    const shape = SHAPES[idx];
    const targetPoints = shape.generate(SAMPLE_COUNT);
    
    this.device.queue.writeBuffer(this.targetsBuffer, 0, targetPoints);

    if (!initial) {
      this.initGrid();
    }
  }

  private updateIndexBuffer() {
    const indices: number[] = [];
    for (let r = 0; r < GRID_RES; r++) {
      for (let c = 0; c < GRID_RES; c++) {
        const curr = r * GRID_RES + c;
        if (c < GRID_RES - 1) {
          indices.push(curr, curr + 1);
        } else if (this.opts.toroidal) {
          indices.push(curr, r * GRID_RES);
        }
        if (r < GRID_RES - 1) {
          indices.push(curr, curr + GRID_RES);
        } else if (this.opts.toroidal) {
          indices.push(curr, c);
        }
      }
    }
    const indicesData = new Uint16Array(indices);
    this.device.queue.writeBuffer(this.indexBuffer, 0, indicesData);
  }

  set(patch: Partial<Options>) {
    const toroidalChanged = patch.toroidal !== undefined && patch.toroidal !== this.opts.toroidal;
    Object.assign(this.opts, patch);
    
    if (toroidalChanged) {
      this.updateIndexBuffer();
      this.initGrid();
    }

    this.dirty = true;
  }

  stepOnce(k = 1) {
    this.pending = Math.min(64, this.pending + k);
    this.dirty = true;
  }

  reset() {
    this.initGrid();
  }

  goHome() {
    this.camera.goHome();
    this.dirty = true;
  }

  get roamed(): boolean {
    const c = this.camera;
    return Math.abs(c.distance - this.homeDist) > this.homeDist * 0.03
        || Math.abs(c.theta - 0.6) > 0.03
        || Math.hypot(c.target[0], c.target[1], c.target[2]) > 2.2 * 0.02;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.camera.dispose();
    this.depthTex?.destroy();
    this.uniBuffer.destroy();
    this.weightsBuffer.destroy();
    this.targetsBuffer.destroy();
    this.indexBuffer.destroy();
  }

  // ---------------------------------------------------------------- Renders y Uniforms

  private ensureDepthTex(w: number, h: number) {
    if (this.depthTex && this.depthTex.width === w && this.depthTex.height === h) return;
    this.depthTex?.destroy();
    this.depthTex = this.device.createTexture({
      size: { width: w, height: h },
      format: "depth16unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  private writeUniforms(vp: Float32Array, w: number, h: number, currentSampleIdx: number, eta: number, sigma: number) {
    const proj = this.camera.projection(w / h);
    
    const bufferData = new ArrayBuffer(256);
    const f = new Float32Array(bufferData);
    const u = new Uint32Array(bufferData);

    f.set(vp, 0);

    f[16] = proj[0];
    f[17] = proj[5];
    f[18] = w;
    f[19] = h;

    f[20] = eta;
    f[21] = sigma;
    u[22] = currentSampleIdx;
    u[23] = GRID_RES;

    u[24] = this.opts.toroidal ? 1 : 0;
    f[25] = this.opts.showTarget ? 1.0 : 0.0;
    f[26] = this.opts.mode;
    f[27] = this.opts.alpha;
    f[28] = this.opts.bright;

    this.device.queue.writeBuffer(this.uniBuffer, 0, bufferData);
  }

  // ------------------------------------------------------------- Ciclo de Animación

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.lastAt ? now - this.lastAt : 16;
    if (this.lastAt) {
      const inst = 1000 / Math.max(1, dt);
      this.stats.fps = this.stats.fps ? this.stats.fps * 0.9 + inst * 0.1 : inst;
    }
    this.lastAt = now;

    const training = (this.opts.running || this.pending > 0) && this.steps < TOTAL_STEPS;
    const moving = this.camera.moving();
    
    if (!training && !moving && !this.dirty) return;
    this.dirty = false;

    // 1. Ajustar tamaño del lienzo al pixel ratio
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ensureDepthTex(w, h);

    // 2. Ejecutar entrenamiento SOM si corresponde
    let stepsThisFrame = 0;
    if (training) {
      stepsThisFrame = this.opts.running ? this.opts.stepsPerFrame : this.pending;
      stepsThisFrame = Math.min(stepsThisFrame, TOTAL_STEPS - this.steps);
      this.pending = 0;
    }

    this.camera.update();
    const vp = this.camera.viewProj(w / h);

    const enc = this.device.createCommandEncoder();

    // 3. Pasadas de entrenamiento en GPU
    for (let s = 0; s < stepsThisFrame; s++) {
      const stepNo = this.steps + s;
      
      const progress = stepNo / TOTAL_STEPS;
      const eta = this.opts.eta0 * Math.pow(0.01 / this.opts.eta0, progress);
      const sigma = this.opts.sigma0 * Math.pow(1.0 / this.opts.sigma0, progress);

      this.stats.eta = eta;
      this.stats.sigma = sigma;

      const currentSampleIdx = Math.floor(Math.random() * SAMPLE_COUNT);

      this.writeUniforms(vp, w, h, currentSampleIdx, eta, sigma);

      const cp = enc.beginComputePass();
      cp.setPipeline(this.trainPipeline);
      cp.setBindGroup(0, this.computeBG);
      cp.dispatchWorkgroups(1);
      cp.end();
    }

    if (stepsThisFrame > 0) {
      this.steps += stepsThisFrame;
      this.stats.steps = this.steps;
      if (this.steps >= TOTAL_STEPS) {
        this.stats.done = true;
      }
    }

    if (stepsThisFrame === 0) {
      const progress = this.steps / TOTAL_STEPS;
      const eta = this.opts.eta0 * Math.pow(0.01 / this.opts.eta0, progress);
      const sigma = this.opts.sigma0 * Math.pow(1.0 / this.opts.sigma0, progress);
      this.writeUniforms(vp, w, h, 0, eta, sigma);
    }

    // 4. Render Pass
    const renderTarget = this.ctx.getCurrentTexture().createView();
    const renderPass = enc.beginRenderPass({
      colorAttachments: [{
        view: renderTarget,
        clearValue: { r: 0.012, g: 0.016, b: 0.030, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: this.depthTex!.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      }
    });

    // A. Dibujar la grilla de Kohonen
    renderPass.setPipeline(this.gridPipeline);
    renderPass.setBindGroup(0, this.renderBG);
    const lineIndicesCount = (GRID_RES * (GRID_RES - 1) * 2 + (this.opts.toroidal ? GRID_RES * 2 : 0)) * 2;
    renderPass.setIndexBuffer(this.indexBuffer, "uint16");
    renderPass.drawIndexed(lineIndicesCount, 1, 0, 0, 0);

    // B. Dibujar los puntos objetivo
    if (this.opts.showTarget) {
      renderPass.setPipeline(this.targetPipeline);
      renderPass.setBindGroup(0, this.renderBG);
      renderPass.draw(6, SAMPLE_COUNT, 0, 0);
    }

    renderPass.end();

    this.device.queue.submit([enc.finish()]);
  };
}
