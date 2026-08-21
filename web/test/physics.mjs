/**
 * Valida el compute shader contra la referencia numpy.
 *
 *   node test/physics.mjs
 *
 * Test 1 — determinista (K=0): sin repulsión no hay azar, así que WGSL y numpy
 *          deben coincidir salvo error de coma flotante. Aísla el recorrido del
 *          CSR, la atracción LinLog y la integración.
 * Test 2 — estadístico (K=24, 400 pasos): el muestreo difiere entre las dos
 *          implementaciones, así que se comparan métricas agregadas.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import gpuMod from "@kmamal/gpu";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, "..", "..", "data", "fixture");
const SHADER = join(HERE, "..", "src", "galaxy", "gpu", "physics.wgsl");

const meta = JSON.parse(readFileSync(join(FX, "meta.json"), "utf8"));
const bin = (f) => {
  const b = readFileSync(join(FX, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const f32 = (f) => new Float32Array(bin(f));
const u32 = (f) => new Uint32Array(bin(f));

const seed = f32("seed.bin");
const offsets = u32("offsets.bin");
const targets = u32("targets.bin");
const weights = f32("weights.bin");
const mass = f32("mass.bin");
const refK0 = f32("ref_k0.bin");
const refFull = f32("ref_full.bin");
const edges = u32("edges.bin");
const N = meta.n;

// ---------------------------------------------------------------- métricas
const centre = (p) => {
  const c = [0, 0, 0];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) c[k] += p[i * 4 + k];
  return c.map((v) => v / N);
};

function metrics(p) {
  const c = centre(p);
  let sum = 0;
  const m = edges.length / 2;
  for (let e = 0; e < m; e++) {
    const a = edges[e * 2], b = edges[e * 2 + 1];
    sum += Math.hypot(p[a * 4] - p[b * 4], p[a * 4 + 1] - p[b * 4 + 1],
                      p[a * 4 + 2] - p[b * 4 + 2]);
  }
  const r = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    r[i] = Math.hypot(p[i * 4] - c[0], p[i * 4 + 1] - c[1], p[i * 4 + 2] - c[2]);
  }
  r.sort();
  return { edgeLen: sum / m, radiusP90: r[Math.floor(N * 0.9)] };
}

/** Error relativo máximo y medio entre dos nubes, tras centrar ambas. */
function compare(a, b) {
  const ca = centre(a), cb = centre(b);
  let worst = 0, sum = 0, scale = 0;
  for (let i = 0; i < N; i++) {
    const dx = (a[i * 4] - ca[0]) - (b[i * 4] - cb[0]);
    const dy = (a[i * 4 + 1] - ca[1]) - (b[i * 4 + 1] - cb[1]);
    const dz = (a[i * 4 + 2] - ca[2]) - (b[i * 4 + 2] - cb[2]);
    const d = Math.hypot(dx, dy, dz);
    const s = Math.hypot(b[i * 4] - cb[0], b[i * 4 + 1] - cb[1], b[i * 4 + 2] - cb[2]);
    if (d > worst) worst = d;
    sum += d; scale += s;
  }
  return { meanAbs: sum / N, maxAbs: worst, meanRel: sum / Math.max(scale, 1e-9) };
}

// ------------------------------------------------------------------- WebGPU
Object.assign(globalThis, gpuMod);   // el módulo esparce los globals de WebGPU en su raíz
const inst = gpuMod.create([]);
const adapter = await inst.requestAdapter();
if (!adapter) { console.error("sin adaptador WebGPU"); process.exit(1); }
const device = await adapter.requestDevice({
  requiredLimits: { maxStorageBufferBindingSize: 128 * 1024 * 1024 },
});
// 0.2.0 de las bindings no expone addEventListener en el device;
// los errores no capturados salen por stderr de Dawn.

const module = device.createShaderModule({ code: readFileSync(SHADER, "utf8") });
const info = await module.getCompilationInfo();
for (const m of info.messages) {
  console.log(`  WGSL ${m.type} línea ${m.lineNum}: ${m.message}`);
  if (m.type === "error") process.exit(1);
}

const S = GPUBufferUsage.STORAGE;
const mk = (data, usage) => {
  const b = device.createBuffer({
    size: Math.ceil(data.byteLength / 4) * 4, usage, mappedAtCreation: true,
  });
  new (data.constructor)(b.getMappedRange()).set(data);
  b.unmap();
  return b;
};

