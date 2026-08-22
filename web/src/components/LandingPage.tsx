import { useState, useEffect, useRef } from "react";

/* La silueta de la portada no se genera: se calca.
 *
 * Está muestreada de la referencia (48 columnas x 30 filas, celda de 12,6 px
 * sobre un lienzo de 605x379). Un generador procedural —seno + dither, que es
 * lo que había antes— nunca da *esta* silueta, y la silueta es el diseño: la
 * masa clara arriba a la izquierda que sostiene el titular, la lengua oscura
 * que baja por el centro y la isla clara de abajo a la derecha donde vive el
 * párrafo. Cada bloque de texto está posicionado en porcentaje sobre esa
 * misma proporción, así que mover un carácter de la máscara mueve el suelo
 * bajo el texto.
 *
 * '1' = claro, '0' = oscuro. */
const MASK = [
  "111111111111111111110001111111111111111111111111",
  "111111111111111111111011111111111111111111111111",
  "111111111111111111111111111111111111111111111111",
  "111111111111111111111111111111111111111111111111",
  "111111111111111111111111111111111111111111111111",
  "111111111111111111101111111111111111111111011111",
  "111111111111111111110111111111111111001110011101",
  "111111111111111111111111111111111111000000010100",
  "111111111111111111111111111111111111100000101000",
  "111111111111111111111111111111111111100001000000",
  "111111111111111111111111111111011111100000110000",
  "111111111111111111111101111111100111000000010000",
  "111111111111111111111001000000000000000000000000",
  "111111111111111111111100100000000000000000000000",
  "111111111111111111111001010000000000000000000000",
  "111111111111111111101000000000000000000000000000",
  "111111111100001111110000000000000000000000000000",
  "101111111100101000000000000000000000000000000000",
  "110010110000010000000000000000000000000001000000",
  "000000010000100000000000000000000000000000100000",
  "000000010000000000000000000000000000000000110101",
  "000000100000000000000000000000000000000001101011",
  "000000000000000000000000000000000000100011110111",
  "000000000000000000000000000000000000011111111111",
  "000000000000000000000010000000000011111111111111",
  "000000000000000000000001000000100111111111111111",
  "000000000000000000000101001001010111111111111111",
  "000000000000000000000010100110001111111111111111",
  "000000000000000000000000010010101111111111111111",
  "000000000000000000000000010001001111111111111111",
];

const COLS = MASK[0].length; // 48
const ROWS = MASK.length; // 30

interface Cell {
  light: boolean;
  /** Vecinos oscuros (8-vecindad). Sólo se pinta en celdas claras y > 0. */
  n: number;
  /** Punto del recorrido (en alturas de ventana) en el que la celda se apaga.
   *  Sólo lo llevan las celdas de la costura de escritorio. */
  t?: number;
}

/** Vecinos oscuros de una celda clara, sobre una rejilla cualquiera. Fuera de
 *  la rejilla cuenta como oscuro sólo por abajo y por los lados: por arriba lo
 *  decide quien llama, pasando la fila anterior dentro de `rows`. */
function neighbours(rows: string[], r: number, c: number): number {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nc < 0 || nc >= COLS) continue;
      if (nr < 0 || nr >= rows.length) {
        n++; // el vacío es oscuro
        continue;
      }
      if (rows[nr][nc] === "0") n++;
    }
  }
  return n;
}

/* Los números son los del buscaminas: cuántas celdas oscuras toca una clara.
 * No es decoración arbitraria — es lo que hace legible el borde dithered, y
 * es también lo que la referencia dibuja: los dígitos se apagan solos en
 * cuanto te alejas de la frontera, sin necesidad de una máscara aparte. */
function buildCells(): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const light = MASK[r][c] === "1";
      out.push({ light, n: light ? neighbours(MASK, r, c) : 0 });
    }
  }
  return out;
}

const CELLS = buildCells();

/* ---------------------------------------------------------------- costura */

