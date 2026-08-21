/** Camino más corto entre dos palabras, sobre el mismo grafo kNN que se dibuja.
 *
 *  Es la función que hace legible que esto **es un grafo** y no una nube de
 *  puntos: la galaxia ya enseña dónde está cada palabra, pero no por dónde se
 *  pasa de una a otra. El camino sí, y además explica el atlas — los saltos que
 *  cruzan de región son los puentes entre barrios, y se ven en el color.
 *
 *  Anchura primero y **sin pesos**: lo que se busca son los saltos mínimos, no
 *  la suma de similitudes. Un camino de tres pasos por vecinos flojos dice más
 *  del grafo que uno de nueve por vecinos perfectos, y con pesos el segundo
 *  ganaría siempre. Dijkstra aquí sobraría en las dos direcciones: costaría un
 *  montículo y respondería otra pregunta.
 *
 *  Cuesta lo que cuesta recorrer el CSR una vez (50.000 nodos, 147.000 aristas):
 *  suficientemente barato para ir en el hilo de la interfaz sin trocearlo.
 *
 *  El grafo puede estar **desconectado** — la poda por kNN mutuo deja islas que
 *  la columna vertebral MST no siempre cose — así que `null` es una respuesta
 *  legítima y la interfaz tiene que saber decirla.
 */

/**
 * Camino de `a` a `b` como lista de nodos, extremos incluidos.
 * @param {import("./loader").Galaxy} g
 * @param {number} a
 * @param {number} b
 * @returns {number[] | null}  `null` si no hay camino; `[a]` si `a === b`
 */
export function shortestPath(g, a, b) {
  const { offsets, targets } = g;
  const n = g.labels.length;
  if (a < 0 || b < 0 || a >= n || b >= n) return null;
  if (a === b) return [a];

  // Un solo Int32Array hace de «visitado» y de árbol de vuelta: −1 es sin ver,
  // y la raíz se marca consigo misma para no necesitar un centinela aparte.
  const prev = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  queue[tail++] = a;
  prev[a] = a;

  while (head < tail) {
    const u = queue[head++];
    for (let j = offsets[u]; j < offsets[u + 1]; j++) {
      const v = targets[j];
      if (prev[v] !== -1) continue;
      prev[v] = u;
      if (v === b) return unwind(prev, a, b);
      queue[tail++] = v;
    }
  }
  return null;
}

/**
 * @param {Int32Array} prev
 * @param {number} a
 * @param {number} b
 * @returns {number[]}
 */
function unwind(prev, a, b) {
  const out = [];
  for (let v = b; v !== a; v = prev[v]) out.push(v);
  out.push(a);
  return out.reverse();
}

/**
 * Similitud de cada salto del camino, en el orden en que se recorre.
 *
 *  Sale del peso del CSR, que es coseno en 300D cuantizado a un byte — no una
 *  distancia medida en la galaxia, que es lo que el proyecto no muestra nunca.
 * @param {import("./loader").Galaxy} g
 * @param {number[]} path
 * @returns {number[]}  `path.length - 1` valores en [0,1]
 */
export function hops(g, path) {
  const { offsets, targets, weights } = g;
  const out = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const u = path[i], v = path[i + 1];
    let w = 0;
    for (let j = offsets[u]; j < offsets[u + 1]; j++) {
      if (targets[j] === v) { w = weights[j] / 255; break; }
    }
    out.push(w);
  }
  return out;
}
