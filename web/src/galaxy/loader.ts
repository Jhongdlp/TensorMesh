/** Carga los binarios del pipeline. Todo son vistas sobre ArrayBuffer:
 *  no hay parseo, no hay JSON.parse de 1,4 MB congelando la pestaña. */

export interface Meta {
  lang: string;
  nodes: number;
  edges: number;
  csr: number;
  posScale: number;
  communities: number;
  /** Tamaño del registro de `vecs.bin`. Opcional: una galaxia publicada antes
   *  de que existiera el comparador no lo lleva, y entonces no hay vectores. */
  dims?: number;
  stopwords: number;
  generated: string;
}

export interface Galaxy {
  meta: Meta;
  /** n*3 float, ya des-cuantizado */
  positions: Float32Array;
  /** CSR: vecinos de i están en targets[offsets[i] .. offsets[i+1]] */
  offsets: Uint32Array;
  targets: Uint16Array;
  weights: Uint8Array;
  labels: string[];
  community: Uint8Array;
  rank: Uint16Array;
  flags: Uint8Array;
  /** aristas únicas (i < j), aplanadas: [a0,b0, a1,b1, ...] */
  uniqueEdges: Uint32Array;
}

/** Peticiones que el `<script is:inline>` de `index.astro` ya lanzó antes de
 *  que existiera React. Ver el comentario de allí: se pasan como promesa y no
 *  como `<link rel=preload>` para no arriesgar una segunda descarga. */
declare global {
  interface Window { __atlas?: Record<string, Promise<Response | null>> }
}

/** La respuesta ya en marcha si la hay, y si no una nueva.
 *
 *  Sólo sirve una vez por URL: un `Response` no se puede leer dos veces, así
 *  que la entrada se consume al usarla. Cambiar de idioma y volver vuelve a
 *  pedir el archivo — que es lo correcto, porque la caché HTTP ya lo tiene. */
function req(url: string): Promise<Response | null> {
  const pre = typeof window !== "undefined" ? window.__atlas : undefined;
  const hit = pre?.[url];
  if (hit) { delete pre![url]; return hit; }
  return fetch(url);
}

async function buf(url: string): Promise<ArrayBuffer> {
  const r = await req(url);
  if (!r || !r.ok) throw new Error(`${url} → ${r ? r.status : "sin respuesta"}`);
  return r.arrayBuffer();
}

export async function loadGalaxy(base: string): Promise<Galaxy> {
  const metaRes = await req(`${base}/meta.json`);
  if (!metaRes || !metaRes.ok) {
    throw new Error(`${base}/meta.json → ${metaRes ? metaRes.status : "sin respuesta"}`);
  }
  const meta: Meta = await metaRes.json();
  const n = meta.nodes;

  const [posB, edgeB, labB, attrB] = await Promise.all([
    buf(`${base}/positions.bin`),
    buf(`${base}/edges.bin`),
    buf(`${base}/labels.bin`),
    buf(`${base}/attrs.bin`),
  ]);

  const q = new Int16Array(posB);
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = q[i] * meta.posScale;

  // edges.bin = offsets Uint32(n+1) | targets Uint16(csr) | weights Uint8(csr)
  const offBytes = (n + 1) * 4;
  const tgtBytes = meta.csr * 2;
  const offsets = new Uint32Array(edgeB, 0, n + 1);
  const targets = new Uint16Array(edgeB, offBytes, meta.csr);
  const weights = new Uint8Array(edgeB, offBytes + tgtBytes, meta.csr);

  // labels.bin = offsets Uint32(n+1) | blob UTF-8
  const labOff = new Uint32Array(labB, 0, n + 1);
  const blob = new Uint8Array(labB, (n + 1) * 4);
  const dec = new TextDecoder();
  const labels = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    labels[i] = dec.decode(blob.subarray(labOff[i], labOff[i + 1]));
  }

  // attrs.bin = community Uint8(n) | rank Uint16(n) | flags Uint8(n)
  const community = new Uint8Array(attrB, 0, n);
  const rank = new Uint16Array(attrB, n, n);
  const flags = new Uint8Array(attrB, n + n * 2, n);

  // El CSR es simétrico: nos quedamos con una dirección para dibujar líneas.
  const uniqueEdges = new Uint32Array(meta.edges * 2);
  let w = 0;
  for (let i = 0; i < n; i++) {
    for (let j = offsets[i]; j < offsets[i + 1]; j++) {
      const t = targets[j];
      if (t > i) {
        uniqueEdges[w++] = i;
        uniqueEdges[w++] = t;
      }
    }
  }

  return { meta, positions, offsets, targets, weights, labels,
           community, rank, flags, uniqueEdges: uniqueEdges.subarray(0, w) };
}

/** Vecinos de un nodo, ordenados por peso descendente. */
export function neighbours(g: Galaxy, i: number) {
  const out: { id: number; w: number }[] = [];
  for (let j = g.offsets[i]; j < g.offsets[i + 1]; j++) {
    out.push({ id: g.targets[j], w: g.weights[j] / 255 });
  }
  return out.sort((a, b) => b.w - a.w);
}
