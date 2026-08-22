/** Lo que la sala comparte con su test, y las cinco superficies.
 *
 *  Es `.mjs` y no `.ts` por la misma razón que `palette.mjs` y `highlight.mjs`:
 *  `package.json` es `type: commonjs` y Node no carga un `.ts` como módulo,
 *  mientras que `tsc` sí tipa un `.mjs` con `allowJs`. Todo lo que `engine.ts` y
 *  `test/descent.mjs` tienen que ver igual vive aquí.
 *
 *  **La duplicación que hay aquí, y por qué se acepta.** `f` está escrita dos
 *  veces: en `field.wgsl` (que es donde se calcula el descenso) y aquí (que es
 *  donde se decide la escala vertical y el encuadre). No hay forma de evitarlo
 *  sin llevar el muestreo de la escala a la GPU, que cuesta más de lo que
 *  ahorra. Lo que sí hay es una red: `test/descent.mjs` evalúa las cinco
 *  funciones en la GPU y en JS sobre los mismos puntos y exige que coincidan.
 *  Si una de las dos copias se desvía, el test lo dice.
 */
import { rampCss } from "../../galaxy/palette.mjs";

/** Caminantes por defecto.
 *
 *  Eran 40.000 y era el error de diseño de la sala: a ese número, con dos
 *  píxeles de radio y mezcla aditiva, lo que se ve no son caminantes sino
 *  niebla. La pregunta que la sala contesta —«¿cómo baja *uno*?»— no se puede
 *  leer en una nube. Ocho mil se siguen viendo como multitud y cada bolita
 *  sigue siendo una bolita, que es lo que hay que ver antes de creerse nada.
 *  El mando llega hasta `N_MAX` para quien quiera la niebla. */
export const N_DEFAULT = 8_000;
export const N_MAX = 120_000;
/** Número al que está calibrada la exposición. **No** es `N_DEFAULT`: la luz
 *  acumulada es `vivos · brillo`, así que el brillo se compensa contra una
 *  referencia fija. Si fuese `N_DEFAULT`, cambiar el reparto por defecto
 *  recalibraría en silencio la imagen de todas las superficies. */
export const N_REF = 40_000;

/** Caminantes **seguidos**: los que dejan su camino dibujado, punto a punto.
 *
 *  Son la respuesta a la pregunta que la sala no contestaba. Ocho mil canicas
 *  idénticas dicen «esto es un enjambre» y no dicen nada más: nadie puede
 *  seguir a una con la vista, así que la mecánica —*mira la pendiente bajo tus
 *  pies, da un paso cuesta abajo, repite*— no se ve por ninguna parte. Cinco
 *  que van marcadas y arrastran sus últimas posiciones **sí** la enseñan, y de
 *  paso hacen visible lo que el enjambre entero ya estaba diciendo en voz baja.
 *
 *  Cinco y no una: con una sola, lo que se aprende es un camino; con cinco se
 *  ve que la superficie los trata distinto según de dónde salgan, que es la
 *  mitad del contenido de Himmelblau y de Rastrigin. Y no veinte: a partir de
 *  ahí vuelven a ser un enjambre pequeño.
 *
 *  Ocupan los **primeros** índices del estado, así que seguirlos es un rango
 *  contiguo y no una lista de índices sueltos. */
export const TRACED = 5;
/** Cuántas posiciones guarda el rastro de cada uno, en frames. A ocho pasos
 *  por frame son ~3.000 pasos: casi la corrida entera. */
export const PATH_LEN = 384;

/** @typedef {"sgd" | "momentum" | "adam"} OptKey */

/** @type {OptKey[]} */
export const OPTS = ["sgd", "momentum", "adam"];

/** @type {Record<OptKey, string>} */
export const OPT_NAMES = { sgd: "Descenso", momentum: "Momento", adam: "Adam" };

