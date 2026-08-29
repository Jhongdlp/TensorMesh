/**
 * Valida la sala 07 — Red Neuronal.
 *
 *   node test/nn.mjs
 *   NN_BATCHES=4000 NN_W=1920 NN_H=1080 node test/nn.mjs
 *
 * Tres cosas, y las tres sólo se pueden hacer aquí:
 *
 * Test 1 — **el gradiente**. `trainBatch` retropropaga; esta prueba compara sus
 *          gradientes contra diferencias finitas de la propia pérdida, para las
 *          tres activaciones. Es la única red que impide que un signo cambiado
 *          en `actGrad` pase por «converge un poco peor»: la sala seguiría
 *          entrenando, sólo que hacia el sitio equivocado.
 * Test 2 — **aprende**. Cada conjunto con la arquitectura de casa hasta un
 *          umbral de acierto. El de la espiral es bajo a propósito: que la
 *          espiral cueste es la lección del capítulo 3, no un fallo.
 * Test 3 — **compila el shader y construye los cinco pipelines**. `npm run
 *          check` no mira los `.wgsl`, así que esto es su único linter. Y en
 *          esta máquina Chrome cae al respaldo WebGL, donde este shader ni
 *          existe: la sala **sólo** se puede ver por Dawn.
 * Imagen  — la escena entera, con la red entrenada. Míralo, es media prueba:
 *           `data/nn.png`.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import gpuMod from "@kmamal/gpu";
import { png } from "./png.mjs";
import { perspective, lookAt, mul } from "./mat.mjs";
// Del propio `src`: estos dos módulos existen justo para que la imagen sea la
// de la sala y no una recreación que se despega en el primer retoque.
import { Mlp, DATASETS, mulberry32, fieldColor, weightColor, CLASS_A, CLASS_B } from "../src/rooms/nn/math.mjs";
import {
  FLOOR_Y, FLOOR_HALF, R_HIDDEN, R_EDGE, CAM, AXIS_X, AXIS_Y, nodeLayout, nodeIndex,
} from "../src/rooms/nn/layout.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "rooms", "nn");

const W = Number(process.env.NN_W ?? 1920);
const H = Number(process.env.NN_H ?? 1080);
const BATCHES = Number(process.env.NN_BATCHES ?? 2600);
// Tienen que coincidir con `engine.ts`.
const FIELD_RES = 128;
const OUT_FMT = "rgba8unorm";
const DEPTH = "depth24plus";

let failed = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "OK " : "!! "}${label}${detail ? "  " + detail : ""}`);
  if (!cond) failed++;
};

// ================================================================== test 1
console.log(`\n— gradiente contra diferencias finitas ${"—".repeat(20)}`);

/** Pérdida media del lote entero, sin tocar los pesos. */
function lossOf(net, pts) {
  let s = 0;
  for (const p of pts) {
    const o = Math.min(1 - 1e-7, Math.max(1e-7, net.forward(p.x, p.y)));
    s += -(p.label * Math.log(o) + (1 - p.label) * Math.log(1 - o));
  }
  return s / pts.length;
}

/**
 * Qué unidades ocultas están encendidas, para cada muestra.
 *
 * ReLU tiene un codo en cero, y una diferencia finita que lo cruza compara dos
 * funciones lineales distintas: no puede coincidir con ninguna derivada. Si el
 * patrón de encendidos es el mismo a un lado y al otro de la perturbación, no
 * se ha cruzado ningún codo y ahí la comprobación **sí** tiene que salir
 * exacta. Descartar esos pesos es lo honesto; aflojar el umbral hasta que
 * pasen sería tapar también un signo cambiado de verdad.
 */
function pattern(net, pts) {
  let k = "";
  for (const p of pts) {
    net.forward(p.x, p.y);
    for (let l = 1; l < net.sizes.length - 1; l++) {
      for (let i = 0; i < net.sizes[l]; i++) k += net.A[l][i] > 0 ? "1" : "0";
    }
  }
  return k;
}

