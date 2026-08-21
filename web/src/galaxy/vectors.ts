/** Los vectores 300D, pedidos de a 300 bytes.
 *
 *  El resto del atlas se descarga entero y se queda en memoria; esto no. El
 *  motivo es el tamaño: `vecs.bin` son 15 MB por idioma, siete veces todo lo
 *  demás junto, y el comparador necesita **cinco palabras**, no cincuenta mil.
 *  Así que el archivo vive entero en el servidor y en el cable viaja sólo la
 *  fila que se ha pedido, con una petición `Range:`.
 *
 *  Por qué se puede hacer así:
 *
 *  - el registro es **contiguo y sin cabecera** — la palabra `i` ocupa
 *    `[i*dims, i*dims + dims)`, que es exactamente lo que se pide en bytes;
 *  - es **int8** y la escala por vector **no se publica**: el coseno no la
 *    necesita, y aquí se renormaliza al decodificar. Ver `pipeline/vectors.py`
 *    para el error medido (peor caso 0,0033 — por debajo de los dos decimales
 *    que muestra la ficha).
 *
 *  Dos cosas que este módulo tiene que aguantar y no son hipótesis:
 *
 *  1. **Que el servidor ignore el rango.** Un `200` con el archivo entero es
 *     una respuesta válida a una petición con `Range:`. Cuando pasa, se guarda
 *     el archivo completo y se sirve de ahí en adelante: caro una vez, gratis
 *     después. Sin esta rama, un servidor estático sin soporte de rangos
 *     dejaría el comparador roto en vez de lento.
 *  2. **Que `vecs.bin` no esté publicado.** Es el archivo que se puede olvidar
 *     al copiar (`pipeline/all.sh` lo copia; una publicación a mano, no). Un
 *     404 apaga el módulo (`available === false`) y la interfaz cae a lo que el
 *     grafo sí sabe, en vez de reventar.
 */

import { invNorms, nearest } from "./analogy.mjs";

/** Cuántos registros de hueco se toleran antes de partir en dos peticiones.
 *  Ocho registros son 2,4 KB de más; una petición HTTP cuesta bastante más que
 *  eso en ida y vuelta, así que unir sale a cuenta. */
const GAP = 8;

/** Peticiones en vuelo a la vez. El comparador pide como mucho unas decenas de
 *  filas (las elegidas y sus vecinos compartidos); ocho las cubre sin abrir un
 *  abanico de conexiones que el navegador acabaría encolando igual. */
const POOL = 8;

export class Vectors {
  /** `false` en cuanto se sabe que el archivo no está. `null` mientras no se
   *  ha pedido nada todavía: no se sondea al arrancar, sólo al usarse. */
  available: boolean | null = null;

  private readonly url: string;
  /** Públicos: quien busca en el archivo entero (la analogía) necesita el
   *  tamaño del registro y cuántas filas hay para recorrerlo. */
  readonly dims: number;
  readonly n: number;
  /** Ya normalizados: se normaliza una vez al decodificar, no en cada coseno. */
  private readonly cache = new Map<number, Float32Array>();
  /** El archivo entero. Llega por dos caminos: un servidor que ignora el
   *  `Range:` y contesta con todo, o alguien que lo pide a propósito
   *  (`loadAll`) porque va a preguntar por las cincuenta mil a la vez. */
  private whole: Int8Array | null = null;
  /** Norma inversa de cada fila, sólo con el archivo entero. Se calcula una vez
   *  al llegar: en cada consulta sería otra pasada de 15 millones de sumas. */
  private inv: Float32Array | null = null;
  /** La descarga entera en curso, para que dos paneles no la pidan dos veces. */
  private allJob: Promise<boolean> | null = null;
  /** Peticiones en curso por clave de tramo, para no pedir dos veces lo mismo
   *  cuando el comparador reacciona a dos cambios seguidos. */
  private inflight = new Map<string, Promise<void>>();

  constructor(base: string, dims: number, n: number) {
    this.url = `${base}/vecs.bin`;
    this.dims = dims;
    this.n = n;
  }

  /** El vector ya normalizado, o `null` si aún no se ha traído. Síncrono a
   *  propósito: el render de React lee de aquí y no puede esperar. */
  get(id: number): Float32Array | null {
    return this.cache.get(id) ?? null;
  }

  /** Trae las filas que falten. Devuelve cuando todas las pedidas están en
   *  caché — o cuando se sabe que no van a estar. */
  async load(ids: number[]): Promise<void> {
    if (this.available === false) return;
    const want = [...new Set(ids)]
      .filter(i => i >= 0 && i < this.n && !this.cache.has(i))
      .sort((a, b) => a - b);
    if (!want.length) return;

    if (this.whole) { for (const i of want) this.decode(i, this.whole); return; }

    const jobs = runs(want, GAP).map(r => this.range(r));
    await pool(jobs, POOL);
  }

  /** Coseno en 300D entre dos palabras ya traídas, o `null` si falta alguna.
   *
   *  Es un producto escalar y nada más: los dos vectores llegan normalizados. */
  cos(a: number, b: number): number | null {
    const u = this.get(a), v = this.get(b);
    if (!u || !v) return null;
    let s = 0;
    for (let i = 0; i < u.length; i++) s += u[i] * v[i];
    // El redondeo puede sacarlo de [−1,1] por una billonésima; recortarlo evita
    // que un `Math.acos` río abajo devuelva NaN.
    return s < -1 ? -1 : s > 1 ? 1 : s;
  }

