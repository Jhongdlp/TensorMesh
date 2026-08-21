/**
 * Render de la galaxia fuera del navegador, con los mismos .wgsl que usa la web.
 *
 *   node test/render.mjs [es|en] [pasos]
 *
 * Chrome headless no expone WebGPU en esta máquina, pero Dawn en Node sí llega a
 * la GPU real. Esto ejecuta la física, dibuja a una textura y escribe un PNG, lo
 * que valida los shaders de render y las matrices sin abrir un navegador.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import gpuMod from "@kmamal/gpu";
// El color de zona y los escalones de resalte se importan del propio src: son
// .mjs justamente para que el test no tenga que reimplementarlos y desviarse.
import { zoneColours } from "../src/galaxy/palette.mjs";
import { HL, tiers } from "../src/galaxy/highlight.mjs";

Object.assign(globalThis, gpuMod);

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "galaxy", "gpu");
const LANG = process.argv[2] || "es";
const STEPS = Number(process.argv[3] ?? 250);
// W*4 múltiplo de 256: exigencia de copyTextureToBuffer. W=/H= permiten medir a
// la resolución real del navegador, que es donde el coste de relleno duele:
// 1280×720 son 0,92 Mpx, pero un canvas de 1440p a dpr 2 son 8,3.
const W = Number(process.env.W ?? 1280), H = Number(process.env.H ?? 720);
if (W % 64) throw new Error(`W=${W}: W*4 debe ser múltiplo de 256`);

// ------------------------------------------------------------------ PNG mínimo
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function png(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ matrices
const perspective = (fov, aspect, near, far) => {
  const f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = far / (near - far); m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
};
function lookAt(e, a, up) {
  let zx = e[0] - a[0], zy = e[1] - a[1], zz = e[2] - a[2];
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[4] = xy; m[5] = yy; m[6] = zy;
  m[8] = xz; m[9] = yz; m[10] = zz;
  m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
  m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
  m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
  m[15] = 1;
  return m;
}
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                   a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
};

// ------------------------------------------------------------------ datos
const DATA = join(HERE, "..", "public", "data", LANG);
const rd = (f) => { const b = readFileSync(join(DATA, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const meta = JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8"));
const n = meta.nodes;

const q = new Int16Array(rd("positions.bin"));
const eb = rd("edges.bin");
const offsets = new Uint32Array(eb, 0, n + 1);
const targets = new Uint16Array(eb, (n + 1) * 4, meta.csr);
const weights = new Uint8Array(eb, (n + 1) * 4 + meta.csr * 2, meta.csr);
const ab = rd("attrs.bin");
const community = new Uint8Array(ab, 0, n);
const rank = new Uint16Array(ab, n, n);

const seed = new Float32Array(n * 4);
let cx = 0, cy = 0, cz = 0;
for (let i = 0; i < n; i++) {
  for (let k = 0; k < 3; k++) seed[i * 4 + k] = q[i * 3 + k] * meta.posScale;
  cx += seed[i * 4]; cy += seed[i * 4 + 1]; cz += seed[i * 4 + 2];
}
cx /= n; cy /= n; cz /= n;
const dd = new Float32Array(n);
for (let i = 0; i < n; i++) dd[i] = Math.hypot(seed[i*4]-cx, seed[i*4+1]-cy, seed[i*4+2]-cz);
const radius = Float32Array.from(dd).sort()[Math.floor(n * 0.95)] || 1;

// Vista con la forma que espera `src/galaxy`: los mismos datos, sin el loader.
const galaxy = { meta, positions: new Float32Array(n * 3), community, offsets, targets };
for (let i = 0; i < n * 3; i++) galaxy.positions[i] = q[i] * meta.posScale;

// rgb = color de zona, que aquí sólo tiñe las aristas (los nodos son blancos).
const zone = zoneColours(galaxy).node;
const colour = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  colour[i*4] = zone[i*3]; colour[i*4+1] = zone[i*3+1]; colour[i*4+2] = zone[i*3+2];
  colour[i*4+3] = radius * (0.0012 + 0.0055 * Math.pow(1 - rank[i] / 65535, 8));
}
const deg = new Float32Array(n);
let degSum = 0;
for (let i = 0; i < n; i++) { deg[i] = offsets[i+1] - offsets[i] + 1; degSum += deg[i]; }
const mass = new Float32Array(n);
for (let i = 0; i < n; i++) mass[i] = deg[i] / (degSum / n);
const w32 = new Float32Array(meta.csr);
for (let i = 0; i < meta.csr; i++) w32[i] = weights[i] / 255;

const edgeIdx = new Uint32Array(meta.edges * 2);
let ei = 0;
for (let i = 0; i < n; i++) {
  for (let j = offsets[i]; j < offsets[i+1]; j++) {
    const t = targets[j];
    if (t > i) { edgeIdx[ei++] = i; edgeIdx[ei++] = t; }
  }
}

// ------------------------------------------------------------------ WebGPU
const inst = gpuMod.create([]);
const adapter = await inst.requestAdapter();
const hasTimestamp = adapter.features.has("timestamp-query");
const device = await adapter.requestDevice({
  requiredFeatures: hasTimestamp ? ["timestamp-query"] : [],
  requiredLimits: { maxStorageBufferBindingSize: 256 * 1024 * 1024, maxBufferSize: 256 * 1024 * 1024 },
});
// 0.2.0 de las bindings no expone addEventListener en el device;
// los errores no capturados salen por stderr de Dawn.

const B = GPUBufferUsage;
const store = (data, extra = 0) => {
  const b = device.createBuffer({ size: Math.max(4, data.byteLength), usage: B.STORAGE | extra, mappedAtCreation: true });
  new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  b.unmap(); return b;
};

const pos = [store(seed, B.COPY_SRC), store(new Float32Array(n * 4), B.COPY_SRC)];
const vel = store(new Float32Array(n * 4));
const dim = store(new Float32Array(n).fill(1), B.COPY_DST);
const bOff = store(new Uint32Array(offsets));
const bTgt = store(new Uint32Array(targets));
const bWt = store(w32);
const bMass = store(mass);
const bCol = store(colour);
const bEdge = store(edgeIdx);
const physU = device.createBuffer({ size: 48, usage: B.UNIFORM | B.COPY_DST });
const rendU = device.createBuffer({ size: 128, usage: B.UNIFORM | B.COPY_DST });

const load = (f) => readFileSync(join(SRC, f), "utf8");
const physMod = device.createShaderModule({ code: load("physics.wgsl") });
const rendMod = device.createShaderModule({ code: load("render.wgsl") });
for (const [name, mod] of [["physics", physMod], ["render", rendMod]]) {
  for (const m of (await mod.getCompilationInfo()).messages) {
    console.log(`  ${name}.wgsl ${m.type} línea ${m.lineNum}: ${m.message}`);
    if (m.type === "error") process.exit(1);
  }
}

const physPipe = device.createComputePipeline({ layout: "auto", compute: { module: physMod, entryPoint: "step" } });
// layout: "auto" genera un layout distinto por pipeline, y son incompatibles
// entre sí aunque las entradas coincidan. Como aristas y nodos comparten el
// mismo bind group, el layout tiene que ser explícito y común.
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

// --- descarte en GPU + dibujo indirecto ---
const cullMod = device.createShaderModule({ code: load("cull.wgsl") });
for (const m of (await cullMod.getCompilationInfo()).messages) {
  console.log(`  cull.wgsl ${m.type} línea ${m.lineNum}: ${m.message}`);
  if (m.type === "error") process.exit(1);
}
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
const cullNodePipe = device.createComputePipeline({ layout: cullPL, compute: { module: cullMod, entryPoint: "cullNodes" } });
const cullEdgePipe = device.createComputePipeline({ layout: cullPL, compute: { module: cullMod, entryPoint: "cullEdges" } });

const visNodes = store(new Uint32Array(n));
const visEdges = store(new Uint32Array(edgeIdx.length));
const drawArgs = device.createBuffer({ size: 32, usage: B.INDIRECT | B.STORAGE | B.COPY_DST | B.COPY_SRC });
const argsStage = device.createBuffer({ size: 32, usage: B.MAP_READ | B.COPY_DST });
const cullU = device.createBuffer({ size: 96, usage: B.UNIFORM | B.COPY_DST });
const ARGS_RESET = new Uint32Array([6, 0, 0, 0, 0, 1, 0, 0]);

const cullBG = device.createBindGroup({
  layout: cullBGL,
  entries: [
    { binding: 0, resource: { buffer: cullU } }, { binding: 1, resource: { buffer: pos[0] } },
    { binding: 2, resource: { buffer: bEdge } }, { binding: 3, resource: { buffer: visNodes } },
    { binding: 4, resource: { buffer: visEdges } }, { binding: 5, resource: { buffer: drawArgs } },
    { binding: 6, resource: { buffer: dim } },
  ],
});

// Aristas aditivas sin profundidad; nodos con mezcla alfa y prueba de
// profundidad, igual que el motor: un punto sólido que tapa a los de detrás.
const additive = {
  color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
  alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" },
};
const over = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};
const mkR = (vs, fs, topology, blend, depthWriteEnabled, depthCompare) =>
  device.createRenderPipeline({
    layout: rendPL,
    vertex: { module: rendMod, entryPoint: vs },
    fragment: { module: rendMod, entryPoint: fs, targets: [{ format: "rgba8unorm", blend }] },
    primitive: { topology },
    depthStencil: { format: "depth16unorm", depthWriteEnabled, depthCompare },
  });
const edgePipe = mkR("vsEdge", "fsEdge", "line-list", additive, false, "always");
const nodePipe = mkR("vsNode", "fsNode", "triangle-list", over, true, "less");

const depthTex = device.createTexture({
  size: [W, H], format: "depth16unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
const depthView = depthTex.createView({
  format: "depth16unorm", dimension: "2d", aspect: "depth-only",
  baseMipLevel: 0, mipLevelCount: 1, baseArrayLayer: 0, arrayLayerCount: 1,
});
const depthAttach = () => ({
  view: depthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store",
});

const physBG = [0, 1].map(i => device.createBindGroup({
  layout: physPipe.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: pos[i] } }, { binding: 1, resource: { buffer: pos[1-i] } },
    { binding: 2, resource: { buffer: vel } }, { binding: 3, resource: { buffer: bOff } },
    { binding: 4, resource: { buffer: bTgt } }, { binding: 5, resource: { buffer: bWt } },
    { binding: 6, resource: { buffer: bMass } }, { binding: 7, resource: { buffer: physU } },
  ],
}));
const rendBG = [0, 1].map(i => device.createBindGroup({
  layout: rendBGL,
  entries: [
    { binding: 0, resource: { buffer: rendU } }, { binding: 1, resource: { buffer: pos[i] } },
    { binding: 2, resource: { buffer: bCol } }, { binding: 3, resource: { buffer: dim } },
    { binding: 4, resource: { buffer: visEdges } },
    { binding: 5, resource: { buffer: visNodes } },
  ],
}));

// --- física ---
let cur = 0;
const t0 = performance.now();
for (let s = 0; s < STEPS; s++) {
  const u = new ArrayBuffer(48);
  new Uint32Array(u, 0, 4).set([n, 24, s, 0]);
  new Float32Array(u, 16, 8).set([1.0, 0.15, n / 24, 0.55, 0.90, 1.0, 8.0, 0.0]);
  device.queue.writeBuffer(physU, 0, u);
  const e = device.createCommandEncoder();
  const p = e.beginComputePass();
  p.setPipeline(physPipe); p.setBindGroup(0, physBG[cur]);
  p.dispatchWorkgroups(Math.ceil(n / 64)); p.end();
  device.queue.submit([e.finish()]);
  cur ^= 1;
}
await device.queue.onSubmittedWorkDone();
const physMs = performance.now() - t0;

// --- cámara y uniforms ---
const fov = (55 * Math.PI) / 180;
const baseDist = (radius / Math.tan(fov / 2)) * 0.92;
// Los valores por defecto son los que escribe `engine.ts:writeRender`; el del
// resalte sale del brillo de la malla, para llevar la arista a color pleno y no
// más allá (pasarse recorta los tres canales y el camino sale blanco).
const SEL_SCALE = Number(process.env.SEL_SCALE ?? 2.5);

// Longitud típica de arista, igual que en el motor: fija el encuadre al enfocar.
const meanEdge = (() => {
  const m = meta.edges, stride = Math.max(1, Math.floor(m / 4000));
  let sum = 0, c = 0;
  for (let e = 0; e < m; e += stride) {
    const a = edgeIdx[e*2], b = edgeIdx[e*2+1];
    sum += Math.hypot(seed[a*4]-seed[b*4], seed[a*4+1]-seed[b*4+1], seed[a*4+2]-seed[b*4+2]);
    c++;
  }
  return c ? sum / c : radius * 0.1;
})();

/** Escribe el canal de resalte igual que hace el motor, para poder *ver* la
 *  selección en una imagen en vez de suponer que se nota. */
