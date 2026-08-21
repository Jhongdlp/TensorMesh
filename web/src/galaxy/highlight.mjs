/** Escalones del canal de resalte: <1 atenúa, 1 es normal, >1 resalta con esa
 *  intensidad (el exceso sobre 1). Los comparten los dos motores.
 *
 *  Son cuatro y no dos porque el segundo anillo es lo que convierte un puñado
 *  de puntos sueltos en un barrio con forma: sin él las aristas de los vecinos
 *  se cortan en seco y el camino no lleva a ninguna parte. */
export const HL = {
  /** Todo lo demás. Ni 0 ni 0,3: por debajo se pierde el sitio donde está la
   *  palabra, por encima los 50.000 restantes vuelven a taparla. */
  rest: 0.08,
  /** Vecinos de los vecinos: apenas por encima de lo normal, lo justo para que
   *  se vean las aristas que salen del barrio. */
  ring2: 1.18,
  /** Vecinos directos: son los que lista la ficha. */
  ring1: 1.95,
  /** La palabra elegida. */
  self: 3.0,
  /** Bajo el cursor. Confirma el objetivo antes de gastar un clic. */
  hover: 1.5,
};

/** Escribe en `out` (n valores) el escalón de cada nodo para la selección `id`.
 *  De fuera hacia dentro, para que un nodo que cae en dos anillos se quede con
 *  el más cercano. */
/**
 * @param {import("./loader").Galaxy} g
 * @param {number | null} id
 * @param {Float32Array} out
 */
export function tiers(g, id, out) {
  const { offsets, targets } = g;
  if (id === null) {
    out.fill(1);
    return out;
  }
  out.fill(HL.rest);
  for (let j = offsets[id]; j < offsets[id + 1]; j++) {
    const a = targets[j];
    for (let k = offsets[a]; k < offsets[a + 1]; k++) out[targets[k]] = HL.ring2;
  }
  for (let j = offsets[id]; j < offsets[id + 1]; j++) out[targets[j]] = HL.ring1;
  out[id] = HL.self;
  return out;
}

/** Escalones del **atractor**: una palabra se enciende y **nadie se apaga**.
 *
 *  Es la diferencia entre presentar la galaxia y taparla. Los otros dos
 *  repartos atenúan las 49.999 restantes a `rest` (0,08) porque quien ha pedido
 *  una palabra quiere ver *esa*; aquí no la ha pedido nadie —el atlas está
 *  pasando páginas solo— y apagar la nebulosa para señalar un punto deja la
 *  pantalla negra justo cuando lo único que hay que enseñar es la nebulosa.
 *
 *  Así que el fondo se queda en 1 y sólo sube la palabra y su vecindario: el
 *  destello se lee sobre la malla encendida, que es el cartel.
 *
 * @param {import("./loader").Galaxy} g
 * @param {number | null} id
 * @param {Float32Array} out
 */
export function spotTiers(g, id, out) {
  const { offsets, targets } = g;
  out.fill(1);
  if (id === null) return out;
  for (let j = offsets[id]; j < offsets[id + 1]; j++) out[targets[j]] = HL.ring1;
  out[id] = HL.self;
  return out;
}

/** Lo mismo para un **camino** entre dos palabras.
 *
 *  Los nodos del camino van a `self` y sus vecinos directos a `ring2`. El
 *  anillo no es adorno: sin él el camino son siete puntos brillantes colgando
 *  del vacío, y lo que se quiere ver es por qué barrios pasa. Con él, cada
 *  paso arrastra su vecindario y el color dice cuándo se cruza de región.
 *
 *  No hay `ring1` aquí a propósito: en la selección los vecinos directos son
 *  los que lista la ficha y merecen un escalón propio; en un camino lo que
 *  importa es la cadena, y un tercer nivel la enterraría.
 *
 * @param {import("./loader").Galaxy} g
 * @param {number[] | null} path
 * @param {Float32Array} out
 */
export function pathTiers(g, path, out) {
  const { offsets, targets } = g;
  if (!path || path.length === 0) {
    out.fill(1);
    return out;
  }
  out.fill(HL.rest);
  for (const id of path) {
    for (let j = offsets[id]; j < offsets[id + 1]; j++) out[targets[j]] = HL.ring2;
  }
  // Después del anillo: un nodo del camino que además sea vecino de otro no
  // puede quedarse con el escalón de fuera.
  for (const id of path) out[id] = HL.self;
  return out;
}
