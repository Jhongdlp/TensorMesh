import type { Galaxy } from "../loader";
import { zoneColours } from "../palette.mjs";
import { HL, tiers, pathTiers, spotTiers } from "../highlight.mjs";
import { OrbitCamera, type CamState } from "./camera";
import physicsWGSL from "./physics.wgsl?raw";
import renderWGSL from "./render.wgsl?raw";
import pickWGSL from "./pick.wgsl?raw";
import cullWGSL from "./cull.wgsl?raw";

export interface Params {
  ks: number;
  kr: number;
  dt: number;
  drag: number;
  gravity: number;
  K: number;
  alpha: number;
  running: boolean;
  stepsPerFrame: number;
  /** Opacidad de la malla de aristas. Bajarla despeja los nodos, y es además lo
   *  único que mueve la aguja del rendimiento: las aristas son todo el coste.
   *  0,5 es el punto en el que la malla no satura; por encima el núcleo empieza a
   *  lavarse a blanco, que es justo el aspecto de neón que se busca. */
  edgeBright: number;
  /** Radio mínimo del nodo en píxeles. Es lo que lo hace visible y clicable. */
  minPx: number;
  /** Longitud mínima de arista en píxeles. Por debajo no aporta nada visible
   *  pero rasteriza igual: es el grueso del overdraw en el núcleo denso. */
  minEdgePx: number;
  /** Rango de dibujo, relativo a la distancia de cámara. 1 = sin límite.
   *  Es el clásico "draw distance": recorta lo que queda muy por detrás. */
  range: number;
  /** Baja la resolución interna cuando el frame no entra en presupuesto. */
  adaptiveRes: boolean;
}

export const DEFAULTS: Params = {
  ks: 1.0, kr: 0.15, dt: 0.55, drag: 0.9, gravity: 0.0,
  K: 24, alpha: 1.0, running: true, stepsPerFrame: 1,
  edgeBright: 0.85, minPx: 2.0, minEdgePx: 1.2, range: 0.8, adaptiveRes: true,
};

const FMAX = 8.0;
/** Presupuesto de frame en ms. Por encima, se adelgaza la malla y luego baja la
 *  resolución interna. */
const BUDGET = 15.0;
/** Suelo del adelgazamiento. Por debajo de ~0,35 la niebla se vuelve alambre:
 *  se ven aristas sueltas en vez de densidad, y con ella se va la nebulosa. */
const LOD_MIN = 0.35;
/** Cuánto se aparta el techo del nivel que falló. Sin margen, el techo queda
 *  clavado en el punto justo de fallo y se vuelve a fallar en el siguiente
 *  repunte. */
const LOD_MARGIN = 0.08;
/** Frames de calma tras bajar la calidad, antes de tantear de nuevo. A 60 Hz son
 *  1,5 s: suficiente para que un pico de carga pase sin que el lazo reaccione a
 *  su propia reacción. */
const CALM = 90;
/** Argumentos de draw indirecto: nodos [6,count,0,0] · aristas [count,1,0,0]. */
const ARGS_RESET = new Uint32Array([6, 0, 0, 0, 0, 1, 0, 0]);
/** Tope de pasos de física por frame. Tiene que coincidir con el máximo del
 *  slider en `Controls.tsx`: cada paso ocupa una ranura del anillo de uniformes. */
const MAX_STEPS = 6;
/** Alineación mínima de un binding de uniform. Es lo que fuerza que cada ranura
 *  del anillo ocupe 256 bytes para 48 de contenido. */
const UNI_ALIGN = 256;
const PICK_RADIUS = 20;

/** Tope de nodos que el encuadre de un camino lee de vuelta a la CPU.
 *
 *  Un camino en un grafo kNN de 50.000 nodos es de mundo pequeño: casi siempre
 *  cabe en menos de diez saltos. El tope está para que el invariante —las
 *  posiciones no vuelven a la CPU— no dependa de que el grafo se porte bien:
 *  1 KB de lectura y sólo al pedir un camino, no por frame. */
const PATH_MAX = 64;
const DEPTH: GPUTextureFormat = "depth16unorm";

export async function gpuAvailable(): Promise<GPUDevice | null> {
  if (!navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    return await adapter.requestDevice();
  } catch {
    return null;
  }
}

export class GpuEngine {
  readonly camera = new OrbitCamera();
  params: Params = { ...DEFAULTS };
  selected: number | null = null;
  fps = 0;
  /** Lo que sobrevivió al descarte en el último sondeo, para mostrarlo. */
  visible = { nodes: 0, edges: 0, res: 1, lod: 1 };

  private ctx: GPUCanvasContext;
  private fmt: GPUTextureFormat;
  private n: number;
  private edgeVerts: number;
  private radius = 1;
  private frame = 0;
  private cur = 0;
  private raf = 0;
  private lastFrameAt = 0;
  private dimHost: Float32Array;
  /** Nodo resaltado por el cursor, para poder devolverlo a su escalón. */
  private hoverId: number | null = null;
  private seedHost: Float32Array;
  /** Longitud típica de arista: fija a qué distancia encuadra un vecindario. */
  private meanEdge = 1;

