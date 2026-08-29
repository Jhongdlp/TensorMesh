/**
 * Sala 07 — Red Neuronal (perceptrón multicapa).
 *
 * Todo lo que la sala *afirma* se calcula aquí, en CPU y en doble precisión de
 * JavaScript: el paso hacia delante, la retropropagación, la pérdida, el
 * acierto y el campo de decisión que se pinta en el suelo. El motor sólo
 * dibuja lo que este módulo devuelve.
 *
 * Está en CPU y no en un compute shader a propósito. La red de esta sala es
 * diminuta —dos entradas, unas decenas de pesos— y lo que hay que enseñar no
 * es cuánto se puede paralelizar sino **qué número cambia y por qué**: la
 * ficha de una neurona muestra sus pesos, y el suelo muestra la función que
 * esos pesos definen. Con los pesos viviendo sólo en la GPU habría que
 * bajarlos cada vez que alguien pincha una neurona, que es justo el camino que
 * el atlas evita y que aquí no compra nada.
 *
 * Es `.mjs` y no `.ts` por la misma razón que `palette.mjs`, `highlight.mjs` y
 * `field.mjs`: `test/nn.mjs` lo importa tal cual para comprobar el gradiente
 * contra diferencias finitas. `package.json` es `type: commonjs` y Node no
 * carga un `.ts` como módulo, mientras que `tsc` sí tipa un `.mjs` por JSDoc.
 */

/** @typedef {"relu" | "tanh" | "sigmoid"} ActId */

/**
 * Un punto del conjunto de entrenamiento. El dominio es [-1, 1]².
 * @typedef {object} Pt
 * @property {number} x
 * @property {number} y
 * @property {number} label  0 o 1
 */

/**
 * @typedef {object} DatasetDef
 * @property {string} id
 * @property {0 | 1 | 2} hardness  cuántas capas ocultas hacen falta *como
 *   mínimo* para separarlo. Lo usan la guía y la ficha: es la lección.
 * @property {(n: number, noise: number, rnd: () => number) => Pt[]} generate
 */

