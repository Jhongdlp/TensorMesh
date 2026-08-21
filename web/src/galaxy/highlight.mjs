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
