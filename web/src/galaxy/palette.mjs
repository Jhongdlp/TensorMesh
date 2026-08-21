/** Color por zona: el tono sale de *dónde* cae la región en el propio atlas.
 *
 *  Los nodos son blancos. Todo el color de la galaxia lo ponen las aristas, así
 *  que ese color no puede ser arbitrario. La paleta cíclica anterior
 *  (`community % 8`) daba a dos regiones que se tocan colores opuestos y a dos
 *  regiones opuestas el mismo color: el color no significaba nada.
 *
 *  Las posiciones vienen de la simulación de fuerzas sobre el grafo kNN, así
 *  que dos regiones que se tocan en pantalla son regiones correlacionadas en
 *  300D. Derivando el tono de la posición del centroide, los grupos vecinos
 *  salen en tonos contiguos y leer la galaxia por color es leerla por vecindad.
 *
 *  El camino:
 *    1. ejes propios de la nube (Jacobi sobre la covarianza 3×3) y blanqueo,
 *       para que el círculo de tonos se reparta entero sea cual sea la forma;
 *    2. por comunidad: ángulo en el plano principal → posición en una **rampa
 *       de nebulosa** (no el círculo de tonos entero: el arcoíris se lee como
 *       gráfico de categorías, no como cielo), distancia al centro → croma (el
 *       núcleo, donde todo se mezcla, sale casi neutro), tercer eje →
 *       claridad (separa dos regiones que comparten ángulo);
 *    3. cada nodo se desvía un poco del color de su región hacia el de la
 *       vecina, así que las fronteras se funden en vez de cortarse a cuchillo;
 *    4. Oklch → sRGB, porque el blending aditivo suma *luz*: en HSL el amarillo
 *       pesaría el triple que el azul con el mismo brillo nominal.
 */
/**
 * @typedef {object} Zones
 * @property {Float32Array} node       rgb sRGB [0,1] por nodo, n*3. Es lo que colorea las aristas.
 * @property {Float32Array} community  rgb sRGB [0,1] por comunidad, para la leyenda de la ficha.
 * @property {(c: number) => string} css  `#rrggbb` de una comunidad.
 */

/** Rampa cíclica de nebulosa, en Oklch: `[t, L, C, tono en grados]`.
 *
 *  Es la parte del color que **no** se deduce del dato, y por eso está escrita a
 *  mano. Recorre la paleta con la que se publican las nebulosas —el falso color
 *  Hubble: OIII en cian, Hα en rosa, SII en oro— pasando por el índigo del polvo
 *  frío. El círculo de tonos entero daría un arcoíris, que se lee como leyenda
 *  de categorías; esto se lee como cielo.
 *
 *  Dos reglas al tocarla: tiene que **cerrar** (la última ancla vuelve a la
 *  primera, o la galaxia se parte por una costura) y el verde puro hay que
 *  cruzarlo rápido y sin croma — no existe verde en una nebulosa real, y en
 *  Oklch es además el tono más luminoso, así que se comería a los demás. */
const RAMP = [
  [0.00, 0.86, 206],   // cian
  [0.12, 0.73, 238],   // azul eléctrico
  [0.26, 0.55, 265],   // azul profundo
  [0.38, 0.54, 291],   // violeta
  [0.50, 0.64, 318],   // púrpura
  [0.60, 0.69, 334],   // magenta
  [0.70, 0.65, 355],   // rosa
  [0.79, 0.70, 40],    // naranja
  [0.87, 0.85, 87],    // ámbar
  [0.93, 0.94, 116],   // amarillo
  [0.97, 0.88, 139],   // verde
  [1.00, 0.86, 206],   // cierra en la primera
];

/** Croma pedido a la rampa: **más del que cabe en sRGB, a propósito**. La
 *  claridad la fija la rampa y el croma sale del ajuste a gama, así que cada
 *  tono acaba en el borde exacto de lo que la pantalla sabe pintar. Es lo que
 *  separa un neón de un pastel: pedir un croma fijo y modesto deja lavados los
 *  tonos que podrían con mucho más (el magenta llega a 0,31; el cian, a 0,15). */
const MAX_C = 0.45;

