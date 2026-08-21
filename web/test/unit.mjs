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
import {
  MAX_WORDS, pairs, matrix, ranked, shared, typical, mds, dist,
} from "../src/galaxy/compare.mjs";
import { regions, core } from "../src/galaxy/regions.mjs";
import { compile, match, MAX as PAT_MAX } from "../src/galaxy/pattern.mjs";
import { query, invNorms, nearest } from "../src/galaxy/analogy.mjs";
import { encodeCam, decodeCam } from "../src/galaxy/share.mjs";

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
  if (conTilde >= 0) {
    const plegada = fold(g.labels[conTilde]);
    const hit = exact(idx, plegada);
    ok(hit >= 0 && fold(g.labels[hit]) === plegada,
       "escribir sin tildes encuentra la palabra", `«${g.labels[conTilde]}» ← «${plegada}»`);
  } else {
    ok(true, "escribir sin tildes encuentra la palabra (sin palabras con tilde en este idioma)");
  }
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

  if (LANG === "es") {
    const plur = resolve(idx, g, "perross");
    ok(plur >= 0 && g.labels[plur] === "perros", "resuelve plural con s extra o similar", `«perross» → «${g.labels[plur]}»`);
    const difusa = resolve(idx, g, "cienncia");
    ok(difusa >= 0 && g.labels[difusa] === "ciencia", "resuelve palabra con error por Levenshtein", `«cienncia» → «${g.labels[difusa]}»`);
  } else if (LANG === "en") {
    const plur = resolve(idx, g, "dogss");
    ok(plur >= 0 && g.labels[plur] === "dogs", "resuelve plural con s extra o similar", `«dogss» → «${g.labels[plur]}»`);
    const difusa = resolve(idx, g, "scieence");
    ok(difusa >= 0 && g.labels[difusa] === "science", "resuelve palabra con error por Levenshtein", `«scieence» → «${g.labels[difusa]}»`);
  }
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

// ------------------------------------------------------------------ vectores
/** Lector de `vecs.bin` con la misma firma que `Vectors` de la web.
 *
 *  Aquí se lee el archivo entero de disco en vez de pedir rangos por HTTP: lo
 *  que este test cubre es la **aritmética** —cuantizar, renormalizar, coseno— y
 *  el contrato de bytes, no el transporte. La rama de `Range:` sólo se puede
 *  ejercitar contra un servidor, y montar uno aquí probaría `fetch`, no el
 *  atlas. Lo que sí se comprueba, y es lo que se rompería en silencio, es que
 *  el offset `i * dims` cae en la palabra `i`: contra los pesos del CSR, que
 *  son el mismo coseno calculado por el pipeline sin pasar por aquí. */
function vectores() {
  const path = join(DATA, "vecs.bin");
  let raw;
  try {
    raw = readFileSync(path);
  } catch {
    return null;
  }
  const D = g.meta.dims;
  const cache = new Map();
  const get = (i) => {
    const hit = cache.get(i);
    if (hit) return hit;
    const out = new Float32Array(D);
    let sum = 0;
    for (let k = 0; k < D; k++) {
      const v = raw.readInt8(i * D + k);
      out[k] = v;
      sum += v * v;
    }
    const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
    for (let k = 0; k < D; k++) out[k] *= inv;
    cache.set(i, out);
    return out;
  };
  return {
    bytes: raw.length,
    available: true,
    get,
    cos(a, b) {
      const u = get(a), v = get(b);
      let s = 0;
      for (let k = 0; k < D; k++) s += u[k] * v[k];
      return s < -1 ? -1 : s > 1 ? 1 : s;
    },
  };
}