  private depthTex: GPUTexture | null = null;
  private depthW = 0;
  private depthH = 0;

  private pos: [GPUBuffer, GPUBuffer];
  private vel: GPUBuffer;
  private dim: GPUBuffer;
  private physU: GPUBuffer;
  private renderU: GPUBuffer;
  private pickU: GPUBuffer;
  private pickOut: GPUBuffer;
  private pickStage: GPUBuffer;
  private oneStage: GPUBuffer;
  /** Encuadre de un camino: hasta `PATH_MAX` posiciones en una sola lectura. */
  private manyStage: GPUBuffer;
  private cullU: GPUBuffer;
  private drawArgs: GPUBuffer;
  private argsStage: GPUBuffer;

  private physPipe: GPUComputePipeline;
  private edgePipe: GPURenderPipeline;
  private nodePipe: GPURenderPipeline;
  private pickPipe: GPUComputePipeline;
  private cullNodePipe: GPUComputePipeline;
  private cullEdgePipe: GPUComputePipeline;
  /** [paridad][ranura del anillo de uniformes] */
  private physBG: [GPUBindGroup[], GPUBindGroup[]];
  private renderBG: [GPUBindGroup, GPUBindGroup];
  private pickBG: [GPUBindGroup, GPUBindGroup];
  private cullBG: [GPUBindGroup, GPUBindGroup];
  private resScale = 1;
  /** Fracción de la malla que se dibuja. Es la primera palanca del presupuesto,
   *  por delante de la resolución: adelgazar la niebla al 40% se lee como la
   *  misma niebla (el brillo se compensa por 1/lod), mientras que bajar a 0,55×
   *  emborrona los nodos, que es lo único que hay que poder apuntar. */
  private lodScale = 1;
  /** Techo aprendido del adelgazamiento: el último nivel que **no** entró en
   *  presupuesto, menos un margen. Sin él el lazo caza entre 60 y 30 fps. */
  private lodCeil = 1;
  /** Frames que faltan para volver a intentar subir la calidad. */
  private cooldown = 0;
  private lastStats = 0;
  private dirty = true;