/** Cuánto inclina la claridad el tercer eje. Es lo que separa dos regiones que
 *  comparten posición en la rampa por estar una encima de la otra. */
const L_TILT = 0.07;
/** Techo y suelo de esa inclinación. El techo no es decorativo: en Oklab, `L`
 *  por encima de 1 es blanco y **no admite croma**, así que un nodo de la zona
 *  amarilla (L 0,94) inclinado hacia arriba salía blanco puro y sin color. */
const L_MAX = 0.93;
const L_MIN = 0.28;
/** Croma del núcleo respecto al del borde. Apenas baja: el aditivo ya lava el
 *  centro a blanco solo, y restarle croma además lo dejaba gris. */
const C_CORE = 0.82;
/** Giro de la rampa. Sólo decide qué región es cian y cuál oro. */
const RAMP_OFFSET = 0.12;

/** Los tres consumidores (motor WebGPU, respaldo WebGL y la ficha) piden lo
 *  mismo para la misma galaxia; el cálculo recorre los 50.000 nodos dos veces. */
const cache = new WeakMap();

/**
 * @param {import("./loader").Galaxy} g
 * @returns {Zones}
 */
export function zoneColours(g) {
  const hit = cache.get(g);
  if (hit) return hit;
  const z = computeZones(g);
  cache.set(g, z);
  return z;
}

/** El color de la rampa en `t` (cíclico), como `#rrggbb`.
 *
 *  No lo usa la galaxia —allí la posición en la rampa la decide el centroide de
 *  cada región, no un número escrito a mano— sino la presentación, que necesita
 *  enseñar la rampa entera antes de que haya galaxia cargada. Va aquí y no en
 *  el componente por la misma razón que todo lo demás de este archivo: una
 *  segunda copia de la rampa se queda desfasada en cuanto se toca la primera,
 *  y entonces la explicación del color deja de describir el color.
 *
 *  El croma se ajusta a gama igual que en los nodos, así que la muestra sale
 *  con el mismo neón y no con un pastel.
 *  @type {(t: number) => string} */