/**
 * @typedef {object} Surface
 * @property {string} key
 * @property {string} name
 * @property {string} formula
 * @property {string} note      qué enseña esta superficie y no otra
 * @property {number[]} dom     [x0, x1, y0, y1]
 * @property {(x: number, y: number) => number} f
 * @property {(x: number, y: number) => number[]} g
 * @property {Record<OptKey, { lr: number, clip: number }>} opt
 * @property {number[][]} min   mínimos conocidos, en coordenadas del problema.
 *                              Se dibujan como diana sobre el relieve: sin
 *                              blanco a la vista, «descender» no tiene a dónde,
 *                              y en Himmelblau son cuatro y ése es el chiste.
 *                              La silla no tiene: por eso su lista va vacía.
 * @property {string} reach     cuántos llegan al fondo, del barrido
 */

const TAU = Math.PI * 2;
/** Altura total del relieve en unidades de mundo, y lado del dominio. Fijos
 *  para las cinco: así la cámara encuadra igual y comparar superficies no
 *  implica reaprender la escala.
 *
 *  `H_SPAN` era 4,3 —tanto como el lado— y ésa era la mitad de por qué la sala
 *  se veía rara. Con la vertical tan alta como el ancho, el relieve deja de
 *  parecer un paisaje y parece **una tela doblada**: las paredes de pérdida
 *  alta se levantan por encima de la cámara, tapan el valle y se acaba mirando
 *  la cara de abajo de la malla. A 0,55× del lado se lee lo que es —un terreno
 *  con un valle— sin perder ni un escalón de la rampa, porque el color y las
 *  curvas de nivel siguen recorriendo el rango entero. */
const H_SPAN = 2.2;
const XY_SPAN = 4.0;

/** Las cinco. `f` y `g` son espejo de `fEval`/`fGrad` en `field.wgsl`.
 *
 *  Los `lr` y los recortes **no son a ojo**: salen de un barrido sobre 3.000
 *  caminantes y 3.000 pasos por cada par superficie·optimizador, quedándose con
 *  el que más llegan al fondo sin un solo NaN. Los porcentajes de `reach` son
 *  los de ese barrido y son parte del contenido de la sala: que en Rastrigin
 *  sólo llegue el 9% con los tres optimizadores es el resultado, no un fallo. */
