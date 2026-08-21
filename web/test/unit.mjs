/** Lógica pura: buscador, caminos, escalones de resalte, teclado y el
 *  contrato de bytes de los binarios.
 *
 *  Los otros dos tests necesitan una GPU real vía Dawn y tardan minutos. Éste
 *  no toca la GPU y corre en menos de un segundo, así que es el que se puede
 *  ejecutar en cada guardado. Cubre lo que hasta ahora no cubría nada: hasta
 *  aquí `npm test` protegía la física y el render, y el buscador, el camino y
 *  el tacto del teclado se comprobaban abriendo el navegador.
 *
 *    node test/unit.mjs [idioma]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fold, buildIndex, exact, suggest, resolve, SUGGEST } from "../src/galaxy/search.mjs";
import { shortestPath, hops } from "../src/galaxy/path.mjs";
import { HL, tiers, pathTiers } from "../src/galaxy/highlight.mjs";
import { KeyFly } from "../src/galaxy/keys.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LANG = process.argv[2] || "es";
const DATA = join(HERE, "..", "public", "data", LANG);

let failed = 0;
const ok = (cond, label, detail) => {
  if (!cond) failed++;
  console.log(`  ${cond ? "OK " : "!! "}${label}${detail ? "  " + detail : ""}`);
};

// --------------------------------------------------------------------- datos
/** Mismo desempaquetado que `src/galaxy/loader.ts`.
 *
 *  Está duplicado, y es a propósito: `loader.ts` es TypeScript y Node no lo
 *  carga como módulo (el paquete es `type: commonjs`). Es la misma duplicación
 *  que ya documenta el `CLAUDE.md` para `test/render.mjs`. Justamente por eso
 *  las comprobaciones de abajo son sobre el **contrato de bytes**: si el
 *  pipeline cambia el formato, esta copia deja de cuadrar y el test lo dice,
 *  que es lo único que una segunda implementación puede aportar aquí. */