function applySelection(id) {
  const h = tiers(galaxy, id, new Float32Array(n));
  device.queue.writeBuffer(dim, 0, h);
  return id === null ? 0 : offsets[id + 1] - offsets[id];
}
// `engine.ts:writeRender` con el `edgeBright` por defecto: (0,85/0,5) sobre el
// punto neutro. EDGE= lo escala para tantear la calibración desde fuera.
const edgeB = Math.min(0.34, (0.34 * 15949) / meta.edges) * 1.7 * Number(process.env.EDGE ?? 1);
const SEL_EDGE = Number(process.env.SEL_EDGE ?? Math.min(24, (1 / edgeB - 1) / (HL.self - 1)));
let vp, eye, proj;

function setCamera(zoom, at = null, dist0 = null) {
  const dist = dist0 ?? baseDist / zoom;
  const tgt = at ?? [cx, cy, cz];
  const th = 0.6, ph = 1.15;
  eye = [tgt[0] + dist*Math.sin(ph)*Math.sin(th), tgt[1] + dist*Math.cos(ph), tgt[2] + dist*Math.sin(ph)*Math.cos(th)];
  proj = perspective(fov, W / H, radius * 0.002, radius * 60);
  vp = mul(proj, lookAt(eye, tgt, [0, 1, 0]));
  const ru = new ArrayBuffer(128);
  new Float32Array(ru, 0, 16).set(vp);
  new Float32Array(ru, 64, 4).set([eye[0], eye[1], eye[2], 0]);
  // Mismo tramo de bruma que `engine.ts:writeRender`. Si se toca allí hay que
  // tocarlo aquí, o el PNG deja de representar lo que ve la web.
  const fogSpan = Math.max(dist, radius * 0.35) * 2.3;
  new Float32Array(ru, 80, 11).set([
    proj[0], proj[5], dist - fogSpan * 0.45, 1.0, edgeB / KEEP, 2.0, W, H,
    SEL_SCALE, SEL_EDGE, fogSpan,
  ]);
  device.queue.writeBuffer(rendU, 0, ru);
}

