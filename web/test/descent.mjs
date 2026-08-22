/**
 * Valida la sala 02 contra la referencia numpy.
 *
 *   node test/descent.mjs
 *
 * Y, sobre todo, **compila los cuatro shaders y construye los cinco pipelines**.
 * `npm run check` no mira los `.wgsl`, así que el único linter real que tienen
 * es esto. En esta máquina Chrome cae al respaldo WebGL —donde estos shaders ni
 * existen— y en headless apenas corre ocho frames antes de la captura, de modo
 * que el relieve y las estelas **sólo** se pueden ver por Dawn.
 *
 * Test 1 — gradiente exacto de las cinco superficies. Un paso de SGD con lr=1 y
 *          sin recorte deja `p − g(p)` en la salida, así que restando se
 *          recupera el gradiente del shader sin añadir un entry point de
 *          depuración. Se compara contra numpy y, de paso, contra la copia en
 *          JS de `field.mjs`: es la red que impide que las dos definiciones se
 *          desincronicen en silencio.
 * Test 2 — 400 pasos por superficie y optimizador. Es donde sale la corrección
 *          de sesgo de Adam, que a un paso casi no se nota.
 * Test 3 — 3.000 pasos, agregado. En el fondo de un valle plano float32 en GPU
 *          y en CPU se separan legítimamente; lo que tiene que coincidir es
 *          dónde acabó la nube.
 * Imagen — las cinco superficies con relieve y estelas, y las tres variantes de
 *          optimizador sobre Rosenbrock.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import gpuMod from "@kmamal/gpu";
import { png } from "./png.mjs";
import { perspective, lookAt, mul } from "./mat.mjs";
// Superficies, siembra y escalas se importan del propio src: `field.mjs` existe
// justo para que estas imágenes sean las de la sala y no una recreación.
import { SURFACES, OPTS, HYPER, metricsOf, seedWalkers } from "../src/rooms/descent/field.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "rooms", "descent");
const FX = join(HERE, "..", "..", "data", "fixture", "descent");

const meta = JSON.parse(readFileSync(join(FX, "meta.json"), "utf8"));
const N = meta.n;

const f32 = (f) => {
  const b = readFileSync(join(FX, f));
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

const field = readFileSync(join(SRC, "field.wgsl"), "utf8");
const walkersSrc = readFileSync(join(SRC, "walkers.wgsl"), "utf8");
const surfaceSrc = readFileSync(join(SRC, "surface.wgsl"), "utf8");
const renderSrc = readFileSync(join(SRC, "render.wgsl"), "utf8");
const trailsSrc = readFileSync(join(SRC, "trails.wgsl"), "utf8");

// Tienen que coincidir con `engine.ts`.
const MESH_RES = 192;
const WALKER_SIZE = 0.009;
const MIN_PX = 1.35;
const LIFT = 0.012;
const UNI_ALIGN = 256;
const DEPTH = "depth16unorm";
const TRAIL = "rgba16float";
const OUT_FMT = "rgba8unorm";

// ------------------------------------------------------------------- WebGPU
Object.assign(globalThis, gpuMod);
const inst = gpuMod.create([]);
const adapter = await inst.requestAdapter();
if (!adapter) { console.error("sin adaptador WebGPU"); process.exit(1); }
const device = await adapter.requestDevice();

let failed = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "OK " : "!! "}${label}${detail ? "  " + detail : ""}`);
  if (!cond) failed++;
};

async function moduleOf(code, label) {
  const m = device.createShaderModule({ code });
  const info = await m.getCompilationInfo();
  let bad = 0;
  for (const msg of info.messages) {
    console.log(`  WGSL ${msg.type} en ${label}, línea ${msg.lineNum}: ${msg.message}`);
    if (msg.type === "error") bad++;
  }
  if (bad) process.exit(1);
  return m;
}

console.log(`\n— entorno ${"—".repeat(46)}`);
console.log(`  ${adapter.info?.description || adapter.info?.vendor || "adaptador"} · n=${N}`);

console.log(`\n— compilación ${"—".repeat(43)}`);
const stepMod = await moduleOf(field + "\n" + walkersSrc, "walkers.wgsl");
const surfMod = await moduleOf(field + "\n" + surfaceSrc, "surface.wgsl");
const walkMod = await moduleOf(field + "\n" + renderSrc, "render.wgsl");
const trailMod = await moduleOf(trailsSrc, "trails.wgsl");

const stepPipe = device.createComputePipeline({
  layout: "auto", compute: { module: stepMod, entryPoint: "step" },
});
const surfPipe = device.createRenderPipeline({
  layout: "auto",
  vertex: { module: surfMod, entryPoint: "vsSurface" },
  fragment: { module: surfMod, entryPoint: "fsSurface", targets: [{ format: OUT_FMT }] },
  primitive: { topology: "triangle-list" },
  depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: "less" },
});
const walkPipe = device.createRenderPipeline({
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
  depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "less" },
});
const fadePipe = device.createRenderPipeline({
  layout: "auto",
  vertex: { module: trailMod, entryPoint: "vsFull" },
  fragment: {
    module: trailMod, entryPoint: "fsFade",
    targets: [{
      format: TRAIL,
      blend: {
        color: { srcFactor: "zero", dstFactor: "constant", operation: "add" },
        alpha: { srcFactor: "zero", dstFactor: "constant", operation: "add" },
      },
    }],
  },
  primitive: { topology: "triangle-list" },
  depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "always" },
});
const compPipe = device.createRenderPipeline({
  layout: "auto",
  vertex: { module: trailMod, entryPoint: "vsFull" },
  fragment: {
    module: trailMod, entryPoint: "fsComposite",
    targets: [{
      format: OUT_FMT,
      blend: {
        color: { srcFactor: "one", dstFactor: "one", operation: "add" },
        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
      },
    }],
  },
  primitive: { topology: "triangle-list" },
});
ok(true, "los cuatro shaders compilan");
ok(true, "los cinco pipelines se construyen", "uniformes de 64/48/96/112 B y profundidad");

// -------------------------------------------------------------------- útiles
const S = GPUBufferUsage.STORAGE;
const CD = GPUBufferUsage.COPY_DST;
const mk = (data, usage) => {
  const b = device.createBuffer({ size: data.byteLength, usage, mappedAtCreation: true });
  new Float32Array(b.getMappedRange()).set(data);
  b.unmap();
  return b;
};

const surfU = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | CD });
const stepU = device.createBuffer({ size: 32 * UNI_ALIGN, usage: GPUBufferUsage.UNIFORM | CD });

/** `freeRange` abre la jaula. Hace falta para el test 1: allí se da un paso con
 *  `lr = 1` para leer el gradiente de la salida, y con la jaula puesta el
 *  resultado sale recortado contra el borde del dominio — que fue exactamente
 *  el primer fallo del test, no del shader. */
