/**
 * Sala 06 — K-Means Clustering & Voronoi 3D
 * Motor WebGPU con conceptos semánticos, constelaciones estelares y búsqueda interactiva.
 */

import { OrbitCamera } from "../../galaxy/gpu/camera";
import {
  DATASET_PRESETS,
  CLUSTER_PALETTE,
  runKmeansSimulation,
  computeElbowAnalysis,
  type DataPoint,
  type Centroid,
  type KmeansStep,
  type IntraEdge,
  type ElbowPoint,
} from "./math";
import kmeansRenderWGSL from "./kmeans_render.wgsl?raw";

export interface KmeansOptions {
  datasetId: string;
  k: number;
  pointCount: number;
  initMethod: "kmeans_plus_plus" | "random";
  pointSize: number;
  centroidSize: number;
  showTrajectories: boolean;
  showConstellations: boolean;
  playbackSpeed: number;
  autoPlay: boolean;
}

export const DEFAULTS: KmeansOptions = {
  datasetId: "blobs",
  k: 5,
  pointCount: 3000,
  initMethod: "kmeans_plus_plus",
  pointSize: 0.0055,
  centroidSize: 0.018,
  showTrajectories: true,
  showConstellations: true,
  playbackSpeed: 1.5,
  autoPlay: true,
};

export interface SelectedConcept {
  id: number;
  label: string;
  domain: string;
  cluster: number;
  centroidLabel: string;
  distToCentroid: number;
  coords: [number, number, number];
}

export interface EngineStats {
  fps: number;
  currentStepIndex: number;
  totalSteps: number;
  iteration: number;
  phase: string;
  activeMessage: string;
  inertia: number;
  maxDelta: number;
  k: number;
  pointCount: number;
  isPlaying: boolean;
  clusterCounts: number[];
  centroidsInfo: Array<{ id: number; label: string; count: number; inertia: number; color: [number, number, number] }>;
  selectedPoint: SelectedConcept | null;
  hoveredCentroid: { id: number; label: string; count: number; inertia: number; pos: [number, number, number] } | null;
  elbowAnalysis: { curve: ElbowPoint[]; optimalK: number };
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

export class KmeansEngine {
  readonly camera = new OrbitCamera();
  opts: KmeansOptions = { ...DEFAULTS };

  points: DataPoint[] = [];
  steps: KmeansStep[] = [];
  intraEdges: IntraEdge[] = [];
  currentStepIndex = 0;
  selectedPointId = -1;

  stats: EngineStats = {
    fps: 0,
    currentStepIndex: 0,
    totalSteps: 0,
    iteration: 0,
    phase: "init",
    activeMessage: "Iniciando simulación...",
    inertia: 0,
    maxDelta: 0,
    k: 5,
    pointCount: 1600,
    isPlaying: true,
    clusterCounts: [],
    centroidsInfo: [],
    selectedPoint: null,
    hoveredCentroid: null,
    elbowAnalysis: { curve: [], optimalK: 5 },
  };

  private ctx: GPUCanvasContext;
  private fmt: GPUTextureFormat;
  private raf = 0;
  private lastAt = 0;
  private stepTimer = 0;
  private homeDist = 0;
  private depthTex: GPUTexture | null = null;

  // WebGPU Buffers
  private uniBuffer!: GPUBuffer;
  private pointBuffer!: GPUBuffer;
  private centroidBuffer!: GPUBuffer;
  private lineBuffer!: GPUBuffer;

  private pointCount = 0;
  private centroidCount = 0;
  private lineVertexCount = 0;

  // Pipelines
  private pointPipeline!: GPURenderPipeline;
  private centroidPipeline!: GPURenderPipeline;
  private linePipeline!: GPURenderPipeline;
  private renderBG!: GPUBindGroup;

  private centroidHistories: Array<Array<{ x: number; y: number; z: number }>> = [];

  constructor(
    private device: GPUDevice,
    private canvas: HTMLCanvasElement,
    opts?: Partial<KmeansOptions>
  ) {
    Object.assign(this.opts, opts);
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.fmt, alphaMode: "opaque" });

