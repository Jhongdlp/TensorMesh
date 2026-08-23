/**
 * Sala 05 — MCTS (Monte Carlo Tree Search & Tree-of-Thoughts)
 * Motor WebGPU de renderizado fractal con pulsos de retropropagación y Vía Dorada.
 */

import { OrbitCamera } from "../../galaxy/gpu/camera";
import {
  REASONING_PRESETS,
  type ReasoningPreset,
  type MCTSNode,
  type MCTSLink,
  type MCTSPlaybackStep,
} from "./math";
import mctsRenderWGSL from "./mcts_render.wgsl?raw";

export interface MctsOptions {
  presetId: string;
  cPuct: number;
  nodeSize: number;
  edgeAlpha: number;
  showLevelRings: boolean;
  playbackSpeed: number;
  autoPlay: boolean;
}

export const DEFAULTS: MctsOptions = {
  presetId: "math_proof",
  cPuct: 1.414,
  nodeSize: 0.018,
  edgeAlpha: 0.45,
  showLevelRings: true,
  playbackSpeed: 1.5,
  autoPlay: true,
};

export interface EngineStats {
  fps: number;
  currentStepIndex: number;
  totalSteps: number;
  totalNodes: number;
  totalLinks: number;
  currentPhase: string;
  activeMessage: string;
  rootValue: number;
  goldenLength: number;
  prunedCount: number;
  isPlaying: boolean;
  hoveredNode: { id: number; label: string; value: number; visits: number; reward: number; depth: number } | null;
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

export class MctsEngine {
  readonly camera = new OrbitCamera();
  opts: MctsOptions = { ...DEFAULTS };

  nodes: MCTSNode[] = [];
  links: MCTSLink[] = [];
  steps: MCTSPlaybackStep[] = [];
  goldenPath: number[] = [];
  currentStepIndex = 0;

  stats: EngineStats = {
    fps: 0,
    currentStepIndex: 0,
    totalSteps: 0,
    totalNodes: 1,
    totalLinks: 0,
    currentPhase: "select",
    activeMessage: "Iniciando búsqueda...",
    rootValue: 0.5,
    goldenLength: 0,
    prunedCount: 0,
    isPlaying: true,
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
  private ringBuffer!: GPUBuffer;

  private nodeCount = 0;
  private lineVertexCount = 0;

  // Pipelines
  private nodePipeline!: GPURenderPipeline;
  private linePipeline!: GPURenderPipeline;
  private ringPipeline!: GPURenderPipeline;
  private renderBG!: GPUBindGroup;

  constructor(
    private device: GPUDevice,
    private canvas: HTMLCanvasElement,
    opts?: Partial<MctsOptions>
  ) {
    Object.assign(this.opts, opts);
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.fmt, alphaMode: "opaque" });

    this.camera.theta = 0.45;
    this.camera.phi = 0.65;
    this.camera.frame(3.8);
    this.homeDist = this.camera.distance;
    this.camera.attach(canvas);

    this.setupInteractivity();
    this.initPipelines();
    this.loadPreset(this.opts.presetId);
    this.startLoop();
  }

  private setupInteractivity() {
    this.canvas.addEventListener("pointermove", (e) => {
      if (this.nodes.length === 0) return;
      const rect = this.canvas.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      // Hit-testing en espacio de pantalla aproximado
      let closest: MCTSNode | null = null;
      let minDist = 0.12;

      for (const n of this.nodes) {
        // Distancia euclidiana 2D en plano
        const dx = n.pos.x * 0.4 - normX;
        const dy = (n.pos.y - 0.4) * 0.4 - normY;
        const d = Math.hypot(dx, dy);
        if (d < minDist) {
          minDist = d;
          closest = n;
        }
      }

      if (closest) {
        this.stats.hoveredNode = {
          id: closest.id,
          label: closest.label,
          value: closest.value,
          visits: closest.visits,
          reward: closest.reward,
          depth: closest.depth,
        };
      } else {
        this.stats.hoveredNode = null;
      }
    });
  }