/** @type {Surface[]} */
export const SURFACES = [
  {
    key: "rosenbrock",
    name: "Rosenbrock",
    formula: "(1 − x)² + 100(y − x²)²",
    note: "Un valle plano y curvo. Casi todos lo encuentran en diez pasos y luego tardan cuatro mil en recorrerlo: el problema no es bajar, es avanzar.",
    dom: [-2, 2, -1, 3],
    f: (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
    g: (x, y) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)],
    opt: { sgd: { lr: 0.002, clip: 20 }, momentum: { lr: 0.002, clip: 20 }, adam: { lr: 0.05, clip: 1e9 } },
    min: [[1, 1]],
    reach: "98%",
  },
  {
    key: "himmelblau",
    name: "Himmelblau",
    formula: "(x² + y − 11)² + (x + y² − 7)²",
    note: "Cuatro mínimos del mismo valor. Aquí el color por origen deja de ser adorno: es el mapa de cuencas, y se ve qué mitad del plano cae en cuál.",
    dom: [-5, 5, -5, 5],
    f: (x, y) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
    g: (x, y) => [4 * x * (x * x + y - 11) + 2 * (x + y * y - 7),
                  2 * (x * x + y - 11) + 4 * y * (x + y * y - 7)],
    opt: { sgd: { lr: 0.01, clip: 20 }, momentum: { lr: 0.002, clip: 20 }, adam: { lr: 0.05, clip: 1e9 } },
    min: [[3, 2], [-2.805118, 3.131312], [-3.779310, -3.283186], [3.584428, -1.848126]],
    reach: "100%",
  },
  {
    key: "beale",
    name: "Beale",
    formula: "(1,5 − x + xy)² + (2,25 − x + xy²)² + (2,625 − x + xy³)²",
    note: "Una meseta enorme y casi plana con paredes verticales al borde. Sólo llega el 60%: al resto se le acaba el gradiente antes que el camino.",
    dom: [-4.5, 4.5, -4.5, 4.5],
    f: (x, y) => (1.5 - x + x * y) ** 2 + (2.25 - x + x * y * y) ** 2 + (2.625 - x + x * y ** 3) ** 2,
    g: (x, y) => {
      const a = 1.5 - x + x * y, b = 2.25 - x + x * y * y, c = 2.625 - x + x * y ** 3;
      return [2 * a * (y - 1) + 2 * b * (y * y - 1) + 2 * c * (y ** 3 - 1),
              2 * a * x + 4 * b * x * y + 6 * c * x * y * y];
    },
    opt: { sgd: { lr: 0.005, clip: 20 }, momentum: { lr: 0.002, clip: 20 }, adam: { lr: 0.05, clip: 1e9 } },
    min: [[3, 0.5]],
    reach: "60%",
  },
  {
    key: "saddle",
    name: "Silla",
    formula: "x² − y²",
    note: "No tiene mínimo: se escapan los diez mil. En millones de dimensiones esto —y no los mínimos locales— es lo que de verdad frena a un optimizador.",
    dom: [-2, 2, -2, 2],
    f: (x, y) => x * x - y * y,
    g: (x, y) => [2 * x, -2 * y],
    opt: { sgd: { lr: 0.02, clip: 20 }, momentum: { lr: 0.002, clip: 20 }, adam: { lr: 0.05, clip: 1e9 } },
    min: [],
    reach: "escapan todos",
  },
  {
    key: "rastrigin",
    name: "Rastrigin",
    formula: "20 + x² − 10cos(2πx) + y² − 10cos(2πy)",
    note: "Mínimos locales a puñados. Sólo el 9% encuentra el global, y da igual el optimizador: cada uno cae en el hoyo que tiene debajo.",
    dom: [-5.12, 5.12, -5.12, 5.12],
    f: (x, y) => 20 + x * x - 10 * Math.cos(TAU * x) + y * y - 10 * Math.cos(TAU * y),
    g: (x, y) => [2 * x + 10 * TAU * Math.sin(TAU * x), 2 * y + 10 * TAU * Math.sin(TAU * y)],
    opt: { sgd: { lr: 0.005, clip: 20 }, momentum: { lr: 0.002, clip: 20 }, adam: { lr: 0.02, clip: 1e9 } },
    min: [[0, 0]],
    reach: "9%",
  },
];

export const HYPER = { mu: 0.9, b1: 0.9, b2: 0.999, eps: 1e-8 };

/** Escala vertical y horizontal de una superficie.
 *
 *  El percentil 99 y no el máximo, por la misma razón que el atlas encuadra con
 *  p95 y no con la esfera envolvente: en Beale una esquina vale 160.000 y el
 *  resto del dominio menos de 100, así que normalizar por el máximo aplasta el
 *  relieve entero contra el suelo para que quepa una aguja. */
export function metricsOf(surf, res = 256) {
  const [x0, x1, y0, y1] = surf.dom;
  const vals = new Float64Array(res * res);
  let fMin = Infinity;
  for (let j = 0; j < res; j++) {
    const y = y0 + ((y1 - y0) * j) / (res - 1);
    for (let i = 0; i < res; i++) {
      const x = x0 + ((x1 - x0) * i) / (res - 1);
      const v = surf.f(x, y);
      vals[j * res + i] = v;
      if (v < fMin) fMin = v;
    }
  }
  const ls = Float64Array.from(vals, (v) => Math.log1p(v - fMin));
  ls.sort();
  const lp = ls[Math.floor(ls.length * 0.99)] || 1;

  const w = x1 - x0, h = y1 - y0;
  return {
    fMin,
    hScale: H_SPAN / lp,
    hOffset: -H_SPAN * 0.5,
    hLo: -H_SPAN * 0.5,
    hHi: H_SPAN * 0.5,
    k: XY_SPAN / Math.max(w, h),
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    halfX: w * 0.75,
    halfY: h * 0.75,
    /** Radio de encuadre. Sale de la caja normalizada y no de la nube: el
     *  relieve ocupa siempre el mismo sitio, así que cambiar de superficie no
     *  mueve la cámara. */
    radius: Math.hypot((XY_SPAN * w) / Math.max(w, h) / 2, H_SPAN / 2,
                       (XY_SPAN * h) / Math.max(w, h) / 2),
  };
}

