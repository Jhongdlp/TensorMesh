/** Los números de las láminas de la guía.
 *
 *  La guía explica el atlas con dibujos que se mueven, y esos dibujos necesitan
 *  aritmética: un puñado de vectores de juguete que se parezcan entre sí como
 *  se parecen las palabras de verdad, y una simulación de muelles en dos
 *  dimensiones que enseñe, en una esquina de la pantalla, lo mismo que la
 *  galaxia entera está haciendo detrás.
 *
 *  Vive fuera del componente por dos razones:
 *
 *  - **es lo único de la guía que puede estar mal.** Un texto mal escrito se ve
 *    al leerlo; un layout que no separa los dos grupos, o unos vectores de
 *    juguete donde «gato» se parece más a «lunes» que a «perro», enseñan lo
 *    contrario de lo que dice el pie y nadie lo nota. `test/unit.mjs` lo
 *    comprueba;
 *  - es `.mjs` y no `.ts` por lo mismo que `palette` o `compare`: el test lo
 *    importa tal cual, y el paquete es `type: commonjs`.
 *
 *  Nada de aquí toca el DOM ni React: entra un estado, sale un estado.
 */

/* ====================== vectores de juguete ======================
   Para la primera lámina, donde hay que enseñar que dos palabras parecidas
   tienen listas de números parecidas. Son 24 números y no 300 porque en 300
   barras no se distingue una de otra a 320 px de ancho.

   Importa que sean **de juguete y que el pie lo diga**: los 300 de verdad no
   significan nada por separado y este archivo no los está imitando, sólo
   fabrica tres listas con la relación correcta —dos que se parecen y una que
   no— para que el dibujo no mienta sobre lo único que afirma. */

/** Cuántos números lleva cada vector de juguete. */
export const TOY_DIMS = 24;

/** Congruencial lineal: un azar reproducible. Los tres vectores tienen que
 *  salir idénticos en cada carga o la lámina cambiaría de dibujo entre una
 *  visita y la siguiente sin que nada lo justifique.
 *  @param {number} seed
 *  @returns {() => number} el siguiente número en [-1, 1) */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0x100000000) * 2 - 1;
  };
}

/**
 * Normaliza en el sitio y devuelve el mismo array.
 * @param {Float32Array} v
 * @returns {Float32Array}
 */
function unit(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const inv = s > 0 ? 1 / Math.sqrt(s) : 0;
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return v;
}

/** A cuánto se parece el extraño de los otros dos. Sale de lo que mide el atlas
 *  de verdad: dos palabras cualesquiera del mismo idioma no dan cero —comparten
 *  el idioma— pero tampoco un número negativo. Los dos vecinos se quedan en 0,7
 *  por el ruido de abajo, que es donde caen los vecinos del kNN. */
const TOY_FAR = 0.10;

/**
 * Tres vectores: dos vecinos y un extraño.
 *
 * `a` y `b` comparten un fondo común y se separan por ruido pequeño, que es lo
 * que le pasa a «gato» y «perro» en el modelo de verdad. El extraño **no** se
 * saca de otra semilla y ya está: se construye perpendicular al plano de los
 * otros dos y se le añade una pizca en su dirección, hasta el coseno que se
 * quiere. Dejarlo al azar salía en −0,4, y un coseno negativo no dice «no se
 * parecen», dice «son opuestas» — que es otra afirmación, y falsa.
 * @returns {{a: Float32Array, b: Float32Array, c: Float32Array}}
 */