  private initPipelines() {
    const sm = this.device.createShaderModule({ code: mctsRenderWGSL });

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

    this.ringPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: sm,
        entryPoint: "vsRing",
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
        entryPoint: "fsRing",
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

    const R = 1.4;
    const ringVerts = new Float32Array([
      -R, 0, -R, 0, 0,
       R, 0, -R, 1, 0,
       R, 0,  R, 1, 1,
      -R, 0, -R, 0, 0,
       R, 0,  R, 1, 1,
      -R, 0,  R, 0, 1,
    ]);
    this.ringBuffer = this.device.createBuffer({
      size: ringVerts.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.ringBuffer, 0, ringVerts);
  }

  loadPreset(presetId: string) {
    this.opts.presetId = presetId;
    const preset = REASONING_PRESETS.find(p => p.id === presetId) || REASONING_PRESETS[0];
    const data = preset.generateTree(this.opts.cPuct);

    this.nodes = data.nodes;
    this.links = data.links;
    this.steps = data.steps;
    this.goldenPath = data.goldenPath;

    this.currentStepIndex = 0;
    this.stats.totalSteps = this.steps.length;
    this.stats.totalNodes = this.nodes.length;
    this.stats.totalLinks = this.links.length;
    this.stats.goldenLength = this.goldenPath.length;
    this.stats.prunedCount = this.nodes.filter(n => n.state === "pruned").length;
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
    this.updateSceneBuffers();
  }

  reset() {
    this.currentStepIndex = 0;
    this.updateSceneBuffers();
  }

  set(partial: Partial<MctsOptions>) {
    const rebuild = partial.presetId !== undefined || (partial.cPuct !== undefined && partial.cPuct !== this.opts.cPuct);
    Object.assign(this.opts, partial);

    if (rebuild) {
      this.loadPreset(this.opts.presetId);
    } else {
      this.updateSceneBuffers();
    }
  }

  private updateSceneBuffers() {
    const step = this.steps[this.currentStepIndex];
    if (!step) return;

    this.stats.currentStepIndex = this.currentStepIndex;
    this.stats.currentPhase = step.phase;
    this.stats.activeMessage = step.message;
    this.stats.rootValue = this.nodes[0]?.value || 0.5;

    const isFinal = this.currentStepIndex === this.steps.length - 1;
    const activePathSet = new Set(step.activePathIds);

    // 1. Nodos de Pensamiento
    const nodeData: number[] = [];

    for (const n of this.nodes) {
      const isActive = n.id === step.activeNodeId;
      const isPath = activePathSet.has(n.id);
      const isGolden = isFinal && n.isGolden;
      const isPruned = isFinal && n.state === "pruned";

      let stateCode = 0.0; // unvisited
      let r = 0.7, g = 0.75, b = 0.85;

      if (isGolden) {
        stateCode = 3.0; // golden
        r = 1.0; g = 0.85; b = 0.20;
      } else if (step.phase === "backprop" && isPath) {
        stateCode = 2.0; // backprop pulse
        r = 0.20; g = 0.85; b = 1.00;
      } else if (isActive) {
        stateCode = 1.0; // active
        r = 0.30; g = 0.98; b = 0.55;
      } else if (isPruned) {
        stateCode = 4.0; // pruned
        r = 0.40; g = 0.35; b = 0.40;
      }

      // posDepth: (x, y, z, depth)
      nodeData.push(n.pos.x, n.pos.y, n.pos.z, n.depth);
      // colorState: (r, g, b, stateCode)
      nodeData.push(r, g, b, stateCode);
      // metrics: (visits, value, reward, isGolden)
      nodeData.push(n.visits, n.value, n.reward, isGolden ? 1.0 : 0.0);
    }

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

    // 2. Líneas y Enlaces Sinápticos
    const lineData: number[] = [];

    for (const link of this.links) {
      const u = this.nodes[link.fromId];
      const v = this.nodes[link.toId];
      if (!u || !v) continue;

      const isPathLink = activePathSet.has(link.fromId) && activePathSet.has(link.toId);
      const isGoldenLink = isFinal && link.isGolden;

      let linkType = 1.0; // normal
      let r = 0.6, g = 0.65, b = 0.75, a = 0.35;

      if (isGoldenLink) {
        linkType = 4.0; // golden
        r = 1.0; g = 0.85; b = 0.20; a = 0.95;
      } else if (step.phase === "backprop" && isPathLink) {
        linkType = 3.0; // backprop pulse
        r = 0.20; g = 0.85; b = 1.00; a = 0.90;
      } else if (isPathLink) {
        linkType = 2.0; // active path
        r = 0.30; g = 0.98; b = 0.55; a = 0.75;
      }

      lineData.push(u.pos.x, u.pos.y, u.pos.z, linkType);
      lineData.push(r, g, b, a);
      lineData.push(v.pos.x, v.pos.y, v.pos.z, linkType);
      lineData.push(r, g, b, a);
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

    const uniData = new Float32Array(32);
    uniData.set(vp, 0);
    uniData[16] = proj[0];
    uniData[17] = proj[5];
    uniData[18] = 1.0;
    uniData[19] = timeSec;
    uniData[20] = this.opts.nodeSize;
    uniData[21] = this.opts.edgeAlpha;
    uniData[22] = 0.0;
    uniData[23] = 0.0;
    uniData[24] = this.opts.showLevelRings ? 1.0 : 0.0;

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

    // 1. Anillos de Profundidad
    if (this.opts.showLevelRings && this.ringBuffer) {
      pass.setPipeline(this.ringPipeline);
      pass.setVertexBuffer(0, this.ringBuffer);
      pass.draw(6, 4, 0, 0);
    }

    // 2. Líneas y Enlaces Sinápticos
    if (this.lineBuffer && this.lineVertexCount > 0) {
      pass.setPipeline(this.linePipeline);
      pass.setVertexBuffer(0, this.lineBuffer);
      pass.draw(this.lineVertexCount, 1, 0, 0);
    }

    // 3. Nodos de Pensamiento
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
        || Math.abs(c.theta - 0.45) > 0.03;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.camera.dispose();
    this.depthTex?.destroy();
    this.uniBuffer?.destroy();
    this.nodeBuffer?.destroy();
    this.lineBuffer?.destroy();
    this.ringBuffer?.destroy();
  }
}