/** minEdgePx=0 y margen enorme desactivan el descarte de hecho: sirve de línea
 *  base para medir cuánto aporta, sin cambiar ninguna otra variable. */
// `KEEP` lo consume además `setCamera`, que compensa el brillo de la malla por
// 1/keep igual que `engine.ts:writeRender`. Llama siempre a `setCull` **antes**
// que a `setCamera`, o la nebulosa se pinta con el keep del escenario anterior.
let KEEP = 1;
function setCull(minEdgePx, margin, keep = 1) {
  KEEP = keep;
  const cu = new ArrayBuffer(96);
  new Float32Array(cu, 0, 16).set(vp);
  new Float32Array(cu, 64, 2).set([W, H]);
  new Uint32Array(cu, 72, 2).set([n, meta.edges]);
  new Float32Array(cu, 80, 4).set([minEdgePx, margin, 0, KEEP]);
  device.queue.writeBuffer(cullU, 0, cu);
}

const tex = device.createTexture({
  size: [W, H], format: "rgba8unorm",
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
});
const readBuf = device.createBuffer({ size: W * H * 4, usage: B.MAP_READ | B.COPY_DST });
const view = tex.createView({
  format: "rgba8unorm", dimension: "2d", aspect: "all",
  baseMipLevel: 0, mipLevelCount: 1, baseArrayLayer: 0, arrayLayerCount: 1,
});

