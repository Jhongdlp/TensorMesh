/** Resaltar una familia entera: `*mente`, `des*`, `*ción*`.
 *
 *  El buscador contesta «dónde está esta palabra». Esto contesta otra cosa que
 *  la galaxia sabe y no enseñaba: **dónde vive una terminación**. Encender de
 *  golpe las 1.400 palabras que acaban en `-mente` y ver que no se apilan en un
 *  rincón sino que se reparten por todos los barrios dice, sin una línea de
 *  texto, que estos vectores agrupan por significado y no por forma. Y con
 *  `-ción` o `des-` pasa justo lo contrario en algunos sitios, que también se
 *  ve. Es la función más barata del atlas y la que más enseña por línea.
 *
 *  Cuatro decisiones:
 *
 *  - **se busca sobre la clave plegada** del índice, la misma que el buscador
 *    (`fold`): quien escribe `*cion` encuentra `canción`. Exigir la tilde en un
 *    comodín sería pedirla dos veces;
 *  - **sin comodín, contiene**. `mente` se lee como `*mente*`. Un patrón exacto
 *    no tiene sentido aquí: para una palabra ya está el buscador;
 *  - **el comodín es `*` y nada más.** Ni `?`, ni clases, ni regex del usuario:
 *    esto se teclea en una caja de 14 rem, y una sintaxis que hay que aprender
 *    no la usa nadie. Lo demás se escapa antes de compilar, así que un patrón
 *    con `(` o `.` busca esos caracteres y no revienta;
 *  - **hay tope** (`MAX`). `*a*` casa con media galaxia, y resaltar 30.000
 *    nodos es apagar 20.000: no queda contraste y no se ve nada. Se resaltan
 *    las más frecuentes y se dice cuántas quedaron fuera.
 */

import { fold } from "./search.mjs";

/** Cuántas coincidencias se resaltan como mucho. Mil ya llenan la galaxia de
 *  puntos encendidos; a partir de ahí el resalte deja de señalar. */
export const MAX = 1000;

/** Cuántas se listan en el panel. Las demás están en la galaxia, no en la lista. */
export const LIST = 10;

/**
 * @typedef {object} Match
 * @property {number[]} ids    nodos a resaltar, por frecuencia (tope `MAX`)
 * @property {number} total    cuántos casan de verdad
 * @property {boolean} capped  `true` si `total > ids.length`
 */

/**
 * Compila un patrón con comodines a expresión regular anclada.
 *
 * Sin `*` se envuelve en dos: buscar «mente» es buscar dónde aparece.
 *
 * @param {string} raw
 * @returns {RegExp | null}  `null` si no hay nada que buscar
 */
export function compile(raw) {
  const q = fold(raw.trim());
  if (!q) return null;
  const body = q.includes("*") ? q : `*${q}*`;
  // Se escapa todo menos el `*`, que es el único metacarácter que este lenguaje
  // tiene. Sin esto, un `(` suelto lanza al construir la RegExp.
  const rx = body
    .split("*")
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  try {
    return new RegExp(`^${rx}$`);
  } catch {
    return null;
  }
}

/**
 * Las palabras que casan con el patrón.
 *
 * Barrido lineal de las 50.000 claves ya plegadas: unos milisegundos, y no hay
 * índice que sirva —un sufijo no es un prefijo, que es lo único que el índice
 * del buscador sabe responder rápido—. Quien llama lo hace con retardo.
 *
 * @param {import("./search.mjs").Index} idx
 * @param {import("./loader").Galaxy} g
 * @param {string} raw
 * @param {number} [max]
 * @returns {Match}
 */
export function match(idx, g, raw, max = MAX) {
  const rx = compile(raw);
  if (!rx) return { ids: [], total: 0, capped: false };

  const hit = [];
  for (let i = 0; i < idx.folded.length; i++) {
    if (rx.test(idx.folded[i])) hit.push(i);
  }
  hit.sort((a, b) => g.rank[a] - g.rank[b]);
  return { ids: hit.slice(0, max), total: hit.length, capped: hit.length > max };
}