function toyVectors() {
  const base = rng(20240821);
  const near = rng(7717);
  const far = rng(31337);
  const a = new Float32Array(TOY_DIMS);
  const b = new Float32Array(TOY_DIMS);
  const c = new Float32Array(TOY_DIMS);
  // El ruido que separa a los dos vecinos. Ajustado a mano hasta que el coseno
  // entre `a` y `b` cae en 0,70, que es lo que dan dos vecinos del kNN de
  // verdad; el test lo comprueba, así que no puede desviarse en silencio.
  const spread = 0.44;
  for (let i = 0; i < TOY_DIMS; i++) {
    const shared = base();
    a[i] = shared + near() * spread;
    b[i] = shared + near() * spread;
    c[i] = far();
  }
  unit(a); unit(b);

  // La dirección media de los dos vecinos, y el extraño limpiado de todo lo que
  // tuviera de `a` y de `b`. Al quedar perpendicular a los dos lo está también
  // a su media, y entonces `c = t·mid + √(1−t²)·c⊥` sale unitario sin más y da
  // el **mismo** coseno contra cada vecino: `t · (a·mid)`. Quitarle sólo la
  // componente de la media dejaba 0,21 contra uno y −0,02 contra el otro, que
  // en la lámina se lee como que «lunes» se parece a «gato» y no a «perro».
  const mid = new Float32Array(TOY_DIMS);
  for (let i = 0; i < TOY_DIMS; i++) mid[i] = a[i] + b[i];
  unit(mid);
  // Gram-Schmidt sobre una base **ortonormal** del plano, no dos proyecciones
  // seguidas contra `a` y contra `b`: como `a` y `b` no son perpendiculares
  // entre sí, la segunda le devuelve al extraño parte de lo que le quitó la
  // primera y se queda en 0,22 contra una de las dos.
  const e2 = new Float32Array(TOY_DIMS);
  let ab = 0;
  for (let i = 0; i < TOY_DIMS; i++) ab += a[i] * b[i];
  for (let i = 0; i < TOY_DIMS; i++) e2[i] = b[i] - ab * a[i];
  unit(e2);
  for (const u of [a, e2]) {
    let dot = 0;
    for (let i = 0; i < TOY_DIMS; i++) dot += c[i] * u[i];
    for (let i = 0; i < TOY_DIMS; i++) c[i] -= dot * u[i];
  }
  unit(c);
  let m = 0;
  for (let i = 0; i < TOY_DIMS; i++) m += a[i] * mid[i];
  const t = TOY_FAR / m;
  const s = Math.sqrt(1 - t * t);
  for (let i = 0; i < TOY_DIMS; i++) c[i] = t * mid[i] + s * c[i];

  return { a, b, c };
}

/** Los tres vectores de la primera lámina. `a` y `b` son las dos palabras que
 *  se parecen; `c` es la que no pinta nada. Quién es cada una la decide el
 *  idioma, en el componente: aquí no hay palabras. */
export const TOY = toyVectors();

/**
 * Coseno entre dos vectores ya unitarios. El mismo número que el atlas enseña
 * junto a cada vecino, calculado igual.
 * @param {Float32Array} u
 * @param {Float32Array} v
 * @returns {number} en [-1, 1]
 */
export function toyCos(u, v) {
  let s = 0;
  for (let i = 0; i < u.length; i++) s += u[i] * v[i];
  return s < -1 ? -1 : s > 1 ? 1 : s;
}

/* ====================== la galaxia en pequeño ======================
   La lámina de los muelles. Veintiocho nodos en dos grupos, atados por dentro
   y con un solo puente entre ellos, sueltos desde posiciones al azar.

   Lo que tiene que demostrar es lo mismo que hace la galaxia de detrás con
   cincuenta mil: **los barrios no se dibujan, salen**. Nadie le dice a la
   simulación que hay dos grupos; están sólo en quién tira de quién. */

/** Nodos de la simulación de juguete, repartidos entre los dos grupos. */
const MINI_N = 28;

/** Aristas por nodo dentro de su grupo. Con una sola el grupo sale en cadena y
 *  parece una serpiente, no un barrio. */
const MINI_K = 3;

/**
 * @typedef {object} Mini
 * @property {Float32Array} pos    dos coordenadas por nodo, en unidades de caja
 * @property {Float32Array} vel    la velocidad de cada uno
 * @property {Uint8Array} group    0 o 1, sólo para el color del dibujo
 * @property {[number, number][]} links
 */

/**
 * Un grafo de juguete con dos comunidades y las posiciones ya revueltas.
 *
 * La semilla es un argumento porque el botón «soltar otra vez» de la lámina
 * tiene que dar un revuelto distinto: repetir el mismo desde el mismo sitio
 * enseñaría una película, no una simulación.
 * @param {number} [seed]
 * @returns {Mini}
 */
export function miniGraph(seed = 7) {
  const r = rng(seed);
  const pos = new Float32Array(MINI_N * 2);
  const vel = new Float32Array(MINI_N * 2);
  const group = new Uint8Array(MINI_N);
  /** @type {[number, number][]} */
  const links = [];

  for (let i = 0; i < MINI_N; i++) {
    // Revueltos, pero no encima del centro: dos nodos exactamente en el mismo
    // punto dan una repulsión infinita y salen disparados.
    pos[i * 2] = r() * 0.85;
    pos[i * 2 + 1] = r() * 0.85;
    group[i] = i < MINI_N / 2 ? 0 : 1;
  }

  // Dentro de cada grupo: cada nodo con los `MINI_K` siguientes en círculo. Es
  // un vecindario regular y basta — lo que la lámina enseña es que las aristas
  // mandan sobre la posición inicial, no cómo se eligieron las aristas.
  const half = MINI_N / 2;
  for (let g = 0; g < 2; g++) {
    const off = g * half;
    for (let i = 0; i < half; i++) {
      for (let k = 1; k <= MINI_K; k++) {
        const j = (i + k) % half;
        if (i < j) links.push([off + i, off + j]);
      }
    }
  }
  // El puente: una sola arista entre los dos grupos. Sin ella los dos barrios
  // se van a tomar viento y el dibujo se sale del recuadro; con más de una, se
  // pegan y deja de verse que son dos.
  links.push([0, half]);

  return { pos, vel, group, links };
}

