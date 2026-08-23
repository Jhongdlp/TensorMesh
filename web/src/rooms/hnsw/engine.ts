/** Sala 04 — HNSW (Hierarchical Navigable Small World).
 *
 *  Motor WebGPU de alta fidelidad:
 *  - Nodos como "Focos de Luz" que se encienden con halo bloom en cada salto.
 *  - Interacción táctil y de ratón directa sobre el plano 3D (Click para buscar).
 *  - Conductos verticales de energía animados y radares concéntricos.
 */

import { OrbitCamera } from "../../galaxy/gpu/camera";
import {
  HNSWIndex,
  DATASET_PRESETS,
  dist2D,
  type DatasetPreset,
  type Vec2D,
  type SearchStep,
  type SearchResult,
} from "./math";
import hnswRenderWGSL from "./hnsw_render.wgsl?raw";

export interface HnswOptions {
  datasetId: string;
  M: number;
  efSearch: number;
  K: number;
  layerSpacing: number;
  activeLayer: number;
  nodeSize: number;
  edgeAlpha: number;
  interLayerAlpha: number;
  showGridPlanes: boolean;
  playbackSpeed: number;
  autoPlay: boolean;
}

export const DEFAULTS: HnswOptions = {
  datasetId: "clusters",
  M: 8,
  efSearch: 16,
  K: 5,
  layerSpacing: 1.45,
  activeLayer: -1,
  nodeSize: 0.016,
  edgeAlpha: 0.35,
  interLayerAlpha: 0.30,
  showGridPlanes: true,
  playbackSpeed: 1.5,
  autoPlay: true,
};

export interface EngineStats {
  fps: number;
  currentStepIndex: number;
  totalSteps: number;
  currentLayer: number;
  currentNodeId: number;
  currentNodeLabel: string;
  totalComparisons: number;
  bruteForceComparisons: number;
  recall: number;
  activeMessage: string;
  topK: { nodeId: number; dist: number; label: string }[];
  isPlaying: boolean;
  l2Count: number;
  l1Count: number;
  l0Count: number;
  hoveredNode: { id: number; label: string; dist: number; layer: number } | null;
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

const CATEGORY_COLORS: [number, number, number][] = [
  [0.20, 0.88, 1.00], // Cian celeste
  [1.00, 0.40, 0.75], // Magenta
  [1.00, 0.85, 0.20], // Ámbar oro
  [0.30, 0.98, 0.60], // Esmeralda
  [0.80, 0.60, 1.00], // Lavanda
];

export class HnswEngine {
  readonly camera = new OrbitCamera();
  opts: HnswOptions = { ...DEFAULTS };

  index!: HNSWIndex;
  searchResult!: SearchResult;
  currentStepIndex = 0;
  queryPos: Vec2D = { x: 0.12, z: 0.15 };

  stats: EngineStats = {
    fps: 0,
    currentStepIndex: 0,
    totalSteps: 0,
    currentLayer: 2,
    currentNodeId: 0,
    currentNodeLabel: "",
    totalComparisons: 0,
    bruteForceComparisons: 0,
    recall: 1.0,
    activeMessage: "Iniciando búsqueda...",
    topK: [],
    isPlaying: true,
    l2Count: 6,
    l1Count: 28,
    l0Count: 160,
    hoveredNode: null,
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
  private nodeBuffer!: GPUBuffer;
  private lineBuffer!: GPUBuffer;
  private gridBuffer!: GPUBuffer;

  private nodeCount = 0;
  private lineVertexCount = 0;

  // Pipelines
  private nodePipeline!: GPURenderPipeline;
  private linePipeline!: GPURenderPipeline;
  private gridPipeline!: GPURenderPipeline;
  private renderBG!: GPUBindGroup;

  constructor(
    private device: GPUDevice,
    private canvas: HTMLCanvasElement,
    opts?: Partial<HnswOptions>
  ) {
    Object.assign(this.opts, opts);
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.fmt, alphaMode: "opaque" });

