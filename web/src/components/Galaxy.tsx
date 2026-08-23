import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { getStoredLang, setStoredLang, type Lang } from "../i18n";
import { loadGalaxy, neighbours, type Galaxy } from "../galaxy/loader";
import { zoneColours } from "../galaxy/palette.mjs";
import { GalaxyScene } from "../galaxy/scene";
import { GpuEngine, gpuAvailable, DEFAULTS, type Params } from "../galaxy/gpu/engine";
import Controls from "./Controls";
import KeyHelp from "./KeyHelp";
import WordSearch from "./WordSearch";
import { buildIndex, resolve } from "../galaxy/search.mjs";
import { typing } from "../galaxy/keys.mjs";
import { shortestPath, hops } from "../galaxy/path.mjs";
import { Vectors } from "../galaxy/vectors";
import { MAX_WORDS, typical } from "../galaxy/compare.mjs";
import Compare from "./Compare";
import Welcome, { introPending } from "./Welcome";
import LandingPage from "./LandingPage";
import Legend from "./Legend";
import Pattern from "./Pattern";
import Analogy from "./Analogy";
import Start, { common } from "./Start";
import {
  IcoChevron, IcoControls, IcoHelp, IcoOrbit, IcoFly, IcoFit,
  IcoCompare, IcoExpand, IcoShrink, IcoShare, IcoKeys,
} from "./icons";
import Guide, { type ChapterId } from "./Guide";
import Foot from "./Foot";
import GpuRoomLoader from "./GpuRoomLoader";
import { encodeCam, decodeCam } from "../galaxy/share.mjs";
import type { CamState } from "../galaxy/gpu/camera";

const LANGS = [
  { id: "es", name: "español" },
  { id: "en", name: "english" },
];

const COPY = {
  es: { search: "buscar una palabra…", words: "palabras", edges: "aristas",
        regions: "regiones", loading: "cargando binarios…", region: "región",
        freq: "frecuencia", stop: "palabra vacía",
        live: "webgpu · simulación viva", static: "webgl · posiciones fijas", sim: "simulación",
        hint: "pasa el ratón sobre un punto · clic para abrirlo",
        hintOut: "clic en el vacío o esc para soltarla",
        shut: "cerrar", esc: "esc", drop: "soltar",
        held: (w: string) => `mirando «${w}»`,
        heldPath: (a: string, b: string) => `camino «${a}» → «${b}»`,
        heldGroup: (k: number) => `${k} palabras resaltadas`,
        keys: "teclas",
        guide: "qué es esto",
        // «qué es esto» abre la presentación —cuatro pantallas— y «la guía»
        // abre los diez capítulos. Dos rótulos distintos porque son dos
        // sitios distintos: con el mismo nombre, quien ya vio la
        // presentación no vuelve a pulsar y no descubre nunca la guía.
        guideLong: "guía del atlas",
        why: "por qué",
        nbrs: "vecinos más cercanos",
        pathTo: "camino hasta…", pathHead: "camino", pathBack: "volver a la palabra",
        steps: (k: number) => `${k} ${k === 1 ? "salto" : "saltos"}`,
        pathNone: (a: string, b: string) =>
          `no hay camino de «${a}» a «${b}»: el grafo podado deja islas`,
        tools: "herramientas",
        open: "desplegar", close: "plegar", whole: "vista completa",
        navOrbit: "órbita", navFly: "vuelo",
        foot: "similitud coseno en 300D — no la distancia que ves",
        compare: "comparar", addTo: "comparar esta palabra",
        cmp: {
          add: "añadir una palabra…",
          hint: "añade dos o más palabras y verás cuánto se parecen",
          hintFew: "falta una más para poder comparar",
          full: (n: number) => `el máximo son ${n} palabras · quita una para añadir otra`,
          bars: "parecido por pareja",
          grid: "matriz",
          map: "constelación",
          mapNote: "en un plano, no en la galaxia",
          stress: (v: number) => `${Math.round(v * 100)}% de distancia perdida al aplanar`,
          ref: "dos palabras vecinas se parecen, de media,",
          hops: "saltos en el grafo",
          hopsNone: "sin camino",
          step: (k: number) => `${k} ${k === 1 ? "salto" : "saltos"}`,
          shared: "vecinos en común",
          sharedNone: "ningún vecino en común: se parecen sin tocarse en el grafo",
          sharedWith: (k: number) => `${k} de ellas`,
          clear: "vaciar",
          loading: "pidiendo vectores…",
          off: "los vectores 300D no están publicados (falta vecs.bin)",
          foot: "todo medido en 300D — la constelación es una proyección de esos números",
        },
        homeKey: "inicio",
        zen: "pantalla completa", zenOut: "salir",
        zenNote: "sólo la galaxia · f o esc para volver",
        share: "compartir esta vista", shareOk: "enlace copiado",
        shareNo: "el navegador no dejó copiar el enlace",
        idle: "el atlas gira solo", idleOut: "mueve el ratón para tomarlo",
        zones: {
          tab: "regiones",
          note: "el color de la malla, en palabras · pásales el ratón por encima",
          words: (n: number) => `${n.toLocaleString("es")} palabras`,
          foot: "el nombre de una región son sus palabras más frecuentes: nadie la ha etiquetado",
        },
        pat: {
          tab: "familias",
          ph: "*mente",
          note: "enciende todas las palabras que comparten una forma · «*» es el comodín",
          hits: (n: number) => `${n.toLocaleString("es")} palabras casan`,
          none: "ninguna palabra casa con ese patrón",
          capped: (k: number) => `se resaltan las ${k} más frecuentes`,
          clear: "quitar el resalte",
          foot: "si se reparten por todos los barrios, lo que agrupa aquí es el significado y no la terminación",
          ex: ["*mente", "*ción", "des*", "*ito"],
        },
        ana: {
          tab: "analogías",
          note: "a − b + c: la dirección que va de b a a, aplicada sobre c",
          slots: ["", "−", "+"] as [string, string, string],
          pick: "una palabra…",
          run: "resolver",
          need: "elige tres palabras",
          loading: (pct: number) => `descargando los vectores… ${pct}%`,
          weigh: "midiendo las 50.000…",
          none: "sin respuesta",
          off: "los vectores 300D no están publicados (falta vecs.bin)",
          foot: "coseno en 300D contra las 50.000 · las tres de la pregunta quedan fuera",
          ex: [["rey", "hombre", "mujer"], ["madrid", "españa", "francia"],
               ["mayor", "grande", "pequeño"]] as [string, string, string][],
        },
        start: {
          head: "por dónde empezar",
          note: "clica cualquier punto de la galaxia, o entra por aquí",
          rnd: "palabra al azar",
          road: "camino sorpresa",
          guide: "la guía del atlas",
          foot: "cada punto es una palabra ·",
          ex: ["amor", "guerra", "azul", "perro", "música", "dinero"],
        },
        missing: (q: string, n: number) => `«${q}» no está en las ${n} palabras de esta galaxia` },
  en: { search: "search a word…", words: "words", edges: "edges",
        regions: "regions", loading: "loading binaries…", region: "region",
        freq: "frequency", stop: "stop word",
        live: "webgpu · live simulation", static: "webgl · fixed positions", sim: "simulation",
        hint: "hover a dot · click to open it",
        hintOut: "click empty space or press esc to let it go",
        shut: "close", esc: "esc", drop: "let go",
        held: (w: string) => `looking at “${w}”`,
        heldPath: (a: string, b: string) => `path “${a}” → “${b}”`,
        heldGroup: (k: number) => `${k} words highlighted`,
        keys: "keys",
        guide: "what is this",
        guideLong: "atlas guide",
        why: "why",
        nbrs: "nearest neighbours",
        pathTo: "path to…", pathHead: "path", pathBack: "back to the word",
        steps: (k: number) => `${k} ${k === 1 ? "hop" : "hops"}`,
        pathNone: (a: string, b: string) =>
          `no path from “${a}” to “${b}”: the pruned graph leaves islands`,
        tools: "tools",
        open: "expand", close: "collapse", whole: "whole galaxy",
        navOrbit: "orbit", navFly: "fly",
        foot: "cosine similarity in 300D — not the distance you see",
        compare: "compare", addTo: "compare this word",
        cmp: {
          add: "add a word…",
          hint: "add two or more words to see how alike they are",
          hintFew: "one more word and there is something to compare",
          full: (n: number) => `${n} words is the limit · drop one to add another`,
          bars: "similarity by pair",
          grid: "matrix",
          map: "constellation",
          mapNote: "on a plane, not in the galaxy",
          stress: (v: number) => `${Math.round(v * 100)}% of distance lost when flattening`,
          ref: "two neighbouring words are, on average, this alike:",
          hops: "hops in the graph",
          hopsNone: "no path",
          step: (k: number) => `${k} ${k === 1 ? "hop" : "hops"}`,
          shared: "neighbours in common",
          sharedNone: "no shared neighbours: they are alike without touching in the graph",
          sharedWith: (k: number) => `${k} of them`,
          clear: "clear",
          loading: "fetching vectors…",
          off: "the 300D vectors are not published (vecs.bin missing)",
          foot: "all measured in 300D — the constellation is a projection of those numbers",
        },
        homeKey: "home",
        zen: "fullscreen", zenOut: "exit",
        zenNote: "the galaxy alone · f or esc to come back",
        share: "share this view", shareOk: "link copied",
        shareNo: "the browser would not copy the link",
        idle: "the atlas is drifting", idleOut: "move the mouse to take over",
        zones: {
          tab: "regions",
          note: "the colour of the mesh, in words · hover to light one up",
          words: (n: number) => `${n.toLocaleString("en")} words`,
          foot: "a region is named by its most frequent words: nobody labelled it",
        },
        pat: {
          tab: "families",
          ph: "*ly",
          note: "light up every word that shares a shape · “*” is the wildcard",
          hits: (n: number) => `${n.toLocaleString("en")} words match`,
          none: "no word matches that pattern",
          capped: (k: number) => `the ${k} most frequent are highlighted`,
          clear: "drop the highlight",
          foot: "scattered across every neighbourhood means what groups here is meaning, not the ending",
          ex: ["*ly", "*tion", "un*", "*ing"],
        },
        ana: {
          tab: "analogies",
          note: "a − b + c: the direction from b to a, applied to c",
          slots: ["", "−", "+"] as [string, string, string],
          pick: "a word…",
          run: "solve",
          need: "pick three words",
          loading: (pct: number) => `downloading the vectors… ${pct}%`,
          weigh: "weighing all 50,000…",
          none: "no answer",
          off: "the 300D vectors are not published (vecs.bin missing)",
          foot: "cosine in 300D against all 50,000 · the three asked about are excluded",
          ex: [["king", "man", "woman"], ["paris", "france", "italy"],
               ["bigger", "big", "small"]] as [string, string, string][],
        },
        start: {
          head: "where to start",
          note: "click any dot in the galaxy, or come in through here",
          rnd: "random word",
          road: "surprise path",
          guide: "the atlas guide",
          foot: "every dot is a word ·",
          ex: ["love", "war", "blue", "dog", "music", "money"],
        },
        missing: (q: string, n: number) => `“${q}” is not among this galaxy's ${n} words` },
};

