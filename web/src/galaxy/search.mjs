/** Buscador de palabras: plegado sin tildes e índice de prefijos.
 *
 *  Antes esto era `labels.indexOf(q)`: un barrido lineal que además exigía
 *  **acierto exacto**. Quien escribía `corazon` sin tilde recibía «no está en
 *  las 50.000 palabras» de una galaxia que sí la tiene, y quien escribía `perr`
 *  no recibía nada — la puerta de entrada al atlas era la parte más frágil.
 *
 *  Dos piezas, ninguna cara:
 *
 *  1. **plegado** (`fold`): NFD y fuera los diacríticos. `corazon` y `corazón`
 *     colapsan en la misma clave, así que la tilde deja de ser un requisito.
 *     `ñ` sobrevive como `n` — es lo que hace que `nino` encuentre `niño`, y en
 *     un buscador tolerante eso es lo que se quiere, no la letra correcta;
 *  2. **prefijos**: los índices se ordenan una vez por su clave plegada y las
 *     sugerencias salen de una búsqueda binaria más un paseo por el tramo que
 *     empieza igual. Sin trie: sobre 50.000 claves ya plegadas el paseo más
 *     largo (una sola letra) son unos pocos miles de comparaciones.
 *
 *  El orden del índice es por **clave**, y los empates por **rango de
 *  frecuencia**, así que `exact` devuelve la palabra más común cuando dos se
 *  pliegan igual (`de` gana a `dé`). Las sugerencias, en cambio, se reordenan
 *  enteras por frecuencia: alfabético dentro de un prefijo no dice nada, y lo
 *  que uno busca al escribir `cas` es `casa`, no `casabe`.
 */

/** Cuántas sugerencias devuelve el desplegable. Siete llenan el hueco bajo el
 *  buscador sin empujar la ficha de la palabra fuera de la pantalla. */
export const SUGGEST = 7;

/** Tope del paseo por el tramo de prefijo. Con una sola letra el tramo puede
 *  ser de miles; esto sólo evita que una consulta degenerada bloquee el hilo. */
const WALK_MAX = 20000;

/**
 * Clave de búsqueda: minúsculas y sin diacríticos.
 * @param {string} s
 * @returns {string}
 */
export function fold(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * @typedef {object} Index
 * @property {string[]} folded  clave plegada de cada nodo, por índice de nodo
 * @property {Uint32Array} order  índices de nodo ordenados por clave (empate: rango)
 */

/**
 * Construye el índice. Se hace una vez por galaxia, junto a la carga.
 * @param {import("./loader").Galaxy} g
 * @returns {Index}
 */
export function buildIndex(g) {
  const n = g.labels.length;
  const folded = new Array(n);
  for (let i = 0; i < n; i++) folded[i] = fold(g.labels[i]);

  const ord = new Array(n);
  for (let i = 0; i < n; i++) ord[i] = i;
  // Comparación por unidades UTF-16, no `localeCompare`: es la misma que usa
  // `<` en la búsqueda binaria de abajo, y las dos tienen que coincidir o el
  // tramo de prefijo se busca donde no está. Sobre claves ya plegadas el orden
  // del idioma no aporta nada.
  ord.sort((a, b) => {
    const x = folded[a], y = folded[b];
    return x < y ? -1 : x > y ? 1 : g.rank[a] - g.rank[b];
  });

  return { folded, order: Uint32Array.from(ord) };
}

/**
 * Primera posición del índice cuya clave no es menor que `q`.
 * @param {Index} idx
 * @param {string} q
 * @returns {number}
 */
function lower(idx, q) {
  let lo = 0, hi = idx.order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (idx.folded[idx.order[mid]] < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Nodo cuya palabra pliega exactamente a `q`, o −1. Con empates gana el más
 * frecuente, que es el orden con el que se construyó el índice.
 * @param {Index} idx
 * @param {string} q  ya plegado
 * @returns {number}
 */
export function exact(idx, q) {
  const p = lower(idx, q);
  if (p >= idx.order.length) return -1;
  const id = idx.order[p];
  return idx.folded[id] === q ? id : -1;
}

/**
 * Hasta `k` nodos cuya palabra empieza por `q`, los más frecuentes primero.
 * @param {Index} idx
 * @param {import("./loader").Galaxy} g
 * @param {string} q  ya plegado
 * @param {number} [k]
 * @returns {number[]}
 */
export function suggest(idx, g, q, k = SUGGEST) {
  if (!q) return [];
  const out = /** @type {number[]} */ ([]);
  const { order, folded } = idx;
  let p = lower(idx, q);
  for (let seen = 0; p < order.length && seen < WALK_MAX; p++, seen++) {
    const id = order[p];
    if (!folded[id].startsWith(q)) break;
    // Inserción en una lista de siete: más barato que ordenar el tramo entero,
    // que con una sola letra son miles de entradas.
    let j = out.length;
    while (j > 0 && g.rank[out[j - 1]] > g.rank[id]) j--;
    if (j < k) {
      out.splice(j, 0, id);
      if (out.length > k) out.pop();
    }
  }
  return out;
}

/**
 * Lo que hace Enter en el buscador: el acierto exacto si lo hay y, si no, la
 * mejor sugerencia por prefijo. Escribir `corazon` cae en la primera vía;
 * escribir `nostalg` y pulsar Enter, en la segunda.
 * @param {Index} idx
 * @param {import("./loader").Galaxy} g
 * @param {string} raw  tal cual lo escribió quien busca
 * @returns {number}  índice de nodo, o −1
 */
export function resolve(idx, g, raw) {
  const q = fold(raw.trim());
  if (!q) return -1;
  const hit = exact(idx, q);
  if (hit >= 0) return hit;
  const s = suggest(idx, g, q, 1);
  return s.length ? s[0] : -1;
}
