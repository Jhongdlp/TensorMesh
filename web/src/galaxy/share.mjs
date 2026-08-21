/** La vista, en la URL. Seis números y un enlace.
 *
 *  El atlas ya sabía compartir *qué* se está mirando (`?w=`, `?to=`, `?cmp=`),
 *  pero no **desde dónde**. Y en una galaxia de 50.000 puntos el encuadre es la
 *  mitad del mensaje: «mira este puente entre dos barrios» no es la palabra, es
 *  el sitio de la cámara desde el que el puente se ve como un puente. Sin esto,
 *  quien abre el enlace aterriza en el encuadre completo y tiene que volver a
 *  buscar a mano lo que el otro ya había encontrado.
 *
 *  Es la órbita entera y no la matriz de vista: centro, distancia y dos
 *  ángulos. Seis números en vez de dieciséis, y sobre todo **es el estado que
 *  los dos motores comparten** — `gpu/camera.ts` y `scene.ts` tienen cada uno
 *  su cámara, pero las dos son la misma órbita. Un enlace hecho en WebGPU abre
 *  igual en el respaldo WebGL, que es el camino que se ve en Linux sin la
 *  bandera.
 *
 *  Tres decimales: a las escalas de esta nube, la diferencia entre dos
 *  encuadres separados por una milésima no la ve nadie, y la URL no se llena de
 *  ruido de coma flotante.
 */

/** El tipo vive en `gpu/camera.ts`, con la cámara que lo produce: dos
 *  descripciones de los mismos seis números se desfasan en cuanto se toca una.
 *  @typedef {import("./gpu/camera").CamState} CamState */

/** Recorta ceros de cola: `1.500` es `1.5` y `2.000` es `2`. */
const num = (v) => Number(v.toFixed(3)).toString();

/**
 * @param {CamState} c
 * @returns {string}
 */
export function encodeCam(c) {
  return [c.t[0], c.t[1], c.t[2], c.d, c.th, c.ph].map(num).join(",");
}

/**
 * Lee lo que `encodeCam` escribió. Cualquier cosa que no sean seis números
 * finitos devuelve `null`: la URL la escribe cualquiera a mano, y una cámara a
 * medio leer deja el visor mirando a `NaN` — pantalla negra sin nada que diga
 * por qué. Mejor ignorar el parámetro y abrir en el encuadre completo.
 *
 * @param {string | null} s
 * @returns {CamState | null}
 */
export function decodeCam(s) {
  if (!s) return null;
  const p = s.split(",").map(Number);
  if (p.length !== 6 || !p.every(Number.isFinite)) return null;
  // La distancia negativa o cero pone la cámara en el punto que mira: `lookAt`
  // degenera y no hay imagen.
  if (p[3] <= 0) return null;
  return { t: [p[0], p[1], p[2]], d: p[3], th: p[4], ph: p[5] };
}