for (const act of ["relu", "tanh", "sigmoid"]) {
  const rnd = mulberry32(11);
  const pts = DATASETS[1].generate(24, 0.1, rnd);
  const net = new Mlp([2, 5, 4, 1], act, 5);
  const idx = new Int32Array(pts.length).map((_, i) => i);

  // `trainBatch` con lr = 0 acumula los gradientes y no mueve nada, así que
  // los pesos que se perturban después son exactamente los que los produjeron.
  net.trainBatch(pts, idx, 0, pts.length, 0);
  const grads = net.gW.map((g) => Float32Array.from(g));

  // 1e-2 y no 1e-6: los pesos son `Float32Array`, así que un paso más corto se
  // pierde en el redondeo del propio almacenamiento y el cociente sale
  // ruidoso. Con 1e-2 el error de truncamiento sigue por debajo de 1e-3.
  const EPS = 1e-2;
  let worst = 0, worstAt = "", skipped = 0, checked = 0;
  for (let l = 0; l < net.W.length; l++) {
    for (let k = 0; k < net.W[l].length; k++) {
      const w0 = net.W[l][k];
      net.W[l][k] = w0 + EPS;
      const up = lossOf(net, pts);
      const pUp = pattern(net, pts);
      net.W[l][k] = w0 - EPS;
      const dn = lossOf(net, pts);
      const pDn = pattern(net, pts);
      net.W[l][k] = w0;
      // Sólo ReLU tiene codo: en tanh y sigmoide el signo de la activación
      // no marca ninguna frontera y descartar por él sería descartar al azar.
      if (act === "relu" && pUp !== pDn) { skipped++; continue; }
      checked++;
      const num = ((up - dn) / (2 * EPS)) * pts.length;   // gW no está promediado
      const ana = grads[l][k];
      const scale = Math.max(1e-3, Math.abs(num) + Math.abs(ana));
      const rel = Math.abs(num - ana) / scale;
      if (rel > worst) { worst = rel; worstAt = `capa ${l}, peso ${k}`; }
    }
  }
  ok(worst < 0.005 && checked > 10, `${act.padEnd(8)} error relativo máximo`,
     `${worst.toExponential(2)} (${worstAt}) · ${checked} pesos, ${skipped} descartados por el codo`);
}

// ================================================================== test 2
console.log(`\n— aprende ${"—".repeat(48)}`);
// Umbrales por conjunto, con la arquitectura de casa. La espiral va baja a
// propósito: que cueste es lo que enseña, no lo que falla.
const WANT = { gauss: 0.97, circle: 0.96, xor: 0.90, moons: 0.90, spiral: 0.70 };

for (const d of DATASETS) {
  const rnd = mulberry32(7);
  const pts = d.generate(420, 0.1, rnd);
  const net = new Mlp([2, 6, 6, 1], "tanh", 3);
  const idx = new Int32Array(pts.length).map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  let cursor = 0;
  for (let s = 0; s < 3000; s++) {
    net.trainBatch(pts, idx, cursor, 16, 0.35);
    cursor += 16;
  }
  const e = net.evaluate(pts);
  ok(e.acc >= WANT[d.id], `${d.id.padEnd(8)} acierto`, `${(e.acc * 100).toFixed(1)}% (mínimo ${(WANT[d.id] * 100).toFixed(0)}%), pérdida ${e.loss.toFixed(3)}`);
}

// El campo tiene que salir dentro de rango en los dos modos, porque va a un
// `rgba8unorm` y cualquier desbordamiento se ve como una banda plana.
{
  const net = new Mlp([2, 6, 6, 1], "relu", 2);
  const f = new Float32Array(32 * 32);
  net.sampleField(f, 32, -1, 0);
  const a = [Math.min(...f), Math.max(...f)];
  net.sampleField(f, 32, 1, 2);
  const b = [Math.min(...f), Math.max(...f)];
  ok(a[0] >= 0 && a[1] <= 1 && b[0] >= 0 && b[1] <= 1, "el campo cae en [0,1]",
     `salida ${a[0].toFixed(2)}–${a[1].toFixed(2)}, neurona ${b[0].toFixed(2)}–${b[1].toFixed(2)}`);
}

// ================================================================== test 3
console.log(`\n— WebGPU ${"—".repeat(49)}`);
Object.assign(globalThis, gpuMod);
const inst = gpuMod.create([]);
const adapter = await inst.requestAdapter();
if (!adapter) { console.error("sin adaptador WebGPU"); process.exit(1); }
const device = await adapter.requestDevice();
console.log(`  ${adapter.info?.description || adapter.info?.vendor || "adaptador"}`);