/** Constantes del muelle. Son las mismas ideas que `physics.wgsl` —atracción
 *  por arista, repulsión entre todos, un poco de gravedad al centro y
 *  amortiguación— con los números de una caja de 28 nodos. */
const SPRING = 0.085;   // tirón de cada arista hacia su longitud de reposo
const REST = 0.16;      // longitud de reposo
const REPEL = 0.0006;   // empuje entre cualquier par
const GRAVITY = 0.020;  // hacia el centro, o los grupos se van del recuadro
const DAMP = 0.86;      // la misma amortiguación que el ratón del atlas
const MAX_V = 0.06;     // tope de velocidad: sin él el primer paso explota

/**
 * Un paso de la simulación, en el sitio.
 *
 * Es O(n²) en la repulsión y da igual: 28 nodos son 378 pares. La galaxia de
 * verdad no puede permitírselo y por eso muestrea desde memoria compartida en
 * la GPU, pero copiar aquí ese apaño sólo añadiría código que no se ve.
 * @param {Mini} m
 * @param {number} [steps] cuántos pasos dar de una vez
 */
export function miniStep(m, steps = 1) {
  const { pos, vel, links } = m;
  const n = pos.length / 2;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < n; i++) {
      let fx = -pos[i * 2] * GRAVITY;
      let fy = -pos[i * 2 + 1] * GRAVITY;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = pos[i * 2] - pos[j * 2];
        const dy = pos[i * 2 + 1] - pos[j * 2 + 1];
        // El suelo de la distancia es lo que impide el infinito cuando dos
        // nodos coinciden; sin él un solo par superpuesto rompe la lámina.
        const d2 = Math.max(dx * dx + dy * dy, 1e-4);
        const f = REPEL / d2;
        const d = Math.sqrt(d2);
        fx += (dx / d) * f;
        fy += (dy / d) * f;
      }
      vel[i * 2] += fx;
      vel[i * 2 + 1] += fy;
    }
    for (const [a, b] of links) {
      const dx = pos[b * 2] - pos[a * 2];
      const dy = pos[b * 2 + 1] - pos[a * 2 + 1];
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
      const f = (d - REST) * SPRING;
      const ux = (dx / d) * f, uy = (dy / d) * f;
      vel[a * 2] += ux; vel[a * 2 + 1] += uy;
      vel[b * 2] -= ux; vel[b * 2 + 1] -= uy;
    }
    for (let i = 0; i < n; i++) {
      let vx = vel[i * 2] * DAMP, vy = vel[i * 2 + 1] * DAMP;
      const v = Math.hypot(vx, vy);
      if (v > MAX_V) { vx = (vx / v) * MAX_V; vy = (vy / v) * MAX_V; }
      vel[i * 2] = vx; vel[i * 2 + 1] = vy;
      pos[i * 2] += vx;
      pos[i * 2 + 1] += vy;
    }
  }
}

/**
 * Cuánto se mueve todavía, en unidades de caja por paso.
 *
 * La lámina la usa para saber cuándo dejar de pedir cuadros: una simulación
 * asentada que sigue repintando a 60 Hz es un bucle de render encendido en un
 * panel de texto.
 * @param {Mini} m
 * @returns {number}
 */
export function miniHeat(m) {
  const { vel } = m;
  let s = 0;
  for (let i = 0; i < vel.length; i += 2) s += Math.hypot(vel[i], vel[i + 1]);
  return s / (vel.length / 2);
}

/**
 * Distancia media entre dos nodos del mismo grupo y entre nodos de grupos
 * distintos. Es la medida de que los barrios **salieron**: al soltar, las dos
 * son iguales; asentado, la de dentro es mucho menor que la de fuera.
 * @param {Mini} m
 * @returns {{inside: number, across: number}}
 */
export function miniSplit(m) {
  const { pos, group } = m;
  const n = group.length;
  let si = 0, ni = 0, sa = 0, na = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = Math.hypot(pos[i * 2] - pos[j * 2], pos[i * 2 + 1] - pos[j * 2 + 1]);
      if (group[i] === group[j]) { si += d; ni++; } else { sa += d; na++; }
    }
  }
  return { inside: ni ? si / ni : 0, across: na ? sa / na : 0 };
}