console.log(`\n— vectores 300D ${"—".repeat(43)}`);
const vec = vectores();
if (!vec) {
  console.log("  -- vecs.bin no está publicado; el comparador quedaría apagado");
  console.log("     (pipeline/vectors.py <idioma> y copiar a web/public/data/)");
} else {
  const D = g.meta.dims;
  ok(typeof D === "number" && D > 0, "meta.json declara el tamaño del registro", `dims=${D}`);
  ok(vec.bytes === n * D, "vecs.bin mide exactamente n x dims bytes",
     `${vec.bytes} = ${n} x ${D}`);

  // Norma: se renormaliza al decodificar, así que todo vector debe salir a 1.
  let peorNorma = 0;
  for (let i = 0; i < n; i += 617) {
    const v = vec.get(i);
    let s = 0;
    for (let k = 0; k < D; k++) s += v[k] * v[k];
    peorNorma = Math.max(peorNorma, Math.abs(Math.sqrt(s) - 1));
  }
  ok(peorNorma < 1e-5, "todo vector sale normalizado", `peor ${peorNorma.toExponential(1)}`);

  // La comprobación que de verdad ata el archivo a la galaxia: el coseno
  // calculado aquí contra el peso que el pipeline guardó en el CSR. Si los
  // offsets se desalinearan por una palabra, esto se dispara.
  //
  // El margen es 0,012 y no 0,0033 (el error medido de la cuantización a int8)
  // porque el peso del CSR es **otro** cuantizado, a uint8 sobre [0,1]: sólo
  // ese paso ya vale 1/255 = 0,0039. Los dos errores se suman.
  let peorArista = 0, mediaArista = 0, cuenta = 0;
  for (let i = 0; i < n; i += 211) {
    for (let j = g.offsets[i]; j < g.offsets[i + 1]; j++) {
      const e = Math.abs(vec.cos(i, g.targets[j]) - g.weights[j] / 255);
      peorArista = Math.max(peorArista, e);
      mediaArista += e;
      cuenta++;
    }
  }
  mediaArista /= cuenta;
  ok(peorArista < 0.012, "el coseno de vecs.bin cuadra con el peso del CSR",
     `${cuenta} aristas · medio ${mediaArista.toFixed(5)} · peor ${peorArista.toFixed(5)}`);

  ok(Math.abs(vec.cos(7, 7) - 1) < 1e-5, "una palabra consigo misma da 1");
  ok(Math.abs(vec.cos(3, 9) - vec.cos(9, 3)) < 1e-9, "el coseno es simétrico");
}

