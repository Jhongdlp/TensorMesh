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
 * Sin fallback difuso.
 * @param {Index} idx
 * @param {import("./loader").Galaxy} g
 * @param {string} q  ya plegado
 * @param {number} k
 * @returns {number[]}
 */
function suggestPrefix(idx, g, q, k) {
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
 * Distancia de Levenshtein entre dos cadenas con límite máximo y terminación temprana.
 * @param {string} s1
 * @param {string} s2
 * @param {number} maxDist
 * @returns {number}
 */
export function levenshteinDistance(s1, s2, maxDist = 3) {
  if (s1.length < s2.length) {
    const tmp = s1; s1 = s2; s2 = tmp;
  }
  let len1 = s1.length;
  let len2 = s2.length;
  if (len2 === 0) return len1;
  if (len1 - len2 > maxDist) return 999;

  let row = new Int32Array(len2 + 1);
  for (let i = 0; i <= len2; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= len1; i++) {
    let prev = i;
    const char1 = s1.charCodeAt(i - 1);
    let minRowVal = 999;
    for (let j = 1; j <= len2; j++) {
      let val;
      if (char1 === s2.charCodeAt(j - 1)) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1], Math.min(row[j], prev)) + 1;
      }
      row[j - 1] = prev;
      prev = val;
      if (val < minRowVal) minRowVal = val;
    }
    row[len2] = prev;
    
    if (minRowVal > maxDist) {
      return 999;
    }
  }
  return row[len2];
}

/**
 * Busca palabras similares por heurística de sufijos o distancia de edición.
 * @param {Index} idx
 * @param {import("./loader").Galaxy} g
 * @param {string} q  ya plegado
 * @param {number} [k]
 * @returns {number[]}
 */
export function suggestFuzzy(idx, g, q, k = SUGGEST) {
  if (!q) return [];
  const { order, folded } = idx;
  const n = order.length;

  // 1. Heurísticas rápidas para sufijos comunes (plurales en español e inglés, etc.)
  const attempts = [];
  if (q.length > 3) {
    if (q.endsWith("ces")) {
      attempts.push(q.slice(0, -3) + "z");
    }
    if (q.endsWith("es")) {
      attempts.push(q.slice(0, -2));
    }
    if (q.endsWith("s")) {
      attempts.push(q.slice(0, -1));
    }
  }

  for (const alt of attempts) {
    const p = lower(idx, alt);
    if (p < order.length && folded[order[p]].startsWith(alt)) {
      const altSuggestions = suggestPrefix(idx, g, alt, k);
      if (altSuggestions.length > 0) return altSuggestions;
    }
  }

  // 2. Distancia Levenshtein con poda por longitud y límite dinámico
  const matches = [];
  let maxLimit = 3;
  
  for (let id = 0; id < n; id++) {
    const word = folded[id];
    const lenDiff = Math.abs(q.length - word.length);
    
    if (lenDiff > maxLimit) {
      continue;
    }
    
    const dist = levenshteinDistance(q, word, maxLimit);
    if (dist > maxLimit) continue;
    
    let insertPos = matches.length;
    while (insertPos > 0) {
      const prev = matches[insertPos - 1];
      if (dist < prev.dist || (dist === prev.dist && g.rank[id] < prev.rank)) {
        insertPos--;
      } else {
        break;
      }
    }
    
    if (insertPos < k) {
      matches.splice(insertPos, 0, { id, dist, rank: g.rank[id] });
      if (matches.length > k) {
        matches.pop();
      }
      if (matches.length === k) {
        maxLimit = matches[k - 1].dist;
      }
    }
  }
  
  return matches.map(m => m.id);
}

/**
 * Hasta `k` nodos cuya palabra empieza por `q` o es similar por distancia de
 * edición si no hay coincidencias de prefijo.
 * @param {Index} idx
 * @param {import("./loader").Galaxy} g
 * @param {string} q  ya plegado
 * @param {number} [k]
 * @returns {number[]}
 */
export function suggest(idx, g, q, k = SUGGEST) {
  if (!q) return [];
  const prefixHits = suggestPrefix(idx, g, q, k);
  if (prefixHits.length > 0) {
    return prefixHits;
  }
  return suggestFuzzy(idx, g, q, k);
}

/**
 * Lo que hace Enter en el buscador: el acierto exacto si lo hay y, si no, la
 * mejor sugerencia por prefijo o distancia. Escribir `corazon` cae en la primera vía;
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