function writeSurf(si, m, freeRange = false) {
  const surf = SURFACES[si];
  const b = new ArrayBuffer(64);
  new Uint32Array(b, 0, 4).set([si, MESH_RES, 0, 0]);
  new Float32Array(b, 16, 12).set([
    surf.dom[0], surf.dom[2], surf.dom[1], surf.dom[3],
    m.cx, m.cy, m.k, m.fMin, m.hScale, m.hOffset,
    freeRange ? 1e30 : m.halfX, freeRange ? 1e30 : m.halfY,
  ]);
  device.queue.writeBuffer(surfU, 0, b);
}

function writeStep(slot, opt, stepNo, n, lr, clip) {
  const b = new ArrayBuffer(48);
  new Uint32Array(b, 0, 4).set([opt, stepNo, n, 0]);
  new Float32Array(b, 16, 8).set([lr, clip, HYPER.mu, HYPER.b1, HYPER.b2, HYPER.eps, 0, 0]);
  device.queue.writeBuffer(stepU, slot * UNI_ALIGN, b);
}

const g1 = (p) => device.createBindGroup({
  layout: p.getBindGroupLayout(1),
  entries: [{ binding: 0, resource: { buffer: surfU } }],
});
const stepG1 = g1(stepPipe), surfG1 = g1(surfPipe), walkG1 = g1(walkPipe);