// ----------------------------------------------------------------- comparador
console.log(`\n— comparador ${"—".repeat(46)}`);
{
  ok(pairs([1, 2, 3, 4, 5]).length === 10, `${MAX_WORDS} palabras dan 10 parejas`);
  ok(pairs([1]).length === 0 && pairs([]).length === 0,
     "con una palabra o ninguna no hay pareja que medir");
  const ps = pairs([4, 7, 9]);
  ok(ps.every(([a, b]) => a !== b), "ninguna pareja repite palabra");
  ok(new Set(ps.map(([a, b]) => `${a}-${b}`)).size === ps.length, "ninguna pareja se repite");

  // dist() es la distancia euclídea real entre vectores unitarios, no una
  // conversión inventada: es lo que hace honesta a la constelación.
  ok(dist(1) === 0, "dos palabras idénticas están a distancia 0");
  ok(Math.abs(dist(-1) - 2) < 1e-9, "dos opuestas, a distancia 2");
  ok(dist(0) > dist(0.5), "menos parecido es más lejos");

  const ref = typical(g);
  ok(ref > 0.3 && ref < 0.9, "la similitud típica entre vecinos es creíble", ref.toFixed(3));
  // Contra la mediana exacta: `typical` muestrea, y si la muestra se desviara
  // la línea de referencia de las barras estaría en el sitio equivocado.
  const todos = Array.from(g.weights, (w) => w / 255).sort((a, b) => a - b);
  const exacta = todos[todos.length >> 1];
  ok(Math.abs(ref - exacta) < 0.01, "la muestra cae sobre la mediana real",
     `${ref.toFixed(3)} vs ${exacta.toFixed(3)}`);

  // --- vecinos compartidos
  {
    // Dos palabras que sí tienen vecinos en común: una y un vecino suyo.
    const a = 100;
    const b = g.targets[g.offsets[a]];
    const s = shared(g, [a, b]);
    ok(s.every((x) => x.with.length > 1), "un vecino común lo es de más de una");
    ok(s.every((x) => x.id !== a && x.id !== b), "una elegida no es vecina común de sí misma");
    ok(s.every((x) => x.with.every((w) => adj(x.id, w))),
       "todo vecino común es de verdad vecino en el grafo");
    const ord = s.every((x, i) => i === 0 || s[i - 1].with.length >= x.with.length);
    ok(ord, "los que más comparten van primero");
    ok(shared(g, []).length === 0, "sin palabras no hay terreno común");
  }

  // --- matriz y orden
  if (vec) {
    const ids = [100, g.targets[g.offsets[100]], 2000, 31000];
    const M = matrix(vec, ids);
    ok(M !== null, "la matriz sale cuando están todos los vectores");
    ok(M.every((r, i) => r[i] === 1), "la diagonal es 1 exacto, sin ruido de redondeo");
    ok(M.every((r, i) => r.every((v, j) => Math.abs(v - M[j][i]) < 1e-9)),
       "la matriz es simétrica");
    ok(M.every((r) => r.every((v) => v >= -1 && v <= 1)), "toda celda es un coseno");

    const r = ranked(vec, ids);
    ok(r.length === 6, "cuatro palabras dan seis parejas ordenadas");
    ok(r.every((x, i) => i === 0 || r[i - 1].s >= x.s), "de más a menos parecidas");
    ok(r[0].s > r[r.length - 1].s, "la primera pareja se parece más que la última");
    // Las dos primeras son vecinas en el grafo, así que su similitud tiene que
    // coincidir con el peso de esa arista. No se comprueba que sea *alta*: el
    // CSR está ordenado por nodo y no por peso, así que `offsets[a]` puede ser
    // el vecino más flojo de los ocho — y con 0,48 lo era.
    const vecinas = r.find((x) => (x.a === ids[0] && x.b === ids[1]) ||
                                  (x.a === ids[1] && x.b === ids[0]));
    let peso = 0;
    for (let j = g.offsets[ids[0]]; j < g.offsets[ids[0] + 1]; j++) {
      if (g.targets[j] === ids[1]) { peso = g.weights[j] / 255; break; }
    }
    ok(Math.abs(vecinas.s - peso) < 0.012,
       "la pareja que es arista del grafo mide lo que el grafo dice",
       `${vecinas.s.toFixed(3)} vs ${peso.toFixed(3)}`);

    // Un vector que falta apaga la vista entera en vez de dibujar un hueco.
    const roto = { cos: (a, b) => (a === 2000 || b === 2000 ? null : vec.cos(a, b)) };
    ok(matrix(roto, ids) === null && ranked(roto, ids) === null,
       "si falta un vector, no hay matriz a medias");
  }

  // --- constelación
  {
    // Un cuadrado de lado 1: MDS clásico tiene que devolverlo exacto, porque
    // las distancias ya viven en un plano. Si el doble centrado o Jacobi se
    // tuercen, el estrés deja de ser 0 y esto lo dice.
    const P = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const sim = P.map((a) => P.map((b) => 1 - d2(a, b) ** 2 / 2));
    const r = mds(sim);
    let peor = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        peor = Math.max(peor, Math.abs(d2(P[i], P[j]) - d2(r.xy[i], r.xy[j])));
      }
    }
    ok(r.stress < 1e-9, "un cuadrado se recupera sin estrés", r.stress.toExponential(1));
    ok(peor < 1e-9, "y con las distancias intactas", peor.toExponential(1));

    // Tres en línea: el segundo eje no existe y tiene que salir plano, no NaN.
    const L = [[0, 0], [1, 0], [3, 0]];
    const rl = mds(L.map((a) => L.map((b) => 1 - d2(a, b) ** 2 / 2)));
    ok(rl.xy.every((p) => p[1] === 0 || Math.abs(p[1]) < 1e-9),
       "tres palabras en línea no se inventan una segunda dimensión");
    ok(rl.xy.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])),
       "ninguna coordenada sale NaN");

    ok(mds([]).xy.length === 0 && mds([[1]]).xy.length === 1,
       "cero y una palabra no revientan la proyección");
    ok(mds([[1, 0.5], [0.5, 1]]).xy.length === 2, "dos palabras dan dos puntos");

    // Sobre palabras de verdad: el estrés tiene que ser un número entre 0 y 1.
    if (vec) {
      const ids = [100, 2000, 31000, 44000, 7];
      const M = matrix(vec, ids);
      const r5 = mds(M);
      ok(r5.xy.length === 5 && r5.xy.every((p) => p.every(Number.isFinite)),
         "cinco palabras reales dan cinco puntos finitos");
      ok(r5.stress >= 0 && r5.stress < 1, "el estrés es una fracción", r5.stress.toFixed(3));
      console.log(`     aplanar 300D a 2D con 5 palabras pierde el ${(r5.stress * 100).toFixed(0)}%`);
    }
  }
}