    this.camera.theta = 0.55;
    this.camera.phi = 0.72;
    this.camera.frame(3.5);
    this.homeDist = this.camera.distance;
    this.camera.attach(canvas);

    this.setupInteractivity();
    this.initPipelines();
    this.loadDataset(this.opts.datasetId);
    this.startLoop();
  }

  // Interacción táctil / click para situar la Query en el plano 3D
  private setupInteractivity() {
    let downX = 0, downY = 0;

    this.canvas.addEventListener("pointerdown", (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    this.canvas.addEventListener("pointerup", (e) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      // Si fue un click limpio (sin arrastre de cámara)
      if (dist < 5) {
        const rect = this.canvas.getBoundingClientRect();
        const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

        // Mapear coordenadas NDC a espacio de plano (XZ)
        const targetX = Math.max(-0.88, Math.min(0.88, normX * 1.1));
        const targetZ = Math.max(-0.88, Math.min(0.88, normY * 1.1));

        this.setQuery({ x: targetX, z: targetZ });
      }
    });

    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.index) return;
      const rect = this.canvas.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      const mousePlane = { x: normX * 1.1, z: normY * 1.1 };

      // Encontrar nodo más cercano bajo el puntero
      let closest: { id: number; dist: number } | null = null;
      for (const n of this.index.nodes) {
        const d = dist2D(mousePlane, n.pos);
        if (d < 0.15 && (!closest || d < closest.dist)) {
          closest = { id: n.id, dist: d };
        }
      }

      if (closest) {
        const n = this.index.nodes[closest.id];
        this.stats.hoveredNode = {
          id: n.id,
          label: n.label,
          dist: dist2D(this.queryPos, n.pos),
          layer: n.maxLevel,
        };
      } else {
        this.stats.hoveredNode = null;
      }
    });
  }

  private initPipelines() {
    const sm = this.device.createShaderModule({ code: hnswRenderWGSL });

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

    this.gridPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: sm,
        entryPoint: "vsGrid",
        buffers: [
          {
            arrayStride: 5 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 3 * 4, format: "float32x2" },
            ],
          },
        ],
      },
      fragment: {
        module: sm,
        entryPoint: "fsGrid",
        targets: [{ format: this.fmt, blend: blendAlpha }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less-equal",
        format: "depth24plus",
      },
    });

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

    this.nodePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: sm,
        entryPoint: "vsNode",
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
        entryPoint: "fsNode",
        targets: [{ format: this.fmt, blend: blendAlpha }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less-equal",
        format: "depth24plus",
      },
    });

    const R = 1.35;
    const gridVerts = new Float32Array([
      -R, 0, -R, 0, 0,
       R, 0, -R, 1, 0,
       R, 0,  R, 1, 1,
      -R, 0, -R, 0, 0,
       R, 0,  R, 1, 1,
      -R, 0,  R, 0, 1,
    ]);
    this.gridBuffer = this.device.createBuffer({
      size: gridVerts.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.gridBuffer, 0, gridVerts);
  }

  loadDataset(presetId: string) {
    this.opts.datasetId = presetId;
    const preset = DATASET_PRESETS.find(p => p.id === presetId) || DATASET_PRESETS[0];
    const nodes = preset.generate();

    this.index = new HNSWIndex(nodes, this.opts.M, 32);

    this.stats.l2Count = this.index.layers[2]?.size || 0;
    this.stats.l1Count = this.index.layers[1]?.size || 0;
    this.stats.l0Count = this.index.layers[0]?.size || 0;

    if (nodes.length > 0) {
      const sample = nodes[Math.floor(nodes.length * 0.4)];
      this.queryPos = {
        x: Math.max(-0.85, Math.min(0.85, sample.pos.x + (Math.random() - 0.5) * 0.18)),
        z: Math.max(-0.85, Math.min(0.85, sample.pos.z + (Math.random() - 0.5) * 0.18)),
      };
    }

    this.runSearch();
  }

  setQuery(pos: Vec2D) {
    this.queryPos = { ...pos };
    this.runSearch();
  }

  runSearch() {
    this.searchResult = this.index.searchRecorded(this.queryPos, this.opts.K, this.opts.efSearch);
    this.currentStepIndex = 0;
    this.stats.totalSteps = this.searchResult.steps.length;
    this.stats.bruteForceComparisons = this.searchResult.bruteForceComparisons;
    this.stats.recall = this.searchResult.recall;
    this.stats.isPlaying = this.opts.autoPlay;
    this.updateSceneBuffers();
  }

  play() {
    this.opts.autoPlay = true;
    this.stats.isPlaying = true;
  }

  pause() {
    this.opts.autoPlay = false;
    this.stats.isPlaying = false;
  }

  stepForward() {
    if (this.currentStepIndex < this.searchResult.steps.length - 1) {
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
    this.currentStepIndex = Math.max(0, Math.min(this.searchResult.steps.length - 1, stepIdx));
    this.updateSceneBuffers();
  }

  reset() {
    this.currentStepIndex = 0;
    this.updateSceneBuffers();
  }

  set(partial: Partial<HnswOptions>) {
    const rebuild = partial.M !== undefined && partial.M !== this.opts.M;
    const reSearch = (partial.efSearch !== undefined && partial.efSearch !== this.opts.efSearch) ||
                     (partial.K !== undefined && partial.K !== this.opts.K);

    Object.assign(this.opts, partial);

    if (rebuild || partial.datasetId) {
      this.loadDataset(this.opts.datasetId);
    } else if (reSearch) {
      this.runSearch();
    } else {
      this.updateSceneBuffers();
    }
  }

  // Sincronización de focos de luz y geometría
  private updateSceneBuffers() {
    const step = this.searchResult.steps[this.currentStepIndex];
    if (!step) return;

    const currNode = this.index.nodes[step.currentNodeId];
    this.stats.currentStepIndex = this.currentStepIndex;
    this.stats.currentLayer = step.layer;
    this.stats.currentNodeId = step.currentNodeId;
    this.stats.currentNodeLabel = currNode?.label || ("Nodo #" + step.currentNodeId);
    this.stats.totalComparisons = step.totalComparisons;
    this.stats.activeMessage = step.message;
    this.stats.topK = this.searchResult.topK.map(t => ({
      nodeId: t.nodeId,
      dist: t.dist,
      label: this.index.nodes[t.nodeId]?.label || ("Nodo #" + t.nodeId),
    }));

    // Conjunto de nodos que han sido visitados en el camino histórico
    const visitedInPath = new Set<string>();
    for (let s = 0; s <= this.currentStepIndex; s++) {
      const st = this.searchResult.steps[s];
      visitedInPath.add(`${st.layer}-${st.currentNodeId}`);
    }

    const topKSet = new Set(this.searchResult.topK.map(t => t.nodeId));
    const evaluatedSet = new Set(step.evaluatedNeighbors.map(e => e.nodeId));
    const isFinalStep = this.currentStepIndex === this.searchResult.steps.length - 1;

    // 1. Instancias de Focos de Luz
    const nodeData: number[] = [];

    for (let l = 0; l <= 2; l++) {
      const layerMap = this.index.layers[l];
      if (!layerMap) continue;

      for (const [nodeId] of layerMap) {
        const n = this.index.nodes[nodeId];
        if (!n) continue;

        const isCurrent = (nodeId === step.currentNodeId && l === step.layer);
        const isPathVisited = visitedInPath.has(`${l}-${nodeId}`);
        const isTopK = (isFinalStep && topKSet.has(nodeId) && l === 0);
        const isEvaluated = (evaluatedSet.has(nodeId) && l === step.layer);

        const catCol = CATEGORY_COLORS[(n.category || 0) % CATEGORY_COLORS.length];
        let r = catCol[0], g = catCol[1], b = catCol[2];
        let isLit = 0.3; // Nivel de encendido: 0.3 = tenue/reposo

        if (isCurrent) {
          // Foco activo en el paso actual (destello oro radiante)
          r = 1.0; g = 0.95; b = 0.20;
          isLit = 2.0;
        } else if (isTopK) {
          // Foco Top-K ganador (esmeralda brillante)
          r = 0.20; g = 1.0; b = 0.50;
          isLit = 1.6;
        } else if (isPathVisited) {
          // Foco del camino histórico (permanece encendido cálido)
          r = 1.0; g = 0.85; b = 0.30;
          isLit = 1.0;
        } else if (isEvaluated) {
          const evalItem = step.evaluatedNeighbors.find(e => e.nodeId === nodeId);
          if (evalItem?.isCloser) {
            r = 0.25; g = 1.0; b = 0.50;
            isLit = 1.2;
          } else {
            r = 1.00; g = 0.25; b = 0.25;
            isLit = 0.6;
          }
        }

        // posLayer: (x, 0, z, layer)
        nodeData.push(n.pos.x, 0.0, n.pos.z, l);
        // colorState: (r, g, b, isLit)
        nodeData.push(r, g, b, isLit);
        // status: (isQuery, isCurrent, isTopK, isEvaluated)
        nodeData.push(0.0, isCurrent ? 1.0 : 0.0, isTopK ? 1.0 : 0.0, isEvaluated ? 1.0 : 0.0);
      }
    }

    // Marcador radiante de la Query en la capa activa
    nodeData.push(this.queryPos.x, 0.0, this.queryPos.z, step.layer);
    nodeData.push(1.0, 0.85, 0.15, 2.2);
    nodeData.push(1.0, 0.0, 0.0, 0.0);

    const nodeArray = new Float32Array(nodeData);
    this.nodeCount = nodeData.length / 12;

    if (!this.nodeBuffer || this.nodeBuffer.size < nodeArray.byteLength) {
      this.nodeBuffer?.destroy();
      this.nodeBuffer = this.device.createBuffer({
        size: Math.max(nodeArray.byteLength, 1024),
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.device.queue.writeBuffer(this.nodeBuffer, 0, nodeArray);

    // 2. Líneas, Rayos y Conductos
    const lineData: number[] = [];

    // Baliza láser vertical de la Query
    const yTop = 1.35 * this.opts.layerSpacing;
    const yBot = -1.35 * this.opts.layerSpacing;
    lineData.push(this.queryPos.x, yTop, this.queryPos.z, 99.0);
    lineData.push(1.0, 0.85, 0.20, 5.0);
    lineData.push(this.queryPos.x, yBot, this.queryPos.z, 99.0);
    lineData.push(1.0, 0.85, 0.20, 5.0);

    // Aristas intra-capa
    for (let l = 0; l <= 2; l++) {
      const layerMap = this.index.layers[l];
      if (!layerMap) continue;

      for (const [u, neighbors] of layerMap) {
        const uNode = this.index.nodes[u];
        if (!uNode) continue;

        for (const v of neighbors) {
          if (u < v) {
            const vNode = this.index.nodes[v];
            if (!vNode) continue;

            lineData.push(uNode.pos.x, 0.0, uNode.pos.z, l);
            lineData.push(0.85, 0.88, 0.95, 1.0);
            lineData.push(vNode.pos.x, 0.0, vNode.pos.z, l);
            lineData.push(0.85, 0.88, 0.95, 1.0);
          }
        }
      }
    }

    // Conductos verticales con pulso descendente (tipo 6.0)
    if (this.opts.interLayerAlpha > 0.01) {
      for (const n of this.index.nodes) {
        if (n.maxLevel > 0) {
          for (let l = 0; l < n.maxLevel; l++) {
            const y1 = (l - 1.0) * this.opts.layerSpacing;
            const y2 = (l + 1 - 1.0) * this.opts.layerSpacing;
            lineData.push(n.pos.x, y1, n.pos.z, 99.0);
            lineData.push(0.35, 0.75, 1.00, 6.0);
            lineData.push(n.pos.x, y2, n.pos.z, 99.0);
            lineData.push(0.35, 0.75, 1.00, 6.0);
          }
        }
      }
    }

    // Circuito electrificado de camino recorrido (Línea dorada brillante)
    for (let s = 1; s <= this.currentStepIndex; s++) {
      const prev = this.searchResult.steps[s - 1];
      const cur = this.searchResult.steps[s];
      if (prev.currentNodeId !== cur.currentNodeId || prev.layer !== cur.layer) {
        const pNode = this.index.nodes[prev.currentNodeId];
        const cNode = this.index.nodes[cur.currentNodeId];
        if (pNode && cNode) {
          const y1 = (prev.layer - 1.0) * this.opts.layerSpacing;
          const y2 = (cur.layer - 1.0) * this.opts.layerSpacing;
          lineData.push(pNode.pos.x, y1, pNode.pos.z, 99.0);
          lineData.push(1.0, 0.85, 0.20, 2.0);
          lineData.push(cNode.pos.x, y2, cNode.pos.z, 99.0);
          lineData.push(1.0, 0.85, 0.20, 2.0);
        }
      }
    }

    // Rayos de sondeo activos en el paso actual
    const activeNode = this.index.nodes[step.currentNodeId];
    if (activeNode) {
      for (const probe of step.evaluatedNeighbors) {
        const nbNode = this.index.nodes[probe.nodeId];
        if (nbNode) {
          lineData.push(activeNode.pos.x, 0.0, activeNode.pos.z, step.layer);
          lineData.push(probe.isCloser ? 0.20 : 1.00, probe.isCloser ? 1.00 : 0.20, 0.25, probe.isCloser ? 3.0 : 4.0);
          lineData.push(nbNode.pos.x, 0.0, nbNode.pos.z, step.layer);
          lineData.push(probe.isCloser ? 0.20 : 1.00, probe.isCloser ? 1.00 : 0.20, 0.25, probe.isCloser ? 3.0 : 4.0);
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
    this.device.queue.writeBuffer(this.lineBuffer, 0, lineArray);
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

      if (this.opts.autoPlay && this.searchResult) {
        this.stepTimer += dt;
        const interval = 1.0 / Math.max(0.2, this.opts.playbackSpeed);
        if (this.stepTimer >= interval) {
          this.stepTimer = 0;
          if (this.currentStepIndex < this.searchResult.steps.length - 1) {
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

    const uniData = new Float32Array(32);
    uniData.set(vp, 0);
    uniData[16] = proj[0];
    uniData[17] = proj[5];
    uniData[18] = this.opts.layerSpacing;
    uniData[19] = this.opts.activeLayer;
    uniData[20] = timeSec;
    uniData[21] = this.opts.nodeSize;
    uniData[22] = this.opts.edgeAlpha;
    uniData[23] = this.opts.interLayerAlpha;
    uniData[24] = this.queryPos.x;
    uniData[25] = this.queryPos.z;
    uniData[26] = this.opts.showGridPlanes ? 1.0 : 0.0;
    uniData[27] = 0.0;

    this.device.queue.writeBuffer(this.uniBuffer, 0, uniData);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.10, g: 0.105, b: 0.115, a: 1.0 },
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

    // 1. Láminas de Capas
    if (this.opts.showGridPlanes && this.gridBuffer) {
      pass.setPipeline(this.gridPipeline);
      pass.setVertexBuffer(0, this.gridBuffer);
      pass.draw(6, 3, 0, 0);
    }

    // 2. Aristas y Rayos
    if (this.lineBuffer && this.lineVertexCount > 0) {
      pass.setPipeline(this.linePipeline);
      pass.setVertexBuffer(0, this.lineBuffer);
      pass.draw(this.lineVertexCount, 1, 0, 0);
    }

    // 3. Focos de Luz
    if (this.nodeBuffer && this.nodeCount > 0) {
      pass.setPipeline(this.nodePipeline);
      pass.setVertexBuffer(0, this.nodeBuffer);
      pass.draw(6, this.nodeCount, 0, 0);
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
    this.nodeBuffer?.destroy();
    this.lineBuffer?.destroy();
    this.gridBuffer?.destroy();
  }
}