  /** Hay un solo buffer de staging por recurso, así que las lecturas se serializan. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private device: GPUDevice,
    private canvas: HTMLCanvasElement,
    private g: Galaxy,
  ) {
    this.n = g.meta.nodes;
    this.edgeVerts = g.uniqueEdges.length;
    this.dimHost = new Float32Array(this.n).fill(1);

    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.fmt, alphaMode: "opaque" });

    const B = GPUBufferUsage;
    const store = (data: ArrayBufferView, extra = 0) => {
      const b = device.createBuffer({
        size: Math.max(4, Math.ceil(data.byteLength / 4) * 4),
        usage: B.STORAGE | extra,
        mappedAtCreation: true,
      });
      new Uint8Array(b.getMappedRange()).set(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      b.unmap();
      return b;
    };

    // --- semilla y encuadre robusto (la esfera envolvente la estiran outliers) ---
    const seed = new Float32Array(this.n * 4);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < this.n; i++) {
      seed[i * 4] = g.positions[i * 3];
      seed[i * 4 + 1] = g.positions[i * 3 + 1];
      seed[i * 4 + 2] = g.positions[i * 3 + 2];
      cx += seed[i * 4]; cy += seed[i * 4 + 1]; cz += seed[i * 4 + 2];
    }
    cx /= this.n; cy /= this.n; cz /= this.n;
    const dists = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      dists[i] = Math.hypot(seed[i * 4] - cx, seed[i * 4 + 1] - cy, seed[i * 4 + 2] - cz);
    }
    this.radius = Float32Array.from(dists).sort()[Math.floor(this.n * 0.95)] || 1;
    this.camera.target = [cx, cy, cz];
    this.camera.frame(this.radius);

    // --- color y tamaño ---
    // rgb es el color de *zona* y lo usan sólo las aristas: los nodos salen
    // blancos del vertex shader. Un punto blanco es un punto, sin más; el color
    // pasa a ser una propiedad de la malla, que es donde significa algo.
    //
    // El tamaño ya no se escala por densidad: eso hacía falta con blending
    // aditivo, donde muchos nodos suman luz hasta saturar. Con mezcla alfa un
    // punto no se acumula con sus vecinos, así que puede ser sólido y honesto.
    const zones = zoneColours(g);
    const colour = new Float32Array(this.n * 4);
    for (let i = 0; i < this.n; i++) {
      colour[i * 4] = zones.node[i * 3];
      colour[i * 4 + 1] = zones.node[i * 3 + 1];
      colour[i * 4 + 2] = zones.node[i * 3 + 2];
      colour[i * 4 + 3] = this.radius *
        (0.0012 + 0.0055 * Math.pow(1 - g.rank[i] / 65535, 8));
    }

    // --- CSR y masas ---
    const deg = new Float32Array(this.n);
    let degSum = 0;
    for (let i = 0; i < this.n; i++) {
      deg[i] = g.offsets[i + 1] - g.offsets[i] + 1;
      degSum += deg[i];
    }
    const degMean = degSum / this.n;
    const mass = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) mass[i] = deg[i] / degMean;

    const weights32 = new Float32Array(g.weights.length);
    for (let i = 0; i < g.weights.length; i++) weights32[i] = g.weights[i] / 255;

    // Muestra de aristas para saber a qué escala vive un vecindario. Es lo que
    // decide la distancia de cámara al enfocar una palabra.
    {
      const m = g.uniqueEdges.length / 2;
      const stride = Math.max(1, Math.floor(m / 4000));
      let sum = 0, count = 0;
      for (let e = 0; e < m; e += stride) {
        const a = g.uniqueEdges[e * 2], b = g.uniqueEdges[e * 2 + 1];
        sum += Math.hypot(seed[a * 4] - seed[b * 4],
                          seed[a * 4 + 1] - seed[b * 4 + 1],
                          seed[a * 4 + 2] - seed[b * 4 + 2]);
        count++;
      }
      this.meanEdge = count ? sum / count : this.radius * 0.1;
    }

    this.seedHost = seed;
    this.pos = [store(seed, B.COPY_SRC | B.COPY_DST),
                store(new Float32Array(this.n * 4), B.COPY_SRC | B.COPY_DST)];
    this.vel = store(new Float32Array(this.n * 4), B.COPY_DST);
    this.dim = store(this.dimHost, B.COPY_DST);
    const bOff = store(new Uint32Array(g.offsets));
    const bTgt = store(new Uint32Array(g.targets));
    const bWt = store(weights32);
    const bMass = store(mass);
    const bCol = store(colour);
    const bEdge = store(new Uint32Array(g.uniqueEdges));

    // Anillo de uniformes: una ranura por paso de física. Existe para poder
    // meter todos los pasos y el render en **un solo command buffer**. Con un
    // único uniform había que submitir por paso, porque todas las escrituras de
    // `writeBuffer` se aplican antes de que el command buffer empiece a correr:
    // los seis pasos habrían leído la misma semilla. Medido a 1344×768,
    // alternando A/B: dos submits 23,05 ms/frame, uno solo 18,34.
    this.physU = device.createBuffer({
      size: UNI_ALIGN * MAX_STEPS, usage: B.UNIFORM | B.COPY_DST,
    });
    this.renderU = device.createBuffer({ size: 128, usage: B.UNIFORM | B.COPY_DST });
    this.pickU = device.createBuffer({ size: 96, usage: B.UNIFORM | B.COPY_DST });
    this.pickOut = device.createBuffer({ size: 4, usage: B.STORAGE | B.COPY_SRC | B.COPY_DST });
    this.pickStage = device.createBuffer({ size: 4, usage: B.MAP_READ | B.COPY_DST });
    this.oneStage = device.createBuffer({ size: 16, usage: B.MAP_READ | B.COPY_DST });
    this.manyStage = device.createBuffer({ size: PATH_MAX * 16,
                                           usage: B.MAP_READ | B.COPY_DST });
    this.cullU = device.createBuffer({ size: 96, usage: B.UNIFORM | B.COPY_DST });
    this.drawArgs = device.createBuffer({
      size: 32, usage: B.INDIRECT | B.STORAGE | B.COPY_DST | B.COPY_SRC,
    });
    this.argsStage = device.createBuffer({ size: 32, usage: B.MAP_READ | B.COPY_DST });
    const visNodes = store(new Uint32Array(this.n));
    const visEdges = store(new Uint32Array(this.edgeVerts));

    // --- pipelines ---
    const physMod = device.createShaderModule({ code: physicsWGSL });
    const rendMod = device.createShaderModule({ code: renderWGSL });
    const pickMod = device.createShaderModule({ code: pickWGSL });

    this.physPipe = device.createComputePipeline({
      layout: "auto", compute: { module: physMod, entryPoint: "step" },
    });
    this.pickPipe = device.createComputePipeline({
      layout: "auto", compute: { module: pickMod, entryPoint: "pick" },
    });

    // Un solo módulo con dos entry points; comparten layout, así que el bind
    // group vale para las dos pasadas.
    const cullMod = device.createShaderModule({ code: cullWGSL });
    const C = GPUShaderStage.COMPUTE;
    const cullBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: { type: "uniform" } },
        { binding: 1, visibility: C, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: C, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: C, buffer: { type: "storage" } },
        { binding: 4, visibility: C, buffer: { type: "storage" } },
        { binding: 5, visibility: C, buffer: { type: "storage" } },
        { binding: 6, visibility: C, buffer: { type: "read-only-storage" } },
      ],
    });
    const cullPL = device.createPipelineLayout({ bindGroupLayouts: [cullBGL] });
    this.cullNodePipe = device.createComputePipeline({
      layout: cullPL, compute: { module: cullMod, entryPoint: "cullNodes" },
    });
    this.cullEdgePipe = device.createComputePipeline({
      layout: cullPL, compute: { module: cullMod, entryPoint: "cullEdges" },
    });

    // layout: "auto" genera un layout distinto por pipeline, incompatibles entre
    // sí aunque las entradas coincidan. Aristas y nodos comparten bind group, así
    // que el layout debe ser explícito y común.
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    const rendBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: "uniform" } },
        { binding: 1, visibility: V, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: V, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: V, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: V, buffer: { type: "read-only-storage" } },
        { binding: 5, visibility: V, buffer: { type: "read-only-storage" } },
      ],
    });
    const rendPL = device.createPipelineLayout({ bindGroupLayouts: [rendBGL] });

    // Aristas: aditivo, la malla debe sumar luz donde se solapa.
    // Nodos: mezcla alfa normal y prueba de profundidad, para que un punto sea un
    // punto sólido, no se lave con los de detrás, y el cercano tape al lejano en
    // vez de depender del orden en que toque dibujarlos.
    const additive: GPUBlendState = {
      color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
      alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
    };
    const over: GPUBlendState = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    const mkRender = (
      vs: string, fs: string, topology: GPUPrimitiveTopology,
      blend: GPUBlendState, depthWriteEnabled: boolean, depthCompare: GPUCompareFunction,
    ) => device.createRenderPipeline({
      layout: rendPL,
      vertex: { module: rendMod, entryPoint: vs },
      fragment: { module: rendMod, entryPoint: fs, targets: [{ format: this.fmt, blend }] },
      primitive: { topology },
      depthStencil: { format: DEPTH, depthWriteEnabled, depthCompare },
    });
    this.edgePipe = mkRender("vsEdge", "fsEdge", "line-list", additive, false, "always");
    this.nodePipe = mkRender("vsNode", "fsNode", "triangle-list", over, true, "less");

    const physGroup = (a: GPUBuffer, b: GPUBuffer, slot: number) => device.createBindGroup({
      layout: this.physPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: a } }, { binding: 1, resource: { buffer: b } },
        { binding: 2, resource: { buffer: this.vel } }, { binding: 3, resource: { buffer: bOff } },
        { binding: 4, resource: { buffer: bTgt } }, { binding: 5, resource: { buffer: bWt } },
        { binding: 6, resource: { buffer: bMass } },
        { binding: 7, resource: { buffer: this.physU, offset: slot * UNI_ALIGN, size: 48 } },
      ],
    });
    const slots = (a: GPUBuffer, b: GPUBuffer) =>
      Array.from({ length: MAX_STEPS }, (_, k) => physGroup(a, b, k));
    this.physBG = [slots(this.pos[0], this.pos[1]), slots(this.pos[1], this.pos[0])];

    const renderGroup = (p: GPUBuffer) => device.createBindGroup({
      layout: rendBGL,
      entries: [
        { binding: 0, resource: { buffer: this.renderU } },
        { binding: 1, resource: { buffer: p } },
        { binding: 2, resource: { buffer: bCol } },
        { binding: 3, resource: { buffer: this.dim } },
        { binding: 4, resource: { buffer: visEdges } },
        { binding: 5, resource: { buffer: visNodes } },
      ],
    });
    this.renderBG = [renderGroup(this.pos[0]), renderGroup(this.pos[1])];

    const cullGroup = (p: GPUBuffer) => device.createBindGroup({
      layout: cullBGL,
      entries: [
        { binding: 0, resource: { buffer: this.cullU } },
        { binding: 1, resource: { buffer: p } },
        { binding: 2, resource: { buffer: bEdge } },
        { binding: 3, resource: { buffer: visNodes } },
        { binding: 4, resource: { buffer: visEdges } },
        { binding: 5, resource: { buffer: this.drawArgs } },
        { binding: 6, resource: { buffer: this.dim } },
      ],
    });
    this.cullBG = [cullGroup(this.pos[0]), cullGroup(this.pos[1])];

    const pickGroup = (p: GPUBuffer) => device.createBindGroup({
      layout: this.pickPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.pickU } },
        { binding: 1, resource: { buffer: p } },
        { binding: 2, resource: { buffer: this.pickOut } },
        { binding: 3, resource: { buffer: bCol } },
      ],
    });
    this.pickBG = [pickGroup(this.pos[0]), pickGroup(this.pos[1])];

    this.camera.attach(canvas);
    addEventListener("resize", this.onResize);
    this.loop();
  }

  // ------------------------------------------------------------------ uniforms
  private writePhys(frame: number, slot: number) {
    const P = this.params;
    const buf = new ArrayBuffer(48);
    new Uint32Array(buf, 0, 4).set([this.n, P.K, frame, 0]);
    new Float32Array(buf, 16, 8).set([
      P.ks, P.kr, P.K ? this.n / P.K : 0, P.dt,
      P.drag, P.alpha, FMAX, P.gravity,
    ]);
    this.device.queue.writeBuffer(this.physU, slot * UNI_ALIGN, buf);
  }

  private writeRender(vp: Float32Array, w: number, h: number) {
    // La malla se atenúa con el número de aristas: el aditivo suma luz, y una
    // constante calibrada a 16.000 aristas satura a blanco con 147.000. El
    // defecto de `edgeBright` (0,85) la sube ×1,7 sobre ese punto neutro: con
    // los tonos en el borde de la gama, por debajo la malla se veía apagada.
    // ...y con el adelgazamiento (`lodScale`) por la misma razón: si se dibuja
    // el 40% de la malla, cada arista tiene que sumar 2,5× para que la nebulosa
    // conserve su luz total. Sin esto, adelgazar apaga la galaxia.
    const density = Math.min(0.34, (0.34 * 15949) / (this.edgeVerts / 2));
    const edgeB = (this.params.edgeBright / 0.5) * density / this.lodScale;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const buf = new ArrayBuffer(128);
    new Float32Array(buf, 0, 16).set(vp);
    const eye = this.camera.eye();
    new Float32Array(buf, 64, 4).set([eye[0], eye[1], eye[2], 0]);
    const proj = this.camera.projection(w / h);
    // El resalte lleva la arista a color pleno y ni un paso más. Fijarlo a un
    // número era lo mismo que fijar el brillo de la malla, que ahora es un
    // mando: al subirlo, el camino se pasaba de 1 en los tres canales y salía
    // blanco — perdiendo justo lo que el color transporta, la zona.
    const selEdge = Math.min(24, (1 / Math.max(edgeB, 1e-3) - 1) / (HL.self - 1));
    // Tramo de bruma, atado a la órbita y no al radio de la nube: lo que se
    // mira queda siempre a media bruma, así que el relieve se lee igual en
    // vista completa que dentro de un barrio. El suelo evita que al entrar en
    // el núcleo (distancia ≈ 0) la bruma colapse a un plano.
    const fogSpan = Math.max(this.camera.distance, this.radius * 0.35) * 2.3;
    const fogNear = this.camera.distance - fogSpan * 0.45;
    // Longitud de referencia para la exposición de las aristas (ver `expose` en
    // render.wgsl). Va en unidades de mundo y atada al radio de la nube, no a la
    // cámara: lo que se corrige es cuánta tinta merece cada relación, y eso es
    // una propiedad del grafo — no cambia porque uno se acerque.
    const edgeRef = this.radius * 0.16;
    new Float32Array(buf, 80, 12).set([
      proj[0], proj[5], fogNear, 1.0,
      edgeB, this.params.minPx * dpr, w, h,
      2.5,   // selScale: el elegido crece ×6 y sus vecinos ×3,4, y con ello sube
             // también su suelo en píxeles: siempre localizable, aun de lejos
      selEdge, fogSpan, edgeRef,
    ]);
    this.device.queue.writeBuffer(this.renderU, 0, buf);
  }

  private ensureDepth(w: number, h: number) {
    if (this.depthTex && this.depthW === w && this.depthH === h) return;
    this.depthTex?.destroy();
    this.depthTex = this.device.createTexture({
      size: [w, h], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthW = w;
    this.depthH = h;
  }

  // -------------------------------------------------------------------- frame
  private writeCull(vp: Float32Array, w: number, h: number) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const buf = new ArrayBuffer(96);
    new Float32Array(buf, 0, 16).set(vp);
    new Float32Array(buf, 64, 2).set([w, h]);
    new Uint32Array(buf, 72, 2).set([this.n, this.edgeVerts / 2]);
    new Float32Array(buf, 80, 4).set([
      this.params.minEdgePx * dpr * this.resScale,
      0.02,                          // holgura de frustum para el radio del nodo
      this.params.range >= 0.999 ? 0 : this.params.range * this.camera.distance * 2.5,
      this.lodScale,
    ]);
    this.device.queue.writeBuffer(this.cullU, 0, buf);
  }

  private readStats() {
    return this.queue(async () => {
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(this.drawArgs, 0, this.argsStage, 0, 32);
      this.device.queue.submit([enc.finish()]);
      await this.argsStage.mapAsync(GPUMapMode.READ);
      const a = new Uint32Array(this.argsStage.getMappedRange().slice(0));
      this.argsStage.unmap();
      this.visible.nodes = a[1];
      this.visible.edges = a[4] / 2;
    });
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.lastFrameAt ? now - this.lastFrameAt : 16;
    if (this.lastFrameAt) {
      const inst = 1000 / Math.max(1, dt);
      this.fps = this.fps ? this.fps * 0.9 + inst * 0.1 : inst;
    }
    this.lastFrameAt = now;

    // Salto de frame en reposo. Sin física ni cámara moviéndose no hay nada que
    // redibujar. En una GPU integrada esto no es sólo batería: al no calentarla,
    // los frames que sí importan corren al doble.
    if (!this.params.running && !this.camera.moving() && !this.dirty) return;
    this.dirty = false;

    // Resolución adaptativa. El coste es de relleno, así que reducir el buffer
    // interno es la palanca más directa que existe; el navegador lo reescala.
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (this.params.adaptiveRes) {
      // Control del presupuesto tipo **AIMD** — el de TCP: bajar de golpe, subir
      // a pasitos, y **no volver al nivel que acaba de fallar**.
      //
      // La memoria del fallo (`lodCeil`) es lo que separa esto de lo anterior, y
      // es justo lo que faltaba para que se sintieran 60 fps. Con vsync a 60 Hz
      // el reloj sólo sabe decir dos cosas: 16,7 ms (entré) o 33,3 (me lo perdí).
      // Un control sin memoria oye «entré» y sube la calidad hasta que se pasa,
      // oye 33,3 y la baja, y vuelta a empezar: **caza** eternamente cruzando el
      // vsync, y lo que se ve es un vaivén 60 → 30 → 60. Media suficiente,
      // fluidez ninguna. Con techo aprendido el lazo converge a un nivel y se
      // queda ahí.
      const over = dt > BUDGET * 1.3, under = dt < BUDGET * 1.15;
      if (this.cooldown > 0) this.cooldown--;

      if (over) {
        // Lo que no aguantó no se vuelve a intentar: el techo baja con él.
        this.lodCeil = Math.max(LOD_MIN, this.lodScale - LOD_MARGIN);
        if (this.lodScale > LOD_MIN) {
          this.lodScale = Math.max(LOD_MIN, this.lodScale - 0.10);
        } else {
          this.resScale = Math.max(0.55, this.resScale - 0.05);
        }
        this.cooldown = CALM;
      } else if (under && this.cooldown === 0) {
        // Se recupera primero la resolución y sólo después la malla: emborronar
        // los nodos cuesta más que aclarar la niebla, y los nodos son lo que hay
        // que poder apuntar y clicar.
        if (this.resScale < 1) {
          this.resScale = Math.min(1, this.resScale + 0.02);
        } else if (this.lodScale < this.lodCeil) {
          this.lodScale = Math.min(this.lodCeil, this.lodScale + 0.01);
        } else if (this.lodCeil < 1) {
          // Ya en el techo y todo tranquilo: se re-tantea, pero una sola vez por
          // periodo de calma. Sin esto el techo se quedaría bajo para siempre y
          // acercarse a un barrio — donde el frustum ya deja poquísimo — no
          // devolvería nunca la malla entera.
          this.lodCeil = Math.min(1, this.lodCeil + 0.05);
          this.cooldown = CALM;
        }
      }
    } else if (this.resScale !== 1 || this.lodScale !== 1) {
      this.resScale = 1;
      this.lodScale = 1;
      this.lodCeil = 1;
    }
    this.visible.res = this.resScale;
    this.visible.lod = this.lodScale;

    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * this.resScale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * this.resScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ensureDepth(w, h);

    // Los uniformes de todos los pasos se escriben *antes* de codificar nada:
    // `writeBuffer` se aplica en orden de cola, así que para cuando el command
    // buffer corra, cada ranura del anillo ya tiene su semilla.
    const steps = this.params.running
      ? Math.min(MAX_STEPS, Math.max(0, this.params.stepsPerFrame | 0)) : 0;
    for (let s = 0; s < steps; s++) this.writePhys(this.frame++, s);

    this.camera.update();
    const vp = this.camera.viewProj(w / h);
    this.writeRender(vp, w, h);
    this.writeCull(vp, w, h);
    this.device.queue.writeBuffer(this.drawArgs, 0, ARGS_RESET);

    const enc = this.device.createCommandEncoder();

    // Física. Los dispatches de una misma pasada se ordenan entre sí y sus
    // escrituras son visibles para el siguiente, así que los seis pasos caben en
    // una pasada: sólo hay que alternar la paridad del doble búfer.
    if (steps > 0) {
      const ph = enc.beginComputePass();
      ph.setPipeline(this.physPipe);
      for (let s = 0; s < steps; s++) {
        ph.setBindGroup(0, this.physBG[this.cur][s]);
        ph.dispatchWorkgroups(Math.ceil(this.n / 64));
        this.cur ^= 1;
      }
      ph.end();
    }

    // Descarte: dos dispatches que compactan lo visible y escriben los propios
    // argumentos de draw. La CPU no llega a saber cuántas primitivas salen.
    const cull = enc.beginComputePass();
    cull.setBindGroup(0, this.cullBG[this.cur]);
    cull.setPipeline(this.cullNodePipe);
    cull.dispatchWorkgroups(Math.ceil(this.n / 64));
    cull.setPipeline(this.cullEdgePipe);
    cull.dispatchWorkgroups(Math.ceil(this.edgeVerts / 2 / 64));
    cull.end();

    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.0196, g: 0.0275, b: 0.051, a: 1 },
        loadOp: "clear", storeOp: "store",
      }],
      depthStencilAttachment: {
        view: this.depthTex!.createView(),
        depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store",
      },
    });
    pass.setBindGroup(0, this.renderBG[this.cur]);
    if (this.params.edgeBright > 0.001) {
      pass.setPipeline(this.edgePipe);
      pass.drawIndirect(this.drawArgs, 16);   // argumentos de aristas
    }
    pass.setPipeline(this.nodePipe);
    pass.drawIndirect(this.drawArgs, 0);      // argumentos de nodos
    pass.end();
    this.device.queue.submit([enc.finish()]);

    if (now - this.lastStats > 400) {
      this.lastStats = now;
      void this.readStats();
    }
  };

  setCameraMode(mode: 'orbit' | 'fly') {
    this.camera.setMode(mode);
    this.dirty = true;
  }

  /** Deriva en reposo. `camera.moving()` la cuenta como movimiento, así que el
   *  salto de frame en reposo se levanta solo mientras dure: sin eso el modo
   *  atractor no movería nada — el bucle se estaría saltando el frame. */
  setAttract(on: boolean) {
    this.camera.setAttract(on);
    this.dirty = true;
  }