/** Ruido determinista. No `Math.random()`: la costura se recalcula en cada
 *  render y con azar vivo el borde parpadearía al montar el componente. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SEAM_ROWS = 7;

/* La costura es el borde inferior de la portada **erosionándose**.
 *
 * El problema del corte anterior era de material: la portada son dos masas
 * planas de píxeles y debajo empezaba, de golpe, una página web normal con
 * tarjetas redondeadas. La línea entre las dos decía «aquí se acaba el
 * diseño». Ahora no hay línea: la última fila de la máscara sigue bajando y se
 * va comiendo a sí misma hasta que sólo queda el oscuro, que es el fondo del
 * índice de salas. La misma rejilla, la misma celda, los mismos dígitos.
 *
 * Tres detalles la sostienen, y los tres se ven al desactivarlos:
 *
 * - es **monótona** (`prev`): una celda que muere no vuelve. Calculando la
 *   probabilidad contra la fila original salían islas encendiéndose otra vez
 *   en mitad del degradado, y el borde dejaba de leerse como una sola masa
 *   que se deshace;
 * - `keep` es `S(r)/S(r−1)` sobre una supervivencia **lineal**, así que la
 *   última fila queda vacía por construcción y no por suerte. Con una
 *   fracción constante la supervivencia es geométrica: al cuarto renglón
 *   quedaba el 6% y las tres últimas filas eran negro liso;
 * - la probabilidad se pondera por la **densidad local** (`d`, cuántas de las
 *   tres celdas de encima están encendidas), que es lo que convierte esto en
 *   erosión y no en ruido: la masa se come por los bordes y los píxeles
 *   sueltos del dithering de la silueta mueren en la primera fila. Sin eso
 *   una mota aislada sobrevivía cinco renglones seguidos y dejaba un hilo
 *   vertical de un píxel que se lee como un fallo de render, no como polvo. */
function buildSeam(seed: string): string[] {
  const rows: string[] = [];
  let prev = seed;
  for (let r = 0; r < SEAM_ROWS; r++) {
    const keep = (SEAM_ROWS - 1 - r) / (SEAM_ROWS - r);
    let s = "";
    for (let c = 0; c < COLS; c++) {
      const d =
        (prev[c - 1] === "1" ? 1 : 0) +
        (prev[c] === "1" ? 1 : 0) +
        (prev[c + 1] === "1" ? 1 : 0);
      s += prev[c] === "1" && hash(r, c) < keep * (0.55 + 0.225 * (d - 1)) ? "1" : "0";
    }
    rows.push(s);
    prev = s;
  }
  return rows;
}

/* La erosión no se detiene al llegar al último renglón: **sigue mientras te
 * vas**. Cada celda de la costura lleva su `--t`, el punto del recorrido en el
 * que le toca apagarse, y el CSS compara ese umbral contra `--p` —la posición
 * de scroll medida en alturas de ventana—. El resultado es que el pie del
 * cuadro se come a sí mismo mientras sube, y por debajo aparece el índice.
 *
 * La ventana **no sale de la geometría, sale del material**. El primer reparto
 * fue de 0,08 a 0,60 por dónde cae cada fila en pantalla, y estaba mal: las
 * dos últimas filas del dibujo ya están vacías —son el final de la erosión
 * espacial— así que el último tercio del recorrido no tenía nada que apagar y
 * la costura se quedaba hecha desde el 40% en adelante. Con 0,06 a 0,44 los
 * umbrales se reparten sobre las filas que de verdad llevan celdas, y el
 * deshilachado se acaba justo cuando el índice empieza a montarse (el
 * observador dispara sobre el 41%), sin un hueco muerto entre las dos cosas.
 *
 * Lo que **no** se toca son las últimas filas del cuadro: el borde inferior de
 * la silueta es la isla clara donde vive la nota, así que deshilacharlo es
 * disolver el suelo bajo un párrafo que todavía se está leyendo. El cuadro se
 * queda con su canto recto y se va con él, que es lo que hace un cuadro.
 *
 * Las filas de abajo mueren después que las de arriba (`r`) y el ruido
 * (`hash`) desordena el frente dentro de cada fila, que es lo que impide que
 * se lea como una persiana bajando. */
const EROD_P0 = 0.06;
const EROD_P1 = 0.44;