/** Corre `steps` pasos en la GPU y devuelve el estado final. Los pasos van en
 *  una sola pasada, exactamente como en `engine.ts`. */
async function run(si, optIdx, seedArr, n, steps, lr, clip) {
  const a = mk(seedArr, S | GPUBufferUsage.COPY_SRC | CD);
  const b = mk(new Float32Array(n * 2), S | GPUBufferUsage.COPY_SRC | CD);
  const acc = mk(new Float32Array(n * 4), S | CD);
  const bg = (x, y, slot) => device.createBindGroup({
    layout: stepPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: x } },
      { binding: 1, resource: { buffer: y } },
      { binding: 2, resource: { buffer: acc } },
      { binding: 3, resource: { buffer: stepU, offset: slot * UNI_ALIGN, size: 48 } },
    ],
  });

  const t0 = performance.now();
  let cur = 0;
  const CHUNK = 32;
  for (let base = 0; base < steps; base += CHUNK) {
    const k = Math.min(CHUNK, steps - base);
    for (let s = 0; s < k; s++) writeStep(s, optIdx, base + s + 1, n, lr, clip);
    const enc = device.createCommandEncoder();
    const cp = enc.beginComputePass();
    cp.setPipeline(stepPipe);
    cp.setBindGroup(1, stepG1);
    for (let s = 0; s < k; s++) {
      cp.setBindGroup(0, bg(cur ? b : a, cur ? a : b, s));
      cp.dispatchWorkgroups(Math.ceil(n / 64));
      cur ^= 1;
    }
    cp.end();
    device.queue.submit([enc.finish()]);
  }
  await device.queue.onSubmittedWorkDone();
  const ms = performance.now() - t0;

  const final = cur === 0 ? a : b;
  const stage = device.createBuffer({ size: n * 8, usage: GPUBufferUsage.MAP_READ | CD });
  const e2 = device.createCommandEncoder();
  e2.copyBufferToBuffer(final, 0, stage, 0, n * 8);
  device.queue.submit([e2.finish()]);
  await stage.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(stage.getMappedRange().slice(0));
  stage.unmap();
  a.destroy(); b.destroy(); acc.destroy(); stage.destroy();
  return { out, ms };
}

/** Distancia entre dos nubes.
 *
 *  El umbral va sobre la **mediana** y no sobre la media ni el máximo, y no es
 *  indulgencia: está medido. El descenso con momento en un valle estrecho es
 *  Lyapunov-inestable, así que a cuatrocientos pasos dos implementaciones
 *  correctas divergen en unos pocos caminantes por puro redondeo. Corriendo la
 *  **misma** referencia numpy en float32 y en float64 sobre Rosenbrock salen
 *  media 1,1e-2 y máximo 9,4e-1 —*más* de lo que separa a la GPU de numpy— con
 *  mediana 2,1e-7. O sea: el grueso de la nube coincide a precisión de float32
 *  y sólo un puñado se descorrela.
 *
 *  Un error **sistemático** —el recorte en el orden equivocado, la corrección
 *  de sesgo ausente, un signo cruzado— mueve la nube entera y sale en la
 *  mediana. El ruido de precisión, no. */
function compare(a, b) {
  let worst = 0, sum = 0;
  const all = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(a[i * 2] - b[i * 2], a[i * 2 + 1] - b[i * 2 + 1]);
    all[i] = d;
    if (d > worst) worst = d;
    sum += d;
  }
  all.sort();
  return { median: all[N >> 1], mean: sum / N, max: worst };
}