/** La marca del guía de primeros gestos, en `localStorage`. Lleva versión como
 *  la de la presentación: subirla es la única forma de volver a enseñárselo a
 *  quien ya lo pasó, si algún día cambian los gestos. */
const COACH_KEY = "atlas.coach.v1";

/** ¿Toca enseñar los primeros gestos? Envuelto, como todo lo que toca
 *  `localStorage`: en una ventana privada el propio acceso lanza, y una
 *  excepción leyendo una preferencia no puede llevarse por delante el visor. */
function coachPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COACH_KEY) !== "1";
  } catch {
    // Sin sitio donde anotarlo se enseña igual: una línea de más por visita es
    // menos malo que una galaxia que nunca dice cómo se toca.
    return true;
  }
}

/** Da el guía por aprendido. Nunca lanza. */
function coachDone() {
  try { localStorage.setItem(COACH_KEY, "1"); } catch { /* sin sitio donde anotarlo */ }
}

/* Los iconos de la tira viven en `components/icons.tsx`: los comparten la
   galaxia y la sala del descenso, que usan el mismo mueble. */

/** Lo que la vista necesita, sea cual sea el motor debajo. */
interface Viewer {
  select(id: number | null): void;
  /** Resalta un camino entero. Mismo canal `dim` que `select`: no es un objeto
   *  nuevo en la escena, es otro reparto de los mismos cuatro escalones. */
  selectPath(path: number[] | null): void;
  pick(x: number, y: number): Promise<number | null>;
  dispose(): void;
  /** Resalte de paso. Sólo el motor WebGPU puede permitírselo: allí cuesta
   *  cuatro bytes, y en WebGL habría que resubir el atributo entero. */
  hover?(id: number | null): void;
  setCameraMode?(mode: 'orbit' | 'fly'): void;
  /** Vuelve al encuadre completo. La tenían los dos motores atada a `Inicio`;
   *  ahora también es un botón, porque una tecla sin botón no la encuentra
   *  quien no despliega la leyenda. */
  goHome?(): void;
  /** Vuela hasta una palabra y encuadra su vecindario. */
  focus?(id: number): void | Promise<void>;
  /** Vuela hasta encuadrar un camino entero. */
  focusPath?(path: number[]): void | Promise<void>;
  /** Deriva en reposo: la galaxia gira sola mientras nadie la toca. */
  setAttract?(on: boolean): void;
  /** Destello del atractor: enciende una palabra **sin apagar** el resto. */
  spotlight?(id: number | null): void;
  /** La órbita, para escribirla en un enlace, y de vuelta desde uno. */
  cameraState?(): CamState;
  setCameraState?(s: CamState): void;
}

/** Cuánto silencio hace falta para que la galaxia empiece a girar sola. Veinte
 *  segundos son más de lo que dura una duda y menos de lo que dura un café: no
 *  se dispara mientras se lee la ficha, y sí en cuanto la pestaña se abandona. */
const IDLE_MS = 20000;

/** Cada cuánto el atractor enciende otra palabra. Cinco segundos y medio dan
 *  tiempo a leerla y a que la deriva enseñe el sitio desde otro ángulo. */
const DRIFT_MS = 5500;

/** Cuántos nodos se le pasan a la cámara para encuadrar un grupo. Es el
 *  `PATH_MAX` del motor WebGPU, que lee las posiciones de la GPU y no puede
 *  leer mil: recortar aquí, y no allí, es lo que hace que los dos motores
 *  encuadren **lo mismo** — el respaldo WebGL no tiene ese tope y sin esto
 *  enmarcaría un grupo más ancho que el otro con el mismo clic. */
const FRAME_MAX = 64;

/** Intervalo de sondeo al pasar el ratón. Cada consulta es un dispatch sobre
 *  50.000 nodos más el mapeo de un buffer, así que no puede ir por evento. */
const HOVER_MS = 90;

