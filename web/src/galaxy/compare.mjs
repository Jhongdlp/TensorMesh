/** Comparar varias palabras a la vez: la matriz de similitudes, el mapa que
 *  sale de ella y los vecinos que comparten.
 *
 *  Es lo que la ficha de una palabra no puede contestar. La ficha enseña el
 *  barrio de *una* —sus vecinos kNN y el camino hasta otra—, pero «cuánto se
 *  parecen camello e inglaterra» no está en el grafo: no son vecinos, así que
 *  no hay arista entre ellos y no hay peso que leer. La respuesta existe sólo
 *  en 300D, y por eso este módulo trabaja sobre `Vectors` y no sobre el CSR.
 *
 *  Dos cosas que se calculan aquí y conviene no confundir:
 *
 *  - **la similitud** es coseno en 300D, exacta salvo el error de cuantización
 *    (0,0033 en el peor caso; ver `pipeline/vectors.py`). Es un número sobre el
 *    modelo, no sobre la galaxia;
 *  - **la constelación** es una proyección a 2D *de esas similitudes*, hecha
 *    aquí mismo con las cinco palabras elegidas y nada más. No tiene nada que
 *    ver con las posiciones de la galaxia, que salen de una simulación de
 *    fuerzas sobre 50.000 nodos. Dos palabras pueden salir juntas en la
 *    constelación y lejos en el atlas sin que ninguna de las dos mienta.
 *
 *  Va en `.mjs` y no en `.ts` por lo mismo que `palette` y `path`: así
 *  `test/unit.mjs` lo importa tal cual (ver «Layouts duplicados» en CLAUDE.md).
 */

/** Tope de palabras a comparar. Cinco es el límite que aguanta la matriz sin
 *  volverse ilegible: son diez pares, que caben en una lista que se lee de un
 *  vistazo. Con seis son quince y ya hay que buscar. */
export const MAX_WORDS = 5;

/** Vecinos que se miran por palabra al buscar los compartidos. Ocho es lo que
 *  el kNN dejó de media tras la poda; pedir más devuelve el resto del CSR. */
export const POOL = 8;

/** Cuántos vecinos compartidos se muestran. */
export const SHARED = 12;

/**
 * Los pares sin repetir, en orden estable.
 * @param {number[]} ids
 * @returns {[number, number][]}
 */
export function pairs(ids) {
  const out = /** @type {[number, number][]} */ ([]);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  }
  return out;
}

/**
 * Matriz de similitudes, `null` si falta algún vector por traer.
 *
 * La diagonal es 1 exacto y no el coseno consigo mismo: un vector cuantizado
 * contra sí mismo da 1 salvo redondeo, y una diagonal que parpadea entre 0,999
 * y 1 en la tabla se lee como un dato, cuando es ruido.
 *
 * @param {import("./vectors").Vectors} vec
 * @param {number[]} ids
 * @returns {number[][] | null}
 */
export function matrix(vec, ids) {
  const n = ids.length;
  const M = Array.from({ length: n }, () => new Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = vec.cos(ids[i], ids[j]);
      if (s === null) return null;
      M[i][j] = M[j][i] = s;
    }
  }
  return M;
}

/**
 * Los pares ordenados de más a menos parecidos.
 * @param {import("./vectors").Vectors} vec
 * @param {number[]} ids
 * @returns {{ a: number, b: number, s: number }[] | null}
 */
export function ranked(vec, ids) {
  const out = [];
  for (const [a, b] of pairs(ids)) {
    const s = vec.cos(a, b);
    if (s === null) return null;
    out.push({ a, b, s });
  }
  return out.sort((x, y) => y.s - x.s);
}

/** Similitud típica entre dos palabras que **sí** son vecinas en el grafo.
 *
 *  Es la vara de medir que le falta a un 0,35 suelto: contra este número se ve
 *  si dos palabras se parecen más o menos de lo que se parecen dos que el kNN
 *  consideró vecinas. Sale de los pesos del CSR, que son el mismo coseno en
 *  300D cuantizado a un byte.
 *
 *  Es la **mediana** y no la media porque la cola de pesos altos (los pares casi
 *  idénticos, «rapido»/«rápidamente») arrastraría la media hacia arriba y la
 *  referencia quedaría en un sitio donde casi nada la alcanza.
 *
 * @param {import("./loader").Galaxy} g
 * @returns {number}
 */