// Instrumentación. El reloj de pared no sirve aquí: sincronizar por frame
// cuesta ~100 ms en estas bindings, y sin sincronizar no se puede separar A de
// B. Los timestamps los escribe la propia GPU al entrar y salir de cada pasada,
// se acumulan en un buffer y se leen todos juntos al final: coste cero por frame
// y tiempo de GPU real, no de cola.
const FRAMES = 64;
const qs = hasTimestamp ? device.createQuerySet({ type: "timestamp", count: 4 }) : null;
const qResolve = device.createBuffer({ size: 32, usage: GPUBufferUsage.QUERY_RESOLVE | B.COPY_SRC });
const qLog = device.createBuffer({ size: 32 * FRAMES, usage: B.COPY_DST | B.COPY_SRC });
const qStage = device.createBuffer({ size: 32 * FRAMES, usage: B.MAP_READ | B.COPY_DST });
let qFrame = 0;

async function readTimings(count) {
  const e = device.createCommandEncoder();
  e.copyBufferToBuffer(qLog, 0, qStage, 0, 32 * count);
  device.queue.submit([e.finish()]);
  await qStage.mapAsync(GPUMapMode.READ);
  const v = new BigUint64Array(qStage.getMappedRange().slice(0, 32 * count));
  qStage.unmap();
  const cull = [], draw = [];
  for (let f = 0; f < count; f++) {
    cull.push(Number(v[f * 4 + 1] - v[f * 4 + 0]) / 1e6);
    draw.push(Number(v[f * 4 + 3] - v[f * 4 + 2]) / 1e6);
  }
  // mediana: inmune a un frame suelto que pille el reloj cambiando
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  return { cull: med(cull), draw: med(draw) };
}