function load() {
  const rd = (f) => {
    const b = readFileSync(join(DATA, f));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const meta = JSON.parse(readFileSync(join(DATA, "meta.json"), "utf8"));
  const n = meta.nodes;

  const q = new Int16Array(rd("positions.bin"));
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = q[i] * meta.posScale;

  const eb = rd("edges.bin");
  const offsets = new Uint32Array(eb, 0, n + 1);
  const targets = new Uint16Array(eb, (n + 1) * 4, meta.csr);
  const weights = new Uint8Array(eb, (n + 1) * 4 + meta.csr * 2, meta.csr);

  const lb = rd("labels.bin");
  const labOff = new Uint32Array(lb, 0, n + 1);
  const blob = new Uint8Array(lb, (n + 1) * 4);
  const dec = new TextDecoder();
  const labels = new Array(n);
  for (let i = 0; i < n; i++) labels[i] = dec.decode(blob.subarray(labOff[i], labOff[i + 1]));

  const ab = rd("attrs.bin");
  const community = new Uint8Array(ab, 0, n);
  const rank = new Uint16Array(ab, n, n);
  const flags = new Uint8Array(ab, n + n * 2, n);

  const uniqueEdges = new Uint32Array(meta.edges * 2);
  let w = 0;
  for (let i = 0; i < n; i++) {
    for (let j = offsets[i]; j < offsets[i + 1]; j++) {
      if (targets[j] > i) { uniqueEdges[w++] = i; uniqueEdges[w++] = targets[j]; }
    }
  }
  return { meta, positions, offsets, targets, weights, labels, community, rank, flags,
           uniqueEdges: uniqueEdges.subarray(0, w) };
}

const g = load();
const n = g.meta.nodes;
const adj = (a, b) => {
  for (let j = g.offsets[a]; j < g.offsets[a + 1]; j++) if (g.targets[j] === b) return true;
  return false;
};

console.log(`\n— binarios ${"—".repeat(48)}`);
console.log(`  ${LANG} · ${n} nodos · ${g.meta.csr} entradas CSR · ${g.meta.edges} aristas`);

{
  let mono = offsets0(), inRange = true, selfLoop = false;
  function offsets0() { return g.offsets[0] === 0; }
  for (let i = 0; i < n; i++) {
    if (g.offsets[i] > g.offsets[i + 1]) mono = false;
    for (let j = g.offsets[i]; j < g.offsets[i + 1]; j++) {
      if (g.targets[j] >= n) inRange = false;
      if (g.targets[j] === i) selfLoop = true;
    }
  }
  ok(mono && g.offsets[n] === g.meta.csr, "offsets crecen y cierran en csr",
     `${g.offsets[n]} === ${g.meta.csr}`);
  ok(inRange, "todo destino cae dentro del grafo");
  ok(!selfLoop, "ningún nodo es vecino de sí mismo");
  // 65.535 es el techo duro del formato: los destinos son Uint16.
  ok(n <= 65535, "el grafo cabe en índices Uint16", `${n} ≤ 65535`);
}

{
  // El CSR se publica simétrico; el motor cuenta con ello para heredar el
  // resalte por los dos extremos de cada arista.
  let sym = true;
  const step = Math.max(1, Math.floor(n / 3000));
  for (let i = 0; i < n && sym; i += step) {
    for (let j = g.offsets[i]; j < g.offsets[i + 1]; j++) {
      if (!adj(g.targets[j], i)) { sym = false; break; }
    }
  }
  ok(sym, "el CSR es simétrico (muestreo)");
  ok(g.uniqueEdges.length / 2 === g.meta.edges, "aristas únicas = meta.edges",
     `${g.uniqueEdges.length / 2} === ${g.meta.edges}`);
}

{
  const empty = g.labels.filter((s) => !s.length).length;
  const blank = g.labels.filter((s) => /\s/.test(s)).length;
  ok(g.labels.length === n && empty === 0, "hay una etiqueta no vacía por nodo");
  ok(blank === 0, "ninguna etiqueta lleva espacios", `${blank} con espacio`);
  // El rango es la posición en la lista de frecuencia: 0 es la más común.
  ok(g.rank[0] === 0 || Math.min(...Array.from(g.rank.subarray(0, 50))) === 0,
     "el rango arranca en 0");
}

// ----------------------------------------------------------------- buscador
console.log(`\n— buscador ${"—".repeat(48)}`);
const idx = buildIndex(g);

ok(fold("Corazón") === "corazon" && fold("NIÑO") === "nino",
   "el plegado quita tildes y baja a minúsculas");
ok(fold("") === "", "el plegado aguanta la cadena vacía");

{
  // El caso que motivó todo esto: la palabra existe con tilde y se escribe sin.
  const conTilde = g.labels.findIndex((w) => /[áéíóúñ]/.test(w) && w.length > 3);
  const plegada = fold(g.labels[conTilde]);
  const hit = exact(idx, plegada);
  ok(hit >= 0 && fold(g.labels[hit]) === plegada,
     "escribir sin tildes encuentra la palabra", `«${g.labels[conTilde]}» ← «${plegada}»`);
}

{
  const q = fold(g.labels[0]);
  ok(exact(idx, q) >= 0, "acierto exacto de una palabra cualquiera", `«${q}»`);
  ok(exact(idx, "zzqxwv") === -1, "una palabra que no está devuelve −1");
}

{
  const pre = fold(g.labels[3]).slice(0, 3);
  const s = suggest(idx, g, pre);
  const todas = s.every((i) => fold(g.labels[i]).startsWith(pre));
  let orden = true;
  for (let i = 1; i < s.length; i++) if (g.rank[s[i - 1]] > g.rank[s[i]]) orden = false;
  ok(s.length > 0 && s.length <= SUGGEST, `«${pre}» sugiere entre 1 y ${SUGGEST}`, `${s.length}`);
  ok(todas, "toda sugerencia empieza por el prefijo");
  ok(orden, "las sugerencias van de más a menos frecuente");
  ok(suggest(idx, g, "").length === 0, "sin consulta no hay sugerencias");
}

{
  // Enter con la palabra a medias: `resolve` cae en la mejor sugerencia.
  const pre = fold(g.labels[7]).slice(0, Math.max(2, g.labels[7].length - 1));
  const r = resolve(idx, g, pre.toUpperCase());
  ok(r >= 0 && fold(g.labels[r]).startsWith(pre),
     "Enter a medias cae en la mejor sugerencia", `«${pre}» → «${g.labels[r]}»`);
  ok(resolve(idx, g, "   ") === -1, "sólo espacios no resuelve a nada");
  ok(resolve(idx, g, "qxzwvkj") === -1, "una palabra inventada no resuelve a nada");
}

// -------------------------------------------------------------------- camino
console.log(`\n— camino ${"—".repeat(50)}`);
{
  ok(shortestPath(g, 5, 5).join() === "5", "de una palabra a sí misma, un solo paso");
  ok(shortestPath(g, 0, -1) === null, "un extremo fuera de rango devuelve null");

  // Pares repartidos por la lista de frecuencia, no vecinos elegidos a dedo.
  const pares = [[0, 1000], [3, 20000], [11, 4321], [900, 45000], [77, 33333]]
    .filter(([a, b]) => a < n && b < n);
  let encontrados = 0, validos = 0, minimos = 0, largo = 0;
  for (const [a, b] of pares) {
    const p = shortestPath(g, a, b);
    if (!p) continue;
    encontrados++;
    largo = Math.max(largo, p.length - 1);
    if (p[0] === a && p[p.length - 1] === b && p.every((x, i) => i === 0 || adj(p[i - 1], x))) validos++;
    // En un grafo sin pesos, un camino mínimo no puede tener atajos: si dos
    // pasos no consecutivos fuesen vecinos, se podría recortar. Es la
    // comprobación de minimalidad que no consiste en repetir el algoritmo.
    let atajo = false;
    for (let i = 0; i < p.length && !atajo; i++) {
      for (let j = i + 2; j < p.length; j++) if (adj(p[i], p[j])) { atajo = true; break; }
    }
    if (!atajo) minimos++;
  }
  ok(encontrados > 0, `hay camino entre palabras lejanas`, `${encontrados}/${pares.length} pares`);
  ok(validos === encontrados, "cada paso del camino es una arista real");
  ok(minimos === encontrados, "ningún camino admite atajo (es mínimo)");
  console.log(`     camino más largo de la muestra: ${largo} saltos`);

  const p = shortestPath(g, pares[0][0], pares[0][1]);
  if (p) {
    const h = hops(g, p);
    ok(h.length === p.length - 1, "un peso por salto", `${h.length} para ${p.length} palabras`);
    ok(h.every((w) => w > 0 && w <= 1), "los pesos son similitudes coseno en (0,1]");
  }
}

// -------------------------------------------------------------------- resalte
console.log(`\n— resalte ${"—".repeat(49)}`);
{
  // El canal `dim` es `f32`, así que un escalón guardado ahí ya no es igual al
  // literal de JS: 0,08 en doble no es 0,08 en simple. Se compara contra el
  // valor redondeado, que es el que de verdad llega a la GPU.
  const f32 = (v) => Math.fround(v);
  const out = new Float32Array(n);
  const id = 100;
  tiers(g, id, out);
  const vecinos = Array.from(g.targets.subarray(g.offsets[id], g.offsets[id + 1]));
  ok(out[id] === f32(HL.self), "la palabra elegida va al escalón más alto");
  ok(vecinos.every((v) => out[v] === f32(HL.ring1)), "los vecinos directos, al primer anillo");
  ok(out.filter((v) => v === f32(HL.rest)).length > n * 0.5, "el resto queda atenuado");

  tiers(g, null, out);
  ok(out.every((v) => v === 1), "sin selección todo vuelve a normal");

  const p = [10, ...Array.from(g.targets.subarray(g.offsets[10], g.offsets[10] + 1))];
  pathTiers(g, p, out);
  ok(p.every((i) => out[i] === f32(HL.self)), "todo nodo del camino va al escalón más alto");
  ok(vecinosDe(p).every((v) => out[v] >= f32(HL.ring2)), "el vecindario del camino se levanta");
  pathTiers(g, null, out);
  ok(out.every((v) => v === 1), "sin camino todo vuelve a normal");

  function vecinosDe(nodos) {
    const s = new Set();
    for (const i of nodos) {
      for (let j = g.offsets[i]; j < g.offsets[i + 1]; j++) s.add(g.targets[j]);
    }
    return [...s];
  }
}

// -------------------------------------------------------------------- teclado
console.log(`\n— teclado ${"—".repeat(49)}`);
{
  const f = new KeyFly();

  // En órbita la galaxia no se mueve de sitio: ninguna tecla toca el centro.
  f.setMode("orbit");
  f.keys.add("KeyW"); f.keys.add("KeyD");
  const orb = f.read();
  ok(orb.fwd === 0 && orb.side === 0 && orb.vert === 0,
     "en órbita ninguna tecla traslada");
  ok(orb.pitch !== 0 && orb.yaw !== 0, "en órbita WASD giran");
  f.stop();

  f.setMode("fly");
  f.keys.add("KeyW");
  const fly1 = f.read();
  ok(fly1.fwd > 0, "en vuelo W avanza", fly1.fwd.toFixed(5));

  // Mantener acumula; soltar frena solo, y el bucle de render puede dormirse.
  const fly2 = f.read();
  ok(fly2.fwd > fly1.fwd, "mantener la tecla acelera");
  f.keys.clear();
  let pasos = 0;
  while (f.active() && pasos < 500) { f.read(); pasos++; }
  ok(!f.active() && pasos > 1 && pasos < 200,
     "al soltar frena por amortiguación y el bucle se duerme", `${pasos} frames`);

  // Cambiar de modo con inercia pendiente daba un tirón: se corta en seco.
  f.keys.add("KeyW"); f.read();
  f.setMode("orbit");
  ok(!f.active(), "cambiar de modo corta la inercia");

  ok(f.read().fwd === 0, "sin teclas la velocidad es cero");
}

console.log(`\n${failed === 0 ? "TODO OK" : `${failed} FALLOS`}\n`);
process.exit(failed ? 1 : 0);