const code = readFileSync(join(SRC, "nn_render.wgsl"), "utf8");
const mod = device.createShaderModule({ code });
{
  const info = await mod.getCompilationInfo();
  let bad = 0;
  for (const m of info.messages) {
    console.log(`  WGSL ${m.type} línea ${m.lineNum}: ${m.message}`);
    if (m.type === "error") bad++;
  }
  if (bad) process.exit(1);
}

const bgl = device.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
  ],
});
const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
const alpha = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};
const add = {
  color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
};
const depth = (write) => ({ format: DEPTH, depthWriteEnabled: write, depthCompare: "less-equal" });
const lineBuffers = [{
  arrayStride: 32,
  attributes: [
    { shaderLocation: 0, offset: 0, format: "float32x4" },
    { shaderLocation: 1, offset: 16, format: "float32x4" },
  ],
}];
const instBuffers = [{
  arrayStride: 48, stepMode: "instance",
  attributes: [
    { shaderLocation: 0, offset: 0, format: "float32x4" },
    { shaderLocation: 1, offset: 16, format: "float32x4" },
    { shaderLocation: 2, offset: 32, format: "float32x4" },
  ],
}];

const floorPipe = device.createRenderPipeline({
  layout,
  vertex: { module: mod, entryPoint: "vsFloor" },
  fragment: { module: mod, entryPoint: "fsFloor", targets: [{ format: OUT_FMT, blend: alpha }] },
  primitive: { topology: "triangle-list" },
  depthStencil: depth(true),
});
const gridPipe = device.createRenderPipeline({
  layout,
  vertex: { module: mod, entryPoint: "vsLine", buffers: lineBuffers },
  fragment: { module: mod, entryPoint: "fsLine", targets: [{ format: OUT_FMT, blend: alpha }] },
  primitive: { topology: "line-list" },
  depthStencil: depth(false),
});
const edgePipe = device.createRenderPipeline({
  layout,
  vertex: { module: mod, entryPoint: "vsLine", buffers: lineBuffers },
  fragment: { module: mod, entryPoint: "fsLine", targets: [{ format: OUT_FMT, blend: add }] },
  primitive: { topology: "line-list" },
  depthStencil: depth(false),
});
const nodePipe = device.createRenderPipeline({
  layout,
  vertex: { module: mod, entryPoint: "vsNode", buffers: instBuffers },
  fragment: { module: mod, entryPoint: "fsNode", targets: [{ format: OUT_FMT, blend: alpha }] },
  primitive: { topology: "triangle-list", cullMode: "none" },
  depthStencil: depth(true),
});
const pointPipe = device.createRenderPipeline({
  layout,
  vertex: { module: mod, entryPoint: "vsNode", buffers: instBuffers },
  fragment: { module: mod, entryPoint: "fsNode", targets: [{ format: OUT_FMT, blend: alpha }] },
  primitive: { topology: "triangle-list", cullMode: "none" },
  depthStencil: depth(false),
});
const pulsePipe = device.createRenderPipeline({
  layout,
  vertex: { module: mod, entryPoint: "vsPulse", buffers: instBuffers },
  fragment: { module: mod, entryPoint: "fsPulse", targets: [{ format: OUT_FMT, blend: add }] },
  primitive: { topology: "triangle-list", cullMode: "none" },
  depthStencil: depth(false),
});
ok(true, "el shader compila y los seis pipelines se construyen",
   "uniforme de 160 B, vértices de 32 B y instancias de 48 B");

// ================================================================== imagen
console.log(`\n— imagen ${"—".repeat(50)}`);

// La red de la foto: la de casa sobre el anillo, ya entrenada. Con los pesos
// recién inicializados el suelo sale liso y la imagen no enseña nada.
const rnd = mulberry32(7);
const all = DATASETS[1].generate(420, 0.12, rnd);
const train = [], test = [];
for (let i = 0; i < all.length; i++) (i % 10 < 7 ? train : test).push(all[i]);
const net = new Mlp([2, 6, 6, 1], "tanh", 3);
const order = new Int32Array(train.length).map((_, i) => i);
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  const t = order[i]; order[i] = order[j]; order[j] = t;
}
for (let s = 0, c = 0; s < BATCHES; s++, c += 16) net.trainBatch(train, order, c, 16, 0.12);
const ev = net.evaluate(train);
console.log(`  ${BATCHES} lotes · acierto ${(ev.acc * 100).toFixed(1)}% · pérdida ${ev.loss.toFixed(3)}`);

