/**
 * Sala 07 — Red Neuronal. Motor de dibujo.
 *
 * La red se entrena en `math.ts`, en CPU; aquí sólo se traduce a geometría y
 * se sube a la GPU. El reparto de la escena es la idea entera de la sala:
 *
 *   - **abajo**, el suelo: el cuadrado de entrada con la nube de puntos y, en
 *     color, lo que la red contesta en cada punto de ese cuadrado. Es la
 *     *función*.
 *   - **arriba**, la red: neuronas y pesos. Son los *coeficientes* de esa
 *     función.
 *
 * Mirar los dos a la vez es lo único que convierte «una matriz cambió» en
 * «la frontera se dobló». Por eso la cámara arranca de tres cuartos y no de
 * frente: de frente la red se lee como un diagrama de libro y el suelo
 * desaparece en una línea.
 */

import { OrbitCamera } from "../../galaxy/gpu/camera";
import {
  Mlp, DATASETS, datasetById, mulberry32, fieldColor, weightColor,
  CLASS_A, CLASS_B, type ActId, type Pt,
} from "./math.mjs";
import {
  FLOOR_Y, FLOOR_HALF, R_HIDDEN, R_EDGE,
  CAM, AXIS_X, AXIS_Y, nodeLayout, nodeIndex,
} from "./layout.mjs";
import nnRenderWGSL from "./nn_render.wgsl?raw";

// --------------------------------------------------------------- constantes

/** Resolución del campo de decisión. 128² son 16.384 pasos hacia delante cada
 *  vez que se refresca: ~4 ms con la red de casa, y a 5,5 Hz no se nota. Por
 *  debajo de 128 el borde de la frontera se ve escalonado en el canto lejano
 *  del plano, donde un texel abarca varios píxeles; por encima, el filtrado
 *  bilineal ya no deja ver la diferencia y el refresco pasa a costar más que
 *  el entrenamiento que lo motivó. Y 128 · 4 son 512 bytes por fila, múltiplo
 *  de 256: la alineación que pediría una copia desde búfer, gratis. */
const FIELD_RES = 128;
/** Cada cuánto se recalculan suelo, aristas y neuronas. Es el pulso visible de
 *  la sala; atarlo al frame no cambia nada que se pueda ver y multiplica por
 *  diez el coste. */
const REFRESH_MS = 180;
/** El ciclo ilustrado: ida, vuelta y actualización. No es el reloj del
 *  entrenamiento —a velocidad alta caben cientos de lotes dentro— sino el de
 *  la explicación. */
const CYCLE_MS = 1500;
const T_FWD = 0.42, T_BWD = 0.78;

export { AXIS_X, AXIS_Y };

export const MAX_HIDDEN_LAYERS = 4;
export const MAX_UNITS = 12;
export const MIN_UNITS = 1;

// ----------------------------------------------------------------- opciones

export interface Options {
  datasetId: string;
  hidden: number[];
  act: ActId;
  lr: number;
  batch: number;
  noise: number;
  samples: number;
  /** Lotes por segundo. La cifra que de verdad manda en lo rápido que aprende. */
  speed: number;
  running: boolean;
  showPoints: boolean;
  showPulses: boolean;
  fieldAlpha: number;
  edgeAlpha: number;
}

export const DEFAULTS: Options = {
  datasetId: "circle",
  hidden: [6, 6],
  act: "tanh",
  lr: 0.12,
  batch: 16,
  noise: 0.12,
  samples: 420,
  speed: 40,
  running: true,
  showPoints: true,
  showPulses: true,
  fieldAlpha: 0.92,
  edgeAlpha: 1.0,
};

export interface NeuronInfo {
  layer: number;
  unit: number;
  /** `x₁`, `h1.3`, `salida`. Lo escribe el motor porque el nombre depende de
   *  la arquitectura, no del idioma. */
  tag: string;
  kind: "input" | "hidden" | "output";
  bias: number;
  mean: number;
  /** Pesos que entran, ya ordenados por magnitud: los tres primeros son la
   *  respuesta a «¿de qué depende esta neurona?». */
  wIn: { from: string; w: number }[];
  dead: boolean;
}

export interface Stats {
  fps: number;
  batches: number;
  epochs: number;
  lossTrain: number;
  lossTest: number;
  acc: number;
  accTest: number;
  phase: "fwd" | "bwd" | "upd";
  history: { tr: number; te: number }[];
  arch: number[];
  dead: number;
  selected: NeuronInfo | null;
  hovered: NeuronInfo | null;
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

interface Node3 { x: number; y: number; z: number; layer: number; unit: number; }

export class NnEngine {
  readonly camera = new OrbitCamera();
  opts: Options = { ...DEFAULTS };
  readonly stats: Stats = {
    fps: 0, batches: 0, epochs: 0,
    lossTrain: 0, lossTest: 0, acc: 0, accTest: 0,
    phase: "fwd", history: [], arch: [2, 6, 6, 1], dead: 0,
    selected: null, hovered: null,
  };