/** Generador reproducible: reiniciar con la misma semilla da la misma nube. */
/**
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido gaussiano (Box-Muller). El uniforme apelmaza los bordes. */
/** @param {() => number} rnd @returns {number} */
function gauss(rnd) {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

// ---------------------------------------------------------------- conjuntos

const clamp1 = (/** @type {number} */ v) => Math.max(-1, Math.min(1, v));

/** @type {DatasetDef[]} */
export const DATASETS = [
  {
    id: "gauss",
    hardness: 0,
    generate: (n, noise, rnd) => {
      const out = /** @type {Pt[]} */ ([]);
      for (let i = 0; i < n; i++) {
        const label = i % 2;
        const cx = label ? 0.45 : -0.45;
        const cy = label ? 0.45 : -0.45;
        const s = 0.22 + noise * 0.5;
        out.push({ x: clamp1(cx + gauss(rnd) * s), y: clamp1(cy + gauss(rnd) * s), label });
      }
      return out;
    },
  },
  {
    id: "circle",
    hardness: 1,
    generate: (n, noise, rnd) => {
      const out = /** @type {Pt[]} */ ([]);
      for (let i = 0; i < n; i++) {
        const label = i % 2;
        const r = label ? 0.12 + rnd() * 0.30 : 0.66 + rnd() * 0.30;
        const a = rnd() * Math.PI * 2;
        const s = noise * 0.34;
        out.push({
          x: clamp1(Math.cos(a) * r + gauss(rnd) * s),
          y: clamp1(Math.sin(a) * r + gauss(rnd) * s),
          label,
        });
      }
      return out;
    },
  },
  {
    id: "xor",
    hardness: 1,
    generate: (n, noise, rnd) => {
      const out = /** @type {Pt[]} */ ([]);
      for (let i = 0; i < n; i++) {
        let x = rnd() * 2 - 1;
        let y = rnd() * 2 - 1;
        // Un pasillo vacío en los ejes: si no, media nube cae sobre la
        // frontera y el acierto se estanca en 0,8 sin que nada esté mal.
        x += x > 0 ? 0.06 : -0.06;
        y += y > 0 ? 0.06 : -0.06;
        const label = x * y > 0 ? 1 : 0;
        const s = noise * 0.42;
        out.push({ x: clamp1(x + gauss(rnd) * s), y: clamp1(y + gauss(rnd) * s), label });
      }
      return out;
    },
  },
  {
    id: "moons",
    hardness: 1,
    generate: (n, noise, rnd) => {
      const out = /** @type {Pt[]} */ ([]);
      for (let i = 0; i < n; i++) {
        const label = i % 2;
        const a = rnd() * Math.PI;
        const s = 0.06 + noise * 0.34;
        const r = 0.62;
        const x = label ? Math.cos(a) * r + 0.30 : -Math.cos(a) * r - 0.30;
        const y = label ? Math.sin(a) * r - 0.28 : -Math.sin(a) * r + 0.28;
        out.push({ x: clamp1(x + gauss(rnd) * s), y: clamp1(y + gauss(rnd) * s), label });
      }
      return out;
    },
  },
  {
    id: "spiral",
    hardness: 2,
    generate: (n, noise, rnd) => {
      const out = /** @type {Pt[]} */ ([]);
      for (let i = 0; i < n; i++) {
        const label = i % 2;
        const t = (i / n) * 3.6 + rnd() * 0.12;
        const r = 0.08 + t * 0.26;
        const a = t * 2.1 + (label ? Math.PI : 0);
        const s = noise * 0.30;
        out.push({
          x: clamp1(Math.cos(a) * r + gauss(rnd) * s),
          y: clamp1(Math.sin(a) * r + gauss(rnd) * s),
          label,
        });
      }
      return out;
    },
  },
];

/** @param {string} id @returns {DatasetDef} */
export function datasetById(id) {
  return DATASETS.find(d => d.id === id) ?? DATASETS[0];
}

// -------------------------------------------------------------------- la red

/** Coeficientes de la activación oculta y su derivada, en un solo sitio: el
 *  paso hacia atrás usa exactamente la derivada de lo que usó el de ida, y
 *  tenerlos separados es la forma clásica de que dejen de corresponderse. */
/** @param {ActId} kind @param {number} z @returns {number} */
function actFwd(kind, z) {
  if (kind === "relu") return z > 0 ? z : 0;
  if (kind === "tanh") return Math.tanh(z);
  return 1 / (1 + Math.exp(-z));
}

/** @param {ActId} kind @param {number} z @param {number} a @returns {number} */
function actGrad(kind, z, a) {
  if (kind === "relu") return z > 0 ? 1 : 0;
  if (kind === "tanh") return 1 - a * a;
  return a * (1 - a);
}

const sigmoid = (/** @type {number} */ z) => 1 / (1 + Math.exp(-z));

/**
 * Perceptrón multicapa con salida sigmoide y entropía cruzada binaria.
 *
 * `sizes` incluye la capa de entrada y la de salida: `[2, 8, 8, 1]`. Los pesos
 * de la capa `l` viven en `W[l]`, de tamaño `sizes[l+1] × sizes[l]`, en orden
 * fila-mayor: `W[l][j * sizes[l] + i]` va de la neurona `i` de la capa `l` a la
 * `j` de la `l+1`.
 */
export class Mlp {
  /** @type {number[]} */ sizes;
  /** @type {Float32Array[]} */ W = [];
  /** @type {Float32Array[]} */ B = [];
  /** Activaciones del último paso hacia delante. `A[0]` es la entrada. */
  /** @type {Float32Array[]} */ A = [];
  /** Preactivaciones (z) por capa, sin contar la de entrada. */
  /** @type {Float32Array[]} */ Z = [];
  /** Deltas del paso hacia atrás, por capa (sin contar la entrada). */
  /** @type {Float32Array[]} */ D = [];
  /** Gradientes del último lote. Públicos porque el dibujo los usa: el
   *  grosor del pulso de vuelta es |∂L/∂w|, no un número decorativo. */
  /** @type {Float32Array[]} */ gW = [];
  /** @type {Float32Array[]} */ gB = [];
  /** @type {ActId} */ act;

  /**
   * @param {number[]} sizes
   * @param {ActId} act
   * @param {number} [seed]
   */
  constructor(sizes, act, seed = 1) {
    this.sizes = sizes.slice();
    this.act = act;
    const rnd = mulberry32(seed);
    for (let l = 0; l < sizes.length - 1; l++) {
      const inN = sizes[l], outN = sizes[l + 1];
      // He para ReLU (que mata la mitad de la señal), Xavier para las
      // saturantes. Con una sola escala, ReLU arranca apagada o revienta.
      const scale = act === "relu" ? Math.sqrt(2 / inN) : Math.sqrt(1 / inN);
      const w = new Float32Array(inN * outN);
      for (let k = 0; k < w.length; k++) w[k] = gauss(rnd) * scale;
      this.W.push(w);
      this.B.push(new Float32Array(outN));
      this.gW.push(new Float32Array(inN * outN));
      this.gB.push(new Float32Array(outN));
      this.Z.push(new Float32Array(outN));
      this.D.push(new Float32Array(outN));
    }
    for (const n of sizes) this.A.push(new Float32Array(n));
  }

  /** @returns {number} */
  get layers() { return this.sizes.length; }

  /** Paso hacia delante sobre un punto. Deja las activaciones en `A`. */
  /**
   * @param {number} x
   * @param {number} y
   * @returns {number}
   */
  forward(x, y) {
    const A = this.A, Z = this.Z, L = this.sizes.length;
    A[0][0] = x;
    A[0][1] = y;
    for (let l = 0; l < L - 1; l++) {
      const w = this.W[l], b = this.B[l];
      const inN = this.sizes[l], outN = this.sizes[l + 1];
      const prev = A[l], z = Z[l], cur = A[l + 1];
      const last = l === L - 2;
      for (let j = 0; j < outN; j++) {
        let s = b[j];
        const row = j * inN;
        for (let i = 0; i < inN; i++) s += w[row + i] * prev[i];
        z[j] = s;
        cur[j] = last ? sigmoid(s) : actFwd(this.act, s);
      }
    }
    return A[L - 1][0];
  }

  /** Un lote de descenso de gradiente. Devuelve la pérdida media del lote. */
  /**
   * @param {Pt[]} pts
   * @param {Int32Array} idx
   * @param {number} from
   * @param {number} count
   * @param {number} lr
   * @returns {number} la pérdida media del lote
   */
  trainBatch(pts, idx, from, count, lr) {
    const L = this.sizes.length;
    for (let l = 0; l < L - 1; l++) {
      this.gW[l].fill(0);
      this.gB[l].fill(0);
    }
    let loss = 0;

    for (let k = 0; k < count; k++) {
      const p = pts[idx[(from + k) % idx.length]];
      const out = this.forward(p.x, p.y);
      const t = p.label;
      // Entropía cruzada binaria, acotada: con out exactamente 0 o 1 el
      // logaritmo se va a infinito y la curva de pérdida se rompe entera.
      const o = Math.min(1 - 1e-7, Math.max(1e-7, out));
      loss += -(t * Math.log(o) + (1 - t) * Math.log(1 - o));

      // Sigmoide + entropía cruzada: el delta de salida es (a − t) pelado.
      this.D[L - 2][0] = out - t;
      for (let l = L - 3; l >= 0; l--) {
        const wNext = this.W[l + 1];
        const dNext = this.D[l + 1];
        const d = this.D[l];
        const outN = this.sizes[l + 1], nextN = this.sizes[l + 2];
        for (let j = 0; j < outN; j++) {
          let s = 0;
          for (let q = 0; q < nextN; q++) s += wNext[q * outN + j] * dNext[q];
          d[j] = s * actGrad(this.act, this.Z[l][j], this.A[l + 1][j]);
        }
      }
      for (let l = 0; l < L - 1; l++) {
        const d = this.D[l], prev = this.A[l];
        const inN = this.sizes[l], outN = this.sizes[l + 1];
        const gw = this.gW[l], gb = this.gB[l];
        for (let j = 0; j < outN; j++) {
          const dj = d[j];
          gb[j] += dj;
          const row = j * inN;
          for (let i = 0; i < inN; i++) gw[row + i] += dj * prev[i];
        }
      }
    }

    const s = lr / Math.max(1, count);
    for (let l = 0; l < L - 1; l++) {
      const w = this.W[l], gw = this.gW[l], b = this.B[l], gb = this.gB[l];
      for (let k = 0; k < w.length; k++) w[k] -= s * gw[k];
      for (let j = 0; j < b.length; j++) b[j] -= s * gb[j];
    }
    return loss / Math.max(1, count);
  }

  /** Pérdida media y acierto sobre un conjunto. */
  /**
   * @param {Pt[]} pts
   * @returns {{ loss: number, acc: number }}
   */
  evaluate(pts) {
    if (pts.length === 0) return { loss: 0, acc: 0 };
    let loss = 0, hit = 0;
    for (const p of pts) {
      const out = this.forward(p.x, p.y);
      const o = Math.min(1 - 1e-7, Math.max(1e-7, out));
      loss += -(p.label * Math.log(o) + (1 - p.label) * Math.log(1 - o));
      if ((o > 0.5 ? 1 : 0) === p.label) hit++;
    }
    return { loss: loss / pts.length, acc: hit / pts.length };
  }

  /**
   * Muestrea una función escalar sobre el cuadrado de entrada.
   *
   * `layer < 0` devuelve la salida de la red (probabilidad, ya en 0..1). Con
   * una capa y una neurona concretas devuelve **la activación de esa neurona**,
   * reescalada a 0..1 por su propio máximo: es la pregunta «¿qué mira ésta?»,
   * y sin reescalar una neurona tibia sale negra y parece muerta.
   */
  /**
   * @param {Float32Array} out
   * @param {number} res
   * @param {number} layer
   * @param {number} unit
   */
  sampleField(out, res, layer, unit) {
    let mx = 1e-6;
    let k = 0;
    for (let v = 0; v < res; v++) {
      const y = (v / (res - 1)) * 2 - 1;
      for (let u = 0; u < res; u++) {
        const x = (u / (res - 1)) * 2 - 1;
        this.forward(x, y);
        const val = layer < 0 ? this.A[this.sizes.length - 1][0] : this.A[layer][unit];
        out[k++] = val;
        const a = Math.abs(val);
        if (a > mx) mx = a;
      }
    }
    if (layer >= 0) {
      // 0,5 en el centro: la rampa es divergente y el cero tiene que caer en
      // su punto neutro, o una activación nula se leería como «negativa».
      for (let i = 0; i < out.length; i++) out[i] = 0.5 + (out[i] / mx) * 0.5;
    }
  }

  /** Activación media (en valor absoluto) de cada neurona sobre la nube. Es lo
   *  que apaga a una neurona muerta en el dibujo: no es cosmética, es su
   *  estado real. */
  /**
   * @param {Pt[]} pts
   * @param {Float32Array[]} into
   */
  meanActivation(pts, into) {
    for (const a of into) a.fill(0);
    const n = Math.max(1, pts.length);
    for (const p of pts) {
      this.forward(p.x, p.y);
      for (let l = 1; l < this.sizes.length; l++) {
        const src = this.A[l], dst = into[l];
        for (let i = 0; i < src.length; i++) dst[i] += Math.abs(src[i]);
      }
    }
    for (const a of into) for (let i = 0; i < a.length; i++) a[i] /= n;
  }

  /** El peso mayor en valor absoluto: normaliza el grosor visual de la malla. */
  /** @returns {number} */
  maxWeight() {
    let mx = 1e-6;
    for (const w of this.W) for (let i = 0; i < w.length; i++) mx = Math.max(mx, Math.abs(w[i]));
    return mx;
  }
}

// ------------------------------------------------------------------- colores

/**
 * La rampa del suelo. Divergente y con el punto neutro **exactamente** en 0,5:
 * es la frontera de decisión, y una rampa que no marque su centro convierte
 * «la red aún no lo sabe» en un color cualquiera del degradado.
 *
 * Los dos extremos son los mismos dos colores de las dos clases —rosa y
 * cian—, así que el suelo y los puntos hablan el mismo idioma sin leyenda.
 */
/** @type {[number, number, number]} */
export const CLASS_A = [1.0, 0.25, 0.44];
/** @type {[number, number, number]} */
export const CLASS_B = [0.0, 0.94, 1.0];

/**
 * @param {number} t
 * @returns {[number, number, number]}
 */
export function fieldColor(t) {
  const v = Math.max(0, Math.min(1, t));
  // Dos tramos con un valle de luz en el centro: el neutro es casi negro, así
  // la frontera se lee como una zanja y no hay que buscarla.
  //
  // El exponente es mayor que uno y el techo se queda en 0,62 a propósito. El
  // suelo es fondo: con la rampa a plena luz sale un cartel de dos colores que
  // se come a los puntos que tiene encima —que son el dato— y a la malla que
  // tiene detrás. Y con la curva hacia arriba, la penumbra ocupa toda la
  // franja de duda en vez de sólo la línea del medio: se ve *cuánto* duda,
  // no sólo dónde.
  const k = Math.abs(v - 0.5) * 2;
  const c = v < 0.5 ? CLASS_A : CLASS_B;
  const g = 0.035 + 0.585 * Math.pow(k, 1.7);
  return [c[0] * g, c[1] * g, c[2] * g];
}

/** Color de un peso: cian si suma, rosa si resta. El signo es la mitad de lo
 *  que un peso significa y en escala de grises no se ve. */
/**
 * @param {number} w
 * @returns {[number, number, number]}
 */
export function weightColor(w) {
  return w >= 0 ? CLASS_B : CLASS_A;
}
