/** Sala 02 — descenso de gradiente. Fase 01.
 *
 *  La fase 00 contestó su pregunta: el armazón del atlas se despega de su dato.
 *  Esto es la sala de verdad — cinco superficies, tres optimizadores, relieve
 *  sombreado, estelas y presupuesto de frame.
 *
 *  Lo que se hereda del atlas sin tocar una línea: `gpu/camera.ts` (órbita,
 *  vuelo, `Inicio`, tope de alejamiento), `keys.mjs` y `palette.mjs`. Lo que no
 *  se hereda: ni un shader.
 *
 *  Tres pasadas por frame, en este orden y por estas razones:
 *
 *  1. **Relieve** → lienzo, opaco y con profundidad. Es lo único que escribe el
 *     búfer de profundidad, y lo escribe para los demás.
 *  2. **Estelas** → textura propia, cargando lo que había. Primero un triángulo
 *     que multiplica el destino por un factor menor que uno, después los
 *     caminantes en aditivo. La profundidad va **en sólo lectura** contra la que
 *     dejó el relieve, así que un caminante al otro lado de una loma queda
 *     tapado por ella.
 *  3. **Composición** → lienzo, aditivo. Las estelas suman luz sobre el terreno
 *     en vez de taparlo, que es lo que las hace legibles sobre una ladera clara
 *     y sobre el fondo del valle a la vez.
 *
 *  El anillo de uniformes, que la fase 00 se ahorró, vuelve: la corrección de
 *  sesgo de Adam depende del número de paso, así que cada dispatch necesita su
 *  ranura de 256 B. Es exactamente por lo que el atlas tiene el suyo.
 */
import { OrbitCamera } from "../../galaxy/gpu/camera";
import {
  SURFACES, HYPER, N_DEFAULT, N_MAX, N_REF, OPTS, TRACED, PATH_LEN,
  metricsOf, seedWalkers,
} from "./field.mjs";
import fieldWGSL from "./field.wgsl?raw";
import walkersWGSL from "./walkers.wgsl?raw";
import surfaceWGSL from "./surface.wgsl?raw";
import renderWGSL from "./render.wgsl?raw";
import trailsWGSL from "./trails.wgsl?raw";

const DEPTH: GPUTextureFormat = "depth16unorm";
/** rgba16float y no rgba8: la acumulación suma miles de aportaciones pequeñas y
 *  en 8 bits se pierde todo lo que no llegue a 1/255 en un solo frame — que es
 *  justamente lo que forma la estela. */
const TRAIL: GPUTextureFormat = "rgba16float";

/** Radio del **rastro** en unidades de mundo. La bolita que se ve encima mide
 *  `WALKER_SIZE · HEAD_SCALE`: el rastro tiene que ser fino para que la estela
 *  sea un hilo y no una cinta, y la cabeza gorda para que sea una bolita. */
const WALKER_SIZE = 0.009;
const HEAD_SCALE = 2.4;
const MIN_PX = 1.35;
/** Cuánto se levanta el caminante sobre el relieve. Sin esto, punto y malla
 *  ocupan la misma profundidad y la prueba `less` los borra a medias: aparecen
 *  y desaparecen según el ángulo. */
const LIFT = 0.012;
const MESH_RES = 192;

/** Ángulo polar de las dos vistas. `OrbitCamera` arranca en 1,15 rad porque
 *  para la galaxia —una nube sin arriba ni abajo— da igual; para un relieve no.
 *  A 1,15 se mira el terreno **casi de canto**: la pared del fondo tapa el
 *  valle, se ve la cara de abajo de la malla y los caminantes quedan detrás de
 *  su propia loma. A 0,78 (unos 45° sobre el horizonte) el relieve se lee como
 *  relieve y la nube se ve **encima** de él, que es donde está. */
const PHI_RELIEF = 0.78;
const PHI_PLAN = 0.06;

/** Las cinco funciones tienen dos tiempos muy separados —en Rosenbrock el
 *  término en y es `200·(y − x²)` y todo el mundo cae sobre la parábola en diez
 *  pasos— así que a ocho pasos por frame el primer acto dura dos frames y nadie
 *  lo ve. Los primeros 40 van de uno en uno. El contador está a la vista. */
const SLOW_UNTIL = 40;
const STEPS_SLOW = 1;
const STEPS_FAST = 8;
export const TOTAL_STEPS = 6000;
/** Tope de pasos por frame: cada uno ocupa una ranura del anillo. */
const MAX_STEPS = 16;
const UNI_ALIGN = 256;