function drawFrame(drawEdges = true, drawNodes = true) {
  const e = device.createCommandEncoder();
  device.queue.writeBuffer(drawArgs, 0, ARGS_RESET);
  const ts = (a, b) => qs ? { querySet: qs, beginningOfPassWriteIndex: a, endOfPassWriteIndex: b } : undefined;
  const c = e.beginComputePass({ timestampWrites: ts(0, 1) });
  c.setBindGroup(0, cullBG);
  c.setPipeline(cullNodePipe); c.dispatchWorkgroups(Math.ceil(n / 64));
  c.setPipeline(cullEdgePipe); c.dispatchWorkgroups(Math.ceil(meta.edges / 64));
  c.end();
  const p = e.beginRenderPass({
    colorAttachments: [{ view, clearValue: { r: 0.0196, g: 0.0275, b: 0.051, a: 1 },
      loadOp: "clear", storeOp: "store" }],
    depthStencilAttachment: depthAttach(),
    timestampWrites: ts(2, 3),
  });
  p.setBindGroup(0, rendBG[0]);
  if (drawEdges) { p.setPipeline(edgePipe); p.drawIndirect(drawArgs, 16); }
  if (drawNodes) { p.setPipeline(nodePipe); p.drawIndirect(drawArgs, 0); }
  p.end();
  if (qs && qFrame < FRAMES) {
    e.resolveQuerySet(qs, 0, 4, qResolve, 0);
    e.copyBufferToBuffer(qResolve, 0, qLog, qFrame * 32, 32);
    qFrame++;
  }
  device.queue.submit([e.finish()]);
}

/** Mide una configuración con timestamps de GPU: sin sincronizar por frame. */
async function gpuBench(setup, frames = 40) {
  setup();
  for (let w = 0; w < 5; w++) drawFrame();
  await device.queue.onSubmittedWorkDone();
  qFrame = 0;
  for (let f = 0; f < frames; f++) drawFrame();
  await device.queue.onSubmittedWorkDone();
  return readTimings(Math.min(frames, FRAMES));
}

async function counts() {
  drawFrame();
  const e = device.createCommandEncoder();
  e.copyBufferToBuffer(drawArgs, 0, argsStage, 0, 32);
  device.queue.submit([e.finish()]);
  await argsStage.mapAsync(GPUMapMode.READ);
  const a = new Uint32Array(argsStage.getMappedRange().slice(0));
  argsStage.unmap();
  return { nodes: a[1], edges: a[4] / 2 };
}

async function throughput(frames = 40) {
  for (let w = 0; w < 4; w++) drawFrame();
  await device.queue.onSubmittedWorkDone();
  const t = performance.now();
  for (let f = 0; f < frames; f++) drawFrame();
  await device.queue.onSubmittedWorkDone();
  return (performance.now() - t) / frames;
}