/** La costura, con la fila que tiene encima delante del array: los dígitos de
 *  la primera fila cuentan así los vecinos que de verdad tienen arriba.
 *
 *  `erode` sólo lo pide la costura de escritorio: la de móvil vive en una
 *  página de flujo normal, donde `100vh` no dice dónde está, así que ahí el
 *  umbral no se puede calcular y el borde se queda quieto. */
function seamCells(seed: string, erode: boolean): Cell[] {
  const rows = buildSeam(seed);
  const ctx = [seed, ...rows];
  return rows.flatMap((row, r) =>
    [...row].map((ch, c) => ({
      light: ch === "1",
      n: ch === "1" ? neighbours(ctx, r + 1, c) : 0,
      t: erode
        ? EROD_P0 + (EROD_P1 - EROD_P0) * ((r + hash(r + 31, c)) / SEAM_ROWS)
        : undefined,
    })),
  );
}

/** Dos costuras porque hay dos bordes que coser. En pantalla ancha, encima
 *  está la silueta y la erosión arranca de su última fila. Por debajo de 820
 *  px la rejilla de la portada no se dibuja —el fondo es claro y plano— así
 *  que arrancar de la silueta dejaría medio borde oscuro sin nada oscuro
 *  encima; ahí la erosión empieza con la fila entera encendida. */
const SEAM_CELLS = seamCells(MASK[ROWS - 1], true);
const SEAM_FLAT_CELLS = seamCells("1".repeat(COLS), false);

/* ------------------------------------------------------------------ glifos con motion algorítmico */

function NebulaMotionGlyph({ isHovered }: { isHovered: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 60);
    }, isHovered ? 60 : 120);
    return () => clearInterval(timer);
  }, [isHovered]);

  const grid: number[][] = Array.from({ length: 8 }, () => Array(10).fill(0));
  const t = tick * 0.105;

  // Núcleo gravitacional central con micro-pulsación
  grid[3][4] = 1; grid[3][5] = 1;
  grid[4][4] = 1; grid[4][5] = 1;
  if (Math.sin(t * 2) > 0.3) {
    grid[2][4] = 1; grid[5][5] = 1;
  }

  // 3 partículas en trayectorias armónicas de atracción
  const p1x = Math.round(4.5 + Math.cos(t * 1.2) * 3.2);
  const p1y = Math.round(3.5 + Math.sin(t * 1.2) * 2.1);
  if (p1y >= 0 && p1y < 8 && p1x >= 0 && p1x < 10) grid[p1y][p1x] = 1;

  const p2x = Math.round(4.5 + Math.cos(t * 0.9 + 2.2) * 3.6);
  const p2y = Math.round(3.5 + Math.sin(t * 1.5 + 2.2) * 2.5);
  if (p2y >= 0 && p2y < 8 && p2x >= 0 && p2x < 10) grid[p2y][p2x] = 1;

  const p3x = Math.round(4.5 + Math.cos(t * 1.6 + 4.1) * 2.5);
  const p3y = Math.round(3.5 + Math.sin(t * 0.8 + 4.1) * 2.8);
  if (p3y >= 0 && p3y < 8 && p3x >= 0 && p3x < 10) grid[p3y][p3x] = 1;

  // Aristas de grafo que se conectan cuando dos partículas se acercan
  const dist12 = Math.hypot(p1x - p2x, p1y - p2y);
  if (dist12 <= 3.5) {
    const mx = Math.round((p1x + p2x) / 2);
    const my = Math.round((p1y + p2y) / 2);
    if (my >= 0 && my < 8 && mx >= 0 && mx < 10) grid[my][mx] = 1;
  }

  const dist23 = Math.hypot(p2x - p3x, p2y - p3y);
  if (dist23 <= 3.5) {
    const mx = Math.round((p2x + p3x) / 2);
    const my = Math.round((p2y + p3y) / 2);
    if (my >= 0 && my < 8 && mx >= 0 && mx < 10) grid[my][mx] = 1;
  }

  return (
    <div className="landing-glyph" aria-hidden="true">
      {grid.flatMap((row, r) =>
        row.map((on, c) => (
          <span key={`${r}-${c}`} className={on ? "gp gp-on" : "gp"} />
        )),
      )}
    </div>
  );
}