// ------------------------------------------------------------------ regiones
console.log(`\n— leyenda de regiones ${"—".repeat(38)}`);
{
  const rs = regions(g);
  ok(rs.length === g.meta.communities,
     "hay tantas regiones como dice meta.json", `${rs.length}`);

  const suma = rs.reduce((a, r) => a + r.members.length, 0);
  ok(suma === g.meta.nodes, "cada palabra cae en exactamente una región");

  ok(rs.every((r, i) => i === 0 || rs[i - 1].members.length >= r.members.length),
     "salen de la más grande a la más pequeña");

  ok(rs.every((r) => r.name.length > 0 && r.name.every((i) => g.community[i] === r.id)),
     "toda región se nombra con palabras suyas");

  // Nombrar con palabras vacías titularía media galaxia con «de · la · que».
  const conLlenas = rs.filter((r) => r.members.some((i) => !g.flags[i]));
  ok(conLlenas.every((r) => r.name.every((i) => !g.flags[i])),
     "ninguna región con palabras llenas se nombra con vacías");

  // El nombre es el de las más frecuentes, no el de las primeras que salgan.
  ok(rs.every((r) => {
    const llenas = r.members.filter((i) => !g.flags[i]);
    if (llenas.length < r.name.length) return true;
    const mejor = Math.min(...llenas.map((i) => g.rank[i]));
    return g.rank[r.name[0]] === mejor;
  }), "la primera del nombre es la más frecuente de la región");

  const grande = rs[0];
  const nucleo = core(g, grande);
  const dentro = new Set(grande.members);
  ok(nucleo.length <= grande.members.length && nucleo.every((i) => dentro.has(i)),
     "el núcleo es un subconjunto de la región", `${nucleo.length}/${grande.members.length}`);

  // Y es el subconjunto *central*: encuadrar sobre los miembros sueltos deja el
  // barrio como un punto en mitad de la pantalla.
  const d = (i) => Math.hypot(g.positions[i * 3] - grande.centroid[0],
                              g.positions[i * 3 + 1] - grande.centroid[1],
                              g.positions[i * 3 + 2] - grande.centroid[2]);
  const radioNucleo = Math.max(...nucleo.map(d));
  const radioTodo = Math.max(...grande.members.map(d));
  ok(radioNucleo <= radioTodo, "y el más apretado de los dos",
     `${radioNucleo.toFixed(2)} <= ${radioTodo.toFixed(2)}`);

  console.log(`     la mayor: ${grande.name.map((i) => g.labels[i]).join(" · ")} ` +
              `(${grande.members.length} palabras)`);
}

// ------------------------------------------------------------------ familias
console.log(`\n— familias por patrón ${"—".repeat(38)}`);
{
  const sufijo = LANG === "en" ? "*ly" : "*mente";
  const prefijo = LANG === "en" ? "un*" : "des*";

  const suf = match(idx, g, sufijo);
  const terminacion = sufijo.slice(1);
  ok(suf.ids.length > 0, `«${sufijo}» encuentra palabras`, `${suf.total}`);
  ok(suf.ids.every((i) => fold(g.labels[i]).endsWith(terminacion)),
     "y todas terminan igual");

  const pre = match(idx, g, prefijo);
  ok(pre.ids.every((i) => fold(g.labels[i]).startsWith(prefijo.slice(0, -1))),
     `«${prefijo}» sólo devuelve palabras que empiezan así`, `${pre.total}`);

  // Sin comodín se busca «dónde aparece»: para una palabra exacta ya está el
  // buscador, y un patrón que sólo casa consigo mismo no es una familia.
  const dentro = match(idx, g, "cas");
  ok(dentro.ids.every((i) => fold(g.labels[i]).includes("cas")),
     "sin comodín, contiene", `${dentro.total}`);

  ok(suf.ids.every((i, k) => k === 0 || g.rank[suf.ids[k - 1]] <= g.rank[i]),
     "las coincidencias salen por frecuencia");

  const todo = match(idx, g, "*a*", 10);
  ok(todo.ids.length === 10 && todo.total > 10 && todo.capped,
     "el tope recorta y lo dice", `${todo.total} → 10`);
  ok(PAT_MAX >= 100, "el tope por defecto deja sitio para una familia entera");

  // La caja la teclea cualquiera: un paréntesis suelto no puede reventar nada.
  ok(compile("(") !== null && match(idx, g, "(").total >= 0,
     "un patrón con metacaracteres no lanza");
  ok(compile("") === null && match(idx, g, "  ").ids.length === 0,
     "un patrón vacío no enciende nada");

  // La tilde no puede ser un requisito: el índice está plegado.
  if (LANG === "es") {
    const cion = match(idx, g, "*cion");
    ok(cion.total > 0, "«*cion» encuentra las de «-ción» sin tilde", `${cion.total}`);
  }
}