const sizes = net.sizes;
const nodes = nodeLayout(sizes);
const meanAct = sizes.map((n) => new Float32Array(n));
net.meanActivation(train, meanAct);

const f32buf = (arr, usage) => {
  const data = new Float32Array(arr);
  const b = device.createBuffer({ size: Math.max(64, data.byteLength), usage, mappedAtCreation: true });
  new Float32Array(b.getMappedRange()).set(data);
  b.unmap();
  return b;
};
const VTX = GPUBufferUsage.VERTEX;

// --- suelo: la textura del campo, igual que en `engine.ts` -----------------
const field = new Float32Array(FIELD_RES * FIELD_RES);
net.sampleField(field, FIELD_RES, -1, 0);
const bytes = new Uint8Array(FIELD_RES * FIELD_RES * 4);
for (let i = 0; i < field.length; i++) {
  const c = fieldColor(field[i]);
  bytes[i * 4] = Math.round(c[0] * 255);
  bytes[i * 4 + 1] = Math.round(c[1] * 255);
  bytes[i * 4 + 2] = Math.round(c[2] * 255);
  bytes[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, field[i])) * 255);
}
const tex = device.createTexture({
  size: [FIELD_RES, FIELD_RES], format: "rgba8unorm",
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
device.queue.writeTexture({ texture: tex }, bytes,
  { bytesPerRow: FIELD_RES * 4, rowsPerImage: FIELD_RES }, { width: FIELD_RES, height: FIELD_RES });

// --- rejilla ---------------------------------------------------------------
const grid = [];
{
  const Y = FLOOR_Y + 0.004, N = 8;
  const put = (x1, z1, x2, z2, c, a) => {
    grid.push(x1, Y, z1, 0, c[0], c[1], c[2], a, x2, Y, z2, 0, c[0], c[1], c[2], a);
  };
  for (let i = 0; i <= N; i++) {
    const t = -FLOOR_HALF + (2 * FLOOR_HALF * i) / N;
    put(t, -FLOOR_HALF, t, FLOOR_HALF, [1, 1, 1], 0.06);
    put(-FLOOR_HALF, t, FLOOR_HALF, t, [1, 1, 1], 0.06);
  }
  put(-FLOOR_HALF, 0, FLOOR_HALF, 0, AXIS_X, 0.55);
  put(0, -FLOOR_HALF, 0, FLOOR_HALF, AXIS_Y, 0.55);
}

// --- aristas ---------------------------------------------------------------
const edges = [];
{
  const maxW = net.maxWeight();
  let count = 0;
  for (let l = 0; l < sizes.length - 1; l++) count += sizes[l] * sizes[l + 1];
  const norm = Math.sqrt(72 / count);
  for (let l = 0; l < sizes.length - 1; l++) {
    const w = net.W[l], inN = sizes[l], outN = sizes[l + 1];
    for (let j = 0; j < outN; j++) {
      const b = nodes[nodeIndex(sizes, l + 1, j)];
      for (let i = 0; i < inN; i++) {
        const a = nodes[nodeIndex(sizes, l, i)];
        const wv = w[j * inN + i];
        const c = weightColor(wv);
        const al = Math.max(0.012, Math.min(1, Math.abs(wv) / maxW) * norm);
        edges.push(a.x, a.y, a.z, 1, c[0], c[1], c[2], al);
        edges.push(b.x, b.y, b.z, 1, c[0], c[1], c[2], al);
      }
    }
  }
  // Verticales, igual que en `engine.ts`.
  const dash = (a, c, al) => {
    const K = 8;
    for (let k = 0; k < K; k++) {
      const t0 = k / K, t1 = t0 + 0.5 / K;
      const y0 = a.y + (FLOOR_Y + 0.01 - a.y) * t0;
      const y1 = a.y + (FLOOR_Y + 0.01 - a.y) * t1;
      edges.push(a.x, y0, a.z, 0, c[0], c[1], c[2], al);
      edges.push(a.x, y1, a.z, 0, c[0], c[1], c[2], al);
    }
  };
  dash(nodes[0], AXIS_X, 0.40);
  dash(nodes[1], AXIS_Y, 0.40);
  dash(nodes[nodes.length - 1], [1, 1, 1], 0.26);
}

// --- puntos y neuronas -----------------------------------------------------
const points = [];
for (const [set, a] of [[train, 0.95], [test, 0.45]]) {
  for (const p of set) {
    const c = p.label ? CLASS_B : CLASS_A;
    points.push(p.x * FLOOR_HALF, FLOOR_Y + 0.012, p.y * FLOOR_HALF, 0.016,
                c[0], c[1], c[2], a, 0, 0, 2.2, 0);
  }
}

const neurons = [];
{
  const L = sizes.length;
  const layerMax = sizes.map((n, l) => {
    let m = 1e-6;
    for (let i = 0; i < n; i++) m = Math.max(m, meanAct[l][i]);
    return m;
  });
  for (const n of nodes) {
    const isIn = n.layer === 0, isOut = n.layer === L - 1;
    const m = isIn ? 1 : meanAct[n.layer][n.unit] / layerMax[n.layer];
    const alive = isIn || meanAct[n.layer][n.unit] > 0.02;
    const c = isIn ? (n.unit === 0 ? AXIS_X : AXIS_Y) : [1, 1, 1];
    const glow = isIn ? 0.25 : Math.max(0, m - 0.25) * 0.7;
    neurons.push(n.x, n.y, n.z, isIn || isOut ? R_EDGE : R_HIDDEN,
                 c[0], c[1], c[2], alive ? 0.55 + 0.45 * (isIn ? 1 : m) : 0.2,
                 1, glow, 3.4, isOut ? 1 : 0);
  }
}

// --- pulsos ----------------------------------------------------------------
const pulses = [];
{
  const F = [], B = [];
  let maxF = 1e-6, maxB = 1e-6;
  for (let l = 0; l < sizes.length - 1; l++) {
    const w = net.W[l], g = net.gW[l], inN = sizes[l], outN = sizes[l + 1];
    for (let j = 0; j < outN; j++) for (let i = 0; i < inN; i++) {
      const f = Math.abs(w[j * inN + i]) * (l === 0 ? 0.6 : meanAct[l][i]);
      const b = Math.abs(g[j * inN + i]);
      F.push(f); B.push(b);
      maxF = Math.max(maxF, f); maxB = Math.max(maxB, b);
    }
  }
  let k = 0;
  for (let l = 0; l < sizes.length - 1; l++) {
    const inN = sizes[l], outN = sizes[l + 1];
    for (let j = 0; j < outN; j++) {
      const b = nodes[nodeIndex(sizes, l + 1, j)];
      for (let i = 0; i < inN; i++, k++) {
        const a = nodes[nodeIndex(sizes, l, i)];
        const mf = Math.min(1, F[k] / maxF), mb = Math.min(1, B[k] / maxB);
        if (mf < 0.06 && mb < 0.06) continue;
        pulses.push(a.x, a.y, a.z, l, b.x, b.y, b.z, ((i * 7 + j * 13) % 11) / 11, mf, mb, 0, 0);
      }
    }
  }
}

const gridBuf = f32buf(grid, VTX);
const edgeBuf = f32buf(edges, VTX);
const pointBuf = f32buf(points, VTX);
const neuronBuf = f32buf(neurons, VTX);
const pulseBuf = f32buf(pulses, VTX);

// --- cámara y uniforme -----------------------------------------------------
const fov = (55 * Math.PI) / 180;
const near = CAM.radius * 0.002, far = CAM.radius * 60;
const dist = (CAM.radius / Math.tan(fov / 2)) * 0.92;
const sp = Math.sin(CAM.phi);
const eye = [
  CAM.target[0] + dist * sp * Math.sin(CAM.theta),
  CAM.target[1] + dist * Math.cos(CAM.phi),
  CAM.target[2] + dist * sp * Math.cos(CAM.theta),
];
const proj = perspective(fov, W / H, near, far);
const vp = mul(proj, lookAt(eye, CAM.target, [0, 1, 0]));

const u = new Float32Array(64);
u.set(vp, 0);
u[16] = eye[0]; u[17] = eye[1]; u[18] = eye[2]; u[19] = 1;
u[20] = proj[0]; u[21] = proj[5]; u[22] = W; u[23] = H;
u[24] = 0;                       // tiempo
u[25] = 1.55;                    // frente de señal: a media capa, para que se vea
u[26] = 1;                       // hacia delante
u[27] = 1;                       // sin destello
u[28] = 0.92;                    // opacidad del suelo
u[29] = FLOOR_HALF;
u[30] = FLOOR_Y;
u[31] = 1;
u[32] = 0.45; u[33] = 1.0; u[34] = 1.0; u[35] = 1;   // color del pulso de ida
u[36] = 0.042;                   // tamaño del pulso
u[37] = 1;
const uniBuf = device.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
device.queue.writeBuffer(uniBuf, 0, u);

const bg = device.createBindGroup({
  layout: bgl,
  entries: [
    { binding: 0, resource: { buffer: uniBuf } },
    { binding: 1, resource: tex.createView() },
    { binding: 2, resource: device.createSampler({ magFilter: "linear", minFilter: "linear" }) },
  ],
});

const colTex = device.createTexture({
  size: [W, H], format: OUT_FMT,
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
});
const depthTex = device.createTexture({
  size: [W, H], format: DEPTH, usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
const readBuf = device.createBuffer({
  size: W * H * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
});

const enc = device.createCommandEncoder();
const pass = enc.beginRenderPass({
  colorAttachments: [{
    view: colTex.createView(),
    clearValue: { r: 0.043, g: 0.047, b: 0.062, a: 1 },
    loadOp: "clear", storeOp: "store",
  }],
  depthStencilAttachment: {
    view: depthTex.createView(),
    depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store",
  },
});
pass.setBindGroup(0, bg);
pass.setPipeline(floorPipe); pass.draw(6, 1, 0, 0);
pass.setPipeline(gridPipe); pass.setVertexBuffer(0, gridBuf); pass.draw(grid.length / 8, 1, 0, 0);
pass.setPipeline(pointPipe); pass.setVertexBuffer(0, pointBuf); pass.draw(6, points.length / 12, 0, 0);
pass.setPipeline(edgePipe); pass.setVertexBuffer(0, edgeBuf); pass.draw(edges.length / 8, 1, 0, 0);
pass.setPipeline(pulsePipe); pass.setVertexBuffer(0, pulseBuf); pass.draw(6, pulses.length / 12, 0, 0);
pass.setPipeline(nodePipe); pass.setVertexBuffer(0, neuronBuf); pass.draw(6, neurons.length / 12, 0, 0);
pass.end();
enc.copyTextureToBuffer({ texture: colTex },
  { buffer: readBuf, bytesPerRow: W * 4, rowsPerImage: H }, [W, H]);
device.queue.submit([enc.finish()]);
await device.queue.onSubmittedWorkDone();
await readBuf.mapAsync(GPUMapMode.READ);
const px = Buffer.from(new Uint8Array(readBuf.getMappedRange()).slice(0));
readBuf.unmap();

// Que la escena no salga vacía tiene que comprobarlo alguien: un fallo de
// binding no da error, da un PNG del color del fondo.
let lit = 0, rosy = 0, cyan = 0;
for (let i = 0; i < W * H; i++) {
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
  if (r > 40 || g > 40 || b > 55) lit++;
  if (r > 90 && b < r * 0.8) rosy++;
  if (b > 90 && r < b * 0.8) cyan++;
}
ok(lit / (W * H) > 0.10, "la escena tiene contenido", `${((lit / (W * H)) * 100).toFixed(1)}% de píxeles encendidos`);
ok(rosy > 2000 && cyan > 2000, "las dos clases se dibujan",
   `${rosy} píxeles rosa, ${cyan} cian`);

const out = join(HERE, "..", "..", "data", "nn.png");
writeFileSync(out, png(W, H, px));
console.log(`  escrito ${out}  (${W}x${H})`);

console.log(`\n${failed ? `!! ${failed} fallos` : "todo en orden"}\n`);
process.exit(failed ? 1 : 0);