export default function GalaxyView({ lang: initial = "es", initialView }: { lang?: string; initialView?: 'landing' | 'app' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const engineRef = useRef<GpuEngine | null>(null);
  const deviceRef = useRef<GPUDevice | null>(null);
  const hoverAt = useRef(0);
  const hoverBusy = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  /** ¿Se ha leído ya el `?cmp=` de la URL? El efecto que la escribe corre en el
   *  mismo commit que el que la lee, y con la lista todavía vacía: sin esta
   *  bandera borraría el parámetro justo antes de que llegara a aplicarse. */
  const urlRead = useRef(false);

  // El idioma vive en la URL: enlaces compartibles y navegación atrás/adelante.
  const [lang, setLang] = useState(() => {
    return getStoredLang(initial as Lang);
  });
  const [g, setG] = useState<Galaxy | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  /** El camino que se está mirando, extremos incluidos. `null` con destino
   *  pedido es una respuesta legítima —la poda por kNN mutuo deja islas— y se
   *  cuenta por `error`, no dejando la ficha a medias. */
  const [path, setPath] = useState<number[] | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Params>({ ...DEFAULTS });
  const [fps, setFps] = useState(0);
  const [visible, setVisible] = useState({ nodes: 0, edges: 0, res: 1, lod: 1 });
  // null = aún sondeando. El motor se decide una vez y no cambia en caliente:
  // un canvas no puede tener contexto webgl y webgpu a la vez.
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fly'>('orbit');
  // El cajón izquierdo. Abierto de entrada: dentro está el buscador, que es la
  // única forma de llegar a una palabra concreta entre cincuenta mil. En mano
  // arranca plegado porque ahí tapa casi toda la galaxia — y con él tapada
  // quedaría la atribución, que no puede depender de un panel abierto.
  const [side, setSide] = useState(
    () => typeof window === "undefined" || window.innerWidth > 720,
  );
  /** El comparador, con su propia lista de palabras. Vive aquí y no dentro del
   *  panel porque la ficha también añade a ella («comparar esta palabra»), y
   *  porque al cambiar de idioma hay que vaciarla: los índices de nodo de una
   *  galaxia no significan nada en la otra. */
  const [cmp, setCmp] = useState(false);
  const [cmpIds, setCmpIds] = useState<number[]>([]);
  /** ¿Hay un grupo del comparador resaltado en la galaxia? No es lo mismo que
   *  tener palabras en la lista: la lista puede estar llena y la galaxia
   *  intacta. Se guarda porque el resalte de grupo no pasa por `sel` ni por
   *  `path`, así que sin esto nada sabría que queda algo que soltar. */
  const [lit, setLit] = useState(false);
  /** La presentación. Arranca abierta en la primera visita —y no sobre un
   *  enlace que ya apunta a algo— y se reabre desde el botón `?`. Se decide en
   *  el inicializador y no en un efecto: puesta después del primer pintado,
   *  aparecería de golpe encima de una galaxia ya dibujada. */
  const [intro, setIntro] = useState(() => introPending());
  /** La guía larga. No es lo mismo que la presentación y por eso es otro estado:
   *  la presentación son cuatro pantallas que se pasan de una vez y salen solas
   *  la primera visita; la guía son diez capítulos que **no salen nunca solos**
   *  y a los que se entra por un capítulo concreto. Guarda el capítulo, no un
   *  booleano: `null` es cerrada, y una cadena es «ábrete por aquí». */
  const [guide, setGuide] = useState<ChapterId | null>(null);
  const [view, setView] = useState<'landing' | 'app'>(() => {
    if (initialView) return initialView;
    if (typeof window === "undefined") return "landing";
    const q = new URLSearchParams(location.search);
    return q.get("w") || q.get("cmp") ? "app" : "landing";
  });
  /** Los tres paneles nuevos del cajón. Independientes y no un acordeón: la
   *  leyenda es lo que se deja abierto mientras se usa lo demás. */
  const [zonesOn, setZonesOn] = useState(false);
  const [patOn, setPatOn] = useState(false);
  const [anaOn, setAnaOn] = useState(false);
  const [controlsOn, setControlsOn] = useState(false);
  const [keysOn, setKeysOn] = useState(true);
  const [cardOpen, setCardOpen] = useState(true);
  /** Aviso de un instante: copiar el enlace no cambia nada en pantalla, así que
   *  sin esto no hay forma de saber si funcionó. */
  const [toast, setToast] = useState<string | null>(null);
  /** ¿Se ha movido la cámara de su encuadre? Es lo que decide si el botón de
   *  vista completa hace falta: un botón que siempre está es un botón que
   *  siempre estorba, y uno que aparece justo cuando uno se ha perdido se lee
   *  como la salida que es. */
  const [roamed, setRoamed] = useState(false);
  /** Los primeros gestos, sobre el lienzo.
   *
   *  La presentación cuenta los cuatro gestos una vez y se va; a partir de ahí
   *  el lienzo —que es el 90% de la pantalla y lo único que hay que tocar— no
   *  dice nada. Quien la saltó, quien vuelve una semana después o quien entró
   *  por un enlace compartido se queda delante de cincuenta mil puntos sin una
   *  sola instrucción, y el panel de arranque, que sí la lleva, está en el raíl
   *  derecho: no es donde miran los ojos.
   *
   *  Es una línea, no un tutorial. Dice **el gesto siguiente** y sólo ése:
   *  primero cómo abrir una palabra, y con una abierta, cómo soltarla — que es
   *  la mitad que nadie encuentra sola. Se retira **para siempre** en cuanto
   *  alguien completa el ciclo (coger y soltar), porque a partir de ahí ya no
   *  enseña nada y sólo tapa galaxia. Los dos textos ya existían en `COPY`
   *  (`hint`, `hintOut`) sin que nada los pintara.
   */
  const [coach, setCoach] = useState(coachPending);
  /** ¿Ha llegado a coger algo? Es lo que distingue «todavía no ha empezado» de
   *  «ya ha soltado», que son el mismo estado visto desde fuera —las manos
   *  vacías— y significan lo contrario. En una `ref` y no en el estado: no
   *  tiene que provocar pintado por sí sola. */
  const heldOnce = useRef(false);
  /** Modo inmersivo: pantalla completa del navegador **y** la interfaz fuera.
   *  Son dos cosas y van juntas a propósito: quitar la barra del navegador y
   *  dejar los paneles tapando un tercio del lienzo no es pantalla completa. */
  const [zen, setZen] = useState(false);
  /** Modo atractor: nadie toca nada desde hace rato. */
  const [attract, setAttract] = useState(() => {
    if (typeof window === "undefined") return false;
    const q = new URLSearchParams(location.search);
    return q.get("w") === null && q.get("cmp") === null;
  });
  /** La palabra que el atractor tiene encendida ahora mismo. */
  const [drift, setDrift] = useState<number | null>(null);
  /** El grupo encendido, para poder devolverlo a su sitio después de un resalte
   *  de paso de la leyenda. `lit` dice que hay algo; esto dice qué. */
  const groupRef = useRef<number[] | null>(null);
  /** Cuántas palabras tiene ese grupo. La píldora lo dice, y ya no puede sacar
   *  el número de la lista del comparador: ahora también encienden grupos la
   *  leyenda y las familias, y entonces contaba palabras que no eran ésas
   *  —«0 palabras resaltadas» con quinientas encendidas—. */
  const [litN, setLitN] = useState(0);
  const t = COPY[lang as keyof typeof COPY] ?? COPY.es;
  // El color de las aristas dice a qué zona pertenece cada palabra; la ficha
  // repite ese mismo color para que la relación sea legible sin adivinarla.
  const zones = useMemo(() => (g ? zoneColours(g) : null), [g]);
  // Índice de prefijos sin tildes. Se construye una vez por galaxia, junto a la
  // carga: ordenar 50.000 claves ya plegadas cuesta menos que el propio fetch.
  const index = useMemo(() => (g ? buildIndex(g) : null), [g]);
  /** El parecido típico entre vecinos de **esta** galaxia: la mediana de los
   *  pesos del CSR. La guía lo pinta en la regla del coseno, y sin él un 0,50
   *  no significa nada — es el mismo número que el comparador usa de línea de
   *  referencia, y por eso sale de la misma función y no de una copia. */
  const ref = useMemo(() => (g ? typical(g) : undefined), [g]);

  /** El ciclo del guía de primeros gestos: coger algo y volver a soltarlo.
   *  Al cerrarse, se retira para siempre. Mira `sel` y `lit` y no sólo `sel`
   *  porque un grupo resaltado —una región, una familia— también es algo que
   *  se tiene cogido, y también hay que saber soltarlo. */
  useEffect(() => {
    if (!coach) return;
    if (sel !== null || lit) { heldOnce.current = true; return; }
    if (heldOnce.current) { setCoach(false); coachDone(); }
  }, [coach, sel, lit]);
  // Fuera del `map`: recalcularlo por fila recorre el CSR del nodo otra vez.
  const road = useMemo(() => (g && path ? hops(g, path) : null), [g, path]);
  /** El lector de `vecs.bin`. Uno por galaxia: guarda una caché de vectores ya
   *  normalizados y los índices de nodo no sobreviven al cambio de idioma. */
  const vec = useMemo(
    () => (g ? new Vectors(`/data/${lang}`, g.meta.dims ?? 300, g.meta.nodes) : null),
    [g, lang],
  );

  const switchTo = useCallback((id: string) => {
    setLang(id as Lang);
    setStoredLang(id as Lang);
  }, []);

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(d => {
      if (dead) return;
      deviceRef.current = d;
      setGpu(!!d);
    });
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (view !== 'app') return;
    let dead = false;
    setG(null); setSel(null); setPath(null);
    setHover(null); setError(null); setCmpIds([]);
    loadGalaxy(`/data/${lang}`)
      .then(gal => { if (!dead) setG(gal); })
      .catch(e => { if (!dead) setError(String(e)); });
    return () => { dead = true; };
  }, [lang, view]);

  useEffect(() => {
    if (!g || gpu === null || !canvasRef.current) return;
    const device = deviceRef.current;
    if (gpu && device) {
      const e = new GpuEngine(device, canvasRef.current, g);
      Object.assign(e.params, params);
      e.setCameraMode?.(cameraMode);
      engineRef.current = e;
      viewerRef.current = e;
    } else {
      const s = new GalaxyScene(canvasRef.current, g);
      s.setCameraMode?.(cameraMode);
      engineRef.current = null;
      viewerRef.current = s;
    }
    return () => {
      viewerRef.current?.dispose();
      viewerRef.current = null;
      engineRef.current = null;
    };
    // params se aplica por referencia; no debe reconstruir el motor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, gpu]);

  useEffect(() => {
    viewerRef.current?.setCameraMode?.(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    if (!gpu) return;
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setFps(e.fps);
      setVisible({ ...e.visible });
    }, 400);
    return () => clearInterval(id);
  }, [gpu, g]);

  /** Único sitio donde cambia lo que se está mirando: una palabra (`b` nulo) o
   *  el camino de `a` a `b`. Las tres cosas que van juntas —resalte, cámara y
   *  URL— van juntas aquí, porque separarlas es como se desincronizan.
   *
   *  `focus` ya no sale de `engineRef` sino del visor: el respaldo WebGL
   *  también sabe volar, y colgarlo del motor WebGPU dejaba el vuelo muerto
   *  justo en el camino que se ve al abrir el navegador en esta máquina. */
  const show = useCallback((
    a: number | null,
    b: number | null,
    { fly = true, push = true }: { fly?: boolean; push?: boolean } = {},
  ) => {
    const v = viewerRef.current;
    setSel(a);
    if (a !== null) setCardOpen(true);
    setError(null);
    // Tanto `select` como `selectPath` reescriben el canal de resalte entero,
    // así que a partir de aquí el grupo del comparador ya no está encendido.
    setLit(false);
    groupRef.current = null;

    let p: number[] | null = null;
    if (g && a !== null && b !== null) p = shortestPath(g, a, b);
    setPath(p);

    if (p) {
      v?.selectPath(p);
      if (fly) void v?.focusPath?.(p);
    } else {
      // Seleccionar sin mover la cámara deja el resalte fuera de plano o
      // diminuto; el enfoque es parte del gesto, no un extra.
      v?.select(a);
      if (a !== null && fly) void v?.focus?.(a);
      if (g && a !== null && b !== null) setError(t.pathNone(g.labels[a], g.labels[b]));
    }

    if (push && g) {
      const u = new URL(location.href);
      const w = a === null ? null : g.labels[a];
      const to = p && b !== null ? g.labels[b] : null;
      if (w) u.searchParams.set("w", w); else u.searchParams.delete("w");
      if (to) u.searchParams.set("to", to); else u.searchParams.delete("to");
      // Una entrada de historial por palabra: «atrás» deshace el último salto,
      // que es lo que el gesto de ir saltando de vecino en vecino sugiere.
      if (u.href !== location.href) history.pushState(null, "", u);
    }
  }, [g, t]);

  const choose = useCallback(
    (id: number | null, fly = true) => show(id, null, { fly }),
    [show],
  );

  /** Lee `?w=` y `?to=` y los aplica sin volver a escribirlos. Es lo que hace
   *  que un enlace abra el atlas ya puesto en una palabra —el enganche que la
   *  fase de las lecciones necesita para decir «pincha aquí y mira»— y lo que
   *  da sentido al botón «atrás».
   *
   *  Pasa por `resolve`, no por igualdad de cadena: así un enlace escrito a
   *  mano y sin tildes sigue llegando a su palabra. */
  const applyUrl = useCallback(() => {
    if (!g || !index) return;
    const q = new URLSearchParams(location.search);

    // La comparación primero: es independiente de la palabra abierta, y el
    // panel tiene que estar puesto antes de que la ficha vuele la cámara.
    //
    // Si el enlace trae las dos cosas (`?w=` y `?cmp=`), manda el grupo: el
    // comparador enciende su selección al montarse, y es la más específica de
    // las dos —una lista que alguien compuso a mano frente a una palabra
    // suelta—. La ficha sigue abierta con su palabra, sólo que el resalte de la
    // galaxia es el del grupo.
    const list = (q.get("cmp") ?? "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean)
      .map(x => resolve(index, g, x))
      .filter(i => i >= 0)
      .slice(0, MAX_WORDS);
    // Sin `Set` la misma palabra escrita dos veces en el enlace daría dos
    // chips con la misma clave de React.
    const uniq = [...new Set(list)];
    setCmpIds(uniq);
    if (uniq.length) setCmp(true);
    urlRead.current = true;

    // El encuadre compartido. Se lee antes de abrir nada porque decide si la
    // ficha puede volar: un enlace que trae cámara dice **desde dónde** hay que
    // mirar, y el vuelo automático de la selección lo pisaría al aterrizar.
    const cam = decodeCam(q.get("cam"));

    const w = q.get("w");
    const a = w ? resolve(index, g, w) : -1;
    const to = q.get("to");
    const b = a >= 0 && to ? resolve(index, g, to) : -1;
    show(a < 0 ? null : a, b < 0 ? null : b, { push: false, fly: !cam });
    if (cam) {
      viewerRef.current?.setCameraState?.(cam);
      setRoamed(true);
    }
  }, [g, index, show]);

  // Al arrancar. Va *después* del efecto que construye el motor, así que
  // `viewerRef` ya apunta a algo cuando esto corre.
  useEffect(() => {
    if (!g || gpu === null) return;
    applyUrl();
    // Sólo al montar la galaxia: reaplicarlo en cada cambio de `show`
    // pisaría la selección que el usuario acaba de hacer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, gpu, index]);

  useEffect(() => {
    const back = () => {
      const l = new URLSearchParams(location.search).get("lang");
      if (l && l !== lang && LANGS.some(x => x.id === l)) { setLang(l as Lang); return; }
      applyUrl();
    };
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, [applyUrl, lang]);

  /** El aviso se borra solo. Un mensaje que se queda es un mensaje que hay que
   *  cerrar, y esto no merece un botón. */
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  /** Quién ha movido la cámara. El teclado de vuelo vive dentro de cada motor
   *  (`KeyFly`), así que aquí sólo se escucha para saber que ha pasado — no
   *  para mover nada. `Inicio` hace lo contrario: devuelve el encuadre, así que
   *  apaga el aviso igual que el botón. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing(e.target) || e.ctrlKey || e.metaKey) return;
      if (e.key === "Home") { setRoamed(false); return; }
      if (/^(Arrow|[wasdqeWASDQE]$|\+|-|Page)/.test(e.key)) setRoamed(true);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const v = viewerRef.current;
    if (!v) return;
    const now = performance.now();
    if (hoverBusy.current || now - hoverAt.current < HOVER_MS) return;
    hoverAt.current = now;
    hoverBusy.current = true;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    v.pick(x, y)
      .then(id => {
        v.hover?.(id);
        setHover(id === null ? null : { id, x, y });
      })
      .catch(() => setHover(null))
      .finally(() => { hoverBusy.current = false; });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerStartRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const dist = Math.hypot(dx, dy);
    pointerStartRef.current = null;

    // Si arrastramos la cámara para volar/orbitar (dist > 6 px),
    // cancelamos la selección de nodos para evitar clicks accidentales.
    if (dist > 6) return;
    if (e.button !== 0) return;

    const v = viewerRef.current;
    if (!v) return;
    const r = e.currentTarget.getBoundingClientRect();
    const id = await v.pick(e.clientX - r.left, e.clientY - r.top);
    // El clic en el vacío es **una salida más** —`hintOut` lo promete—, así que
    // pasa por `clear()` y no por `choose(null)`: éste apaga el resalte pero
    // deja el eje clavado donde lo dejó `focus`, y la galaxia se queda girando
    // alrededor de la última palabra. Es el mismo estado a medias que arreglaba
    // `Esc`, y la regla es que todas las salidas hagan lo mismo.
    //
    // Con las manos vacías el clic no hace nada: mover la cámara sola al pinchar
    // en el hueco sería un gesto que nadie ha pedido.
    if (id === null) {
      if (sel !== null || path || lit) clear();
      return;
    }
    choose(id);
  };

  const applyParams = useCallback((patch: Partial<Params>) => {
    setParams(p => {
      const next = { ...p, ...patch };
      if (engineRef.current) {
        Object.assign(engineRef.current.params, next);
        // La galaxia puede estar en reposo: sin esto el cambio no se vería
        // hasta que algo más forzara un frame.
        engineRef.current.invalidate();
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.reset();
    applyParams({ ...DEFAULTS });
  }, [applyParams]);

  const goHome = useCallback(() => {
    viewerRef.current?.goHome?.();
    setRoamed(false);
  }, []);

  /** El enlace a lo que hay ahora en pantalla, **con el encuadre dentro**.
   *
   *  La palabra ya viajaba (`?w=`), pero no el sitio desde el que se la mira, y
   *  en una nube de 50.000 puntos el encuadre es la mitad del mensaje: «mira
   *  este puente entre dos barrios» no es una palabra, es una vista. Se escribe
   *  además en la barra de direcciones, para que el enlace sea el que se ve.
   */
  const shareView = useCallback(async () => {
    const u = new URL(location.href);
    const cam = viewerRef.current?.cameraState?.();
    if (cam) u.searchParams.set("cam", encodeCam(cam));
    history.replaceState(null, "", u);
    try {
      await navigator.clipboard.writeText(u.href);
      setToast(t.shareOk);
    } catch {
      // Sin HTTPS (o sin permiso) el portapapeles no existe. La URL ya está en
      // la barra, así que la salida es copiarla de ahí y eso es lo que se dice.
      setToast(t.shareNo);
    }
  }, [t]);

  /** La comparación, en la URL. Es la misma idea que `?w=` y `?to=`: un enlace
   *  que abre el atlas ya puesto en lo que se quiere enseñar. «Mira lo que se
   *  parecen éstas cinco» no se puede decir de otra forma sin pedirle a quien
   *  lee que las teclee una a una.
   *
   *  Va por `replaceState` y no por `pushState`: quitar y poner palabras es un
   *  ajuste, no un salto, y cada tecleo dejaría una entrada de historial que
   *  haría del botón «atrás» un deshacer letra a letra. */
  useEffect(() => {
    if (!g || !urlRead.current) return;
    const u = new URL(location.href);
    const val = cmpIds.map(i => g.labels[i]).join(",");
    if (val) u.searchParams.set("cmp", val); else u.searchParams.delete("cmp");
    if (u.href !== location.href) history.replaceState(null, "", u);
  }, [g, cmpIds]);

  /** Soltar lo que se esté mirando: la palabra, el camino o el grupo. Es un
   *  solo gesto para las tres cosas porque desde fuera son la misma —«quiero la
   *  galaxia entera otra vez»— y tener que adivinar cuál está activa para saber
   *  qué botón vale es justo lo que hacía que nadie encontrase la salida.
   *
   *  Y soltar **deshace también el vuelo**, no sólo el resalte: enfocar deja el
   *  centro de la órbita clavado en la palabra, así que al apagar el resalte la
   *  galaxia seguía girando alrededor de un punto cualquiera de un brazo. Eso
   *  no se lee como «he vuelto atrás», se lee como que el atlas se ha torcido.
   *  Es el mismo `goHome()` del botón de vista completa: el eje vuelve al
   *  centro que fijó `frame()`. */
  /** Entrar y salir del modo inmersivo.
   *
   *  El estado es nuestro y la pantalla completa del navegador es un extra que
   *  puede fallar: hay navegadores y contextos (un iframe sin `allowfullscreen`,
   *  un permiso denegado) donde `requestFullscreen` rechaza. Si se atara el modo
   *  a que la API funcione, el botón no haría nada en esos sitios; así, como
   *  mínimo, la interfaz se aparta y queda la galaxia. */
  const toggleZen = useCallback(() => {
    const on = !zen;
    setZen(on);
    try {
      if (on && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (!on && document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {});
      }
    } catch { /* sin pantalla completa nos quedamos con el modo, que es lo gordo */ }
  }, [zen]);

  /** Salir de la pantalla completa por fuera —`Esc`, `F11`, el gesto del
   *  sistema— tiene que apagar también el modo, o la interfaz se quedaría
   *  escondida dentro de una ventana normal y sin nada que la explique. */
  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) setZen(false); };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  /** `F` lo enciende y lo apaga. Va aquí y no en `KeyFly` por lo mismo que
   *  `Escape`: no es una tecla de cámara, y `KeyFly` hay una por motor. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      toggleZen();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [toggleZen]);

  const clear = useCallback(() => {
    if (lit) { viewerRef.current?.select(null); setLit(false); }
    groupRef.current = null;
    show(null, null);
    goHome();
  }, [lit, show, goHome]);

  /** `Escape` suelta la selección.
   *
   *  Va aquí y no en `KeyFly` a propósito: `KeyFly` se instancia **una vez por
   *  motor** —`gpu/camera.ts` y `scene.ts` tienen la suya— y esto no es una
   *  tecla de cámara sino de selección, que vive en este componente. Colgarla
   *  de uno de los dos la habría dejado muerta en el otro, que es el camino que
   *  se ve al abrir el navegador en Linux sin la bandera de WebGPU.
   *
   *  El filtro de foco es el mismo que usa el teclado de vuelo: dentro del
   *  buscador, `Escape` cierra el desplegable y no toca la galaxia. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.ctrlKey || e.metaKey || typing(e.target)) return;
      // El modo inmersivo sale primero: es la capa de encima, y quien pulsa
      // `Esc` con la interfaz escondida quiere la interfaz, no soltar la
      // palabra. (Con pantalla completa de verdad, el navegador se come esta
      // tecla y `fullscreenchange` hace el resto — esta rama es para cuando la
      // pantalla completa no llegó a concederse.)
      if (zen) { e.preventDefault(); toggleZen(); return; }
      if (sel === null && !path && !lit) return;
      e.preventDefault();
      clear();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [sel, path, lit, clear, zen, toggleZen]);

  /** Las palabras que el atractor y el dado pueden sacar: frecuentes y sin
   *  vacías. Una sola pasada por los 50.000 al cargar la galaxia. */
  const pool = useMemo(() => (g ? common(g) : []), [g]);

  /** ¿Puede la galaxia ponerse a girar sola? Sólo con las manos vacías: con una
   *  palabra abierta, un camino o la presentación delante, moverle la cámara a
   *  alguien es quitarle de la vista justo lo que estaba mirando. */
  const canAttract = sel === null && !path && !lit && !intro;

  /** El reloj del reposo. Cualquier gesto —ratón, rueda o tecla— lo pone a cero
   *  y apaga la deriva; veinte segundos de silencio la encienden.
   *
   *  El rearme va limitado (`400 ms`): el ratón dispara sesenta eventos por
   *  segundo y sesenta `setTimeout` por segundo no hacen falta para saber que
   *  alguien está ahí. */
  useEffect(() => {
    if (!g || !canAttract) { setAttract(false); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAttract(true), IDLE_MS);
    };
    const wake = () => {
      setAttract(false);
      const now = performance.now();
      if (now - last < 400) return;
      last = now;
      arm();
    };
    const opts = { passive: true } as const;
    addEventListener("pointerdown", wake, opts);
    addEventListener("pointermove", wake, opts);
    addEventListener("wheel", wake, opts);
    addEventListener("keydown", wake);
    arm();
    return () => {
      if (timer) clearTimeout(timer);
      removeEventListener("pointerdown", wake);
      removeEventListener("pointermove", wake);
      removeEventListener("wheel", wake);
      removeEventListener("keydown", wake);
    };
  }, [g, canAttract]);

  /** El atractor en sí: la galaxia deriva y se va encendiendo una palabra tras
   *  otra.
   *
   *  Las dos mitades hacen falta. Sólo la deriva es un salvapantallas —bonito y
   *  mudo—; sólo los destellos, con la cámara clavada, no enseñan la nube. Y no
   *  pasa por `show`: no hay ficha, no hay URL y no hay vuelo, porque esto no
   *  es una selección — es el atlas pasando páginas mientras nadie mira. Por
   *  eso también se suelta solo, sin `Esc` y sin botón.
   *
   *  El visor se relee del ref al limpiar: si lo que apagó la deriva fue un
   *  cambio de idioma, el motor de la galaxia anterior ya está destruido y
   *  escribirle un buffer es un error en consola. */
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !g || !pool.length) return;
    v.setAttract?.(attract);
    if (!attract) { setDrift(null); return; }
    const flash = () => {
      const id = pool[(Math.random() * pool.length) | 0];
      setDrift(id);
      // `spotlight` y no `selectPath`: el reparto normal atenúa las otras
      // 49.999 a 0,08 y deja la pantalla casi negra — que es justo lo que un
      // atractor no puede hacer, porque la nebulosa *es* el cartel.
      viewerRef.current?.spotlight?.(id);
    };
    flash();
    const id = setInterval(flash, DRIFT_MS);
    return () => {
      clearInterval(id);
      viewerRef.current?.setAttract?.(false);
      viewerRef.current?.select(null);
      setDrift(null);
    };
  }, [attract, g, pool]);

  /** El grupo del comparador, resaltado en la galaxia. No pasa por `show`
   *  porque no es una selección ni un camino entre dos: es la unión de varios,
   *  y la URL no sabría decirla en un `?w=` y un `?to=`. */
  const showGroup = useCallback((nodes: number[], frame?: number[]) => {
    if (!nodes.length) return;
    setSel(null);
    setPath(null);
    const v = viewerRef.current;
    v?.selectPath(nodes);
    // El resalte va sobre el grupo entero; el encuadre, sobre una muestra. Una
    // región tiene miembros sueltos lejísimos y enmarcar sobre el más lejano
    // deja el barrio como un punto en el centro — la misma razón por la que el
    // encuadre inicial usa el percentil 95 y no la esfera envolvente.
    void v?.focusPath?.((frame ?? nodes).slice(0, FRAME_MAX));
    groupRef.current = nodes;
    setLitN(nodes.length);
    setLit(true);
    setRoamed(true);
  }, []);

  /** Resalte de paso de la leyenda: enciende una región **sin mover la cámara**
   *  y devuelve las cosas a su sitio al salir.
   *
   *  No pasa por `show` porque no cambia lo que se está mirando: es una lupa
   *  sobre el mapa, no una selección. Y restaurar no es «apagar»: si había un
   *  grupo, un camino o una palabra, vuelve eso — apagar sin más convertiría
   *  pasar el ratón por la leyenda en una forma de perder la selección. */
  const previewGroup = useCallback((nodes: number[] | null) => {
    const v = viewerRef.current;
    if (!v) return;
    if (nodes) { v.selectPath(nodes); return; }
    if (groupRef.current) v.selectPath(groupRef.current);
    else if (path) v.selectPath(path);
    else v.select(sel);
  }, [path, sel]);

  /** Añadir a la comparación desde la ficha. Abre el cajón además del panel:
   *  añadir una palabra a una lista que no se ve no parece que haya hecho nada. */
  const addToCompare = useCallback((id: number) => {
    setCmpIds(prev =>
      prev.includes(id) || prev.length >= MAX_WORDS ? prev : [...prev, id]);
    setCmp(true);
    setSide(true);
  }, []);

  const fmt = (n: number) => n.toLocaleString(lang === "en" ? "en" : "es");

  /** ¿Está puesta la píldora de vista completa? Se calcula una vez porque hay
   *  dos cosas que dependen de ella: la propia píldora y el guía de primeros
   *  gestos, que comparte con ella el centro del borde de abajo y tiene que
   *  apartarse. Duplicar la condición era garantizar que se solaparan en cuanto
   *  una de las dos cambiase. */
  const homeShown = !!(g && (roamed || sel !== null || lit || path));

  /** Abrir la guía por un capítulo. Cierra la presentación si estaba puesta:
   *  dos cuadros modales a la vez es un cuadro modal que no se puede cerrar. */
  const openGuide = useCallback((at: ChapterId) => {
    setIntro(false);
    setGuide(at);
  }, []);

  /** El «por qué» de un pie, listo para pasárselo a un panel. */
  const why = useCallback(
    (at: ChapterId) => ({ t: t.why, go: () => openGuide(at) }),
    [t.why, openGuide],
  );

  return (
    <div className={"shell galaxy-root" + (side ? " side-open" : "") + (cmp ? " cmp-open" : "") +
                    (zen ? " zen" : "") + (view === 'landing' ? " in-landing" : " in-app")}>
      <canvas
        ref={canvasRef}
        className={"galaxy-canvas" + (hover ? " over" : "")}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onMouseMove={onMove}
        onMouseLeave={() => {
          viewerRef.current?.hover?.(null);
          setHover(null);
          pointerStartRef.current = null;
        }}
      />

      {/* El vacío. Va *encima* del canvas y no debajo: el contexto se configura
          con `alphaMode: "opaque"` y el borrado pinta todos los píxeles, así que
          nada puesto detrás llegaría a verse. Y va en CSS y no en un shader
          porque un degradado a pantalla completa es una pasada más sobre 0,92
          Mpx dentro del presupuesto de frame, mientras que aquí es una capa
          estática que el compositor ya iba a mezclar de todos modos. */}
      <div className="veil" aria-hidden="true" />

      {view === 'app' ? (
        <>
          {/* La salida, donde se está mirando.
          Antes la única forma visible de soltar era un «×» de 11 px en la
          esquina de un panel del raíl derecho — y con un grupo del comparador
          resaltado no había ficha, así que no había ningún botón en absoluto.
          Esta píldora dice **qué** se tiene cogido y **cómo** soltarlo, en el
          borde superior, que es la única banda del lienzo que no usa nada. */}
      {g && (sel !== null || lit) && (
        <div className="held">
          <span className="held-w">
            {path && path.length > 1
              ? t.heldPath(g.labels[path[0]], g.labels[path[path.length - 1]])
              : sel !== null
                ? t.held(g.labels[sel])
                : t.heldGroup(litN)}
          </span>
          <button onClick={clear}>{t.drop} <kbd>{t.esc}</kbd></button>
        </div>
      )}

      {hover && g && (
        <span className="tip" style={{ left: hover.x, top: hover.y }}>
          {g.labels[hover.id]}
        </span>
      )}

      {/* El guía de primeros gestos. Una línea, abajo, sin marco y sin ratón:
          no es un mando, es un rótulo. Dice el gesto **siguiente** —abrir una
          palabra, o soltarla— y desaparece para siempre en cuanto alguien
          completa el ciclo. Se calla ante cualquier cosa que ya esté hablando:
          el modo inmersivo, la presentación, la guía, la deriva del atractor y
          el aviso de un instante. Y sube un escalón cuando la píldora de vista
          completa ocupa su sitio: las dos viven abajo en el centro. */}
      {coach && g && !zen && !intro && !guide && !attract && !toast && (
        <p className={"coach" + (homeShown ? " coach-up" : "")} aria-live="polite">
          {sel !== null || lit ? t.hintOut : t.hint}
        </p>
      )}

      {/* La vuelta al encuadre completo, con el nombre escrito.
          El icono de la barra existe desde siempre y aun así perderse era el
          estado más fácil de alcanzar del atlas: un icono de 15 px en una tira
          de cinco no se lee como «volver». Esta píldora **sólo aparece cuando
          hace falta** —cuando la cámara ya no está en su sitio o hay algo
          cogido— y por eso se puede permitir ser grande y decir la palabra. */}
      {homeShown && (
        <button className="go-home" onClick={goHome}>
          <IcoFit />
          <span>{t.whole}</span>
          <kbd>{t.homeKey}</kbd>
        </button>
      )}

      {/* El atlas en reposo, pasando páginas. El pie dice cómo recuperarlo,
          aunque cualquier gesto ya lo hace: es un cartel, no un mando — de ahí
          `pointer-events: none`, que además deja orbitar por encima de él. */}
      {attract && g && (
        <div className="drift" aria-live="off">
          <span className="drift-w">{drift === null ? "" : g.labels[drift]}</span>
          <span className="drift-n">{t.idle} · {t.idleOut}</span>
        </div>
      )}

      {/* La salida del modo inmersivo. Con la tira de herramientas escondida es
          el **único** mando a la vista, así que no puede esconderse ni esperar
          a que alguien mueva el ratón: se queda arriba a la derecha, tenue, y
          dice además las dos teclas. Un modo del que no se ve cómo salir es la
          forma más rápida de que alguien cierre la pestaña. */}
      {zen && (
        <button className="zen-exit" onClick={toggleZen} title={t.zenNote}>
          <IcoShrink />
          <span>{t.zenOut}</span>
          <kbd>esc</kbd>
        </button>
      )}

      {toast && <p className="toast" role="status">{toast}</p>}

      {/* Cajón izquierdo. La pestaña vive *fuera* del cuerpo, en la misma fila
          flex: al plegar se desplaza todo el bloque justo el ancho del cuerpo,
          así que la pestaña aterriza en el borde y no hay que animar dos cosas
          por separado ni recortar contenido a medio reflujo. */}
      <aside className="side">
        {/* Barra de accesos. Va fuera del cuerpo y con `flex-wrap`: al plegarse
            el cajón, la misma fila se reparte en columna y queda como tira
            vertical en el borde. Un estado menos que animar, y el botón de
            desplegar no necesita ser un trasto aparte. */}
        <div className="tools" role="toolbar" aria-label={t.tools}>
          <button
            className="tool tool-side"
            onClick={() => setSide(o => !o)}
            aria-expanded={side}
            aria-label={side ? t.close : t.open}
            title={side ? t.close : t.open}
          >
            <IcoChevron open={side} />
          </button>
          {/* Vista completa, en blanco pleno como la flecha del cajón y no al 42%
              como los modos: no anuncia un estado, es la salida de emergencia
              del encuadre, y la salida se tiene que ver. Su forma grande está
              en la píldora del lienzo, que aparece en cuanto uno se aleja. */}
          <button
            className="tool tool-home"
            onClick={goHome}
            aria-label={t.whole}
            title={`${t.whole} · ${t.homeKey}`}
          >
            <IcoFit />
          </button>
          {!side && gpu && g && (
            <button
              className={"tool" + (controlsOn ? " on" : "")}
              onClick={() => {
                setControlsOn(o => {
                  const next = !o;
                  if (next) setSide(true);
                  return next;
                });
              }}
              aria-expanded={controlsOn}
              aria-label={t.sim}
              title={t.sim}
            >
              <IcoControls />
            </button>
          )}
          {!side && g && (
            <>
              <button
                className={"tool" + (cameraMode === 'orbit' ? " on" : "")}
                onClick={() => setCameraMode('orbit')}
                aria-pressed={cameraMode === 'orbit'}
                aria-label={t.navOrbit}
                title={t.navOrbit}
              >
                <IcoOrbit />
              </button>
              <button
                className={"tool" + (cameraMode === 'fly' ? " on" : "")}
                onClick={() => setCameraMode('fly')}
                aria-pressed={cameraMode === 'fly'}
                aria-label={t.navFly}
                title={t.navFly}
              >
                <IcoFly />
              </button>
              <button
                className="tool"
                onClick={() => setIntro(true)}
                aria-label={t.guide}
                title={t.guide}
              >
                <IcoHelp />
              </button>
            </>
          )}
          {/* Pantalla completa. Última de la tira, que es donde la busca todo el
              mundo, y con estado (`aria-pressed`) porque es un modo. */}
          <button
            className={"tool" + (zen ? " on" : "")}
            onClick={toggleZen}
            aria-pressed={zen}
            aria-label={t.zen}
            title={`${t.zen} · F`}
          >
            {zen ? <IcoShrink /> : <IcoExpand />}
          </button>
          {/* Compartir la vista. Va con los mandos de cámara y no en el cuerpo
              del cajón porque lo que copia **es** la cámara: la palabra ya
              viajaba sin él. */}
          <button
            className="tool"
            onClick={shareView}
            aria-label={t.share}
            title={t.share}
          >
            <IcoShare />
          </button>
        </div>

        <div className="side-body">
          <a
            href="/"
            className="side-back-btn"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              width: "100%",
              background: "rgba(242, 239, 233, 0.05)",
              border: "1px solid rgba(242, 239, 233, 0.12)",
              borderRadius: "9px",
              color: "var(--ink-2)",
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0.48rem",
              textDecoration: "none",
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s, color 0.15s"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(242, 239, 233, 0.1)";
              e.currentTarget.style.color = "var(--ink)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(242, 239, 233, 0.05)";
              e.currentTarget.style.color = "var(--ink-2)";
            }}
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Volver a Inicio</span>
          </a>
          {/* El botón ancho del cajón abre la **guía**, no la presentación: es
              el único sitio con espacio para escribir la palabra, y la
              presentación ya tiene su `?` en la tira de al lado. Antes los dos
              llevaban al mismo cuadro, así que la guía no tenía puerta. */}
          <button
            className="guide-btn"
            onClick={() => openGuide("nums")}
            aria-label={t.guideLong}
            title={t.guideLong}
          >
            <IcoHelp />
            <span>{t.guideLong}</span>
          </button>
          <div className="langs" role="group">
            {LANGS.map(l => (
              <button
                key={l.id}
                className={l.id === lang ? "on" : ""}
                onClick={() => switchTo(l.id)}
                aria-pressed={l.id === lang}
              >
                {l.name}
              </button>
            ))}
          </div>
          {g && index && (
            <WordSearch
              g={g}
              index={index}
              placeholder={t.search}
              zoneCss={zones?.css}
              onPick={id => choose(id)}
              onMiss={q => setError(t.missing(q, g.meta.nodes))}
            />
          )}
          {/* La entrada al comparador, pegada al buscador.
              Estaba arriba, en la tira de iconos de navegación —órbita, vuelo,
              vista completa—, que son mandos de cámara: un icono de comparar
              entre ellos no se leía como «escribir palabras». Aquí cuelga del
              sitio donde ya se está escribiendo, que es de donde nace el
              gesto. */}
          {g && (
            <button
              className={"cmp-tab" + (cmp ? " on" : "")}
              onClick={() => setCmp(o => !o)}
              aria-expanded={cmp}
            >
              <IcoCompare />
              <span className="cmp-tab-w">{t.compare}</span>
              {cmpIds.length > 0 && (
                <span className="cmp-n">{cmpIds.length}/{MAX_WORDS}</span>
              )}
              <span className="cmp-caret"><IcoChevron open={!cmp} /></span>
            </button>
          )}
          {cmp && g && index && vec && zones && (
            <Compare
              g={g}
              index={index}
              vec={vec}
              zoneCss={zones.css}
              t={t.cmp}
              why={why("dims")}
              ids={cmpIds}
              onIds={setCmpIds}
              onWord={id => choose(id)}
              onPair={(a, b) => show(a, b)}
              onGroup={showGroup}
            />
          )}
          {/* La leyenda del color, las familias y las analogías. Van bajo el
              buscador y en este orden: la primera explica lo que ya se está
              viendo, la segunda enseña a preguntar por un grupo, y la tercera
              es la única que cuesta una descarga. */}
          {g && zones && (
            <Legend
              g={g}
              zoneCss={zones.css}
              t={t.zones}
              why={why("colour")}
              open={zonesOn}
              onOpen={setZonesOn}
              onPick={(members, frame) => showGroup(members, frame)}
              onPreview={previewGroup}
            />
          )}
          {g && index && zones && (
            <Pattern
              g={g}
              index={index}
              zoneCss={zones.css}
              t={t.pat}
              why={why("where")}
              open={patOn}
              onOpen={setPatOn}
              onMatch={ids => showGroup(ids)}
              onClear={clear}
            />
          )}
          {g && index && zones && vec && (
            <Analogy
              g={g}
              index={index}
              vec={vec}
              zoneCss={zones.css}
              t={t.ana}
              why={why("math")}
              open={anaOn}
              onOpen={setAnaOn}
              onWord={id => choose(id)}
            />
          )}
          {error && <p className="err">{error}</p>}
          {!g && !error && <p className="stat">{t.loading}</p>}
          {g && (
            <>
              <hr className="side-sep" />
              {gpu && (
                <>
                  <button
                    className={"cmp-tab" + (controlsOn ? " on" : "")}
                    onClick={() => setControlsOn(o => !o)}
                    aria-expanded={controlsOn}
                  >
                    <IcoControls />
                    <span className="cmp-tab-w">{t.sim}</span>
                    <span className="cmp-n">{fps.toFixed(0)}</span>
                    <span className="cmp-caret"><IcoChevron open={!controlsOn} /></span>
                  </button>
                  {controlsOn && (
                    <div className="ctl-panel">
                      <Controls
                        params={params}
                        onChange={applyParams}
                        onReset={reset}
                        fps={fps}
                        visible={visible}
                        total={{ nodes: g.meta.nodes, edges: g.meta.edges }}
                      />
                    </div>
                  )}
                </>
              )}
              <button
                className={"cmp-tab" + (cameraMode === 'orbit' ? " on" : "")}
                onClick={() => setCameraMode('orbit')}
                aria-pressed={cameraMode === 'orbit'}
              >
                <IcoOrbit />
                <span className="cmp-tab-w">{t.navOrbit}</span>
              </button>
              <button
                className={"cmp-tab" + (cameraMode === 'fly' ? " on" : "")}
                onClick={() => setCameraMode('fly')}
                aria-pressed={cameraMode === 'fly'}
              >
                <IcoFly />
                <span className="cmp-tab-w">{t.navFly}</span>
              </button>
              <button
                className={"cmp-tab" + (keysOn ? " on" : "")}
                onClick={() => setKeysOn(o => !o)}
                aria-expanded={keysOn}
              >
                <IcoKeys />
                <span className="cmp-tab-w">{t.keys}</span>
                <span className="cmp-caret"><IcoChevron open={!keysOn} /></span>
              </button>
              {keysOn && (
                <div className="ctl-panel">
                  <KeyHelp lang={lang} mode={cameraMode} />
                </div>
              )}
            </>
          )}
        </div>
      </aside>
      {/* Raíl derecho: teclas. */}
      <div className="rail rail-r">
        {/* Con las manos vacías, el hueco de la ficha no se queda en blanco:
            ofrece las tres formas de entrar. Sin esto la primera pantalla del
            atlas —y, tras `Esc`, todas las demás— no proponía ningún gesto. */}
        {g && index && zones && sel === null && !lit && (
          <Start
            g={g}
            index={index}
            pool={pool}
            zoneCss={zones.css}
            t={t.start}
            onWord={id => choose(id)}
            onPath={(a, b) => show(a, b)}
            onGuide={() => openGuide("nums")}
          />
        )}
        {sel !== null && g && (
          <aside className={"card" + (cardOpen ? " card-open" : "")}>
            <button
              className="card-toggle"
              onClick={() => setCardOpen(o => !o)}
              aria-expanded={cardOpen}
              aria-label={cardOpen ? t.close : t.open}
              title={cardOpen ? t.close : t.open}
            >
              <IcoChevron open={!cardOpen} />
            </button>
            <header className="card-head">
              <p className="kicker">
                {/* El punto de zona es el único color que queda en la ficha, y no
                    es decoración: es la misma tinta que la palabra tiene en la
                    malla, la única leyenda del mapa. */}
                <i className="swatch" style={{ background: zones?.css(g.community[sel]) }} />
                {t.region} {g.community[sel]} · {t.freq} #{g.rank[sel] + 1}
                {g.flags[sel] ? ` · ${t.stop}` : ""}
              </p>
              <span className="card-acts">
                <button
                  className="card-add"
                  onClick={() => addToCompare(sel)}
                  disabled={cmpIds.includes(sel) || cmpIds.length >= MAX_WORDS}
                  aria-label={t.addTo}
                  title={t.addTo}
                >
                  <IcoCompare />
                </button>
                {/* Cerrar con la palabra escrita y la tecla al lado. Antes era
                    un «×» de 11 px sin etiqueta: la única salida visible del
                    panel, y se confundía con un adorno del borde. */}
                <button className="card-x" onClick={clear} aria-label={t.shut}>
                  {t.shut} <kbd>{t.esc}</kbd>
                </button>
              </span>
            </header>

            <h2 className="card-title">{g.labels[sel]}</h2>

            {/* Camino hasta otra palabra. Va aquí y no en el cajón porque
                siempre parte de la palabra abierta: es una pregunta sobre
                *ésta*, no una búsqueda más. */}
            <p className="kicker rule">{t.pathHead}</p>
            {index && (
              <WordSearch
                g={g}
                index={index}
                small
                placeholder={t.pathTo}
                zoneCss={zones?.css}
                onPick={id => show(sel, id)}
                onMiss={q => setError(t.missing(q, g.meta.nodes))}
              />
            )}
            {path && path.length > 1 && (
              <>
                <ol className="road">
                  {path.map((id, i) => (
                    <li key={`${id}-${i}`}>
                      <button onClick={() => choose(id)}>
                        <i className="swatch" style={{ background: zones?.css(g.community[id]) }} />
                        <span className="w">{g.labels[id]}</span>
                        {/* La similitud del salto que *llega* a esta palabra:
                            es coseno en 300D, el mismo número que la lista de
                            vecinos, no una distancia medida en la galaxia. */}
                        <span className="s">
                          {i === 0 ? "" : road?.[i - 1].toFixed(2)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="stat hint">
                  {t.steps(path.length - 1)}
                  {" · "}
                  <button className="link" onClick={() => choose(sel)}>{t.pathBack}</button>
                </p>
              </>
            )}

            <p className="kicker rule">{t.nbrs}</p>
            <ol className="nbrs">
              {neighbours(g, sel).map(n => (
                <li key={n.id}>
                  <button onClick={() => choose(n.id)}>
                    {/* El punto delata al vecino que vive en otra zona: es el que
                        tiende un puente fuera del barrio. */}
                    <i className="swatch" style={{ background: zones?.css(g.community[n.id]) }} />
                    <span className="w">{g.labels[n.id]}</span>
                    <span className="s">{n.w.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ol>
            {/* El pie de la ficha es el que más falta hace de los cinco: es el
                único sitio donde se explica qué es el 0,72 que hay al lado de
                cada vecino, y hasta ahora se explicaba sin poder ampliarse. */}
            <Foot why={why("cos")}>{t.foot}</Foot>
          </aside>
        )}
      </div>

      <GpuRoomLoader 
        roomName={lang === "es" ? "GALAXIA VECTORIAL" : "VECTOR GALAXY"} 
      />

      {intro && (
        <Welcome
          lang={lang}
          onClose={() => setIntro(false)}
          onGuide={() => openGuide("nums")}
        />
      )}

      {/* La guía larga. Nunca sale sola: se entra por el botón del cajón, por
          el panel de arranque, por el pie de cualquier panel y por la última
          pantalla de la presentación. Las dos se conocen —`onIntro` vuelve a la
          presentación— porque son la versión corta y la larga de lo mismo, y
          quien llega a una por error tiene que poder cruzar a la otra. */}
      {guide && (
        <Guide
          lang={lang}
          near={ref}
          at={guide}
          onClose={() => setGuide(null)}
          onIntro={() => { setGuide(null); setIntro(true); }}
        />
      )}

      {/* CC BY-SA 3.0 exige atribución: es el único requisito legal del proyecto */}
      <p className="attrib">
        vectores{" "}
        <a href="https://fasttext.cc/docs/en/crawl-vectors.html">fastText</a>{" "}
        · Facebook Research · CC BY-SA 3.0
      </p>
        </>
      ) : (
        <LandingPage onExplore={() => setView('app')} />
      )}
    </div>
  );
}