/** Presupuesto de frame, el mismo que el atlas. */
const BUDGET = 15.0;
const CALM = 90;
const LOD_MIN = 0.25;
const LOD_MARGIN = 0.08;

/** Persistencia de la estela. `KEEP_MOVING` es mucho más baja a propósito: la
 *  textura vive en espacio de pantalla, así que lo acumulado deja de valer en
 *  cuanto la cámara gira. Bajando el factor mientras hay movimiento, la estela
 *  vieja se disuelve en unos frames en vez de quedarse pegada describiendo un
 *  encuadre que ya no existe. */
const KEEP_MOVING = 0.80;
const KEEP_REF = 0.965;
/** Tope de la memoria efectiva. Con `keep = 1` la estela no se borra nunca y
 *  `1/(1−keep)` es infinito, así que la exposición se calcula como si fuese una
 *  toma de 800 frames: es lo que hace que «permanente» sea un ajuste más y no
 *  un caso especial que lava la imagen. */
const MEM_MAX = 800;
const MEM_REF = 1 / (1 - KEEP_REF);
/** Exposición base del caminante, calibrada a `N_DEFAULT` y a `KEEP_REF`. */
const EXPOSE = 0.55;

export interface Options {
  surface: number;
  opt: number;
  lr: number;
  n: number;
  keep: number;
  running: boolean;
  plan: boolean;
  adaptive: boolean;
  /** Qué dice el color del caminante. `false` es su **origen** —el ángulo desde
   *  el que se soltó, que en Himmelblau dibuja el mapa de cuencas—; `true`, su
   *  **altura actual**, con lo que el enjambre entero se enfría al bajar. Son
   *  dos preguntas distintas y ninguna gana siempre, así que es un mando y no
   *  una decisión. Arranca en `true` porque es la que se entiende sin leer
   *  nada: la primera vez, lo que hay que ver es que la nube baja. */
  heat: boolean;
  /** Dibujar el camino de los cinco seguidos. Se puede apagar —el enjambre
   *  solo también dice algo— pero arranca encendido: es lo único de la sala
   *  que enseña la **mecánica** y no sólo el resultado. */
  trace: boolean;
}

export const DEFAULTS: Options = {
  surface: 0, opt: 1, lr: 0, n: N_DEFAULT, keep: KEEP_REF,
  running: true, plan: false, adaptive: true, heat: true, trace: true,
};

export interface Stats {
  fps: number;
  steps: number;
  live: number;
  res: number;
  done: boolean;
}

export async function gpuAvailable(): Promise<GPUDevice | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  // Evitar WebGPU en Firefox debido a problemas de estabilidad y cuelgues (crashes)
  // con el dibujo indirecto y la compactación en GPU.
  if (/firefox/i.test(navigator.userAgent)) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    return await adapter.requestDevice();
  } catch {
    return null;
  }
}

export class DescentEngine {
  readonly camera = new OrbitCamera();
  readonly stats: Stats = { fps: 0, steps: 0, live: N_DEFAULT, res: 1, done: false };
  opts: Options = { ...DEFAULTS };

  private ctx: GPUCanvasContext;
  private fmt: GPUTextureFormat;
  private raf = 0;
  private cur = 0;
  private steps = 0;
  private lastAt = 0;
  private dirty = true;
  private seedValue = 1;
  private metrics = metricsOf(SURFACES[0]);
  private clearTrail = true;

  /** Distancia del encuadre completo. La guarda el motor porque `OrbitCamera`
   *  la tiene privada y `roamed` —quién enciende la píldora de «vista
   *  completa»— necesita compararla. */
  private homeDist = 0;
  /** Pasos que la vista pide dar aunque esté en pausa. Es lo que hace
   *  utilizable el botón de «un paso»: el bucle sólo se despierta con
   *  `invalidate`, así que encolarlos aquí y gastarlos allí evita tener que
   *  duplicar la codificación del dispatch fuera del bucle. */
  private pending = 0;

  private lodScale = 1;
  private lodCeil = 1;
  private resScale = 1;
  private cooldown = 0;

  private st: [GPUBuffer, GPUBuffer];
  private acc: GPUBuffer;
  /** Anillo de posiciones de los cinco seguidos. Quince kilobytes: es lo único
   *  de la sala que guarda historia, y sólo se puede permitir porque son cinco. */
  private path: GPUBuffer;
  private traceU: GPUBuffer;
  private pathHead = 0;
  private tint: GPUBuffer;
  private surfU: GPUBuffer;
  private stepU: GPUBuffer;
  private walkerU: GPUBuffer;
  private meshU: GPUBuffer;
  private trailSmp: GPUSampler;