  private ctx: GPUCanvasContext;
  private fmt: GPUTextureFormat;
  private raf = 0;
  private lastAt = 0;
  private depthTex: GPUTexture | null = null;
  private homeDist = 0;

  // --------------------------------------------------------------- el modelo
  private net!: Mlp;
  private train: Pt[] = [];
  private test: Pt[] = [];
  private order!: Int32Array;
  private cursor = 0;
  private seed = 1;
  private debt = 0;
  private pending = 0;
  private meanAct: Float32Array[] = [];
  private nodes: Node3[] = [];
  private clock = 0;
  private sinceRefresh = 1e9;
  private flash = 0;

  // ------------------------------------------------------------- lo de la GPU
  private uni!: GPUBuffer;
  private gridBuf!: GPUBuffer;
  private edgeBuf!: GPUBuffer;
  private pointBuf!: GPUBuffer;
  private neuronBuf!: GPUBuffer;
  private pulseBuf!: GPUBuffer;
  private tex!: GPUTexture;
  private bg!: GPUBindGroup;
  private bgl!: GPUBindGroupLayout;

  private floorPipe!: GPURenderPipeline;
  private gridPipe!: GPURenderPipeline;
  private edgePipe!: GPURenderPipeline;
  private nodePipe!: GPURenderPipeline;
  private pointPipe!: GPURenderPipeline;
  private pulsePipe!: GPURenderPipeline;

  private gridVerts = 0;
  private edgeVerts = 0;
  private pointCount = 0;
  private neuronCount = 0;
  private pulseCount = 0;

  private fieldF = new Float32Array(FIELD_RES * FIELD_RES);
  private fieldB = new Uint8Array(FIELD_RES * FIELD_RES * 4);

  // Lo que hace falta para apuntar a una neurona con el ratón: la última
  // matriz de vista-proyección y el tamaño del lienzo en píxeles de CSS.
  private lastVP: Float32Array | null = null;
  private cssW = 1;
  private cssH = 1;
  private selIdx = -1;
  private hovIdx = -1;
  private downX = 0;
  private downY = 0;

  constructor(
    private device: GPUDevice,
    private canvas: HTMLCanvasElement,
    opts?: Partial<Options>,
  ) {
    Object.assign(this.opts, opts);
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.fmt, alphaMode: "opaque" });

    this.initGpu();
    this.rebuildData();
    this.rebuildNet();
    this.buildGrid();

    this.camera.target = [CAM.target[0], CAM.target[1], CAM.target[2]];
    this.camera.theta = CAM.theta;
    this.camera.phi = CAM.phi;
    this.camera.frame(CAM.radius);
    this.homeDist = this.camera.distance;
    this.camera.attach(canvas);
    this.attachPicking();