    this.camera.theta = 0.55;
    this.camera.phi = 0.60;
    this.camera.frame(3.6);
    this.homeDist = this.camera.distance;
    this.camera.attach(canvas);

    this.setupInteractivity();
    this.initPipelines();
    this.recomputeSimulation();
    this.startLoop();
  }

  private setupInteractivity() {
    this.canvas.addEventListener("pointermove", (e) => {
      const step = this.steps[this.currentStepIndex];
      if (!step) return;

      const rect = this.canvas.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      // Hit-testing centroides
      let closestCentroid: Centroid | null = null;
      let minCentroidDist = 0.15;

      for (const c of step.centroids) {
        const dx = c.pos.x * 0.4 - normX;
        const dy = c.pos.y * 0.4 - normY;
        const d = Math.hypot(dx, dy);
        if (d < minCentroidDist) {
          minCentroidDist = d;
          closestCentroid = c;
        }
      }

      if (closestCentroid) {
        this.stats.hoveredCentroid = {
          id: closestCentroid.id,
          label: closestCentroid.label,
          count: closestCentroid.pointsCount,
          inertia: closestCentroid.inertia,
          pos: [closestCentroid.pos.x, closestCentroid.pos.y, closestCentroid.pos.z],
        };
      } else {
        this.stats.hoveredCentroid = null;
      }
    });

    this.canvas.addEventListener("click", (e) => {
      if (this.points.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      // Hit-testing puntos semánticos
      let closestPt: DataPoint | null = null;
      let minPtDist = 0.08;

      for (const p of this.points) {
        const dx = p.pos.x * 0.4 - normX;
        const dy = p.pos.y * 0.4 - normY;
        const d = Math.hypot(dx, dy);
        if (d < minPtDist) {
          minPtDist = d;
          closestPt = p;
        }
      }

      if (closestPt) {
        this.selectPoint(closestPt.id);
      }
    });
  }

  selectPoint(pointId: number) {
    const pt = this.points.find(p => p.id === pointId);
    const step = this.steps[this.currentStepIndex];
    if (!pt || !step) {
      this.selectedPointId = -1;
      this.stats.selectedPoint = null;
      this.updateSceneBuffers();
      return;
    }

    this.selectedPointId = pt.id;
    const currentCentroid = step.centroids[pt.cluster] || step.centroids[0];

    this.stats.selectedPoint = {
      id: pt.id,
      label: pt.label,
      domain: pt.domain,
      cluster: pt.cluster,
      centroidLabel: currentCentroid.label,
      distToCentroid: pt.distToCentroid,
      coords: [pt.pos.x, pt.pos.y, pt.pos.z],
    };

    this.updateSceneBuffers();
  }

  searchConcept(query: string): DataPoint | null {
    if (!query || query.trim().length === 0) return null;
    const q = query.toLowerCase().trim();

    const match = this.points.find(p => p.label.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q));
    if (match) {
      this.selectPoint(match.id);
      // Suave ajuste de cámara hacia el punto
      this.camera.target = [match.pos.x, match.pos.y, match.pos.z];
      return match;
    }
    return null;
  }

  private initPipelines() {
    const sm = this.device.createShaderModule({ code: kmeansRenderWGSL });

    this.uniBuffer = this.device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bgl = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.renderBG = this.device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: this.uniBuffer } }],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bgl],
    });

    const blendAlpha: GPUBlendState = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };

    // Pipeline de Líneas (Constelaciones y Trayectorias)
    this.linePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: sm,
        entryPoint: "vsLine",
        buffers: [
          {
            arrayStride: 8 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" },
              { shaderLocation: 1, offset: 4 * 4, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: sm,
        entryPoint: "fsLine",
        targets: [{ format: this.fmt, blend: blendAlpha }],
      },
      primitive: { topology: "line-list" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less-equal",
        format: "depth24plus",
      },
    });

    // Pipeline de Puntos Semánticos
    this.pointPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: sm,
        entryPoint: "vsPoint",
        buffers: [
          {
            arrayStride: 12 * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" },
              { shaderLocation: 1, offset: 4 * 4, format: "float32x4" },
              { shaderLocation: 2, offset: 8 * 4, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: sm,
        entryPoint: "fsPoint",
        targets: [{ format: this.fmt, blend: blendAlpha }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less-equal",
        format: "depth24plus",
      },
    });

    // Pipeline de Centroides Gravitacionales
    this.centroidPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: sm,
        entryPoint: "vsCentroid",
        buffers: [
          {
            arrayStride: 8 * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" },
              { shaderLocation: 1, offset: 4 * 4, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module: sm,
        entryPoint: "fsCentroid",
        targets: [{ format: this.fmt, blend: blendAlpha }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less-equal",
        format: "depth24plus",
      },
    });
  }

  recomputeSimulation() {
    const preset = DATASET_PRESETS.find(p => p.id === this.opts.datasetId) || DATASET_PRESETS[0];
    const { points: rawPoints, domainNames } = preset.generatePoints(this.opts.pointCount);

    const res = runKmeansSimulation(rawPoints, domainNames, this.opts.k, this.opts.initMethod);
    this.points = res.points;
    this.steps = res.steps;
    this.intraEdges = res.intraEdges;

    // Analítica del Codo (Elbow Method)
    this.stats.elbowAnalysis = computeElbowAnalysis(rawPoints, 8);

    this.currentStepIndex = 0;
    this.stepTimer = 0;
    this.opts.autoPlay = true;
    this.stats.isPlaying = true;
    this.selectedPointId = -1;
    this.stats.selectedPoint = null;
    this.stats.totalSteps = this.steps.length;
    this.stats.k = this.opts.k;
    this.stats.pointCount = this.points.length;

    this.centroidHistories = Array.from({ length: this.opts.k }, () => []);
    for (const step of this.steps) {
      if (step.phase === "init" || step.phase === "update_m") {
        for (let c = 0; c < this.opts.k; c++) {
          if (step.centroids[c]) {
            this.centroidHistories[c].push({ ...step.centroids[c].pos });
          }
        }
      }
    }

    this.updateSceneBuffers();
  }

  play() {
    this.opts.autoPlay = true;
    this.stats.isPlaying = true;
    if (this.currentStepIndex >= this.steps.length - 1) {
      this.currentStepIndex = 0;
      this.stepTimer = 0;
      this.updateSceneBuffers();
    }
  }

  pause() {
    this.opts.autoPlay = false;
    this.stats.isPlaying = false;
  }

  stepForward() {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.updateSceneBuffers();
    }
  }

  stepBackward() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.updateSceneBuffers();
    }
  }

  seek(stepIdx: number) {
    this.currentStepIndex = Math.max(0, Math.min(this.steps.length - 1, stepIdx));
    this.stepTimer = 0;
    this.updateSceneBuffers();
  }

  reset() {
    this.currentStepIndex = 0;
    this.stepTimer = 0;
    this.opts.autoPlay = true;
    this.stats.isPlaying = true;
    this.updateSceneBuffers();
  }

  set(partial: Partial<KmeansOptions>) {
    const rebuild =
      (partial.datasetId !== undefined && partial.datasetId !== this.opts.datasetId) ||
      (partial.k !== undefined && partial.k !== this.opts.k) ||
      (partial.pointCount !== undefined && partial.pointCount !== this.opts.pointCount) ||
      (partial.initMethod !== undefined && partial.initMethod !== this.opts.initMethod);

    Object.assign(this.opts, partial);

    if (rebuild) {
      this.recomputeSimulation();
    } else {
      this.updateSceneBuffers();
    }
  }

  private updateSceneBuffers() {
    const step = this.steps[this.currentStepIndex];
    if (!step) return;

    this.stats.currentStepIndex = this.currentStepIndex;
    this.stats.iteration = step.iteration;
    this.stats.phase = step.phase;
    this.stats.activeMessage = step.message;
    this.stats.inertia = step.inertia;
    this.stats.maxDelta = step.maxDelta;
    this.stats.clusterCounts = step.centroids.map(c => c.pointsCount);
    this.stats.centroidsInfo = step.centroids.map(c => ({
      id: c.id,
      label: c.label,
      count: c.pointsCount,
      inertia: c.inertia,
      color: c.color,
    }));

    // 1. Puntos Semánticos
    const pointData: number[] = [];
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const clusterIdx = step.pointAssignments[i];
      const isSel = p.id === this.selectedPointId;

      let col: [number, number, number] = [0.8, 0.85, 0.9];
      if (clusterIdx >= 0 && clusterIdx < CLUSTER_PALETTE.length) {
        col = CLUSTER_PALETTE[clusterIdx];
      }

      // posCluster: (x, y, z, clusterIdx)
      pointData.push(p.pos.x, p.pos.y, p.pos.z, clusterIdx);
      // colorDist: (r, g, b, dist)
      pointData.push(col[0], col[1], col[2], p.distToCentroid);
      // pointId: (id, isSelected, 0, 0)
      pointData.push(p.id, isSel ? 1.0 : 0.0, 0.0, 0.0);
    }

    const pointArray = new Float32Array(pointData);
    this.pointCount = pointData.length / 12;

    if (!this.pointBuffer || this.pointBuffer.size < pointArray.byteLength) {
      this.pointBuffer?.destroy();
      this.pointBuffer = this.device.createBuffer({
        size: Math.max(pointArray.byteLength, 1024),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.device.queue.writeBuffer(this.pointBuffer, 0, pointArray);

    // 2. Centroides Gravitacionales
    const centroidData: number[] = [];
    for (const c of step.centroids) {
      centroidData.push(c.pos.x, c.pos.y, c.pos.z, c.id);
      centroidData.push(c.color[0], c.color[1], c.color[2], c.pointsCount);
    }

    const centroidArray = new Float32Array(centroidData);
    this.centroidCount = centroidData.length / 8;

    if (!this.centroidBuffer || this.centroidBuffer.size < centroidArray.byteLength) {
      this.centroidBuffer?.destroy();
      this.centroidBuffer = this.device.createBuffer({
        size: Math.max(centroidArray.byteLength, 1024),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.device.queue.writeBuffer(this.centroidBuffer, 0, centroidArray);

    // 3. Líneas: Trayectorias + Constelaciones Estelares + Rayo al Centroide
    const lineData: number[] = [];

    // Trayectorias de centroides
    if (this.opts.showTrajectories) {
      for (let c = 0; c < this.opts.k; c++) {
        const hist = this.centroidHistories[c];
        const col = CLUSTER_PALETTE[c % CLUSTER_PALETTE.length];
        if (hist && hist.length > 1) {
          for (let s = 0; s < hist.length - 1; s++) {
            const p1 = hist[s];
            const p2 = hist[s + 1];
            lineData.push(p1.x, p1.y, p1.z, 1.0);
            lineData.push(col[0], col[1], col[2], 0.70);
            lineData.push(p2.x, p2.y, p2.z, 1.0);
            lineData.push(col[0], col[1], col[2], 0.70);
          }
        }
      }
    }

    // Constelaciones k-NN
    if (this.opts.showConstellations && this.intraEdges.length > 0) {
      for (const edge of this.intraEdges) {
        const col = CLUSTER_PALETTE[edge.cluster % CLUSTER_PALETTE.length];
        lineData.push(edge.p1.x, edge.p1.y, edge.p1.z, 2.0);
        lineData.push(col[0], col[1], col[2], 0.18);
        lineData.push(edge.p2.x, edge.p2.y, edge.p2.z, 2.0);
        lineData.push(col[0], col[1], col[2], 0.18);
      }
    }

    // Rayo al centroide del punto seleccionado
    if (this.selectedPointId >= 0) {
      const pt = this.points.find(p => p.id === this.selectedPointId);
      if (pt) {
        const cent = step.centroids[pt.cluster];
        if (cent) {
          lineData.push(pt.pos.x, pt.pos.y, pt.pos.z, 3.0);
          lineData.push(1.0, 1.0, 1.0, 0.95);
          lineData.push(cent.pos.x, cent.pos.y, cent.pos.z, 3.0);
          lineData.push(1.0, 0.85, 0.20, 0.95);
        }
      }
    }

    const lineArray = new Float32Array(lineData);
    this.lineVertexCount = lineData.length / 8;

    if (!this.lineBuffer || this.lineBuffer.size < lineArray.byteLength) {
      this.lineBuffer?.destroy();
      this.lineBuffer = this.device.createBuffer({
        size: Math.max(lineArray.byteLength, 1024),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (this.lineVertexCount > 0) {
      this.device.queue.writeBuffer(this.lineBuffer, 0, lineArray);
    }
  }

  private startLoop() {
    let lastFpsAt = performance.now();
    let frameCount = 0;

    const frame = (timeMs: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = this.lastAt ? Math.min(0.1, (timeMs - this.lastAt) / 1000) : 0.016;
      this.lastAt = timeMs;

      frameCount++;
      if (timeMs - lastFpsAt >= 500) {
        this.stats.fps = Math.round((frameCount * 1000) / (timeMs - lastFpsAt));
        frameCount = 0;
        lastFpsAt = timeMs;
      }

      if (this.opts.autoPlay && this.steps.length > 0) {
        this.stepTimer += dt;
        const interval = 1.0 / Math.max(0.2, this.opts.playbackSpeed);
        if (this.stepTimer >= interval) {
          this.stepTimer = 0;
          if (this.currentStepIndex < this.steps.length - 1) {
            this.currentStepIndex++;
            this.updateSceneBuffers();
          } else {
            this.opts.autoPlay = false;
            this.stats.isPlaying = false;
          }
        }
      }

      this.render(timeMs / 1000);
    };

    this.raf = requestAnimationFrame(frame);
  }

  private render(timeSec: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    if (!this.depthTex || this.depthTex.width !== w || this.depthTex.height !== h) {
      this.depthTex?.destroy();
      this.depthTex = this.device.createTexture({
        size: [w, h],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    this.camera.update();
    const vp = this.camera.viewProj(w / h);
    const proj = this.camera.projection(w / h);

    const cp = this.camera.eye();
    const uniData = new Float32Array(32);
    uniData.set(vp, 0);
    uniData[16] = cp[0];
    uniData[17] = cp[1];
    uniData[18] = cp[2];
    uniData[19] = 1.0;
    uniData[20] = proj[0];
    uniData[21] = proj[5];
    uniData[22] = this.opts.pointSize;
    uniData[23] = timeSec;
    uniData[24] = this.opts.centroidSize;
    uniData[25] = this.opts.showTrajectories ? 1.0 : 0.0;
    uniData[26] = this.opts.showConstellations ? 1.0 : 0.0;
    uniData[27] = this.selectedPointId >= 0 ? this.selectedPointId : -1.0;
    uniData[28] = w;
    uniData[29] = h;

    this.device.queue.writeBuffer(this.uniBuffer, 0, uniData);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.055, g: 0.062, b: 0.078, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTex.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    pass.setBindGroup(0, this.renderBG);

    // 1. Líneas de Trayectoria y Constelaciones
    if (this.lineBuffer && this.lineVertexCount > 0) {
      pass.setPipeline(this.linePipeline);
      pass.setVertexBuffer(0, this.lineBuffer);
      pass.draw(this.lineVertexCount, 1, 0, 0);
    }

    // 2. Puntos Semánticos
    if (this.pointBuffer && this.pointCount > 0) {
      pass.setPipeline(this.pointPipeline);
      pass.setVertexBuffer(0, this.pointBuffer);
      pass.draw(6, this.pointCount, 0, 0);
    }

    // 3. Centroides Gravitacionales
    if (this.centroidBuffer && this.centroidCount > 0) {
      pass.setPipeline(this.centroidPipeline);
      pass.setVertexBuffer(0, this.centroidBuffer);
      pass.draw(6, this.centroidCount, 0, 0);
    }

    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  goHome() {
    this.camera.goHome();
  }

  get roamed(): boolean {
    const c = this.camera;
    return Math.abs(c.distance - this.homeDist) > this.homeDist * 0.03
        || Math.abs(c.theta - 0.55) > 0.03;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.camera.dispose();
    this.depthTex?.destroy();
    this.uniBuffer?.destroy();
    this.pointBuffer?.destroy();
    this.centroidBuffer?.destroy();
    this.lineBuffer?.destroy();
  }
}