  /** La órbita, para escribirla en un enlace, y de vuelta. */
  cameraState(): CamState { return this.camera.state(); }

  setCameraState(s: CamState) {
    this.camera.setState(s);
    this.dirty = true;
  }

  /** Vista completa. Es la tecla `Inicio` en forma de método: la barra de
   *  herramientas la necesita, y estar sólo en el teclado la dejaba invisible
   *  para quien no abre la leyenda. */
  goHome() {
    this.camera.goHome();
    this.dirty = true;
  }

  // ---------------------------------------------------------------- selección
  select(id: number | null) {
    this.selected = id;
    // Las aristas no necesitan buffer propio: heredan el resalte de sus
    // extremos en el vertex shader, así que el camino se ilumina solo.
    tiers(this.g, id, this.dimHost);
    this.device.queue.writeBuffer(this.dim, 0, this.dimHost);
    this.hoverId = null;   // la escritura entera se llevó por delante el hover
    this.dirty = true;
  }

  /** Resalte de un camino. Mismo canal `dim` y misma escritura de 200 KB que
   *  `select`: no hay buffers nuevos porque el camino no es un objeto, es otro
   *  reparto de los mismos escalones. Las aristas de la cadena se encienden
   *  solas — heredan el resalte de sus dos extremos en el vertex shader — y
   *  quedan exentas del adelgazamiento de la malla por la regla de `cullEdges`
   *  (`hl > 1`), así que el camino nunca se ve a trozos. */
  selectPath(path: number[] | null) {
    // El extremo es lo que sigue «seleccionado» para el hover: pasar el ratón
    // por encima de un nodo del camino no debe rebajarlo.
    this.selected = path && path.length ? path[path.length - 1] : null;
    pathTiers(this.g, path, this.dimHost);
    this.device.queue.writeBuffer(this.dim, 0, this.dimHost);
    this.hoverId = null;
    this.dirty = true;
  }