    this.raf = requestAnimationFrame(this.loop);
  }

  // ============================================================== inicializar

  private initGpu() {
    const d = this.device;
    const V = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;

    this.uni = d.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.gridBuf = d.createBuffer({ size: 64 * 1024, usage: V });
    this.edgeBuf = d.createBuffer({ size: 256 * 1024, usage: V });
    this.pointBuf = d.createBuffer({ size: 512 * 1024, usage: V });
    this.neuronBuf = d.createBuffer({ size: 32 * 1024, usage: V });
    this.pulseBuf = d.createBuffer({ size: 256 * 1024, usage: V });

    this.tex = d.createTexture({
      size: [FIELD_RES, FIELD_RES],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const smp = d.createSampler({ magFilter: "linear", minFilter: "linear" });

    // Grupo de enlace explícito: los cinco pipelines lo comparten, y con
    // `layout: "auto"` cada uno se inventaría el suyo, incompatible con el
    // resto. Es el mismo tropiezo que ya documenta el atlas.
    this.bgl = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    this.bg = d.createBindGroup({
      layout: this.bgl,
      entries: [
        { binding: 0, resource: { buffer: this.uni } },
        { binding: 1, resource: this.tex.createView() },
        { binding: 2, resource: smp },
      ],
    });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    const sm = d.createShaderModule({ code: nnRenderWGSL });

    const alpha: GPUBlendState = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    // Aditivo para la malla y los pulsos: son luz, no superficie. Una arista
    // detrás de otra suma en vez de taparla, que es lo que hace que la red
    // densa se lea como una nebulosa y no como un plato de espaguetis.
    const add: GPUBlendState = {
      color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
    };
    const depth = (write: boolean): GPUDepthStencilState => ({
      format: "depth24plus", depthWriteEnabled: write, depthCompare: "less-equal",
    });
    const instBuffers: GPUVertexBufferLayout[] = [{
      arrayStride: 48, stepMode: "instance",
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x4" },
        { shaderLocation: 1, offset: 16, format: "float32x4" },
        { shaderLocation: 2, offset: 32, format: "float32x4" },
      ],
    }];
    const lineBuffers: GPUVertexBufferLayout[] = [{
      arrayStride: 32,
      attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x4" },
        { shaderLocation: 1, offset: 16, format: "float32x4" },
      ],
    }];

    this.floorPipe = d.createRenderPipeline({
      layout,
      vertex: { module: sm, entryPoint: "vsFloor" },
      fragment: { module: sm, entryPoint: "fsFloor", targets: [{ format: this.fmt, blend: alpha }] },
      primitive: { topology: "triangle-list" },
      depthStencil: depth(true),
    });

    this.gridPipe = d.createRenderPipeline({
      layout,
      vertex: { module: sm, entryPoint: "vsLine", buffers: lineBuffers },
      fragment: { module: sm, entryPoint: "fsLine", targets: [{ format: this.fmt, blend: alpha }] },
      primitive: { topology: "line-list" },
      depthStencil: depth(false),
    });

    this.edgePipe = d.createRenderPipeline({
      layout,
      vertex: { module: sm, entryPoint: "vsLine", buffers: lineBuffers },
      fragment: { module: sm, entryPoint: "fsLine", targets: [{ format: this.fmt, blend: add }] },
      primitive: { topology: "line-list" },
      depthStencil: depth(false),
    });

    this.nodePipe = d.createRenderPipeline({
      layout,
      vertex: { module: sm, entryPoint: "vsNode", buffers: instBuffers },
      fragment: { module: sm, entryPoint: "fsNode", targets: [{ format: this.fmt, blend: alpha }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: depth(true),
    });

    // Los puntos del conjunto son coplanares y se solapan: con escritura de
    // profundidad, el disco que llega después queda recortado por el que ya
    // estaba y la nube se llena de medias lunas. Mismo shader y mismo grupo de
    // enlace, otro estado de profundidad.
    this.pointPipe = d.createRenderPipeline({
      layout,
      vertex: { module: sm, entryPoint: "vsNode", buffers: instBuffers },
      fragment: { module: sm, entryPoint: "fsNode", targets: [{ format: this.fmt, blend: alpha }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: depth(false),
    });

    this.pulsePipe = d.createRenderPipeline({
      layout,
      vertex: { module: sm, entryPoint: "vsPulse", buffers: instBuffers },
      fragment: { module: sm, entryPoint: "fsPulse", targets: [{ format: this.fmt, blend: add }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: depth(false),
    });
  }

  // ================================================================= el dato

  private rebuildData() {
    const def = datasetById(this.opts.datasetId);
    const rnd = mulberry32(this.seed * 7919 + 13);
    const all = def.generate(this.opts.samples, this.opts.noise, rnd);
    // Reparto 70/30. La curva de prueba es la mitad de la lección: sin ella
    // «bajó la pérdida» no distingue aprender de memorizar.
    this.train = [];
    this.test = [];
    for (let i = 0; i < all.length; i++) (i % 10 < 7 ? this.train : this.test).push(all[i]);

    this.order = new Int32Array(this.train.length);
    for (let i = 0; i < this.order.length; i++) this.order[i] = i;
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = this.order[i]; this.order[i] = this.order[j]; this.order[j] = t;
    }
    this.cursor = 0;
    this.buildPoints();
  }

  /** Rehace la red entera. Cambiar la arquitectura o la activación **no**
   *  conserva los pesos: no hay forma honesta de trasplantar una matriz de
   *  6×6 a una de 8×6, y fingirlo daría una curva de pérdida que no
   *  corresponde a ninguna red. */
  private rebuildNet() {
    const sizes = [2, ...this.opts.hidden, 1];
    this.net = new Mlp(sizes, this.opts.act, this.seed * 2654435761 % 2147483647);
    this.meanAct = sizes.map(n => new Float32Array(n));
    this.stats.arch = sizes.slice();
    this.stats.batches = 0;
    this.stats.epochs = 0;
    this.stats.history = [];
    this.debt = 0;
    this.layout();
    if (this.selIdx >= this.nodes.length) this.selIdx = -1;
    this.hovIdx = -1;
    this.refresh(true);
  }

  /** Dónde va cada neurona. Las medidas están en `layout.mjs` porque
   *  `test/nn.mjs` monta esta misma escena para dibujarla por Dawn. */
  private layout() {
    this.nodes = nodeLayout(this.net.sizes);
  }

  private nodeIndex(layer: number, unit: number): number {
    return nodeIndex(this.net.sizes, layer, unit);
  }

  // ============================================================ entrenamiento

  private runBatches(n: number) {
    const b = Math.min(this.opts.batch, this.train.length);
    for (let i = 0; i < n; i++) {
      this.net.trainBatch(this.train, this.order, this.cursor, b, this.opts.lr);
      this.cursor += b;
      this.stats.batches++;
      if (this.cursor >= this.order.length) {
        this.cursor -= this.order.length;
        this.stats.epochs++;
      }
    }
  }

  /** Recalcula todo lo que depende de los pesos: suelo, aristas, neuronas,
   *  pulsos y las dos pérdidas. Un solo sitio, porque la mitad de los fallos
   *  de una sala así son un dibujo que se quedó describiendo pesos viejos. */
  private refresh(force = false) {
    if (!force && this.sinceRefresh < REFRESH_MS) return;
    this.sinceRefresh = 0;

    this.net.sampleField(this.fieldF, FIELD_RES, this.selLayer(), this.selUnit());
    for (let i = 0; i < this.fieldF.length; i++) {
      const c = fieldColor(this.fieldF[i]);
      const o = i * 4;
      this.fieldB[o] = Math.round(c[0] * 255);
      this.fieldB[o + 1] = Math.round(c[1] * 255);
      this.fieldB[o + 2] = Math.round(c[2] * 255);
      // El alfa lleva el valor sin colorear: lo usa `fsFloor` para las curvas
      // de nivel. La textura es opaca de todos modos —el alfa de la mezcla lo
      // pone `fieldAlpha` en el uniforme—, así que el canal estaba libre.
      this.fieldB[o + 3] = Math.round(Math.max(0, Math.min(1, this.fieldF[i])) * 255);
    }
    this.device.queue.writeTexture(
      { texture: this.tex },
      this.fieldB,
      { bytesPerRow: FIELD_RES * 4, rowsPerImage: FIELD_RES },
      { width: FIELD_RES, height: FIELD_RES },
    );

    this.net.meanActivation(this.train, this.meanAct);

    const tr = this.net.evaluate(this.train);
    const te = this.net.evaluate(this.test);
    this.stats.lossTrain = tr.loss;
    this.stats.lossTest = te.loss;
    this.stats.acc = tr.acc;
    this.stats.accTest = te.acc;
    const h = this.stats.history;
    h.push({ tr: tr.loss, te: te.loss });
    if (h.length > 180) h.shift();

    this.buildEdges();
    this.buildNeurons();
    this.buildPulses();
    this.stats.selected = this.info(this.selIdx);
    this.stats.hovered = this.info(this.hovIdx);
  }

  private selLayer(): number {
    if (this.selIdx < 0) return -1;
    const n = this.nodes[this.selIdx];
    // La entrada no tiene nada que enseñar en el suelo: su «campo» es el eje.
    return n.layer === 0 ? -1 : n.layer;
  }
  private selUnit(): number {
    return this.selIdx < 0 ? 0 : this.nodes[this.selIdx].unit;
  }

  // =============================================================== geometría

  /** La rejilla del suelo y las dos bajadas de los ejes. Estática: sólo
   *  depende del encuadre, no de los pesos. */
  private buildGrid() {
    const v: number[] = [];
    const push = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
                  c: [number, number, number], a: number) => {
      v.push(x1, y1, z1, 0, c[0], c[1], c[2], a);
      v.push(x2, y2, z2, 0, c[0], c[1], c[2], a);
    };
    const H = FLOOR_HALF, Y = FLOOR_Y + 0.004;
    const N = 8;
    const faint: [number, number, number] = [1, 1, 1];
    for (let i = 0; i <= N; i++) {
      const t = -H + (2 * H * i) / N;
      push(t, Y, -H, t, Y, H, faint, 0.06);
      push(-H, Y, t, H, Y, t, faint, 0.06);
    }
    // Los dos ejes, en los colores de las dos entradas. Es la leyenda: sin
    // ella el suelo es un cuadro y no un plano de coordenadas.
    push(-H, Y, 0, H, Y, 0, AXIS_X, 0.55);
    push(0, Y, -H, 0, Y, H, AXIS_Y, 0.55);

    this.gridVerts = v.length / 8;
    this.device.queue.writeBuffer(this.gridBuf, 0, new Float32Array(v));
  }

  private buildPoints() {
    const v: number[] = [];
    const put = (p: Pt, a: number) => {
      const c = p.label ? CLASS_B : CLASS_A;
      v.push(p.x * FLOOR_HALF, FLOOR_Y + 0.012, p.y * FLOOR_HALF, 0.016);
      v.push(c[0], c[1], c[2], a);
      v.push(0, 0, 2.2, 0);
    };
    for (const p of this.train) put(p, 0.95);
    // Los de prueba, más tenues. Están porque la curva de prueba habla de
    // ellos: si no se ven, esa curva no es de nada que esté en la pantalla.
    for (const p of this.test) put(p, 0.45);
    this.pointCount = v.length / 12;
    this.device.queue.writeBuffer(this.pointBuf, 0, new Float32Array(v));
  }

  private buildEdges() {
    const v: number[] = [];
    const net = this.net, sizes = net.sizes;
    const maxW = net.maxWeight();
    // El aditivo suma luz: con una constante calibrada a la red de casa, una
    // red de cuatro capas anchas satura a blanco. Se compensa por número de
    // aristas, igual que en el atlas.
    let count = 0;
    for (let l = 0; l < sizes.length - 1; l++) count += sizes[l] * sizes[l + 1];
    const norm = Math.sqrt(72 / Math.max(1, count)) * this.opts.edgeAlpha;

    const hi = this.hovIdx >= 0 ? this.nodes[this.hovIdx] : (this.selIdx >= 0 ? this.nodes[this.selIdx] : null);

    for (let l = 0; l < sizes.length - 1; l++) {
      const w = net.W[l], inN = sizes[l], outN = sizes[l + 1];
      for (let j = 0; j < outN; j++) {
        const b = this.nodes[this.nodeIndex(l + 1, j)];
        for (let i = 0; i < inN; i++) {
          const a = this.nodes[this.nodeIndex(l, i)];
          const wv = w[j * inN + i];
          const c = weightColor(wv);
          let alpha = Math.min(1, Math.abs(wv) / maxW) * norm;
          // Con algo cogido, lo que no toca a esa neurona se aparta. Es el
          // mismo canal de resalte del atlas: atenuar, no borrar.
          if (hi) {
            const touches = (hi.layer === l && hi.unit === i) || (hi.layer === l + 1 && hi.unit === j);
            alpha *= touches ? 1.35 : 0.16;
          }
          v.push(a.x, a.y, a.z, 1, c[0], c[1], c[2], Math.max(0.012, alpha));
          v.push(b.x, b.y, b.z, 1, c[0], c[1], c[2], Math.max(0.012, alpha));
        }
      }
    }

    // Las bajadas al suelo: dicen «esto de arriba vive sobre ese plano» sin
    // una sola palabra. Van **verticales** y no en diagonal hacia el eje que
    // les toca: en diagonal cruzan media escena, se mezclan con las aristas y
    // parecen una conexión más. La correspondencia entrada↔eje ya la lleva el
    // color, que es donde no estorba.
    const dash = (a: { x: number; y: number; z: number },
                  c: [number, number, number], alpha: number) => {
      const K = 8;
      for (let k = 0; k < K; k++) {
        const t0 = k / K, t1 = t0 + 0.5 / K;
        const y0 = a.y + (FLOOR_Y + 0.01 - a.y) * t0;
        const y1 = a.y + (FLOOR_Y + 0.01 - a.y) * t1;
        v.push(a.x, y0, a.z, 0, c[0], c[1], c[2], alpha);
        v.push(a.x, y1, a.z, 0, c[0], c[1], c[2], alpha);
      }
    };
    dash(this.nodes[0], AXIS_X, 0.40);
    dash(this.nodes[1], AXIS_Y, 0.40);
    dash(this.nodes[this.nodes.length - 1], [1, 1, 1], 0.26);

    this.edgeVerts = v.length / 8;
    this.device.queue.writeBuffer(this.edgeBuf, 0, new Float32Array(v));
  }

  private buildNeurons() {
    const v: number[] = [];
    const sizes = this.net.sizes;
    const L = sizes.length;
    // Escala común a la capa: el brillo de una neurona dice cuánto se enciende
    // *comparada con sus hermanas*, no frente a un número absoluto que
    // depende de la activación elegida.
    const layerMax: number[] = [];
    for (let l = 0; l < L; l++) {
      let m = 1e-6;
      for (let i = 0; i < sizes[l]; i++) m = Math.max(m, this.meanAct[l][i]);
      layerMax.push(m);
    }

    let dead = 0;
    const push = (x: number, y: number, z: number, r: number,
                  c: [number, number, number], a: number, kind: number, glow: number, minPx: number, beat: number) => {
      v.push(x, y, z, r, c[0], c[1], c[2], a, kind, glow, minPx, beat);
    };

    for (let k = 0; k < this.nodes.length; k++) {
      const n = this.nodes[k];
      const isIn = n.layer === 0;
      const isOut = n.layer === L - 1;
      const m = isIn ? 1 : this.meanAct[n.layer][n.unit] / layerMax[n.layer];
      const alive = isIn || this.meanAct[n.layer][n.unit] > 0.02;
      if (!alive) dead++;

      // Blancas. El color de esta sala vive en las aristas (el signo del peso)
      // y en el suelo (la respuesta); teñir además la neurona sería repetir
      // con menos precisión algo que ya está dicho.
      let c: [number, number, number] = [1, 1, 1];
      if (isIn) c = n.unit === 0 ? AXIS_X : AXIS_Y;

      const glow = isIn ? 0.25 : Math.max(0, m - 0.25) * 0.7;
      const r = isIn || isOut ? R_EDGE : R_HIDDEN;
      push(n.x, n.y, n.z, r, c, alive ? 0.55 + 0.45 * (isIn ? 1 : m) : 0.20, 1, glow, 3.4, isOut ? 1 : 0);
    }

    // Los aros van al final: se dibujan encima y no se les puede escribir
    // profundidad, o recortarían la neurona que están marcando.
    for (const idx of [this.hovIdx, this.selIdx]) {
      if (idx < 0) continue;
      const n = this.nodes[idx];
      const sel = idx === this.selIdx;
      push(n.x, n.y, n.z, sel ? 0.150 : 0.125, [1, 1, 1], sel ? 0.95 : 0.55, 2, 0, sel ? 9 : 7, sel ? 1 : 0);
    }

    this.stats.dead = dead;
    this.neuronCount = v.length / 12;
    this.device.queue.writeBuffer(this.neuronBuf, 0, new Float32Array(v));
  }

  private buildPulses() {
    if (!this.opts.showPulses) { this.pulseCount = 0; return; }
    const v: number[] = [];
    const net = this.net, sizes = net.sizes;
    let maxF = 1e-6, maxB = 1e-6;
    const F: number[] = [], B: number[] = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const w = net.W[l], g = net.gW[l], inN = sizes[l], outN = sizes[l + 1];
      for (let j = 0; j < outN; j++) {
        for (let i = 0; i < inN; i++) {
          // Ida: cuánta señal lleva esa arista, |w · a|. Vuelta: cuánta culpa
          // le toca, |∂L/∂w|. Son dos cosas distintas y por eso el pulso de
          // vuelta no ilumina las mismas aristas que el de ida — que es
          // exactamente lo que hay que ver.
          const f = Math.abs(w[j * inN + i]) * (l === 0 ? 0.6 : this.meanAct[l][i]);
          const b = Math.abs(g[j * inN + i]);
          F.push(f); B.push(b);
          if (f > maxF) maxF = f;
          if (b > maxB) maxB = b;
        }
      }
    }

    let k = 0;
    for (let l = 0; l < sizes.length - 1; l++) {
      const inN = sizes[l], outN = sizes[l + 1];
      for (let j = 0; j < outN; j++) {
        const b = this.nodes[this.nodeIndex(l + 1, j)];
        for (let i = 0; i < inN; i++, k++) {
          const a = this.nodes[this.nodeIndex(l, i)];
          const mf = Math.min(1, F[k] / maxF);
          const mb = Math.min(1, B[k] / maxB);
          if (mf < 0.06 && mb < 0.06) continue;
          const jitter = ((i * 7 + j * 13) % 11) / 11;
          v.push(a.x, a.y, a.z, l, b.x, b.y, b.z, jitter, mf, mb, 0, 0);
        }
      }
    }
    this.pulseCount = v.length / 12;
    if (this.pulseCount > 0) this.device.queue.writeBuffer(this.pulseBuf, 0, new Float32Array(v));
  }

  // ================================================================== la ficha

  private info(idx: number): NeuronInfo | null {
    if (idx < 0 || idx >= this.nodes.length) return null;
    const n = this.nodes[idx];
    const L = this.net.sizes.length;
    const kind: NeuronInfo["kind"] = n.layer === 0 ? "input" : n.layer === L - 1 ? "output" : "hidden";
    const wIn: { from: string; w: number }[] = [];
    if (n.layer > 0) {
      const w = this.net.W[n.layer - 1];
      const inN = this.net.sizes[n.layer - 1];
      for (let i = 0; i < inN; i++) wIn.push({ from: this.tag(n.layer - 1, i), w: w[n.unit * inN + i] });
      wIn.sort((p, q) => Math.abs(q.w) - Math.abs(p.w));
    }
    const mean = n.layer === 0 ? 1 : this.meanAct[n.layer][n.unit];
    return {
      layer: n.layer,
      unit: n.unit,
      tag: this.tag(n.layer, n.unit),
      kind,
      bias: n.layer > 0 ? this.net.B[n.layer - 1][n.unit] : 0,
      mean,
      wIn,
      dead: n.layer > 0 && n.layer < L - 1 && mean <= 0.02,
    };
  }

  private tag(layer: number, unit: number): string {
    const L = this.net.sizes.length;
    if (layer === 0) return unit === 0 ? "x₁" : "x₂";
    if (layer === L - 1) return "ŷ";
    return `h${layer}.${unit + 1}`;
  }

  // ================================================================ apuntar

  private attachPicking() {
    const c = this.canvas;
    const move = (e: PointerEvent) => {
      const idx = this.hit(e.clientX, e.clientY);
      if (idx === this.hovIdx) return;
      this.hovIdx = idx;
      c.style.cursor = idx >= 0 ? "pointer" : "";
      this.buildEdges();
      this.buildNeurons();
      this.stats.hovered = this.info(idx);
    };
    const down = (e: PointerEvent) => { this.downX = e.clientX; this.downY = e.clientY; };
    const up = (e: PointerEvent) => {
      // Un arrastre que acaba sobre una neurona no la elige: quien orbita no
      // está pidiendo nada, y perder el encuadre al soltar es el gesto más
      // fácil de hacer sin querer.
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 5) return;
      const idx = this.hit(e.clientX, e.clientY);
      if (idx >= 0) this.select(idx);
      else if (this.selIdx >= 0) this.clear();
    };
    const leave = () => {
      if (this.hovIdx < 0) return;
      this.hovIdx = -1;
      this.buildEdges();
      this.buildNeurons();
      this.stats.hovered = null;
    };
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", leave);
    this.detachPick = () => {
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", leave);
    };
  }
  private detachPick: (() => void) | null = null;

  /** Proyecta las neuronas y devuelve la más cercana al puntero, en píxeles.
   *  Son dos docenas de puntos: un `pick` en GPU aquí sería un dispatch y un
   *  mapeo de buffer para ahorrar veinte multiplicaciones. */
  private hit(clientX: number, clientY: number): number {
    const vp = this.lastVP;
    if (!vp) return -1;
    const r = this.canvas.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    let best = -1, bestD = 26;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const cw = vp[3] * n.x + vp[7] * n.y + vp[11] * n.z + vp[15];
      if (cw <= 1e-5) continue;
      const cx = (vp[0] * n.x + vp[4] * n.y + vp[8] * n.z + vp[12]) / cw;
      const cy = (vp[1] * n.x + vp[5] * n.y + vp[9] * n.z + vp[13]) / cw;
      const sx = (cx * 0.5 + 0.5) * r.width;
      const sy = (0.5 - cy * 0.5) * r.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ================================================================== mandos

  set(patch: Partial<Options>) {
    const archChanged = patch.hidden !== undefined &&
      (patch.hidden.length !== this.opts.hidden.length ||
       patch.hidden.some((v, i) => v !== this.opts.hidden[i]));
    const actChanged = patch.act !== undefined && patch.act !== this.opts.act;
    const dataChanged =
      (patch.datasetId !== undefined && patch.datasetId !== this.opts.datasetId) ||
      (patch.noise !== undefined && patch.noise !== this.opts.noise) ||
      (patch.samples !== undefined && patch.samples !== this.opts.samples);

    Object.assign(this.opts, patch);
    if (dataChanged) { this.rebuildData(); this.rebuildNet(); return; }
    if (archChanged || actChanged) { this.selIdx = -1; this.rebuildNet(); return; }
    if (patch.showPulses !== undefined) this.buildPulses();
    if (patch.edgeAlpha !== undefined) this.buildEdges();
  }

  /** Otra semilla para los pesos, **la misma nube**. Es la lección que no cabe
   *  en ningún texto —dos inicios distintos encuentran dos fronteras
   *  distintas, y las dos aciertan—, y sólo se ve si el problema no cambia a
   *  la vez. Cambiar también los datos convertiría la comparación en nada. */
  reset() {
    this.seed = (this.seed + 1) % 9973 || 1;
    this.rebuildNet();
  }

  /** Un lote exacto, con su ciclo entero dibujado. Nadie ve lo que no puede
   *  parar: es el mismo motivo por el que la sala del descenso tiene su tecla. */
  stepOnce() {
    this.pending = 1;
    this.clock = 0;
  }

  select(idx: number) {
    this.selIdx = idx;
    this.stats.selected = this.info(idx);
    this.buildEdges();
    this.buildNeurons();
    this.refresh(true);
  }

  selectTag(layer: number, unit: number) { this.select(this.nodeIndex(layer, unit)); }

  /** La salida. La llaman las cuatro: `Esc`, la píldora, el botón de la ficha
   *  y el clic en el vacío. La cámara no se toca porque elegir tampoco la
   *  tocó: aquí la red entera cabe en el encuadre y volar sobraría. */
  clear() {
    if (this.selIdx < 0) return;
    this.selIdx = -1;
    this.stats.selected = null;
    this.buildEdges();
    this.buildNeurons();
    this.refresh(true);
  }

  goHome() { this.camera.goHome(); }

  get roamed(): boolean {
    const c = this.camera;
    return Math.abs(c.distance - this.homeDist) > this.homeDist * 0.04
        || Math.abs(c.theta - CAM.theta) > 0.05
        || Math.abs(c.phi - CAM.phi) > 0.05;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.detachPick?.();
    this.camera.dispose();
    this.depthTex?.destroy();
    this.uni.destroy();
    this.gridBuf.destroy();
    this.edgeBuf.destroy();
    this.pointBuf.destroy();
    this.neuronBuf.destroy();
    this.pulseBuf.destroy();
    this.tex.destroy();
  }

  // ================================================================ el bucle

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastAt ? Math.min(100, now - this.lastAt) : 16;
    this.lastAt = now;
    const inst = 1000 / Math.max(1, dt);
    this.stats.fps = this.stats.fps ? this.stats.fps * 0.9 + inst * 0.1 : inst;

    const stepping = this.pending > 0;
    if (this.opts.running || stepping) {
      this.clock = (this.clock + dt / CYCLE_MS) % 1;
      if (stepping) {
        // Un ciclo, un lote: al terminar la vuelta se aplica y se para.
        if (this.clock >= T_BWD) { this.runBatches(1); this.pending = 0; this.flash = 1; }
      } else {
        this.debt += (this.opts.speed * dt) / 1000;
        const n = Math.floor(this.debt);
        if (n > 0) { this.debt -= n; this.runBatches(Math.min(n, 600)); }
      }
    }
    const phase: Stats["phase"] = this.clock < T_FWD ? "fwd" : this.clock < T_BWD ? "bwd" : "upd";
    if (phase === "upd" && this.stats.phase !== "upd") this.flash = 1;
    this.stats.phase = phase;
    this.flash *= Math.pow(0.86, dt / 16);

    this.sinceRefresh += dt;
    if (this.opts.running || stepping) this.refresh();

    this.render(now);
  };

  private render(now: number) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cssW = Math.max(1, this.canvas.clientWidth);
    this.cssH = Math.max(1, this.canvas.clientHeight);
    const w = Math.max(1, Math.round(this.cssW * dpr));
    const h = Math.max(1, Math.round(this.cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (!this.depthTex || this.depthTex.width !== w || this.depthTex.height !== h) {
      this.depthTex?.destroy();
      this.depthTex = this.device.createTexture({
        size: [w, h], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    this.camera.update();
    const vp = this.camera.viewProj(w / h);
    this.lastVP = vp;
    const proj = this.camera.projection(w / h);
    const eye = this.camera.eye();

    // El frente de señal recorre las capas: 0 → L durante la ida y L → 0
    // durante la vuelta. Que la dirección salga del sentido de este número y
    // no de una bandera es lo que deja el dibujo de los pulsos en una fórmula.
    const L = this.net.sizes.length - 1;
    let wave = -9, dir = 1;
    if (this.clock < T_FWD) {
      wave = (this.clock / T_FWD) * (L + 1);
    } else if (this.clock < T_BWD) {
      wave = (1 - (this.clock - T_FWD) / (T_BWD - T_FWD)) * (L + 1);
      dir = -1;
    }

    const u = new Float32Array(64);
    u.set(vp, 0);
    u[16] = eye[0]; u[17] = eye[1]; u[18] = eye[2]; u[19] = 1;
    u[20] = proj[0]; u[21] = proj[5]; u[22] = w; u[23] = h;
    u[24] = now / 1000;
    u[25] = wave;
    u[26] = dir;
    u[27] = 1 + this.flash * 1.5;
    u[28] = this.opts.fieldAlpha;
    u[29] = FLOOR_HALF;
    u[30] = FLOOR_Y;
    u[31] = 1;
    const pc = dir > 0 ? [0.45, 1.0, 1.0] : [1.0, 0.80, 0.38];
    u[32] = pc[0]; u[33] = pc[1]; u[34] = pc[2]; u[35] = 1;
    u[36] = 0.042;
    u[37] = 1;
    this.device.queue.writeBuffer(this.uni, 0, u);

    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.043, g: 0.047, b: 0.062, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: this.depthTex.createView(),
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setBindGroup(0, this.bg);

    pass.setPipeline(this.floorPipe);
    pass.draw(6, 1, 0, 0);

    if (this.gridVerts > 0) {
      pass.setPipeline(this.gridPipe);
      pass.setVertexBuffer(0, this.gridBuf);
      pass.draw(this.gridVerts, 1, 0, 0);
    }

    if (this.opts.showPoints && this.pointCount > 0) {
      pass.setPipeline(this.pointPipe);
      pass.setVertexBuffer(0, this.pointBuf);
      pass.draw(6, this.pointCount, 0, 0);
    }

    if (this.edgeVerts > 0) {
      pass.setPipeline(this.edgePipe);
      pass.setVertexBuffer(0, this.edgeBuf);
      pass.draw(this.edgeVerts, 1, 0, 0);
    }

    if (this.opts.showPulses && this.pulseCount > 0 && wave > -1) {
      pass.setPipeline(this.pulsePipe);
      pass.setVertexBuffer(0, this.pulseBuf);
      pass.draw(6, this.pulseCount, 0, 0);
    }

    if (this.neuronCount > 0) {
      pass.setPipeline(this.nodePipe);
      pass.setVertexBuffer(0, this.neuronBuf);
      pass.draw(6, this.neuronCount, 0, 0);
    }

    pass.end();
    this.device.queue.submit([enc.finish()]);
  }
}

export { DATASETS };