export function rampCss(t) {
  const [L, h] = sampleRamp(t);
  const rgb = new Float32Array(3);
  oklch(L, fitChroma(L, MAX_C, h), h, rgb, 0);
  return `#${[0, 1, 2]
    .map(k => Math.round(255 * clamp(rgb[k], 0, 1)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * @param {import("./loader").Galaxy} g
 * @returns {Zones}
 */
function computeZones(g) {
  const { positions, community } = g;
  const n = g.meta.nodes;

  let nc = 1;
  for (let i = 0; i < n; i++) if (community[i] + 1 > nc) nc = community[i] + 1;

  // --- centroide global y de cada comunidad ---
  const cen = new Float64Array(nc * 3);
  const cnt = new Float64Array(nc);
  let gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < n; i++) {
    const c = community[i];
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    cen[c * 3] += x; cen[c * 3 + 1] += y; cen[c * 3 + 2] += z;
    cnt[c]++;
    gx += x; gy += y; gz += z;
  }
  gx /= n; gy /= n; gz /= n;
  for (let c = 0; c < nc; c++) {
    const k = cnt[c] || 1;
    cen[c * 3] /= k; cen[c * 3 + 1] /= k; cen[c * 3 + 2] /= k;
  }

  // --- ejes propios de la nube ---
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const d = [positions[i * 3] - gx, positions[i * 3 + 1] - gy, positions[i * 3 + 2] - gz];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] += d[a] * d[b];
  }
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) cov[a][b] /= n;
  const { vec, val } = eigen3(cov);
  // Blanqueo: una galaxia aplastada usaría si no un gajo del círculo de tonos.
  const sd = val.map(v => Math.sqrt(Math.max(v, 1e-12)));

  /** Coordenadas blanqueadas de un punto en los ejes propios. */
  const project = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    const dx = x - gx, dy = y - gy, dz = z - gz;
    return [
      (dx * vec[0][0] + dy * vec[0][1] + dz * vec[0][2]) / sd[0],
      (dx * vec[1][0] + dy * vec[1][1] + dz * vec[1][2]) / sd[1],
      (dx * vec[2][0] + dy * vec[2][1] + dz * vec[2][2]) / sd[2],
    ];
  };

  // --- ángulo crudo de cada comunidad en el plano principal ---
  const raw = new Float64Array(nc);
  const rad = new Float64Array(nc);
  const up = new Float64Array(nc);
  for (let c = 0; c < nc; c++) {
    const [u, v, w] = project(cen[c * 3], cen[c * 3 + 1], cen[c * 3 + 2]);
    raw[c] = Math.atan2(v, u);
    rad[c] = Math.min(Math.hypot(u, v) / 1.4, 1);
    up[c] = clamp(w, -1, 1);
  }

  // Ecualización del círculo de tonos. Las regiones no se reparten el plano a
  // partes iguales: en el atlas español había cuatro apiñadas en el mismo
  // sector, y con el ángulo crudo salían del mismo naranja — indistinguibles.
  // El mapa reparte el círculo entero entre ellas **respetando el orden**, así
  // que dos regiones vecinas siguen recibiendo tonos vecinos, pero ninguna
  // queda pisada por otra.
  const equalize = hueMap(raw);

  // --- color base de cada comunidad, muestreando la rampa ---
  const ct = new Float64Array(nc);
  const cl = new Float64Array(nc);
  const cc = new Float64Array(nc);
  const ch = new Float64Array(nc);
  const communityRgb = new Float32Array(nc * 3);
  for (let c = 0; c < nc; c++) {
    ct[c] = equalize(raw[c]) / (Math.PI * 2) + RAMP_OFFSET;
    const [L, h] = sampleRamp(ct[c]);
    ch[c] = h;
    cl[c] = clamp(L + L_TILT * up[c], L_MIN, L_MAX);
    cc[c] = fitChroma(cl[c], MAX_C * (C_CORE + (1 - C_CORE) * rad[c]), ch[c]);
    oklch(cl[c], cc[c], ch[c], communityRgb, c * 3);
  }

  // --- color de cada nodo: el de su región, desviado hacia la vecina ---
  // Sin esta desviación las 28 regiones serían 28 parches planos con la costura
  // a la vista; con ella las fronteras se funden y la malla se lee como un
  // campo continuo, que es lo que de verdad hay debajo.
  const node = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = community[i];
    const [u, v, w] = project(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    const dt = wrapUnit(equalize(Math.atan2(v, u)) / (Math.PI * 2) + RAMP_OFFSET - ct[c]);
    const [L, h] = sampleRamp(ct[c] + 0.35 * clamp(dt, -0.09, 0.09));
    const r = Math.min(Math.hypot(u, v) / 1.4, 1);
    // El ajuste a gama va por nodo, no heredado de la región: cada tono tiene su
    // propio techo de croma y heredarlo dejaba a medio gas a los que podían más.
    const Ln = clamp(L + L_TILT * clamp(w, -1, 1), L_MIN, L_MAX);
    oklch(Ln, fitChroma(Ln, MAX_C * (C_CORE + (1 - C_CORE) * r), h), h, node, i * 3);
  }

  const hex = (/** @type {number} */ c) => {
    const b = [0, 1, 2].map(k =>
      Math.round(255 * Math.min(1, Math.max(0, communityRgb[c * 3 + k])))
        .toString(16).padStart(2, "0"));
    return `#${b.join("")}`;
  };

  return { node, community: communityRgb, css: hex };
}

/** Mapa monótono y continuo del círculo sobre sí mismo que lleva los `k`
 *  ángulos dados a `k` ángulos equiespaciados. Entre dos de ellos interpola
 *  lineal, así que conserva el orden y no abre saltos.
 *  @type {(angles: Float64Array) => (a: number) => number} */
function hueMap(angles) {
  const k = angles.length;
  if (k < 2) return a => a;
  const src = Array.from(angles, wrap).sort((a, b) => a - b);
  const step = (Math.PI * 2) / k;
  return a => {
    const x = wrap(a);
    // Segmento que lo contiene; el último cierra el círculo por el corte en ±π.
    let j = 0;
    while (j < k - 1 && src[j + 1] <= x) j++;
    const lo = src[j];
    const hi = j + 1 < k ? src[j + 1] : src[0] + Math.PI * 2;
    const t = hi > lo ? (x < lo ? (x + Math.PI * 2 - lo) : x - lo) / (hi - lo) : 0;
    return (j + clamp(t, 0, 1)) * step;
  };
}