function DescentMotionGlyph({ isHovered }: { isHovered: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 24);
    }, isHovered ? 70 : 130);
    return () => clearInterval(timer);
  }, [isHovered]);

  const grid: number[][] = Array.from({ length: 8 }, () => Array(10).fill(0));

  // Relieve de contorno del cañón / valle parabólico
  grid[0][0] = 1; grid[0][9] = 1;
  grid[1][0] = 1; grid[1][9] = 1;
  grid[2][1] = 1; grid[2][8] = 1;
  grid[3][1] = 1; grid[3][8] = 1;
  grid[4][2] = 1; grid[4][7] = 1;
  grid[5][2] = 1; grid[5][7] = 1;
  grid[6][3] = 1; grid[6][4] = 1; grid[6][5] = 1; grid[6][6] = 1;
  grid[7][4] = 1; grid[7][5] = 1;

  // Partícula 1 cayendo por el gradiente con aceleración e inercia
  const progress = (tick % 12) / 11;
  const easeY = Math.min(7, Math.floor(progress * progress * 7.9));
  let easeX = 0;
  if (easeY <= 1) easeX = 0;
  else if (easeY <= 3) easeX = 1;
  else if (easeY <= 5) easeX = 2;
  else if (easeY === 6) easeX = 3;
  else easeX = (tick % 2 === 0) ? 4 : 5;

  grid[easeY][easeX] = 1;

  // En hover o en la segunda mitad del ciclo, cae un segundo caminante por el lado opuesto
  if (isHovered || tick >= 6) {
    const p2Progress = ((tick + 6) % 12) / 11;
    const w2Y = Math.min(7, Math.floor(p2Progress * p2Progress * 7.9));
    let w2X = 9;
    if (w2Y <= 1) w2X = 9;
    else if (w2Y <= 3) w2X = 8;
    else if (w2Y <= 5) w2X = 7;
    else if (w2Y === 6) w2X = 6;
    else w2X = (tick % 2 === 0) ? 5 : 4;
    grid[w2Y][w2X] = 1;
  }

  return (
    <div className="landing-glyph" aria-hidden="true">
      {grid.flatMap((row, r) =>
        row.map((on, c) => (
          <span key={`${r}-${c}`} className={on ? "gp gp-on" : "gp"} />
        )),
      )}
    </div>
  );
}

function SomMotionGlyph({ isHovered }: { isHovered: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 36);
    }, isHovered ? 60 : 120);
    return () => clearInterval(timer);
  }, [isHovered]);

  const grid: number[][] = Array.from({ length: 8 }, () => Array(10).fill(0));
  const t = (tick / 36) * Math.PI * 2;

  // Hoja topológica que respira y se pliega armónicamente
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 10; c++) {
      const dx = (c - 4.5) / 4.5;
      const dy = (r - 3.5) / 3.5;
      const rDist = Math.sqrt(dx * dx + dy * dy);
      
      // Onda elástica 2D
      const wave = Math.sin(rDist * 4.2 - t) + Math.cos(dx * 3.0 + t * 0.8) * 0.5;
      const threshold = isHovered ? 0.35 : 0.28;
      
      if (Math.abs(wave) < threshold) {
        grid[r][c] = 1;
      }
    }
  }

  return (
    <div className="landing-glyph" aria-hidden="true">
      {grid.flatMap((row, r) =>
        row.map((on, c) => (
          <span key={`${r}-${c}`} className={on ? "gp gp-on" : "gp"} />
        )),
      )}
    </div>
  );
}

function RoomGlyph({ name, isHovered }: { name: "nebula" | "descent" | "som"; isHovered: boolean }) {
  if (name === "nebula") return <NebulaMotionGlyph isHovered={isHovered} />;
  if (name === "descent") return <DescentMotionGlyph isHovered={isHovered} />;
  return <SomMotionGlyph isHovered={isHovered} />;
}

interface Room {
  id: string;
  glyph: "nebula" | "descent" | "som";
  previewImg?: string;
  previewAlt?: string;
  status: string;
  title: string;
  desc: string;
  href: string;
  action: string;
  intercept?: boolean;
}