// ----------------------------------------------------------------- analogías
console.log(`\n— analogías ${"—".repeat(48)}`);
{
  let raw = null;
  try {
    const b = readFileSync(join(DATA, "vecs.bin"));
    raw = new Int8Array(b.buffer, b.byteOffset, b.length);
  } catch { /* sin vecs.bin no hay analogía, y el panel se apaga solo */ }

  if (!raw) {
    console.log("  -- vecs.bin no está publicado; las analogías quedarían apagadas");
  } else {
    const D = g.meta.dims;
    const n = g.meta.nodes;
    const inv = invNorms(raw, D, n);
    ok(inv.length === n && inv.every(Number.isFinite), "toda fila tiene norma finita");
    ok(inv.every((v) => v > 0), "y ninguna es el vector cero");

    // Una palabra es su propia vecina más cercana: si el offset `i * dims` no
    // cayera en la fila `i`, esto se caería.
    const yo = vec.get(1234);
    const top = nearest(yo, raw, D, n, inv, 3);
    ok(top[0].id === 1234 && Math.abs(top[0].cos - 1) < 0.02,
       "cada palabra es su vecina más cercana", `cos ${top[0].cos.toFixed(3)}`);
    ok(top.every((r, k) => k === 0 || top[k - 1].cos >= r.cos),
       "las respuestas salen ordenadas");

    const sin = nearest(yo, raw, D, n, inv, 3, [1234]);
    ok(!sin.some((r) => r.id === 1234), "lo excluido no aparece");
    ok(sin.length === 3 && new Set(sin.map((r) => r.id)).size === 3,
       "y no se repite ninguna");

    // El vector consulta es unitario: el coseno de abajo cuenta con ello.
    const trío = LANG === "en" ? ["king", "man", "woman"] : ["rey", "hombre", "mujer"];
    const ids = trío.map((w) => resolve(idx, g, w));
    if (ids.every((i) => i >= 0)) {
      const q = query(vec.get(ids[0]), vec.get(ids[1]), vec.get(ids[2]));
      let norma = 0;
      for (let k = 0; k < D; k++) norma += q[k] * q[k];
      ok(Math.abs(Math.sqrt(norma) - 1) < 1e-5, "la consulta sale normalizada");

      const r = nearest(q, raw, D, n, inv, 5, ids);
      ok(r.length === 5 && r.every((x) => x.cos >= -1 && x.cos <= 1),
         "cinco respuestas y todas son cosenos");
      ok(!r.some((x) => ids.includes(x.id)),
         "las tres de la pregunta quedan fuera de la respuesta");
      console.log(`     ${trío[0]} − ${trío[1]} + ${trío[2]} = ` +
                  r.map((x) => `${g.labels[x.id]} ${x.cos.toFixed(2)}`).join(" · "));
    }
  }
}

// ------------------------------------------------------------ vista en la url
console.log(`\n— compartir la vista ${"—".repeat(39)}`);
{
  const c = { t: [1.2345, -8.5, 0], d: 42.125, th: 1.5708, ph: 0.9 };
  const ida = decodeCam(encodeCam(c));
  ok(ida !== null, "una vista codificada se vuelve a leer");
  ok(Math.abs(ida.t[0] - 1.2345) < 1e-3 && Math.abs(ida.d - 42.125) < 1e-3 &&
     Math.abs(ida.th - c.th) < 1e-3 && Math.abs(ida.ph - c.ph) < 1e-3,
     "y con los seis números intactos hasta la milésima");
  ok(encodeCam(c).split(",").length === 6, "son seis números y ni uno más");

  // La URL la escribe cualquiera: nada de esto puede dejar la cámara en NaN.
  ok(decodeCam(null) === null && decodeCam("") === null, "sin parámetro, sin cámara");
  ok(decodeCam("1,2,3") === null, "seis o ninguno");
  ok(decodeCam("a,b,c,d,e,f") === null, "letras, no");
  ok(decodeCam("0,0,0,0,1,1") === null, "distancia cero degenera el lookAt: se ignora");
}

console.log(`\n${failed === 0 ? "TODO OK" : `${failed} FALLOS`}\n`);
process.exit(failed ? 1 : 0);