/** @type {(x: number, lo: number, hi: number) => number} */
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Muestra la rampa en `t` (cíclico) → `[L, tono en radianes]`. El croma no
 *  está en la rampa: lo pone el ajuste a gama, en el máximo que cabe.
 *  Interpola en Oklch y no en RGB: interpolando canales sRGB, cian→magenta pasa
 *  por un gris sucio en vez de por el violeta que hay entre los dos.
 *  @type {(t: number) => [number, number]} */
function sampleRamp(t) {
  const x = t - Math.floor(t);
  let j = 0;
  while (j < RAMP.length - 2 && RAMP[j + 1][0] <= x) j++;
  const a = RAMP[j], b = RAMP[j + 1];
  const k = (x - a[0]) / (b[0] - a[0]);
  // El tono es cíclico: se interpola por el camino corto, o cruzar por 360°
  // daría media vuelta al círculo entre dos anclas contiguas.
  const dh = ((b[2] - a[2] + 540) % 360) - 180;
  return [a[1] + (b[1] - a[1]) * k, ((a[2] + dh * k) * Math.PI) / 180];
}

/** Desplazamiento cíclico en unidades de rampa, al rango (−0,5 · 0,5]. */
function wrapUnit(/** @type {number} */ t) {
  const x = ((t + 0.5) % 1 + 1) % 1;
  return x - 0.5;
}

/** Ángulo al rango (−π, π]. */
function wrap(/** @type {number} */ a) {
  const t = ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return t - Math.PI;
}

/** Oklch → sRGB codificado, escrito en `out[o..o+2]`. */
/** @type {(L: number, C: number, h: number, out: Float32Array, o: number) => void} */
function oklch(L, C, h, out, o) {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  out[o]     = enc(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[o + 1] = enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[o + 2] = enc(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

/** Curva de transferencia sRGB. El shader escribe a un formato no-sRGB, así que
 *  el valor codificado es el que sale por pantalla. */
function enc(/** @type {number} */ v) {
  const c = clamp(v, 0, 1);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** El croma máximo ≤ `C` que entra en sRGB para esa claridad y ese tono, por
 *  bisección. Es el que da el neón: pedir de más y quedarse justo en el borde.
 *  Recortar por canal en vez de esto teñiría los tonos fuera de gama unos hacia
 *  otros, y dos regiones distintas acabarían del mismo color.
 *  @type {(L: number, C: number, h: number) => number} */
function fitChroma(L, C, h) {
  const cos = Math.cos(h), sin = Math.sin(h);
  const inGamut = (/** @type {number} */ c) => {
    const A = c * cos, B = c * sin;
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 &&
           b >= -0.001 && b <= 1.001;
  };
  if (inGamut(C)) return C;
  let lo = 0, hi = C;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (inGamut(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** Jacobi cíclico sobre una simétrica 3×3, ordenado por valor propio
 *  descendente. Con n=3 converge en un puñado de barridos. */
/** @type {(a: number[][]) => { val: number[], vec: number[][] }} */
function eigen3(a) {
  const m = a.map(r => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += m[p][q] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(m[p][q]) < 1e-22) continue;
        const th = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < 3; k++) {
          const kp = m[k][p], kq = m[k][q];
          m[k][p] = c * kp - s * kq; m[k][q] = s * kp + c * kq;
        }
        for (let k = 0; k < 3; k++) {
          const pk = m[p][k], qk = m[q][k];
          m[p][k] = c * pk - s * qk; m[q][k] = s * pk + c * qk;
        }
        for (let k = 0; k < 3; k++) {
          const kp = v[k][p], kq = v[k][q];
          v[k][p] = c * kp - s * kq; v[k][q] = s * kp + c * kq;
        }
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => m[j][j] - m[i][i]);
  return {
    val: order.map(i => m[i][i]),
    vec: order.map(i => [v[0][i], v[1][i], v[2][i]]),
  };
}