/** Altura de mundo en CPU. Espejo de `heightOf` en el shader. */
export const heightOf = (surf, m, x, y) =>
  m.hScale * Math.log(1 + Math.max(surf.f(x, y) - m.fMin, 0)) + m.hOffset;

/** Siembra uniforme en el dominio, con generador propio y semilla explícita:
 *  dos recargas tienen que poder dar la misma imagen, y `Math.random` no deja.
 *  @returns {{ st: Float32Array, tint: Float32Array }} */
export function seedWalkers(surf, n, s, walkerSize) {
  const [x0, x1, y0, y1] = surf.dom;
  let z = s >>> 0;
  const rnd = () => {
    z = (z * 1664525 + 1013904223) >>> 0;
    return z / 4294967296;
  };
  const st = new Float32Array(n * 2);
  const tint = new Float32Array(n * 4);

  // La rampa se muestrea una vez por grado y se reutiliza: `rampCss` biseca
  // para ajustar el croma al borde de la gama, y llamarla cien mil veces sería
  // medio segundo de arranque tirado.
  const LUT = 360;
  const ramp = new Float32Array(LUT * 3);
  for (let i = 0; i < LUT; i++) {
    const hex = rampCss(i / LUT);
    ramp[i * 3] = parseInt(hex.slice(1, 3), 16) / 255;
    ramp[i * 3 + 1] = parseInt(hex.slice(3, 5), 16) / 255;
    ramp[i * 3 + 2] = parseInt(hex.slice(5, 7), 16) / 255;
  }

  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < n; i++) {
    // Los cinco seguidos **no** van al azar: se reparten por un anillo del
    // dominio, a ángulos regulares y con la semilla desplazándolos un poco.
    // Al azar, dos de los cinco caen en el mismo barrio la mitad de las veces
    // —y entonces dibujan el mismo camino dos veces— o los cinco caen en la
    // misma cuenca de Himmelblau, que es justo lo que no hay que enseñar.
    const traced = i < TRACED;
    const ang0 = ((i + 0.5) / TRACED + rnd() * 0.12) * TAU;
    const x = traced
      ? cx + Math.cos(ang0) * (x1 - x0) * 0.34
      : x0 + rnd() * (x1 - x0);
    const y = traced
      ? cy + Math.sin(ang0) * (y1 - y0) * 0.34
      : y0 + rnd() * (y1 - y0);
    st[i * 2] = x;
    st[i * 2 + 1] = y;
    // Tono por el ángulo del **origen** respecto al centro del dominio. En
    // Himmelblau eso convierte la nube en el mapa de las cuatro cuencas.
    const ang = Math.atan2(y - cy, x - cx);
    const k = Math.min(LUT - 1, Math.floor((ang / TAU + 0.5) * LUT));
    tint[i * 4] = ramp[k * 3];
    tint[i * 4 + 1] = ramp[k * 3 + 1];
    tint[i * 4 + 2] = ramp[k * 3 + 2];
    // El radio viaja **por caminante** en `w`, y ahí es donde los cinco
    // seguidos se hacen grandes: el shader no tiene que saber quién es quién.
    tint[i * 4 + 3] = walkerSize * (i < TRACED ? 2.1 : 1);
  }
  return { st, tint };
}
