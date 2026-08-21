/** Analogías: `rey − hombre + mujer`.
 *
 *  Es la operación que hizo famosos a estos vectores y la única del atlas que
 *  **no se puede contestar con un puñado de filas**. El comparador baja cinco
 *  vectores porque sabe cuáles quiere; aquí la respuesta es «la palabra más
 *  parecida de las cincuenta mil», y para saber cuál hay que mirarlas todas.
 *  Por eso este panel pide `vecs.bin` entero (15 MB) y lo pide **cuando se
 *  usa**, no al arrancar: quien no juega a esto no paga la descarga.
 *
 *  El coseno se calcula contra los bytes crudos, sin desempaquetar los 50.000
 *  vectores a `Float32Array` (60 MB de basura para una consulta). Cada fila es
 *  int8 con escala propia sin publicar, así que la escala se recupera aquí como
 *  norma inversa: `cos = (q · fila) / ‖fila‖`, con `q` ya normalizado. Es el
 *  mismo argumento que `vectors.ts`, y por eso las normas se calculan una sola
 *  vez al llegar el archivo.
 *
 *  Cuesta 50.000 × 300 = 15 millones de multiplicaciones por consulta, unas
 *  decenas de milisegundos en el hilo de la interfaz. Es aceptable porque pasa
 *  al pulsar un botón y no por frame; trocearlo en un worker sólo para eso
 *  añadiría un canal de mensajes y una copia del buffer.
 *
 *  **Las tres palabras de la pregunta se excluyen de la respuesta.** No es
 *  cosmética: `rey − hombre + mujer` da `rey` como primer resultado casi
 *  siempre, porque la resta y la suma se cancelan en buena parte y el vector
 *  consulta sigue pegado al original. Quitarlas es la convención con la que se
 *  miden estas tareas, y sin ella el juego contesta siempre lo que ya sabías.
 */

/**
 * Vector consulta `a − b + c`, normalizado.
 *
 * Los tres entran ya normalizados (es lo que devuelve `Vectors.get`), así que
 * esto es la analogía canónica: la dirección «de b a a» aplicada sobre c.
 *
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @param {Float32Array} c
 * @returns {Float32Array}
 */
export function query(a, b, c) {
  const d = a.length;
  const out = new Float32Array(d);
  let sum = 0;
  for (let i = 0; i < d; i++) {
    const v = a[i] - b[i] + c[i];
    out[i] = v;
    sum += v * v;
  }
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  for (let i = 0; i < d; i++) out[i] *= inv;
  return out;
}

/**
 * Norma inversa de cada fila del archivo entero.
 *
 * Una pasada de 15 millones de sumas al cargar, para que cada consulta sea un
 * producto escalar y una multiplicación. Una fila a cero —que no debería
 * existir— recibe 0 y queda fuera de todo resultado en vez de dar NaN.
 *
 * @param {Int8Array} bytes
 * @param {number} dims
 * @param {number} n
 * @returns {Float32Array}
 */
export function invNorms(bytes, dims, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const at = i * dims;
    for (let k = 0; k < dims; k++) { const v = bytes[at + k]; s += v * v; }
    out[i] = s > 0 ? 1 / Math.sqrt(s) : 0;
  }
  return out;
}

/**
 * Las `k` filas más parecidas al vector consulta.
 *
 * Top-k por inserción sobre un array de `k` elementos: con k ≤ 10 es más rápido
 * que un montículo y cabe en una pantalla de código. El coste manda en el bucle
 * de fuera, no aquí.
 *
 * @param {Float32Array} q       ya normalizado
 * @param {Int8Array} bytes
 * @param {number} dims
 * @param {number} n
 * @param {Float32Array} inv     de `invNorms`
 * @param {number} k
 * @param {Iterable<number>} [skip]  nodos excluidos (las palabras de la pregunta)
 * @returns {{ id: number, cos: number }[]}
 */
export function nearest(q, bytes, dims, n, inv, k, skip = []) {
  const out = [];
  const off = new Set(skip);
  let worst = -Infinity;

  for (let i = 0; i < n; i++) {
    const w = inv[i];
    if (w === 0 || off.has(i)) continue;
    const at = i * dims;
    let s = 0;
    for (let d = 0; d < dims; d++) s += q[d] * bytes[at + d];
    const cos = s * w;
    // La guarda barata primero: con la lista llena, la inmensa mayoría de las
    // filas no entra y se descarta con una comparación.
    if (out.length === k && cos <= worst) continue;

    let j = out.length;
    while (j > 0 && out[j - 1].cos < cos) j--;
    out.splice(j, 0, { id: i, cos });
    if (out.length > k) out.pop();
    worst = out[out.length - 1].cos;
  }
  return out;
}