  /** El destello del atractor: enciende una palabra sin apagar la galaxia. Ver
   *  `spotTiers` — aquí no hay nadie pidiendo ver un punto, así que atenuar el
   *  resto sería tapar lo único que se está enseñando. */
  spotlight(id: number | null) {
    this.selected = id;
    spotTiers(this.g, id, this.dimHost);
    this.device.queue.writeBuffer(this.dim, 0, this.dimHost);
    this.hoverId = null;
    this.dirty = true;
  }

  /** Resalte de paso del ratón. Escribe **4 bytes**, no los 200 KB del buffer:
   *  el hover se sondea cada 90 ms y no puede costar una subida entera. */
  hover(id: number | null) {
    if (id === this.hoverId) return;
    const prev = this.hoverId;
    this.hoverId = id;
    if (prev !== null) this.writeDim(prev, this.dimHost[prev]);
    if (id !== null && id !== this.selected) {
      this.writeDim(id, Math.max(this.dimHost[id], HL.hover));
    }
    this.dirty = true;
  }

  private writeDim(i: number, v: number) {
    this.device.queue.writeBuffer(this.dim, i * 4, new Float32Array([v]));
  }

  /** Fuerza un frame: cambió un parámetro o el tamaño, pero nada se mueve. */
  invalidate() { this.dirty = true; }

  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Selección exacta en GPU: O(n) sin índice espacial, válida con los nodos en
   *  movimiento, donde un KD-tree habría que reconstruirlo cada frame. */
  pick(px: number, py: number): Promise<number | null> {
    return this.queue(async () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = this.canvas.width, h = this.canvas.height;
      const buf = new ArrayBuffer(96);
      new Float32Array(buf, 0, 16).set(this.camera.viewProj(w / h));
      new Float32Array(buf, 64, 4).set([px * dpr, py * dpr, w, h]);
      new Uint32Array(buf, 80, 1).set([this.n]);
      new Float32Array(buf, 84, 1).set([PICK_RADIUS * dpr]);
      const proj = this.camera.projection(w / h);
      new Float32Array(buf, 88, 2).set([proj[0], this.params.minPx * dpr]);
      this.device.queue.writeBuffer(this.pickU, 0, buf);
      this.device.queue.writeBuffer(this.pickOut, 0, new Uint32Array([0xffffffff]));

      const enc = this.device.createCommandEncoder();
      const p = enc.beginComputePass();
      p.setPipeline(this.pickPipe);
      p.setBindGroup(0, this.pickBG[this.cur]);
      p.dispatchWorkgroups(Math.ceil(this.n / 64));
      p.end();
      enc.copyBufferToBuffer(this.pickOut, 0, this.pickStage, 0, 4);
      this.device.queue.submit([enc.finish()]);

      await this.pickStage.mapAsync(GPUMapMode.READ);
      const key = new Uint32Array(this.pickStage.getMappedRange())[0];
      this.pickStage.unmap();
      return key === 0xffffffff ? null : key & 0x1ffff;
    });
  }

  /** Enfoca un nodo: vuela hasta él y encuadra su vecindario.
   *
   *  Es la mitad que faltaba del resalte. Por muy brillante que se ponga, un
   *  nodo y sus seis vecinos ocupan el 2% de la pantalla en vista completa —
   *  hacerlos visibles es un problema de cámara, no de brillo.
   *
   *  Los 16 bytes de su posición se leen de la GPU al vuelo: desde que no hay
   *  etiquetas, las posiciones ya no viven en CPU. */
  focus(id: number): Promise<void> {
    return this.queue(async () => {
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(this.pos[this.cur], id * 16, this.oneStage, 0, 16);
      this.device.queue.submit([enc.finish()]);
      await this.oneStage.mapAsync(GPUMapMode.READ);
      const p = new Float32Array(this.oneStage.getMappedRange().slice(0));
      this.oneStage.unmap();
      // Unas cuantas longitudes de arista: el vecindario llena el encuadre sin
      // quedarse pegado a la cara.
      this.camera.flyTo([p[0], p[1], p[2]], this.meanEdge * 5);
      this.dirty = true;
    });
  }

  /** Encuadra un camino entero: centroide de sus nodos y radio que los cubre.
   *
   *  Enfocar sólo el destino, que es lo barato, deja el camino saliendo por
   *  detrás de la cámara — y el camino es justo lo que se ha pedido ver. Aquí
   *  el invariante se paga con `PATH_MAX × 16` bytes, una vez por consulta.
   *
   *  El radio sale de la distancia máxima al centroide, no de la envolvente:
   *  es la misma decisión que el encuadre inicial, y por lo mismo — un extremo
   *  lejano no debe dejar el resto del camino diminuto en el centro. */
  focusPath(path: number[]): Promise<void> {
    const ids = path.slice(0, PATH_MAX);
    return this.queue(async () => {
      const enc = this.device.createCommandEncoder();
      ids.forEach((id, k) => {
        enc.copyBufferToBuffer(this.pos[this.cur], id * 16, this.manyStage, k * 16, 16);
      });
      this.device.queue.submit([enc.finish()]);
      await this.manyStage.mapAsync(GPUMapMode.READ, 0, ids.length * 16);
      const p = new Float32Array(this.manyStage.getMappedRange(0, ids.length * 16).slice(0));
      this.manyStage.unmap();

      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < ids.length; k++) {
        cx += p[k * 4]; cy += p[k * 4 + 1]; cz += p[k * 4 + 2];
      }
      cx /= ids.length; cy /= ids.length; cz /= ids.length;

      let far = 0;
      for (let k = 0; k < ids.length; k++) {
        far = Math.max(far, Math.hypot(p[k * 4] - cx, p[k * 4 + 1] - cy, p[k * 4 + 2] - cz));
      }
      // Con un solo nodo el radio es cero: se cae al encuadre de `focus`.
      this.camera.flyTo([cx, cy, cz], Math.max(far * 1.35, this.meanEdge * 5));
      this.dirty = true;
    });
  }

  settle(on: boolean) { this.params.alpha = on ? 0 : 1; }

  /** Vuelve al estado precalculado del pipeline y detiene todo movimiento. */
  reset() {
    const zero = new Float32Array(this.n * 4);
    this.device.queue.writeBuffer(this.pos[0], 0, this.seedHost);
    this.device.queue.writeBuffer(this.pos[1], 0, zero);
    this.device.queue.writeBuffer(this.vel, 0, zero);
    this.cur = 0;
    this.frame = 0;
    this.camera.frame(this.radius);
    this.dirty = true;
  }

  private onResize = () => { this.dirty = true; };

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.onResize);
    this.camera.dispose();
    this.depthTex?.destroy();
    for (const b of [...this.pos, this.vel, this.dim, this.physU, this.renderU,
                     this.pickU, this.pickOut, this.pickStage, this.oneStage,
                     this.cullU, this.drawArgs, this.argsStage]) {
      try { b.destroy(); } catch { /* ya liberado */ }
    }
  }
}