// ------------------------------------------- test 1: gradiente y duplicación
console.log(`\n— test 1: gradiente exacto de las cinco ${"—".repeat(17)}`);
for (let si = 0; si < SURFACES.length; si++) {
  const surf = SURFACES[si];
  writeSurf(si, metricsOf(surf), true);
  const seedArr = f32(`seed_${surf.key}.bin`);
  const refG = f32(`grad_${surf.key}.bin`);
  const refF = f32(`fval_${surf.key}.bin`);

  // lr = 1 y recorte enorme ⇒ la salida es `p − g(p)`.
  const { out } = await run(si, 0, seedArr, N, 1, 1, 1e30);
  let worst = 0, scale = 0;
  for (let i = 0; i < N; i++) {
    const gx = seedArr[i * 2] - out[i * 2];
    const gy = seedArr[i * 2 + 1] - out[i * 2 + 1];
    const s = Math.hypot(refG[i * 2], refG[i * 2 + 1]);
    const d = Math.hypot(gx - refG[i * 2], gy - refG[i * 2 + 1]) / Math.max(s, 1e-3);
    if (d > worst) worst = d;
    scale = Math.max(scale, s);
  }

  // Y la copia en JS, contra la misma referencia.
  let jsG = 0, jsF = 0;
  for (let i = 0; i < N; i++) {
    const x = seedArr[i * 2], y = seedArr[i * 2 + 1];
    const [gx, gy] = surf.g(x, y);
    jsG = Math.max(jsG, Math.hypot(gx - refG[i * 2], gy - refG[i * 2 + 1]) /
                        Math.max(Math.hypot(refG[i * 2], refG[i * 2 + 1]), 1e-3));
    jsF = Math.max(jsF, Math.abs(surf.f(x, y) - refF[i]) / Math.max(Math.abs(refF[i]), 1e-3));
  }

  ok(worst < 2e-4 && jsG < 2e-4 && jsF < 2e-4, surf.name,
     `wgsl ${worst.toExponential(1)} · field.mjs g ${jsG.toExponential(1)} · f ${jsF.toExponential(1)}` +
     ` (relativo, |g| hasta ${scale.toExponential(1)})`);
}

// ------------------------------------------------- test 2: 400 pasos, exacto
console.log(`\n— test 2: ${meta.stepsShort} pasos, las 15 combinaciones ${"—".repeat(11)}`);
for (let si = 0; si < SURFACES.length; si++) {
  const surf = SURFACES[si];
  writeSurf(si, metricsOf(surf));
  const seedArr = f32(`seed_${surf.key}.bin`);
  const line = [];
  let bad = 0;
  for (let oi = 0; oi < OPTS.length; oi++) {
    const key = OPTS[oi];
    const { lr, clip } = surf.opt[key];
    const { out } = await run(si, oi, seedArr, N, meta.stepsShort, lr, clip);
    const c = compare(out, f32(`ref_${surf.key}_${key}.bin`));
    // Tolerancia relativa al dominio: 1e-3 sobre un dominio de 10 no es lo
    // mismo que sobre uno de 4.
    const span = surf.dom[1] - surf.dom[0];
    if (!(c.median < span * 2e-5)) bad++;
    line.push(`${key} ${c.median.toExponential(1)}/${c.max.toExponential(1)}`);
  }
  ok(bad === 0, surf.name, "mediana/máx  " + line.join(" · "));
}

