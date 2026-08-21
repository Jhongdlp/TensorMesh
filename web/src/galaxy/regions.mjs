/** Las regiones, en palabras. La leyenda que al mapa le faltaba.
 *
 *  La galaxia pinta dos docenas de colores y hasta ahora el único sitio donde
 *  un color se explicaba era el punto de 8 px de la ficha — que no existe hasta
 *  que se clica algo. Quien abre el atlas ve una nebulosa teñida y ninguna
 *  clave: el color, que es la mitad de lo que el dibujo dice, no se podía leer.
 *
 *  Aquí no hay nada aprendido ni escrito a mano. El nombre de una región son
 *  sus palabras más frecuentes, que es la única etiqueta que el dato ya trae:
 *  si la comunidad 7 se llama «guerra · ejército · tropas» es porque ésas son
 *  las tres primeras de las 2.300 que la forman.
 *
 *  Dos decisiones que cambian lo que se lee:
 *
 *  - **las palabras vacías no dan nombre** (`flags`). No se borran —son parte
 *    legítima del modelo y su región es real— pero son las más frecuentes de
 *    todas, así que dejarlas nombrar habría titulado media galaxia con «de ·
 *    la · que». Sólo si una región no tiene otra cosa se cae a ellas;
 *  - **el encuadre usa el núcleo, no todos los miembros** (`core`). Una región
 *    tiene miembros sueltos lejísimos —el grafo los metió ahí por una arista— y
 *    encuadrar sobre el más lejano deja el barrio como un punto en el centro.
 *    Es la misma razón por la que el encuadre inicial usa el percentil 95 y no
 *    la esfera envolvente.
 */

/** Cuántas palabras nombran una región. Tres caben en una línea del cajón y ya
 *  dicen de qué va; con dos, dos regiones vecinas se confunden. */
const NAME = 3;

/** Fracción de miembros que entra en el núcleo de encuadre. */
const CORE = 0.9;

/** El cálculo recorre los 50.000 nodos y la leyenda lo pide en cada pintado. */
const cache = new WeakMap();

/**
 * @typedef {object} Region
 * @property {number} id        índice de comunidad, el mismo de `g.community`
 * @property {number[]} members todos sus nodos
 * @property {number[]} name    los `NAME` nodos que la nombran, por frecuencia
 * @property {[number, number, number]} centroid
 */

/**
 * Las regiones de una galaxia, de la más grande a la más pequeña.
 * @param {import("./loader").Galaxy} g
 * @returns {Region[]}
 */
export function regions(g) {
  const hit = cache.get(g);
  if (hit) return hit;
  const out = compute(g);
  cache.set(g, out);
  return out;
}

/**
 * @param {import("./loader").Galaxy} g
 * @returns {Region[]}
 */
function compute(g) {
  const { community, rank, flags, positions } = g;
  const n = g.meta.nodes;

  let nc = 1;
  for (let i = 0; i < n; i++) if (community[i] + 1 > nc) nc = community[i] + 1;

  /** @type {number[][]} */
  const members = Array.from({ length: nc }, () => []);
  for (let i = 0; i < n; i++) members[community[i]].push(i);

  const out = [];
  for (let c = 0; c < nc; c++) {
    const mem = members[c];
    if (!mem.length) continue;

    // Por frecuencia. `rank` ya es el orden de frecuencia del corpus, así que
    // ordenar es todo lo que hace falta para saber quién manda en la región.
    const byRank = mem.slice().sort((a, b) => rank[a] - rank[b]);
    const full = byRank.filter(i => !flags[i]);
    const name = (full.length >= NAME ? full : byRank).slice(0, NAME);

    let cx = 0, cy = 0, cz = 0;
    for (const i of mem) {
      cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2];
    }
    cx /= mem.length; cy /= mem.length; cz /= mem.length;

    out.push({ id: c, members: mem, name, centroid: /** @type {[number,number,number]} */ ([cx, cy, cz]) });
  }

  out.sort((a, b) => b.members.length - a.members.length);
  return out;
}

/**
 * El núcleo de una región: los miembros más cercanos a su centroide.
 *
 * Es lo que se le pasa a la cámara. El resalte va sobre la región entera —los
 * miembros lejanos son suyos y tienen que encenderse— pero el encuadre no puede
 * salir de ellos, o el barrio queda diminuto en mitad de la pantalla.
 *
 * @param {import("./loader").Galaxy} g
 * @param {Region} r
 * @param {number} [frac]
 * @returns {number[]}
 */
export function core(g, r, frac = CORE) {
  const { positions } = g;
  const [cx, cy, cz] = r.centroid;
  const d = r.members.map(i => Math.hypot(
    positions[i * 3] - cx, positions[i * 3 + 1] - cy, positions[i * 3 + 2] - cz));
  const ord = r.members.map((id, k) => k).sort((a, b) => d[a] - d[b]);
  const keep = Math.max(1, Math.round(ord.length * frac));
  return ord.slice(0, keep).map(k => r.members[k]);
}
