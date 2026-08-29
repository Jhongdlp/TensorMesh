/**
 * Sala 07 — dónde va cada cosa en la escena.
 *
 * Vive fuera del motor porque `test/nn.mjs` monta la misma escena para
 * dibujarla por Dawn: con las medidas copiadas en los dos sitios, el PNG de la
 * prueba deja de representar la sala en cuanto alguien sube el suelo dos
 * centímetros. Es la misma razón por la que `field.mjs` existe en la sala 02.
 *
 * El reparto:
 *
 *   - el **suelo** es el cuadrado de entrada [-1, 1]² escalado a `FLOOR_HALF`.
 *     Sus dos ejes son x₁ y x₂;
 *   - la **red** flota encima, capas de izquierda a derecha y unidades en
 *     columna. Es el diagrama de libro, y reconocerlo es la mitad de entender
 *     qué se está mirando.
 */

export const FLOOR_Y = -1.10;
export const FLOOR_HALF = 1.40;
export const NET_CY = 0.55;
export const NET_SPAN_X = 1.35;
export const NET_MAX_H = 1.50;
/** Separación máxima entre unidades. Sin tope, una capa de dos las manda a los
 *  extremos y la red parece rota por el medio. */
export const UNIT_GAP_MAX = 0.40;

/** Radio en mundo de una neurona. Entrada y salida algo mayores: son las dos
 *  que hay que encontrar sin buscarlas. Con la separación mínima entre capas
 *  (0,34 con seis unidades) esto deja aire entre esferas: en cuanto se tocan,
 *  la columna deja de leerse como una capa de unidades y pasa a ser un tubo. */
export const R_HIDDEN = 0.062;
export const R_EDGE = 0.076;

/**
 * Encuadre de casa. Lo comparten la cámara del motor y la de la prueba.
 *
 * `radius` es la media altura que `frame()` mete en pantalla, y quien manda no
 * es la red sino **la esquina cercana del suelo**: el plano está inclinado, así
 * que su esquina de delante cae mucho más abajo que su borde. Ajustar el
 * encuadre a la red deja esa esquina fuera, y un plano cortado por el canto de
 * la pantalla se lee como un fallo de dibujo y no como un suelo.
 */
export const CAM = { theta: 0.62, phi: 1.02, radius: 2.30, target: [0, -0.05, 0] };

/**
 * Los dos ejes del cuadrado de entrada. No son los colores de las clases a
 * propósito: si el eje x fuese rosa, el rosa dejaría de querer decir «clase».
 * Las dos neuronas de entrada llevan estos mismos dos colores, y ésa es toda
 * la leyenda que el lienzo necesita.
 */
/** @type {[number, number, number]} */
export const AXIS_X = [1.0, 0.72, 0.26];
/** @type {[number, number, number]} */
export const AXIS_Y = [0.64, 0.52, 1.0];

/**
 * @typedef {object} Node3
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} layer
 * @property {number} unit
 */

/**
 * Posición de cada neurona, en orden de capa y unidad.
 * @param {number[]} sizes
 * @returns {Node3[]}
 */
export function nodeLayout(sizes) {
  const L = sizes.length;
  /** @type {Node3[]} */
  const out = [];
  for (let l = 0; l < L; l++) {
    const n = sizes[l];
    const x = L === 1 ? 0 : -NET_SPAN_X + (2 * NET_SPAN_X * l) / (L - 1);
    const gap = n > 1 ? Math.min(UNIT_GAP_MAX, NET_MAX_H / (n - 1)) : 0;
    for (let i = 0; i < n; i++) {
      out.push({ x, y: NET_CY - (i - (n - 1) / 2) * gap, z: 0, layer: l, unit: i });
    }
  }
  return out;
}

/**
 * Índice en `nodeLayout` de la unidad `unit` de la capa `layer`.
 * @param {number[]} sizes
 * @param {number} layer
 * @param {number} unit
 * @returns {number}
 */
export function nodeIndex(sizes, layer, unit) {
  let k = 0;
  for (let l = 0; l < layer; l++) k += sizes[l];
  return k + unit;
}