  private depthTex: GPUTexture | null = null;
  private trailTex: GPUTexture | null = null;
  private texW = 0;
  private texH = 0;
  private compBG: GPUBindGroup | null = null;

  private stepPipe: GPUComputePipeline;
  private recordPipe: GPUComputePipeline;
  private surfPipe: GPURenderPipeline;
  private walkPipe: GPURenderPipeline;
  private headPipe: GPURenderPipeline;
  private tracePipe: GPURenderPipeline;
  private fadePipe: GPURenderPipeline;
  private compPipe: GPURenderPipeline;

  private stepBG: GPUBindGroup[][];
  private walkBG: [GPUBindGroup, GPUBindGroup];
  private headBG: [GPUBindGroup, GPUBindGroup];
  private recordBG: [GPUBindGroup, GPUBindGroup];
  private traceBG: GPUBindGroup;
  private surfBG0: GPUBindGroup;
  private stepGroup1: GPUBindGroup;
  private surfGroup1: GPUBindGroup;
  private walkGroup1: GPUBindGroup;
  private headGroup1: GPUBindGroup;
  private traceGroup1: GPUBindGroup;

  constructor(
    private device: GPUDevice,
    private canvas: HTMLCanvasElement,
    opts?: Partial<Options>,
  ) {
    Object.assign(this.opts, opts);
    this.ctx = canvas.getContext("webgpu") as GPUCanvasContext;
    this.fmt = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device, format: this.fmt, alphaMode: "opaque" });

    const S = GPUBufferUsage.STORAGE;
    const CD = GPUBufferUsage.COPY_DST;
    const mk = (bytes: number, usage: number) => device.createBuffer({ size: bytes, usage });

    // Se reserva para `N_MAX` una sola vez. Mover el mando de caminantes no
    // reasigna nada: sólo cambia cuántos se despachan y cuántos se dibujan.
    this.st = [mk(N_MAX * 8, S | CD), mk(N_MAX * 8, S | CD)];
    this.acc = mk(N_MAX * 16, S | CD);
    this.tint = mk(N_MAX * 16, S | CD);
    this.path = mk(TRACED * PATH_LEN * 8, S | CD);
    this.traceU = mk(16, GPUBufferUsage.UNIFORM | CD);
    this.surfU = mk(64, GPUBufferUsage.UNIFORM | CD);
    this.stepU = mk(MAX_STEPS * UNI_ALIGN, GPUBufferUsage.UNIFORM | CD);
    this.walkerU = mk(144, GPUBufferUsage.UNIFORM | CD);
    this.meshU = mk(160, GPUBufferUsage.UNIFORM | CD);
    this.trailSmp = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    // `field.wgsl` se antepone a los tres módulos que necesitan el campo. El
    // grupo 1 es siempre la superficie; el 0, lo de cada pasada.
    const stepMod = device.createShaderModule({ code: fieldWGSL + "\n" + walkersWGSL });
    const surfMod = device.createShaderModule({ code: fieldWGSL + "\n" + surfaceWGSL });
    const walkMod = device.createShaderModule({ code: fieldWGSL + "\n" + renderWGSL });
    const trailMod = device.createShaderModule({ code: trailsWGSL });

    this.stepPipe = device.createComputePipeline({
      layout: "auto", compute: { module: stepMod, entryPoint: "step" },
    });

    this.recordPipe = device.createComputePipeline({
      layout: "auto", compute: { module: stepMod, entryPoint: "record" },
    });

    this.surfPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: surfMod, entryPoint: "vsSurface" },
      fragment: { module: surfMod, entryPoint: "fsSurface", targets: [{ format: this.fmt }] },
      primitive: { topology: "triangle-list" },
      depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: "less" },
    });

    this.walkPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: walkMod, entryPoint: "vsWalker" },
      fragment: {
        module: walkMod, entryPoint: "fsWalker",
        targets: [{
          format: TRAIL,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
      // Sólo lectura de profundidad: se respeta el relieve sin estropearlo.
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "less" },
    });

    // La bolita. Va **sobre el lienzo ya compuesto** y no dentro de la textura
    // de estelas: la estela es aditiva y sin escritura de profundidad —suma luz
    // y no tapa—, y una bolita que no tapa no es una bolita. Con mezcla alfa
    // normal, en cambio, la de delante oculta a la de detrás, que es lo único
    // que hace que cuarenta de ellas se lean como un enjambre con fondo.
    // La profundidad sigue siendo la del relieve, en sólo lectura.
    this.headPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: walkMod, entryPoint: "vsHead" },
      fragment: {
        module: walkMod, entryPoint: "fsHead",
        targets: [{
          format: this.fmt,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "less" },
    });

    // El camino de los cinco. Mismo estado de mezcla que las cabezas y la misma
    // profundidad en sólo lectura: un punto del rastro al otro lado de una loma
    // tiene que quedar tapado por ella, o el camino miente sobre por dónde fue.
    this.tracePipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: walkMod, entryPoint: "vsTrace" },
      fragment: {
        module: walkMod, entryPoint: "fsTrace",
        targets: [{
          format: this.fmt,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "less" },
    });

    this.fadePipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: trailMod, entryPoint: "vsFull" },
      fragment: {
        module: trailMod, entryPoint: "fsFade",
        targets: [{
          format: TRAIL,
          // `(zero, constant)`: el destino se multiplica por la constante de
          // mezcla. Es la forma de leer y escribir el mismo adjunto sin una
          // segunda textura de ping-pong.
          blend: {
            color: { srcFactor: "zero", dstFactor: "constant", operation: "add" },
            alpha: { srcFactor: "zero", dstFactor: "constant", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "always" },
    });

    this.compPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: trailMod, entryPoint: "vsFull" },
      fragment: {
        module: trailMod, entryPoint: "fsComposite",
        targets: [{
          format: this.fmt,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
      // La pasada de composición comparte adjunto de profundidad con la de las
      // bolitas, que van dentro de ella. Un pipeline sin `depthStencil` no
      // puede correr en un `renderPass` que sí lo tiene, así que aquí va uno
      // que no lo lee ni lo escribe.
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "always" },
    });

    // Grupo 1 = superficie, uno por pipeline: con `layout: "auto"` cada uno
    // genera su propio layout aunque tengan la misma forma.
    const g1 = (p: GPUComputePipeline | GPURenderPipeline) => device.createBindGroup({
      layout: p.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.surfU } }],
    });
    this.stepGroup1 = g1(this.stepPipe);
    this.surfGroup1 = g1(this.surfPipe);
    this.walkGroup1 = g1(this.walkPipe);
    this.headGroup1 = g1(this.headPipe);
    this.traceGroup1 = g1(this.tracePipe);

    this.surfBG0 = device.createBindGroup({
      layout: this.surfPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.meshU } }],
    });

    const sg = (a: GPUBuffer, b: GPUBuffer, slot: number) => device.createBindGroup({
      layout: this.stepPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: a } },
        { binding: 1, resource: { buffer: b } },
        { binding: 2, resource: { buffer: this.acc } },
        { binding: 3, resource: { buffer: this.stepU, offset: slot * UNI_ALIGN, size: 48 } },
      ],
    });
    this.stepBG = [
      Array.from({ length: MAX_STEPS }, (_, k) => sg(this.st[0], this.st[1], k)),
      Array.from({ length: MAX_STEPS }, (_, k) => sg(this.st[1], this.st[0], k)),
    ];

    // El rastro y la bolita leen exactamente lo mismo, pero con `layout: "auto"`
    // cada pipeline se inventa su propio layout aunque la forma coincida: hacen
    // falta dos juegos de grupos, no uno.
    const wg = (pipe: GPURenderPipeline) => (p: GPUBuffer) => device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.walkerU } },
        { binding: 1, resource: { buffer: p } },
        { binding: 2, resource: { buffer: this.tint } },
      ],
    });
    const wgW = wg(this.walkPipe), wgH = wg(this.headPipe);
    this.walkBG = [wgW(this.st[0]), wgW(this.st[1])];
    this.headBG = [wgH(this.st[0]), wgH(this.st[1])];

    // El camino no lee el estado: lee el anillo, que no hace ping-pong. Un solo
    // grupo, y las mismas entradas 0/2/3 que declara `vsTrace`.
    this.traceBG = device.createBindGroup({
      layout: this.tracePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.walkerU } },
        { binding: 2, resource: { buffer: this.tint } },
        { binding: 3, resource: { buffer: this.path } },
      ],
    });

    // Y el que graba, que sí lo lee: bindings 0/4/5, los que usa `record`.
    const rg = (p: GPUBuffer) => device.createBindGroup({
      layout: this.recordPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: p } },
        { binding: 4, resource: { buffer: this.path } },
        { binding: 5, resource: { buffer: this.traceU } },
      ],
    });
    this.recordBG = [rg(this.st[0]), rg(this.st[1])];

    this.camera.phi = PHI_RELIEF;
    this.loadSurface(this.opts.surface, true);
    // 0,95× del radio envolvente. `radius` es el de la **esfera** que contiene
    // la caja normalizada, y un relieve es una placa: vista desde 45° su
    // proyección ocupa bastante menos que su esfera, así que encuadrar con el
    // radio crudo deja el terreno flotando en medio de un tercio de negro.
    // Y no menos de 0,95: la diagonal de la placa mide 2,83 de los 3,03 del
    // radio, así que apretar más recorta las esquinas del dominio — que en la
    // silla es justo por donde se escapan.
    this.camera.frame(this.metrics.radius * 0.95);
    this.homeDist = this.camera.distance;
    this.camera.attach(canvas);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ estado

  /** Cambia de superficie: reescribe el uniforme del campo, resiembra y borra
   *  la estela. El encuadre **no** se toca: las cinco están normalizadas al
   *  mismo tamaño de mundo, así que pasar de una a otra no obliga a reaprender
   *  la escala ni a recolocar la cámara — que es lo que permite compararlas. */
  loadSurface(i: number, initial = false) {
    this.opts.surface = i;
    const surf = SURFACES[i];
    this.metrics = metricsOf(surf);
    this.opts.lr = surf.opt[OPTS[this.opts.opt]].lr;

    const b = new ArrayBuffer(64);
    new Uint32Array(b, 0, 4).set([i, MESH_RES, 0, 0]);
    const m = this.metrics;
    new Float32Array(b, 16, 12).set([
      surf.dom[0], surf.dom[2], surf.dom[1], surf.dom[3],
      m.cx, m.cy, m.k, m.fMin,
      m.hScale, m.hOffset, m.halfX, m.halfY,
    ]);
    this.device.queue.writeBuffer(this.surfU, 0, b);
    this.reseed(this.seedValue + (initial ? 0 : 1));
  }

  setOpt(i: number) {
    this.opts.opt = i;
    this.opts.lr = SURFACES[this.opts.surface].opt[OPTS[i]].lr;
    this.reseed(this.seedValue);
  }

  reseed(s: number) {
    this.seedValue = s;
    const { st, tint } = seedWalkers(SURFACES[this.opts.surface], N_MAX, s, WALKER_SIZE);
    this.device.queue.writeBuffer(this.st[0], 0, st);
    this.device.queue.writeBuffer(this.st[1], 0, st);
    this.device.queue.writeBuffer(this.tint, 0, tint);
    this.device.queue.writeBuffer(this.acc, 0, new Float32Array(N_MAX * 4));
    // El anillo entero arranca en la posición de partida, no a ceros. Las
    // ranuras que todavía no se han escrito se dibujan igual, y a ceros el
    // camino sale con una cola de puntos clavada en una esquina del dominio;
    // sembrado, se apilan todos bajo la canica y no se ven hasta que hay
    // camino de verdad que enseñar.
    const seedPath = new Float32Array(TRACED * PATH_LEN * 2);
    for (let i = 0; i < TRACED; i++) {
      for (let j = 0; j < PATH_LEN; j++) {
        seedPath[(i * PATH_LEN + j) * 2] = st[i * 2];
        seedPath[(i * PATH_LEN + j) * 2 + 1] = st[i * 2 + 1];
      }
    }
    this.device.queue.writeBuffer(this.path, 0, seedPath);
    this.pathHead = 0;
    this.cur = 0;
    this.steps = 0;
    this.stats.done = false;
    this.clearTrail = true;
    this.dirty = true;
  }

  set(patch: Partial<Options>) {
    const n0 = this.opts.n, k0 = this.opts.keep, h0 = this.opts.heat;
    Object.assign(this.opts, patch);
    // Cambiar el reparto de luz con estela vieja encima daría un fogonazo:
    // la acumulada se calibró con otra exposición. Y cambiar de codificación
    // de color dejaría media estela contando la lectura anterior, que es peor
    // que no contar ninguna.
    if (this.opts.n !== n0 || this.opts.keep !== k0 || this.opts.heat !== h0) {
      this.clearTrail = true;
    }
    this.dirty = true;
  }

  /** Un paso, en pausa. Es el mando que convierte la sala en algo que se puede
   *  *leer*: a ocho pasos por frame el primer acto de Rosenbrock dura dos
   *  frames, y nadie ve lo que no puede parar. */
  stepOnce(k = 1) {
    this.pending = Math.min(MAX_STEPS, this.pending + k);
    this.dirty = true;
  }

  goHome() { this.camera.goHome(); this.dirty = true; }

  /** Si la cámara ya no está donde la dejó `frame()`. Enciende la píldora de
   *  vista completa, que sólo aparece cuando hace falta. El ángulo polar queda
   *  **fuera** de la cuenta: lo mueve el propio botón de planta/relieve, y una
   *  píldora que se enciende sola al cambiar de vista no dice nada. */
  get roamed(): boolean {
    const c = this.camera;
    return Math.abs(c.distance - this.homeDist) > this.homeDist * 0.03
        || Math.abs(c.theta - 0.6) > 0.03
        || Math.hypot(c.target[0], c.target[1], c.target[2]) > this.metrics.radius * 0.02;
  }

  // -------------------------------------------------------------- objetivos

  private ensureTargets(w: number, h: number) {
    if (this.depthTex && this.texW === w && this.texH === h) return;
    this.depthTex?.destroy();
    this.trailTex?.destroy();
    this.depthTex = this.device.createTexture({
      size: { width: w, height: h }, format: DEPTH,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.trailTex = this.device.createTexture({
      size: { width: w, height: h }, format: TRAIL,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.compBG = this.device.createBindGroup({
      layout: this.compPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.trailTex.createView() },
        { binding: 1, resource: this.trailSmp },
      ],
    });
    this.texW = w; this.texH = h;
    this.clearTrail = true;
  }

  // --------------------------------------------------------------- uniformes

  private writeStep(slot: number, stepNo: number, live: number) {
    const surf = SURFACES[this.opts.surface];
    const key = OPTS[this.opts.opt];
    const b = new ArrayBuffer(48);
    new Uint32Array(b, 0, 4).set([this.opts.opt, stepNo, live, 0]);
    new Float32Array(b, 16, 8).set([
      this.opts.lr, surf.opt[key].clip,
      HYPER.mu, HYPER.b1, HYPER.b2, HYPER.eps, 0, 0,
    ]);
    this.device.queue.writeBuffer(this.stepU, slot * UNI_ALIGN, b);
  }

  private writeMesh(vp: Float32Array) {
    const b = new ArrayBuffer(160);
    const f = new Float32Array(b);
    f.set(vp, 0);
    const d = this.camera.distance;
    const fogSpan = Math.max(d, this.metrics.radius * 0.35) * 2.3;
    const m = this.metrics;
    const mins = SURFACES[this.opts.surface].min;
    // Luz fija **en mundo** y no en cámara: girar alrededor del relieve tiene
    // que cambiar lo que se ve, no cómo está iluminado. Con luz de cámara, una
    // ladera se ve igual desde los dos lados y el relieve se aplana.
    f.set([0.45, 0.78, 0.44, mins.length], 16);
    f.set([m.hLo, m.hHi, d - fogSpan * 0.45, fogSpan], 20);
    // Las dianas, ya en mundo xz. La conversión se hace aquí y no en el shader
    // porque es la misma cuenta que `worldOf` y son cuatro puntos, no 36.864
    // vértices: repetirla en el fragmento sería pagarla por píxel.
    for (let i = 0; i < 4; i++) {
      const p = mins[i];
      f.set(p ? [(p[0] - m.cx) * m.k, (p[1] - m.cy) * m.k, 1, 0] : [0, 0, 0, 0], 24 + i * 4);
    }
    this.device.queue.writeBuffer(this.meshU, 0, b);
  }

  private writeWalker(vp: Float32Array, w: number, h: number, live: number, keep: number) {
    const b = new ArrayBuffer(144);
    const f = new Float32Array(b);
    f.set(vp, 0);
    // `projXX`/`projYY` salen de la **proyección**, no de `viewProj`:
    // `viewProj[0]` lleva dentro la rotación de la vista, así que el caminante
    // cambiaría de tamaño al orbitar. Mismo cálculo que `engine.ts:writeRender`.
    const proj = this.camera.projection(w / h);
    const d = this.camera.distance;
    const fogSpan = Math.max(d, this.metrics.radius * 0.35) * 2.3;
    // Exposición compensada por cuántos caminantes hay vivos **y** por cuánto
    // dura la estela: la luz acumulada es `live · bright · memoria`, así que sin
    // compensar, subir el número o la persistencia lava la imagen. Mismo
    // argumento que el brillo de aristas del atlas.
    const mem = Math.min(MEM_MAX, 1 / Math.max(1 - keep, 1e-6));
    const bright = EXPOSE * (N_REF / live) * (MEM_REF / mem);
    f.set([
      proj[0], proj[5], w, h,
      d - fogSpan * 0.45, fogSpan, MIN_PX, WALKER_SIZE,
      bright, LIFT, this.metrics.hLo, this.metrics.hHi,
      this.opts.heat ? 1 : 0, HEAD_SCALE, PATH_LEN, this.pathHead,
      TRACED, 0, 0, 0,
    ], 16);
    this.device.queue.writeBuffer(this.walkerU, 0, b);
  }

  // ------------------------------------------------------------------- bucle

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = this.lastAt ? now - this.lastAt : 16;
    if (this.lastAt) {
      const inst = 1000 / Math.max(1, dt);
      this.stats.fps = this.stats.fps ? this.stats.fps * 0.9 + inst * 0.1 : inst;
    }
    this.lastAt = now;

    // Planta o relieve: **es la misma cámara mirando a plomo**, no otra sala.
    // Se interpola en vez de saltar, porque el salto pierde el «esto es lo
    // mismo que estabas viendo».
    const wantPhi = this.opts.plan ? PHI_PLAN : PHI_RELIEF;
    if (Math.abs(this.camera.phi - wantPhi) > 1e-3) {
      this.camera.phi += (wantPhi - this.camera.phi) * 0.12;
      this.dirty = true;
    }

    const stepping = (this.opts.running || this.pending > 0) && this.steps < TOTAL_STEPS;
    const moving = this.camera.moving();
    if (!stepping && !moving && !this.dirty) return;
    this.dirty = false;

    // Lazo AIMD, el del atlas: baja de golpe, sube a pasitos y **no vuelve al
    // nivel que acaba de fallar**. Aquí los mandos son otros —primero los
    // caminantes vivos, después la resolución— porque el coste ya no está en la
    // malla de aristas sino en el relleno de la estela.
    if (this.opts.adaptive) {
      const over = dt > BUDGET * 1.3, under = dt < BUDGET * 1.15;
      if (this.cooldown > 0) this.cooldown--;
      if (over) {
        this.lodCeil = Math.max(LOD_MIN, this.lodScale - LOD_MARGIN);
        if (this.lodScale > LOD_MIN) this.lodScale = Math.max(LOD_MIN, this.lodScale - 0.10);
        else this.resScale = Math.max(0.55, this.resScale - 0.05);
        this.cooldown = CALM;
      } else if (under && this.cooldown === 0) {
        if (this.resScale < 1) this.resScale = Math.min(1, this.resScale + 0.02);
        else if (this.lodScale < this.lodCeil) this.lodScale = Math.min(this.lodCeil, this.lodScale + 0.01);
        else if (this.lodCeil < 1) { this.lodCeil = Math.min(1, this.lodCeil + 0.05); this.cooldown = CALM; }
      }
    } else if (this.lodScale !== 1 || this.resScale !== 1) {
      this.lodScale = 1; this.resScale = 1; this.lodCeil = 1;
    }

    const live = Math.max(1024, Math.round(this.opts.n * this.lodScale));
    this.stats.live = live;
    this.stats.res = this.resScale;

    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * this.resScale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * this.resScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.ensureTargets(w, h);

    const rate = this.opts.running
      ? (this.steps < SLOW_UNTIL ? STEPS_SLOW : STEPS_FAST)
      : this.pending;
    const steps = stepping ? Math.min(rate, MAX_STEPS, TOTAL_STEPS - this.steps) : 0;
    this.pending = 0;
    // Los uniformes de todos los pasos se escriben *antes* de codificar nada:
    // `writeBuffer` se aplica en orden de cola, así que para cuando el command
    // buffer corra, cada ranura del anillo ya tiene su número de paso.
    for (let s = 0; s < steps; s++) this.writeStep(s, this.steps + s + 1, live);

    this.camera.update();
    const vp = this.camera.viewProj(w / h);
    const keep = moving ? KEEP_MOVING : this.opts.keep;
    this.writeMesh(vp);
    this.writeWalker(vp, w, h, live, keep);

    const enc = this.device.createCommandEncoder();

    if (steps > 0) {
      const cp = enc.beginComputePass();
      cp.setPipeline(this.stepPipe);
      cp.setBindGroup(1, this.stepGroup1);
      for (let s = 0; s < steps; s++) {
        cp.setBindGroup(0, this.stepBG[this.cur][s]);
        cp.dispatchWorkgroups(Math.ceil(live / 64));
        this.cur ^= 1;
      }
      // El anillo se graba **dentro de la misma pasada**, después de los pasos:
      // los dispatches de una pasada se ordenan entre sí, así que lo que se
      // guarda es el estado recién calculado. `this.cur` ya apunta al búfer
      // que acaban de escribir los pasos.
      this.pathHead = (this.pathHead + 1) % PATH_LEN;
      this.device.queue.writeBuffer(
        this.traceU, 0, new Uint32Array([PATH_LEN, this.pathHead, TRACED, 0]));
      cp.setPipeline(this.recordPipe);
      cp.setBindGroup(0, this.recordBG[this.cur]);
      cp.dispatchWorkgroups(1);
      cp.end();
      this.steps += steps;
      this.stats.steps = this.steps;
      if (this.steps >= TOTAL_STEPS) this.stats.done = true;
    }

    const target = this.ctx.getCurrentTexture().createView();

    // 1 — relieve
    const mesh = enc.beginRenderPass({
      colorAttachments: [{
        view: target,
        clearValue: { r: 0.012, g: 0.016, b: 0.030, a: 1 },
        loadOp: "clear", storeOp: "store",
      }],
      depthStencilAttachment: {
        view: this.depthTex!.createView(),
        depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store",
      },
    });
    mesh.setPipeline(this.surfPipe);
    mesh.setBindGroup(0, this.surfBG0);
    mesh.setBindGroup(1, this.surfGroup1);
    mesh.draw((MESH_RES - 1) * (MESH_RES - 1) * 6);
    mesh.end();

    // 2 — estelas
    const wipe = this.clearTrail;
    const trail = enc.beginRenderPass({
      colorAttachments: [{
        view: this.trailTex!.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: wipe ? "clear" : "load",
        storeOp: "store",
      }],
      depthStencilAttachment: {
        view: this.depthTex!.createView(),
        depthLoadOp: "load", depthStoreOp: "store",
      },
    });
    if (!wipe) {
      trail.setPipeline(this.fadePipe);
      trail.setBlendConstant({ r: keep, g: keep, b: keep, a: keep });
      trail.draw(3);
    }
    this.clearTrail = false;
    trail.setPipeline(this.walkPipe);
    trail.setBindGroup(0, this.walkBG[this.cur]);
    trail.setBindGroup(1, this.walkGroup1);
    trail.draw(6, live);
    trail.end();

    // 3 — composición y bolitas, en la misma pasada y en este orden.
    // Primero la estela suma su luz sobre el relieve; después las cabezas se
    // dibujan encima con mezcla alfa. Al revés, la estela lavaría de luz las
    // bolitas que acaba de tapar y volveríamos al confeti.
    const comp = enc.beginRenderPass({
      colorAttachments: [{ view: target, loadOp: "load", storeOp: "store" }],
      depthStencilAttachment: {
        view: this.depthTex!.createView(),
        depthLoadOp: "load", depthStoreOp: "store",
      },
    });
    comp.setPipeline(this.compPipe);
    comp.setBindGroup(0, this.compBG!);
    comp.draw(3);
    // El camino va **antes** que las canicas: una cabeza medio tapada por el
    // punto de rastro que acaba de dejar se lee como si fuese más pequeña.
    if (this.opts.trace) {
      comp.setPipeline(this.tracePipe);
      comp.setBindGroup(0, this.traceBG);
      comp.setBindGroup(1, this.traceGroup1);
      comp.draw(6, TRACED * PATH_LEN);
    }
    comp.setPipeline(this.headPipe);
    comp.setBindGroup(0, this.headBG[this.cur]);
    comp.setBindGroup(1, this.headGroup1);
    comp.draw(6, live);
    comp.end();

    this.device.queue.submit([enc.finish()]);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.camera.dispose();
    this.depthTex?.destroy();
    this.trailTex?.destroy();
    this.st[0].destroy(); this.st[1].destroy();
    this.acc.destroy(); this.tint.destroy();
    this.path.destroy(); this.traceU.destroy();
    this.surfU.destroy(); this.stepU.destroy();
    this.walkerU.destroy(); this.meshU.destroy();
  }
}