const ROOMS: Room[] = [
  {
    id: "01",
    glyph: "nebula",
    previewImg: "/previews/nebula-en.png",
    previewAlt: "Embedding Nebula (50,000 words in 3D, English graph)",
    status: "Open",
    title: "Embedding Nebula",
    desc:
      "50,000 words placed in 3D by simulating springs over their nearest-neighbor graph — not by dimension reduction. Color is neighborhood; every similarity you read is measured back in the original 300 dimensions.",
    href: "/embedding-nebula",
    action: "Enter the galaxy",
  },
  {
    id: "02",
    glyph: "descent",
    previewImg: "/previews/descent.png",
    previewAlt: "Gradient Descent (Rosenbrock surface & 40,000 GPU walkers)",
    status: "Open",
    title: "Gradient Descent",
    desc:
      "Ten thousand walkers dropped at once onto the Rosenbrock surface. They fall onto the parabola within ten steps and then spend four thousand crawling along it — which is the whole trouble with a ravine.",
    href: "/gradient-descent",
    action: "Run the descent",
  },
  {
    id: "03",
    glyph: "som",
    previewImg: "/previews/som.png",
    previewAlt: "Self-Organizing Maps (3D neural topological sheet adaptation)",
    status: "Open",
    title: "Self-Organizing Maps",
    desc:
      "A 3D grid of neural nodes stretching and folding in real-time to fit a 3D point cloud. You can choose different target shapes (spheres, toruses, double helices, Lorenz attractors) and watch the topological sheet adapt using WebGPU compute shaders.",
    href: "/self-organizing-maps",
    action: "Run the map",
  },
];

/* ------------------------------------------------------------------ rejilla de fondo de salas */

/* Topografía de masas claras y oscuras para la segunda sección.
 * Silueta arquitectónica minimalista que continúa la estética del Hero:
 * - Campo oscuro limpio en la parte superior continuando la costura erosionada.
 * - Descenso diagonal con dithering orgánico y números de vecindad (.gnum)
 *   que aterriza en una masa sólida en la parte inferior derecha para anclar el pie.
 * - Elimina por completo las manchas fragmentadas laterales ("manchas de vaca"). */
const ROOMS_MASK = [
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000000000",
  "000000000000000000000000000000000000000000010001",
  "000000000000000000000000000000000000000001110111",
  "000000000000000000000000000000000000001001111111",
  "000000000000000000000000000000000000011111111111",
  "000000000000000000000000000000000010111111111111",
  "000000000000000000000000000000000111111111111111",
  "000000000000000000000000000000010111111111111111",
  "000000000000000000000000000001111111111111111111",
  "000000000000000000000000001011111111111111111111",
  "000000000000000000000000011111111111111111111111",
  "000000000000000000000010011111111111111111111111",
  "000000000000000000000111111111111111111111111111",
  "000000000000000000010111111111111111111111111111",
  "000000000000000000111111111111111111111111111111",
];

const ROOMS_ROWS = ROOMS_MASK.length;

function buildRoomsBgCells(): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < ROOMS_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const light = ROOMS_MASK[r][c] === "1";
      out.push({ light, n: light ? neighbours(ROOMS_MASK, r, c) : 0 });
    }
  }
  return out;
}

const ROOMS_BG_CELLS = buildRoomsBgCells();

interface LandingPageProps {
  onExplore: () => void;
}