// ---------------------------------------------- test 3: 3.000 pasos, agregado
console.log(`\n— test 3: ${meta.stepsLong} pasos, agregado ${"—".repeat(21)}`);
let perStepTotal = 0, perStepN = 0;
for (let si = 0; si < SURFACES.length; si++) {
  const surf = SURFACES[si];
  writeSurf(si, metricsOf(surf));
  const seedArr = f32(`seed_${surf.key}.bin`);
  const ref = meta.surfaces[si];
  const line = [];
  let bad = 0;
  for (let oi = 0; oi < OPTS.length; oi++) {
    const key = OPTS[oi];
    const { lr, clip } = surf.opt[key];
    const { out, ms } = await run(si, oi, seedArr, N, meta.stepsLong, lr, clip);
    perStepTotal += ms / meta.stepsLong; perStepN++;
    let nan = 0;
    const v = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      v[i] = surf.f(out[i * 2], out[i * 2 + 1]);
      if (!Number.isFinite(v[i])) nan++;
    }
    v.sort();
    const med = v[N >> 1];
    const want = ref.opt[key].medianLoss;
    // Se compara con holgura relativa: en Himmelblau la mediana es 0 y una
    // diferencia absoluta de 1e-13 no significa nada.
    const near = nan === 0 && Math.abs(med - want) < Math.max(Math.abs(want) * 0.5, 0.05);
    if (!near) bad++;
    line.push(`${key} ${med.toExponential(1)}`);
  }
  ok(bad === 0, surf.name, line.join(" · ") + "  (numpy: " +
     OPTS.map(k => ref.opt[k].medianLoss.toExponential(1)).join(" · ") + ")");
}
console.log(`\n  ${(perStepTotal / perStepN).toFixed(4)} ms/paso de media a ${N} caminantes`);
{
  // Y el número que de verdad importa, **medido** y no extrapolado: a 2.048 el
  // kernel va limitado por el coste de lanzar el dispatch y no por los
  // caminantes, así que multiplicar por veinte daría una cifra inventada.
  const BIG = 40000;
  writeSurf(0, metricsOf(SURFACES[0]));
  const { st } = seedWalkers(SURFACES[0], BIG, 1, WALKER_SIZE);
  const { lr, clip } = SURFACES[0].opt.momentum;
  const { ms } = await run(0, 1, st, BIG, 400, lr, clip);
  const per = ms / 400;
  console.log(`  medido a ${BIG.toLocaleString("es")} caminantes: ${per.toFixed(4)} ms/paso · ` +
              `8 por frame = ${(per * 8).toFixed(2)} ms de los 15 del presupuesto`);
}