  /** ¿Está el archivo entero en memoria y medido? Es lo que separa una pregunta
   *  sobre cinco palabras de una sobre las cincuenta mil. */
  get complete(): boolean { return this.whole !== null && this.inv !== null; }

  /** Trae `vecs.bin` **entero** (15 MB) y calcula las normas.
   *
   *  Sólo lo llama la analogía, y sólo cuando se abre: el resto del atlas se
   *  las apaña con filas sueltas y no hay razón para que quien no juega a esto
   *  pague la descarga. Una vez traído se queda, así que el resto del atlas
   *  también deja de pedir rangos.
   *
   *  `onProgress` existe porque 15 MB en una conexión mala son diez segundos de
   *  botón que no hace nada: sin barra, lo que se aprende es que está roto.
   */
  loadAll(onProgress?: (frac: number) => void): Promise<boolean> {
    if (this.complete) return Promise.resolve(true);
    if (this.available === false) return Promise.resolve(false);
    if (!this.allJob) {
      this.allJob = this.fetchAll(onProgress).finally(() => { this.allJob = null; });
    }
    return this.allJob;
  }

  /** Las `k` palabras más parecidas a un vector cualquiera.
   *
   *  El vector no tiene por qué ser el de una palabra: la analogía pregunta por
   *  un punto del espacio que no ocupa ninguna. Devuelve `[]` mientras no esté
   *  el archivo entero, que es un estado legítimo y no un error.
   */
  nearest(q: Float32Array, k: number, skip: Iterable<number> = []):
    { id: number; cos: number }[] {
    if (!this.whole || !this.inv) return [];
    return nearest(q, this.whole, this.dims, this.n, this.inv, k, skip);
  }

  private async fetchAll(onProgress?: (frac: number) => void): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(this.url);
    } catch {
      this.available = false;
      return false;
    }
    if (!res.ok) { this.available = false; return false; }

    const want = this.n * this.dims;
    let body: Uint8Array;
    if (res.body && onProgress) {
      // Por trozos para poder contar. `Content-Length` puede no venir (respuesta
      // comprimida al vuelo), y entonces el tamaño esperado del archivo es una
      // estimación igual de buena: es el que el pipeline escribió.
      const total = Number(res.headers.get("Content-Length")) || want;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        got += value.length;
        onProgress(Math.min(0.999, got / total));
      }
      body = new Uint8Array(got);
      let at = 0;
      for (const c of chunks) { body.set(c, at); at += c.length; }
    } else {
      body = new Uint8Array(await res.arrayBuffer());
    }

    // Mismo cuidado que en `fetchRange`: si no son exactamente los bytes que el
    // pipeline escribió, no se leen filas de la palabra equivocada.
    if (body.length !== want) { this.available = false; return false; }
    this.whole = new Int8Array(body.buffer, body.byteOffset, body.length);
    this.inv = invNorms(this.whole, this.dims, this.n);
    this.available = true;
    onProgress?.(1);
    return true;
  }

  /** Un tramo de filas contiguas, en una sola petición. */
  private range(r: { lo: number; hi: number }): () => Promise<void> {
    const key = `${r.lo}-${r.hi}`;
    return () => {
      const hit = this.inflight.get(key);
      if (hit) return hit;
      const p = this.fetchRange(r).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
      return p;
    };
  }

  private async fetchRange(r: { lo: number; hi: number }): Promise<void> {
    const from = r.lo * this.dims;
    const to = (r.hi + 1) * this.dims - 1;   // `Range` es inclusivo por los dos lados
    let res: Response;
    try {
      res = await fetch(this.url, { headers: { Range: `bytes=${from}-${to}` } });
    } catch {
      this.available = false;
      return;
    }
    if (!res.ok) { this.available = false; return; }
    const body = new Int8Array(await res.arrayBuffer());
    this.available = true;

    if (res.status === 206) {
      // Lo normal: llega justo el tramo pedido.
      for (let i = r.lo; i <= r.hi; i++) {
        this.decode(i, body, (i - r.lo) * this.dims);
      }
      return;
    }
    // El servidor ignoró el rango. Si de verdad es el archivo entero nos lo
    // quedamos; si es otra cosa (un tramo distinto, una redirección rara), se
    // descarta en vez de leer bytes de la palabra equivocada.
    if (body.length !== this.n * this.dims) { this.available = false; return; }
    this.whole = body;
    for (let i = r.lo; i <= r.hi; i++) this.decode(i, body);
  }

  /** int8 → float32 normalizado. `at` es el desplazamiento dentro de `src`;
   *  con el archivo entero es el offset real de la fila. */
  private decode(id: number, src: Int8Array, at = id * this.dims): void {
    const out = new Float32Array(this.dims);
    let sum = 0;
    for (let i = 0; i < this.dims; i++) {
      const v = src[at + i];
      out[i] = v;
      sum += v * v;
    }
    const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
    for (let i = 0; i < this.dims; i++) out[i] *= inv;
    this.cache.set(id, out);
  }
}

/** Parte una lista ordenada en tramos, uniendo los que estén a menos de `gap`. */
function runs(sorted: number[], gap: number): { lo: number; hi: number }[] {
  const out: { lo: number; hi: number }[] = [];
  let lo = sorted[0], hi = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - hi <= gap) { hi = sorted[i]; continue; }
    out.push({ lo, hi });
    lo = hi = sorted[i];
  }
  out.push({ lo, hi });
  return out;
}

/** Ejecuta las tareas con como mucho `k` a la vez. */
async function pool(jobs: (() => Promise<void>)[], k: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(k, jobs.length) }, worker));
}