export function typical(g) {
  // Sobre una muestra: ordenar los 294.614 pesos cuesta más de lo que aporta,
  // y la mediana de 20.000 tomados a paso fijo cae en el mismo sitio.
  const w = g.weights;
  const step = Math.max(1, Math.floor(w.length / 20000));
  const s = [];
  for (let i = 0; i < w.length; i += step) s.push(w[i] / 255);
  s.sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

/**
 * Palabras vecinas de **más de una** de las elegidas, las que más comparten
 * primero. Son el terreno común que el grafo ya conocía: si «camello» y
 * «desierto» tienen tres vecinos en común, esos tres explican la conexión mejor
 * que el número.
 *
 * Devuelve sólo índices; la similitud exacta a cada elegida la calcula quien
 * llama, cuando sus vectores estén traídos.
 *
 * @param {import("./loader").Galaxy} g
 * @param {number[]} ids
 * @param {number} [k]
 * @returns {{ id: number, with: number[] }[]}
 */
export function shared(g, ids, k = SHARED) {
  const { offsets, targets, weights } = g;
  const chosen = new Set(ids);
  /** @type {Map<number, number[]>} */
  const hits = new Map();

  for (const id of ids) {
    // Los `POOL` mejores vecinos de esta palabra, por peso. El CSR no está
    // ordenado por peso —lo está por nodo—, así que hay que elegirlos.
    const nb = [];
    for (let j = offsets[id]; j < offsets[id + 1]; j++) {
      nb.push([targets[j], weights[j]]);
    }
    nb.sort((a, b) => b[1] - a[1]);
    for (const [t] of nb.slice(0, POOL)) {
      if (chosen.has(t)) continue;   // una elegida no es terreno común de sí misma
      const w = hits.get(t);
      if (w) w.push(id); else hits.set(t, [id]);
    }
  }

  return [...hits.entries()]
    .filter(([, w]) => w.length > 1)
    .map(([id, w]) => ({ id, with: w }))
    // Más palabras compartidas primero; a igualdad, la más frecuente, que es
    // la que quien lee va a reconocer.
    .sort((a, b) => b.with.length - a.with.length || g.rank[a.id] - g.rank[b.id])
    .slice(0, k);
}

/** Distancia euclídea real en 300D a partir del coseno.
 *
 *  No es una conversión inventada: los vectores están normalizados, así que
 *  |u − v|² = 2 − 2·cos exactamente. Eso es lo que hace que la constelación de
 *  abajo sea una proyección honesta y no un dibujo bonito.
 *
 * @param {number} c
 * @returns {number}
 */
export function dist(c) {
  return Math.sqrt(Math.max(0, 2 - 2 * c));
}

/**
 * Constelación: las palabras en un plano, conservando lo mejor posible sus
 * distancias en 300D. Es escalado multidimensional clásico —el de Torgerson—,
 * que sobre cinco puntos es exacto de calcular y no necesita iterar.
 *
 * Tres pasos: distancias al cuadrado, doble centrado (`B = −½·J·D²·J`) y los
 * dos autovectores mayores de `B`, que son los ejes que más varianza retienen.
 * Con `n ≤ 5` la matriz es minúscula y Jacobi la diagonaliza en unas pocas
 * pasadas.
 *
 * Devuelve además `stress`: cuánta distancia se ha perdido al aplastar 300
 * dimensiones en 2. Se muestra porque sin él la constelación invita a leer
 * distancias que puede no estar respetando — con cinco palabras casi siempre es
 * baja, pero cuando no lo es hay que decirlo.
 *
 * @param {number[][]} M  matriz de similitudes
 * @returns {{ xy: [number, number][], stress: number }}
 */
export function mds(M) {
  const n = M.length;
  if (n === 0) return { xy: [], stress: 0 };
  if (n === 1) return { xy: [[0, 0]], stress: 0 };

  const D2 = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => dist(M[i][j]) ** 2));

  // Doble centrado: restar la media de la fila, la de la columna y sumar la
  // global. Lo que queda es la matriz de productos escalares respecto al
  // centroide, que es lo que se diagonaliza.
  const rows = D2.map(r => r.reduce((a, b) => a + b, 0) / n);
  const all = rows.reduce((a, b) => a + b, 0) / n;
  const B = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => -0.5 * (D2[i][j] - rows[i] - rows[j] + all)));

  const { values, vectors } = jacobi(B);
  const ord = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
  const axis = (k) => {
    const i = ord[k];
    // Autovalor negativo o nulo: ese eje no existe (pasa con dos puntos, donde
    // sólo hay una dimensión real). Se devuelve plano en vez de NaN.
    const s = values[i] > 1e-12 ? Math.sqrt(values[i]) : 0;
    return vectors.map(row => row[i] * s);
  };
  const x = axis(0), y = n > 1 ? axis(1) : x.map(() => 0);
  const xy = /** @type {[number, number][]} */ (x.map((v, i) => [v, y[i]]));

  // Estrés de Kruskal sobre las distancias del plano contra las de 300D.
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d3 = dist(M[i][j]);
      const d2 = Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]);
      num += (d3 - d2) ** 2;
      den += d3 ** 2;
    }
  }
  return { xy, stress: den > 0 ? Math.sqrt(num / den) : 0 };
}

/**
 * Autovalores y autovectores de una matriz simétrica pequeña, por rotaciones de
 * Jacobi. Aquí `n ≤ 5`, así que no hace falta nada mejor: cada barrido anula
 * los términos de fuera de la diagonal y en un puñado converge.
 *
 * @param {number[][]} A
 * @returns {{ values: number[], vectors: number[][] }}  `vectors[i][k]` es la
 *   componente `i` del autovector `k`
 */
function jacobi(A) {
  const n = A.length;
  const a = A.map(r => r.slice());
  const v = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-18) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}