console.log(`\n  instrumento: ${hasTimestamp ? "timestamps de GPU" : "reloj de pared (sin timestamp-query)"}`);
console.log("  escenario                      descarte   dibujo    nodos    aristas  ganancia");
for (const [zname, zoom] of [["vista completa", 1], ["zoom x4", 4]]) {
  setCamera(zoom);
  setCull(0, 9);       const cOff = await counts();
  const tOff = await gpuBench(() => setCull(0, 9));
  setCull(1.2, 0.02);  const cOn = await counts();
  const tOn = await gpuBench(() => setCull(1.2, 0.02));
  const gain = ((tOff.draw - tOn.draw) / tOff.draw) * 100;
  const row = (nm, t, c, g) =>
    `  ${(zname + " · " + nm).padEnd(30)} ${t.cull.toFixed(2).padStart(6)}  ${t.draw.toFixed(2).padStart(7)}  ` +
    `${String(c.nodes).padStart(7)}  ${String(c.edges).padStart(9)}  ${g}`;
  console.log(row("sin descarte", tOff, cOff, ""));
  console.log(row("con descarte", tOn, cOn, `${gain >= 0 ? "+" : ""}${gain.toFixed(0)}%`));
}

// --- ¿es coste de relleno? Si lo es, la resolución debe mandar sobre todo lo
// demás, y bajarla es más rentable que cualquier descarte.
console.log("\n  resolución interna           ms/frame   píxeles");
setCamera(1);
setCull(1.2, 0.02);
for (const scale of [1.0, 0.75, 0.55]) {
  const sw = Math.round(W * scale), sh = Math.round(H * scale);
  const t2 = device.createTexture({
    size: [sw, sh], format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const d2 = device.createTexture({
    size: [sw, sh], format: "depth16unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const v2 = t2.createView({ format: "rgba8unorm", dimension: "2d", aspect: "all",
    baseMipLevel: 0, mipLevelCount: 1, baseArrayLayer: 0, arrayLayerCount: 1 });
  const dv2 = d2.createView({ format: "depth16unorm", dimension: "2d", aspect: "depth-only",
    baseMipLevel: 0, mipLevelCount: 1, baseArrayLayer: 0, arrayLayerCount: 1 });
  const frame = () => {
    const e = device.createCommandEncoder();
    device.queue.writeBuffer(drawArgs, 0, ARGS_RESET);
    const c = e.beginComputePass();
    c.setBindGroup(0, cullBG);
    c.setPipeline(cullNodePipe); c.dispatchWorkgroups(Math.ceil(n / 64));
    c.setPipeline(cullEdgePipe); c.dispatchWorkgroups(Math.ceil(meta.edges / 64));
    c.end();
    const pp = e.beginRenderPass({
      colorAttachments: [{ view: v2, clearValue: { r: 0.0196, g: 0.0275, b: 0.051, a: 1 },
        loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: dv2, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    pp.setBindGroup(0, rendBG[0]);
    pp.setPipeline(edgePipe); pp.drawIndirect(drawArgs, 16);
    pp.setPipeline(nodePipe); pp.drawIndirect(drawArgs, 0);
    pp.end();
    device.queue.submit([e.finish()]);
  };
  for (let w = 0; w < 4; w++) frame();
  await device.queue.onSubmittedWorkDone();
  const t0b = performance.now();
  for (let f = 0; f < 40; f++) frame();
  await device.queue.onSubmittedWorkDone();
  const ms = (performance.now() - t0b) / 40;
  console.log(`  ${(scale.toFixed(2) + "×  (" + sw + "×" + sh + ")").padEnd(28)} ${ms.toFixed(2).padStart(6)}   ${((sw*sh)/1e6).toFixed(2)} Mpx`);
  t2.destroy(); d2.destroy();
}

// --- adelgazamiento de la malla: la palanca que va *antes* que la resolución.
// El descarte por longitud se agota (quita las aristas cortas, y el coste vive
// en las largas); `keep` ataca la longitud rasterizada total. El brillo se
// compensa por 1/keep, así que la nebulosa conserva su luz.
console.log("\n  keep de malla                aristas   dibujo ms   ganancia");
{
  let ref = null;
  for (const keep of [1.0, 0.6, 0.4, 0.35, 0.25]) {
    setCull(1.2, 0.02, keep); setCamera(1);
    const c = await counts();
    const t = await gpuBench(() => { setCull(1.2, 0.02, keep); setCamera(1); });
    if (ref === null) ref = t.draw;
    const tag = keep === 0.35 ? "  ← suelo (LOD_MIN)" : "";
    console.log(`  ${(keep.toFixed(2) + "×").padEnd(28)} ${String(c.edges).padStart(7)}   ${t.draw.toFixed(2).padStart(7)}   ${((ref / t.draw - 1) * 100).toFixed(0).padStart(4)}%${tag}`);
  }
}

setCull(1.2, 0.02, 1);
setCamera(1);
const msBoth = await throughput();

// --- captura del estado seleccionado, para juzgarlo con los ojos ---
const SEL = Number(process.env.SEL ?? -1);
if (SEL >= 0) {
  const deg = applySelection(SEL);
  // posición viva del nodo, para enfocarlo como hace el motor
  const st = device.createBuffer({ size: 16, usage: B.MAP_READ | B.COPY_DST });
  const ec2 = device.createCommandEncoder();
  ec2.copyBufferToBuffer(pos[0], SEL * 16, st, 0, 16);
  device.queue.submit([ec2.finish()]);
  await st.mapAsync(GPUMapMode.READ);
  const np = new Float32Array(st.getMappedRange().slice(0));
  st.unmap();

  const focus = process.env.SEL_FOCUS !== "0";
  setCamera(1, focus ? [np[0], np[1], np[2]] : null, focus ? meanEdge * 5 : null);
  setCull(1.2, 0.02);
  drawFrame();
  await device.queue.onSubmittedWorkDone();
  console.log(`  selección   nodo ${SEL} · grado ${deg} · ${focus ? "enfocado" : "vista completa"} · ` +
              `arista media ${meanEdge.toFixed(0)} · escala ${SEL_SCALE} · brillo ${SEL_EDGE}`);
  console.log(`  cámara      nodo en [${np[0].toFixed(0)}, ${np[1].toFixed(0)}, ${np[2].toFixed(0)}] · ` +
              `centro [${cx.toFixed(0)}, ${cy.toFixed(0)}, ${cz.toFixed(0)}] · ` +
              `dist ${(meanEdge*5).toFixed(0)} vs base ${baseDist.toFixed(0)} · ojo [${eye.map(v=>v.toFixed(0)).join(", ")}]`);
}
const msClear = 0, msEdges = 0, msNodes = 0;

const tr = performance.now();
const enc = device.createCommandEncoder();
const pass = enc.beginRenderPass({
  colorAttachments: [{ view: tex.createView({
      format: "rgba8unorm", dimension: "2d", aspect: "all",
      baseMipLevel: 0, mipLevelCount: 1, baseArrayLayer: 0, arrayLayerCount: 1,
    }),
    clearValue: { r: 0.0196, g: 0.0275, b: 0.051, a: 1 }, loadOp: "clear", storeOp: "store" }],
  depthStencilAttachment: depthAttach(),
});
pass.setBindGroup(0, rendBG[0]);
pass.setPipeline(edgePipe); pass.drawIndirect(drawArgs, 16);
pass.setPipeline(nodePipe); pass.drawIndirect(drawArgs, 0);
pass.end();
enc.copyTextureToBuffer({ texture: tex }, { buffer: readBuf, bytesPerRow: W * 4, rowsPerImage: H }, [W, H]);
device.queue.submit([enc.finish()]);
await device.queue.onSubmittedWorkDone();
const rendMs = msBoth;
void tr; void msClear; void msEdges; void msNodes;

await readBuf.mapAsync(GPUMapMode.READ);
const px = Buffer.from(new Uint8Array(readBuf.getMappedRange()).slice(0));
readBuf.unmap();

// ------------------------------------------------------- selección en GPU
{
  const pickMod = device.createShaderModule({ code: load("pick.wgsl") });
  for (const m of (await pickMod.getCompilationInfo()).messages) {
    console.log(`  pick.wgsl ${m.type} línea ${m.lineNum}: ${m.message}`);
    if (m.type === "error") process.exit(1);
  }
  const pickPipe = device.createComputePipeline({ layout: "auto", compute: { module: pickMod, entryPoint: "pick" } });
  const pickU = device.createBuffer({ size: 96, usage: B.UNIFORM | B.COPY_DST });
  const pickOut = device.createBuffer({ size: 4, usage: B.STORAGE | B.COPY_SRC | B.COPY_DST });
  const pickStage = device.createBuffer({ size: 4, usage: B.MAP_READ | B.COPY_DST });
  const posStage = device.createBuffer({ size: n * 16, usage: B.MAP_READ | B.COPY_DST });
  const pickBG = device.createBindGroup({
    layout: pickPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: pickU } },
              { binding: 1, resource: { buffer: pos[cur] } },
              { binding: 2, resource: { buffer: pickOut } },
              { binding: 3, resource: { buffer: bCol } }],
  });

  // posiciones actuales, para saber a qué píxel apuntar
  const ec = device.createCommandEncoder();
  ec.copyBufferToBuffer(pos[cur], 0, posStage, 0, n * 16);
  device.queue.submit([ec.finish()]);
  await posStage.mapAsync(GPUMapMode.READ);
  const live = new Float32Array(posStage.getMappedRange().slice(0));
  posStage.unmap();

  const project = (i) => {
    const x = live[i*4], y = live[i*4+1], z = live[i*4+2];
    const cw = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
    if (cw <= 0) return null;
    const px = (vp[0]*x + vp[4]*y + vp[8]*z + vp[12]) / cw;
    const py = (vp[1]*x + vp[5]*y + vp[9]*z + vp[13]) / cw;
    if (Math.abs(px) > 0.95 || Math.abs(py) > 0.93) return null;
    return [(px*0.5+0.5)*W, (1-(py*0.5+0.5))*H];
  };

  async function pickAt(sx, sy) {
    const u = new ArrayBuffer(96);
    new Float32Array(u, 0, 16).set(vp);
    new Float32Array(u, 64, 4).set([sx, sy, W, H]);
    new Uint32Array(u, 80, 1).set([n]);
    new Float32Array(u, 84, 1).set([22]);
    new Float32Array(u, 88, 2).set([proj[0], 2.0]);
    device.queue.writeBuffer(pickU, 0, u);
    device.queue.writeBuffer(pickOut, 0, new Uint32Array([0xffffffff]));
    const e = device.createCommandEncoder();
    const p = e.beginComputePass();
    p.setPipeline(pickPipe); p.setBindGroup(0, pickBG);
    p.dispatchWorkgroups(Math.ceil(n / 64)); p.end();
    e.copyBufferToBuffer(pickOut, 0, pickStage, 0, 4);
    device.queue.submit([e.finish()]);
    await pickStage.mapAsync(GPUMapMode.READ);
    const key = new Uint32Array(pickStage.getMappedRange())[0];
    pickStage.unmap();
    return key === 0xffffffff ? null : (key & 0x1ffff);
  }

  let hits = 0, tried = 0, miss = 0;
  for (let t = 0; t < 200 && tried < 40; t++) {
    const i = (t * 7919) % n;
    const sp = project(i);
    if (!sp) continue;
    tried++;
    const got = await pickAt(sp[0], sp[1]);
    if (got === null) { miss++; continue; }
    const gp = project(got);
    // se acepta otro nodo si cae prácticamente en el mismo píxel: con 50.000
    // nodos los solapamientos en pantalla son inevitables y no son un fallo
    if (got === i || (gp && Math.hypot(gp[0]-sp[0], gp[1]-sp[1]) <= 2.0)) hits++;
  }
  const noneOut = await pickAt(-500, -500);
  console.log(`\n  selección   ${hits}/${tried} aciertos · ${miss} sin candidato · fuera de pantalla → ${noneOut === null ? "null (correcto)" : "FALLO"}`);
  if (hits < tried * 0.95 || noneOut !== null) { console.log("  !! selección defectuosa"); process.exit(1); }
}

let lit = 0;
for (let i = 0; i < W * H; i++) if (px[i*4] > 12 || px[i*4+1] > 12 || px[i*4+2] > 16) lit++;

const out = join(HERE, "..", "..", "data", `gpu_${LANG}.png`);
writeFileSync(out, png(W, H, px));

console.log(`\n  adaptador   ${adapter.info?.description || "?"}`);
console.log(`  galaxia     ${LANG} · ${n} nodos · ${meta.edges} aristas · radio ${radius.toFixed(0)}`);
console.log(`  física      ${STEPS} pasos en ${physMs.toFixed(0)} ms → ${(physMs/STEPS).toFixed(2)} ms/paso`);
console.log(`  render      ${rendMs.toFixed(2)} ms · ${W}×${H} · con descarte y dibujo indirecto`);
console.log(`  presupuesto ${((physMs/STEPS + rendMs)).toFixed(2)} ms/frame → ${(1000/(physMs/STEPS + rendMs)).toFixed(0)} fps`);
console.log(`  señal       ${(lit / (W*H) * 100).toFixed(1)}% de píxeles iluminados`);
console.log(`  escrito     ${out}\n`);

device.destroy();
gpuMod.destroy(inst);
process.exit(lit > 1000 ? 0 : 1);