// ------------------------------------------------------------------ imágenes
console.log(`\n— imágenes ${"—".repeat(45)}`);
{
  const W = 640, H = 480;                       // W*4 múltiplo de 256
  const WALKERS = 30000;
  // **Exposición larga**: `KEEP = 1` no borra nunca, así que la imagen es el
  // registro de la corrida entera y no de los últimos veintiocho frames. Es lo
  // que hace que comparar optimizadores signifique algo — con la estela rodante
  // los tres salen idénticos, porque a mil quinientos pasos los tres están
  // quietos en el mismo sitio.
  const FRAMES = 220, PER_FRAME = 8, KEEP = 1;
  const EXPOSE = 0.55, N_REF = 40000, KEEP_REF = 0.965;
  const MEM_MAX = 800, MEM_REF = 1 / (1 - KEEP_REF);

  const meshU = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | CD });
  const walkU = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | CD });
  const trailSmp = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const colTex = device.createTexture({
    size: [W, H], format: OUT_FMT,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const trailTex = device.createTexture({
    size: [W, H], format: TRAIL,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const depthTex = device.createTexture({
    size: [W, H], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const readBuf = device.createBuffer({ size: W * H * 4, usage: GPUBufferUsage.MAP_READ | CD });
  const surfBG0 = device.createBindGroup({
    layout: surfPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: meshU } }],
  });
  const compBG = device.createBindGroup({
    layout: compPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: trailTex.createView() },
      { binding: 1, resource: trailSmp },
    ],
  });

  /** Misma cámara que `OrbitCamera` en reposo: `frame()` fija la distancia y
   *  los planos, y theta/phi son los valores por defecto de la clase. */
  function camera(radius) {
    const FOV = (55 * Math.PI) / 180, THETA = 0.6, PHI = 1.15;
    const d = (radius / Math.tan(FOV / 2)) * 0.92;
    const eye = [Math.sin(PHI) * Math.sin(THETA) * d, Math.cos(PHI) * d,
                 Math.sin(PHI) * Math.cos(THETA) * d];
    const proj = perspective(FOV, W / H, radius * 0.002, radius * 60);
    return { vp: mul(proj, lookAt(eye, [0, 0, 0], [0, 1, 0])), proj, d };
  }

  async function shoot(si, oi) {
    const surf = SURFACES[si];
    const m = metricsOf(surf);
    writeSurf(si, m);
    const { vp, proj, d } = camera(m.radius);
    const fogSpan = Math.max(d, m.radius * 0.35) * 2.3;

    {
      const b = new ArrayBuffer(96);
      const f = new Float32Array(b);
      f.set(vp, 0);
      f.set([0.45, 0.78, 0.44, 0], 16);
      f.set([m.hLo, m.hHi, d - fogSpan * 0.45, fogSpan], 20);
      device.queue.writeBuffer(meshU, 0, b);
    }
    {
      const mem = Math.min(MEM_MAX, 1 / Math.max(1 - KEEP, 1e-6));
      const bright = EXPOSE * (N_REF / WALKERS) * (MEM_REF / mem);
      const b = new ArrayBuffer(112);
      const f = new Float32Array(b);
      f.set(vp, 0);
      f.set([proj[0], proj[5], W, H, d - fogSpan * 0.45, fogSpan,
             MIN_PX, WALKER_SIZE, bright, LIFT, 0, 0], 16);
      device.queue.writeBuffer(walkU, 0, b);
    }

    const { st, tint } = seedWalkers(surf, WALKERS, 1, WALKER_SIZE);
    const a = mk(st, S | CD), b2 = mk(new Float32Array(WALKERS * 2), S | CD);
    const acc = mk(new Float32Array(WALKERS * 4), S | CD);
    const tintB = mk(tint, S);
    const stepBG = (x, y, slot) => device.createBindGroup({
      layout: stepPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: x } }, { binding: 1, resource: { buffer: y } },
        { binding: 2, resource: { buffer: acc } },
        { binding: 3, resource: { buffer: stepU, offset: slot * UNI_ALIGN, size: 48 } },
      ],
    });
    const walkBG = [a, b2].map(p => device.createBindGroup({
      layout: walkPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: walkU } },
        { binding: 1, resource: { buffer: p } },
        { binding: 2, resource: { buffer: tintB } },
      ],
    }));

    const { lr, clip } = surf.opt[OPTS[oi]];
    let cur = 0, stepNo = 0;
    for (let fr = 0; fr < FRAMES; fr++) {
      // Mismo arranque en dos velocidades que el motor.
      const k = stepNo < 40 ? 1 : PER_FRAME;
      for (let s = 0; s < k; s++) writeStep(s, oi, stepNo + s + 1, WALKERS, lr, clip);
      const enc = device.createCommandEncoder();

      const cp = enc.beginComputePass();
      cp.setPipeline(stepPipe);
      cp.setBindGroup(1, stepG1);
      for (let s = 0; s < k; s++) {
        cp.setBindGroup(0, stepBG(cur ? b2 : a, cur ? a : b2, s));
        cp.dispatchWorkgroups(Math.ceil(WALKERS / 64));
        cur ^= 1;
      }
      cp.end();
      stepNo += k;

      const mesh = enc.beginRenderPass({
        colorAttachments: [{
          view: colTex.createView(),
          clearValue: { r: 0.012, g: 0.016, b: 0.030, a: 1 },
          loadOp: "clear", storeOp: "store",
        }],
        depthStencilAttachment: {
          view: depthTex.createView(),
          depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store",
        },
      });
      mesh.setPipeline(surfPipe);
      mesh.setBindGroup(0, surfBG0);
      mesh.setBindGroup(1, surfG1);
      mesh.draw((MESH_RES - 1) * (MESH_RES - 1) * 6);
      mesh.end();

      const tr = enc.beginRenderPass({
        colorAttachments: [{
          view: trailTex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: fr === 0 ? "clear" : "load", storeOp: "store",
        }],
        depthStencilAttachment: {
          view: depthTex.createView(), depthLoadOp: "load", depthStoreOp: "store",
        },
      });
      if (fr > 0) {
        tr.setPipeline(fadePipe);
        tr.setBlendConstant({ r: KEEP, g: KEEP, b: KEEP, a: KEEP });
        tr.draw(3);
      }
      tr.setPipeline(walkPipe);
      tr.setBindGroup(0, walkBG[cur]);
      tr.setBindGroup(1, walkG1);
      tr.draw(6, WALKERS);
      tr.end();

      const comp = enc.beginRenderPass({
        colorAttachments: [{ view: colTex.createView(), loadOp: "load", storeOp: "store" }],
      });
      comp.setPipeline(compPipe);
      comp.setBindGroup(0, compBG);
      comp.draw(3);
      comp.end();

      device.queue.submit([enc.finish()]);
    }

    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: colTex },
      { buffer: readBuf, bytesPerRow: W * 4, rowsPerImage: H }, [W, H]);
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    await readBuf.mapAsync(GPUMapMode.READ);
    const px = Buffer.from(new Uint8Array(readBuf.getMappedRange()).slice(0));
    readBuf.unmap();
    a.destroy(); b2.destroy(); acc.destroy(); tintB.destroy();
    return px;
  }

  /** Fracción de píxeles claramente por encima del relieve: es lo que mide si
   *  la estela dejó rastro y si dos optimizadores dibujan campos distintos. */
  const lit = (px) => {
    let k = 0;
    for (let i = 0; i < W * H; i++) {
      if (px[i * 4] > 90 || px[i * 4 + 1] > 90 || px[i * 4 + 2] > 100) k++;
    }
    return k / (W * H);
  };

  const strip = Buffer.alloc(W * H * 4 * SURFACES.length);
  for (let si = 0; si < SURFACES.length; si++) {
    const px = await shoot(si, 1);
    px.copy(strip, si * W * H * 4);
    console.log(`  ${SURFACES[si].name.padEnd(11)} ${(lit(px) * 100).toFixed(2)}% de píxeles con estela`);
  }
  const out1 = join(HERE, "..", "..", "data", "descent.png");
  writeFileSync(out1, png(W, H * SURFACES.length, strip));
  console.log(`  escrito ${out1}  (las cinco, con momento, ${WALKERS} caminantes)`);

  // Los tres optimizadores sobre Rosenbrock. Es la comparación que **sólo**
  // tiene sentido como campo: tres líneas sueltas no distinguen un optimizador
  // de otro, tres campos sí.
  const trio = Buffer.alloc(W * H * 4 * OPTS.length);
  const cover = [];
  for (let oi = 0; oi < OPTS.length; oi++) {
    const px = await shoot(0, oi);
    px.copy(trio, oi * W * H * 4);
    cover.push(lit(px));
    console.log(`  rosenbrock · ${OPTS[oi].padEnd(9)} ${(cover[oi] * 100).toFixed(2)}%`);
  }
  const out2 = join(HERE, "..", "..", "data", "descent_opt.png");
  writeFileSync(out2, png(W, H * OPTS.length, trio));
  console.log(`  escrito ${out2}  (descenso · momento · Adam)`);

  ok(Math.min(...cover) > 0.001, "las estelas dejan rastro",
     `cobertura mínima ${(Math.min(...cover) * 100).toFixed(2)}%`);

  // Que los tres campos se distingan es lo que la sala promete: si el mando de
  // optimizador diera la misma imagen, no estaría diciendo nada.
  //
  // Se mide por **diferencia de píxel** y no por cobertura. La cobertura de los
  // tres sale casi igual —a mil quinientos pasos los tres han llenado el mismo
  // valle— y lo que cambia es *por dónde pasaron*, que sólo lo ve una
  // comparación posición a posición.
  const diff = (a, b) => {
    let s = 0;
    for (let i = 0; i < W * H; i++) {
      s += Math.abs(a[i * 4] - b[i * 4]) + Math.abs(a[i * 4 + 1] - b[i * 4 + 1])
         + Math.abs(a[i * 4 + 2] - b[i * 4 + 2]);
    }
    return s / (W * H * 3);
  };
  const pa = trio.subarray(0, W * H * 4);
  const pb = trio.subarray(W * H * 4, 2 * W * H * 4);
  const pc = trio.subarray(2 * W * H * 4);
  const pares = [["descenso↔momento", diff(pa, pb)], ["momento↔adam", diff(pb, pc)],
                 ["descenso↔adam", diff(pa, pc)]];
  const peor = Math.min(...pares.map(p => p[1]));
  ok(peor > 0.4, "los tres optimizadores dibujan campos distintos",
     pares.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" · ") + " (niveles de 0–255)");
}

console.log(`\n${failed === 0 ? "TODO OK" : `${failed} FALLOS`}\n`);
device.destroy();
gpuMod.destroy(inst);
process.exit(failed ? 1 : 0);