export default function LandingPage({ onExplore }: LandingPageProps) {
  const [transitioning, setTransitioning] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  
  // Rejilla de salas reactiva con física de píxeles
  const [roomsGrid, setRoomsGrid] = useState<Cell[]>(ROOMS_BG_CELLS);
  
  const glowRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const roomsRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const glow = useRef({ near: 0 });

  // Efecto pixel: alternar bit de celda al hacer clic y recalcular vecindad
  const handleCellClick = (idx: number) => {
    setRoomsGrid((prev) => {
      const next = [...prev];
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      const newLight = !next[idx].light;
      
      // Actualizar celda pulsada
      next[idx] = { ...next[idx], light: newLight };

      // Recalcular vecindad de la celda y sus 8 vecinos
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < ROOMS_ROWS && nc >= 0 && nc < COLS) {
            const nIdx = nr * COLS + nc;
            if (next[nIdx].light) {
              let count = 0;
              for (let ddr = -1; ddr <= 1; ddr++) {
                for (let ddc = -1; ddc <= 1; ddc++) {
                  if (ddr === 0 && ddc === 0) continue;
                  const nnr = nr + ddr;
                  const nnc = nc + ddc;
                  if (nnc < 0 || nnc >= COLS || nnr < 0 || nnr >= ROOMS_ROWS) {
                    count++;
                  } else if (!next[nnr * COLS + nnc].light) {
                    count++;
                  }
                }
              }
              next[nIdx] = { ...next[nIdx], n: count };
            }
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let last = -1;
    const apply = () => {
      raf = 0;
      const h = window.innerHeight || 1;
      const q = Math.round((el.scrollTop / h) * 64) / 64;
      if (q === last) return;
      last = q;
      el.style.setProperty("--p", String(q));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const goToRooms = () => {
    roomsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = glowRef.current;
      if (!g) return;
      g.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      glow.current.near = 1;
      g.style.opacity = "1";
    };
    const leave = () => {
      glow.current.near = 0;
      if (glowRef.current) glowRef.current.style.opacity = "0";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
    };
  }, []);

  const handleExploreClick = () => {
    setTransitioning(true);
    setTimeout(onExplore, 600);
  };

  return (
    <div ref={rootRef} className={`landing-overlay ${transitioning ? "transitioning" : ""}`}>
      {/* Rejilla de píxeles de la portada */}
      <div
        className="landing-grid-bg"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {CELLS.map((cell, idx) => (
          <div key={idx} className={cell.light ? "gcell gcell-l" : "gcell gcell-d"}>
            {cell.n > 0 && <span className="gnum">{cell.n}</span>}
          </div>
        ))}
      </div>

      <div ref={glowRef} className="landing-glow" aria-hidden="true" />

      <div className="landing-overlay-ui">
        <a className="landing-brand" href="#" onClick={(e) => { e.preventDefault(); handleExploreClick(); }}>
          <svg className="landing-brand-mark" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M0 2h5v3H2v3H0V2zm11 0h5v6h-2V5h-3V2zM2 8h3v3H2V8zm9 0h3v3h-3V8zM5 5h6v3H5V5zm0 6h6v3H5v-3zm2 3h2v2H7v-2z"
            />
          </svg>
          <span className="landing-brand-name">
            Atlas
            <br />
            Vectorial
          </span>
        </a>

        <nav className="landing-nav">
          <a href="/embedding-nebula" className="landing-nav-item" onClick={(e) => { e.preventDefault(); handleExploreClick(); }}>
            Enter
          </a>
          <a
            className="landing-nav-item"
            href="https://claude.ai/code/artifact/bb9b0833-4b78-4972-b79e-8bdda5e7b858"
            target="_blank"
            rel="noopener noreferrer"
          >
            Algorithm
          </a>
          <a
            className="landing-nav-item"
            href="https://github.com/Jhongdlp/embed"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
          </a>
        </nav>

        <h1 className="landing-title">
          words
          <br />
          have
          <br />
          gravity.
        </h1>

        <div className="landing-ml">
          <p className="landing-ml-tag">Deep learning, made navigable</p>
          <p className="landing-ml-eq">king − man + woman ≈ queen</p>
          <p className="landing-ml-foot">
            cosine 0.72 across 300 dimensions · nobody wrote that rule
          </p>
        </div>

        <div className="landing-note">
          <p>
            50,000 words placed by simulating physical forces on their
            nearest-neighbor graph, not by dimension reduction.
          </p>
          <p className="landing-attrib">fastText Crawl Vectors · CC BY-SA 3.0</p>
        </div>

        <button className="landing-scroll-indicator" onClick={goToRooms} aria-label="Scroll down to rooms">
          <span>Scroll</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* ---------------------------------------------------------------
          EL ÍNDICE DE SALAS: MISMO MATERIAL, MINIMALISMO Y CUADRADOS
          --------------------------------------------------------------- */}
      <section className="landing-rooms" ref={roomsRef}>
        {/* Costura de erosión continua */}
        {([["landing-seam", SEAM_CELLS], ["landing-seam-flat", SEAM_FLAT_CELLS]] as const).map(
          ([cls, cells]) => (
            <div
              key={cls}
              className={`landing-seam-grid ${cls}`}
              style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
              aria-hidden="true"
            >
              {cells.map((cell, idx) => (
                <div
                  key={idx}
                  className={cell.light ? "gcell gcell-l" : "gcell gcell-d"}
                  style={cell.t === undefined ? undefined : ({ "--t": cell.t } as React.CSSProperties)}
                >
                  {cell.n > 0 && <span className="gnum">{cell.n}</span>}
                </div>
              ))}
            </div>
          ),
        )}

        {/* Rejilla de cuadrados interactiva en el fondo de las salas */}
        <div
          className="landing-rooms-grid-bg"
          style={{
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROOMS_ROWS}, 1fr)`,
          }}
          aria-hidden="true"
        >
          {roomsGrid.map((cell, idx) => (
            <div
              key={idx}
              className={`gcell ${cell.light ? "gcell-l" : "gcell-d"} gcell-interactive`}
              onClick={() => handleCellClick(idx)}
            >
              {cell.n > 0 && <span className="gnum">{cell.n}</span>}
            </div>
          ))}
        </div>

        <div className="landing-rooms-inner" ref={innerRef}>
          <header className="landing-rooms-head">
            <div className="landing-rooms-head-main">
              <h2 className="landing-rooms-title">
                algorithms you can
                <br />
                walk through.
              </h2>
              <p className="landing-rooms-lead">
                Each room turns one idea out of machine learning into a place instead of a
                diagram. Nothing here is pre-rendered: the forces, the vectors and the
                descent all run on your own GPU while you look at them.
              </p>
            </div>

            <div className="landing-pipeline-plate" aria-hidden="true">
              <img
                src="/pipeline-architecture.png"
                alt="Tensor Decomposition & 3D Latent Projections"
                className="pipeline-image"
                loading="lazy"
              />
            </div>
          </header>

          <ol className="landing-room-list" role="list">
            {ROOMS.map((room) => {
              const isHovered = hoveredRoom === room.id;
              const inner = (
                <>
                  <div className="landing-room-top">
                    <span className="landing-room-id">{room.id}</span>
                    <span className="landing-room-status">
                      <i className="dot-on" />
                      {room.status}
                    </span>
                  </div>
                  {room.previewImg && (
                    <div className="landing-room-thumb-wrap">
                      <img
                        src={room.previewImg}
                        alt={room.previewAlt || room.title}
                        className="landing-room-thumb"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="landing-room-heading">
                    <RoomGlyph name={room.glyph} isHovered={isHovered} />
                    <h3 className="landing-room-title">{room.title}</h3>
                  </div>
                  <p className="landing-room-desc">{room.desc}</p>
                  <div className="landing-room-action">
                    <span>{room.action}</span>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                         stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </>
              );

              return (
                <li key={room.id}>
                  <a
                    className="landing-room"
                    href={room.href}
                    onMouseEnter={() => setHoveredRoom(room.id)}
                    onMouseLeave={() => setHoveredRoom(null)}
                    onClick={
                      room.intercept
                        ? (e) => {
                            e.preventDefault();
                            handleExploreClick();
                          }
                        : undefined
                    }
                  >
                    {inner}
                  </a>
                </li>
              );
            })}
          </ol>

          <footer className="landing-rooms-foot">
            <span>fastText Crawl Vectors · CC BY-SA 3.0</span>
            <span className="landing-rooms-links">
              <a href="https://github.com/Jhongdlp/embed" target="_blank" rel="noopener noreferrer">
                Source
              </a>
              <a
                href="https://claude.ai/code/artifact/bb9b0833-4b78-4972-b79e-8bdda5e7b858"
                target="_blank"
                rel="noopener noreferrer"
              >
                Technical plan
              </a>
            </span>
          </footer>
        </div>
      </section>
    </div>
  );
}