const bufOff = mk(offsets, S);
const bufTgt = mk(targets, S);
const bufWt = mk(weights, S);
const bufMass = mk(mass, S);
const bufParams = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "step" } });

function writeParams(k, frame, alpha) {
  const u = new ArrayBuffer(48);
  new Uint32Array(u, 0, 4).set([N, k, frame, 0]);
  new Float32Array(u, 16, 8).set([
    meta.ks, meta.kr, k ? N / k : 0, meta.dt,
    meta.drag, alpha, meta.fmax, meta.gravity,
  ]);
  device.queue.writeBuffer(bufParams, 0, u);
}

async function run(k, steps) {
  const posA = mk(seed, S | GPUBufferUsage.COPY_SRC);
  const posB = mk(new Float32Array(N * 4), S | GPUBufferUsage.COPY_SRC);
  const vel = mk(new Float32Array(N * 4), S);

  const bg = (a, b) => device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: a } }, { binding: 1, resource: { buffer: b } },
      { binding: 2, resource: { buffer: vel } }, { binding: 3, resource: { buffer: bufOff } },
      { binding: 4, resource: { buffer: bufTgt } }, { binding: 5, resource: { buffer: bufWt } },
      { binding: 6, resource: { buffer: bufMass } }, { binding: 7, resource: { buffer: bufParams } },
    ],
  });
  const groups = [bg(posA, posB), bg(posB, posA)];
  const wg = Math.ceil(N / 64);

  const t0 = performance.now();
  for (let s = 0; s < steps; s++) {
    writeParams(k, s, 1.0);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, groups[s % 2]);
    pass.dispatchWorkgroups(wg);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
  await device.queue.onSubmittedWorkDone();
  const ms = performance.now() - t0;

  const final = steps % 2 === 0 ? posA : posB;
  const stage = device.createBuffer({ size: N * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(final, 0, stage, 0, N * 16);
  device.queue.submit([enc.finish()]);
  await stage.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(stage.getMappedRange().slice(0));
  stage.unmap();

  posA.destroy(); posB.destroy(); vel.destroy(); stage.destroy();
  return { out, ms, perStep: ms / steps };
}

// --------------------------------------------------------------------- tests
let failed = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "OK " : "!! "}${label}${detail ? "  " + detail : ""}`);
  if (!cond) failed++;
};

console.log(`\n— entorno ${"—".repeat(46)}`);
console.log(`  ${adapter.info?.description || adapter.info?.vendor || "adaptador"} · n=${N} · csr=${targets.length}`);

console.log(`\n— test 1: determinista, K=0, 1 paso ${"—".repeat(28)}`);
{
  const { out } = await run(0, 1);
  const c = compare(out, refK0);
  const span = metrics(refK0).radiusP90;
  ok(c.meanRel < 1e-5, "coincide con numpy",
     `error medio ${c.meanAbs.toExponential(2)} · máx ${c.maxAbs.toExponential(2)} · relativo ${c.meanRel.toExponential(2)} (escala ${span.toFixed(1)})`);
}

console.log(`\n— test 2: estadístico, K=${meta.K}, ${meta.steps} pasos ${"—".repeat(22)}`);
{
  const { out, ms, perStep } = await run(meta.K, meta.steps);
  const g = metrics(out);
  const r = meta.ref_full;
  const dEdge = Math.abs(g.edgeLen - r.edgeLen) / r.edgeLen;
  const dRad = Math.abs(g.radiusP90 - r.radiusP90) / r.radiusP90;
  ok(dEdge < 0.08, "longitud de arista", `wgsl ${g.edgeLen.toFixed(2)} vs numpy ${r.edgeLen.toFixed(2)} (${(dEdge * 100).toFixed(2)}%)`);
  ok(dRad < 0.08, "radio p90", `wgsl ${g.radiusP90.toFixed(2)} vs numpy ${r.radiusP90.toFixed(2)} (${(dRad * 100).toFixed(2)}%)`);
  ok(Number.isFinite(g.edgeLen) && g.edgeLen > 0, "sin NaN ni divergencia");
  console.log(`\n  ${meta.steps} pasos en ${ms.toFixed(0)} ms → ${perStep.toFixed(2)} ms/paso · ${(1000 / perStep).toFixed(0)} pasos/s a ${N} nodos`);
}

console.log(`\n${failed === 0 ? "TODO OK" : `${failed} FALLOS`}\n`);
device.destroy();
gpuMod.destroy(inst);
process.exit(failed ? 1 : 0);
