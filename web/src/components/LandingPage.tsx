import { useState, useEffect, useRef } from "react";
import { useAtlasLang } from "../i18n";
import { LANDING_COPY } from "../i18n/landing";
import Header from "./Header";

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

function HnswMotionGlyph({ isHovered }: { isHovered: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 28);
    }, isHovered ? 60 : 120);
    return () => clearInterval(timer);
  }, [isHovered]);

  const grid: number[][] = Array.from({ length: 8 }, () => Array(10).fill(0));

  // 3 capas horizontales estratificadas (L2 en fila 1, L1 en fila 4, L0 en fila 7)
  for (let c = 1; c < 9; c += 2) {
    grid[1][c] = 1; // Capa superior (pocos nodos)
  }
  for (let c = 1; c < 9; c++) {
    if (c % 2 === 1 || c === 4) grid[4][c] = 1; // Capa media
  }
  for (let c = 0; c < 10; c++) {
    grid[7][c] = 1; // Capa base densa
  }

  // Trayectoria de la búsqueda voraz por fases
  if (tick < 7) {
    // Fase 1: En capa superior (salto rápido)
    const col = Math.min(8, 2 + Math.floor((tick / 7) * 6));
    grid[0][col] = 1;
    grid[1][col] = 1;
  } else if (tick < 14) {
    // Fase 2: Descenso a capa 1 y salto voraz
    const col = Math.max(2, 7 - Math.floor(((tick - 7) / 7) * 4));
    grid[3][col] = 1;
    grid[4][col] = 1;
  } else if (tick < 21) {
    // Fase 3: Descenso a capa base L0
    const col = Math.min(6, 3 + Math.floor(((tick - 14) / 7) * 3));
    grid[6][col] = 1;
    grid[7][col] = 1;
  } else {
    // Fase 4: Pulso de éxito en los vecinos más cercanos
    grid[7][5] = 1;
    grid[7][6] = 1;
    grid[6][5] = (tick % 2 === 0) ? 1 : 0;
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

function MctsMotionGlyph({ isHovered }: { isHovered: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 24);
    }, isHovered ? 60 : 120);
    return () => clearInterval(timer);
  }, [isHovered]);

  const grid: number[][] = Array.from({ length: 8 }, () => Array(10).fill(0));

  // Raíz en la cúspide
  grid[0][4] = 1; grid[0][5] = 1;

  // Ramificación nivel 1
  grid[1][4] = 1; grid[1][5] = 1;
  grid[2][2] = 1; grid[2][4] = 1; grid[2][7] = 1;

  // Ramificación nivel 2
  grid[3][2] = 1; grid[3][7] = 1;
  grid[4][1] = 1; grid[4][3] = 1; grid[4][6] = 1; grid[4][8] = 1;

  // Hojas nivel 3
  grid[5][1] = 1; grid[5][3] = 1; grid[5][6] = 1; grid[5][8] = 1;
  grid[6][0] = 1; grid[6][3] = 1; grid[6][6] = 1; grid[6][9] = 1;
  grid[7][0] = 1; grid[7][3] = 1; grid[7][6] = 1; grid[7][9] = 1;

  // Pulso de retropropagación y Vía Dorada animada
  const step = tick % 12;
  if (step < 4) {
    // Selección descendente
    if (step === 0) { grid[0][4] = 1; grid[0][5] = 1; }
    else if (step === 1) { grid[2][4] = 1; }
    else if (step === 2) { grid[4][3] = 1; }
    else { grid[7][3] = 1; }
  } else if (step < 8) {
    // Retropropagación ascendente
    const up = 7 - (step - 4) * 2;
    if (up >= 0 && up < 8) grid[up][3] = 1;
  } else {
    // Vía Dorada brillante
    grid[0][4] = 1; grid[2][4] = 1; grid[4][3] = 1; grid[7][3] = 1;
    if (tick % 2 === 0) { grid[7][2] = 1; grid[7][4] = 1; }
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

function KmeansMotionGlyph({ isHovered }: { isHovered: boolean }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => (t + 1) % 24);
    }, isHovered ? 60 : 120);
    return () => clearInterval(timer);
  }, [isHovered]);

  const grid: number[][] = Array.from({ length: 8 }, () => Array(10).fill(0));

  // Cluster 1 (Superior Izquierdo)
  grid[0][1] = 1; grid[0][2] = 1;
  grid[1][0] = 1; grid[1][3] = 1;
  grid[2][1] = 1; grid[2][2] = 1;

  // Cluster 2 (Superior Derecho)
  grid[0][7] = 1; grid[0][8] = 1;
  grid[1][6] = 1; grid[1][9] = 1;
  grid[2][7] = 1; grid[2][8] = 1;

  // Cluster 3 (Inferior Central)
  grid[5][4] = 1; grid[5][5] = 1;
  grid[6][3] = 1; grid[6][6] = 1;
  grid[7][4] = 1; grid[7][5] = 1;

  // Centroides gravitacionales oscilando hacia sus centros
  const cStep = tick % 12;
  if (cStep < 6) {
    // Fase de movimiento de centroides
    grid[1][1] = 1;
    grid[1][8] = 1;
    grid[6][4] = 1;
  } else {
    // Centroides alineados en el centro de masa
    grid[1][2] = 1;
    grid[1][7] = 1;
    grid[6][5] = 1;
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

function RoomGlyph({ name, isHovered }: { name: "nebula" | "descent" | "som" | "hnsw" | "mcts" | "kmeans"; isHovered: boolean }) {
  if (name === "nebula") return <NebulaMotionGlyph isHovered={isHovered} />;
  if (name === "descent") return <DescentMotionGlyph isHovered={isHovered} />;
  if (name === "som") return <SomMotionGlyph isHovered={isHovered} />;
  if (name === "hnsw") return <HnswMotionGlyph isHovered={isHovered} />;
  if (name === "mcts") return <MctsMotionGlyph isHovered={isHovered} />;
  return <KmeansMotionGlyph isHovered={isHovered} />;
}



/* ------------------------------------------------------------------ rejilla de fondo de salas */

interface LandingPageProps {
  onExplore: () => void;
}

export default function LandingPage({ onExplore }: LandingPageProps) {
  const [lang, setLang] = useAtlasLang();
  const t = LANDING_COPY[lang];
  const [transitioning, setTransitioning] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  
  const glowRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const roomsRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const glow = useRef({ near: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let last = -1;
    const apply = () => {
      raf = 0;
      const h = window.innerHeight || 1;
      const st = el.scrollTop;
      const q = Math.round((st / h) * 64) / 64;
      if (q !== last) {
        last = q;
        el.style.setProperty("--p", String(q));
      }
      setIsScrolled(st > 24);
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

  const goToTop = () => {
    rootRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
      {/* Header Sticky de alto nivel */}
      <Header
        lang={lang}
        onLangChange={setLang}
        onGoToTop={goToTop}
        isScrolled={isScrolled}
      />

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
        <h1 className="landing-title">
          {t.titleLine1}
          <br />
          {t.titleLine2}
          <br />
          {t.titleLine3}
        </h1>

        <div className="landing-ml">
          <p className="landing-ml-tag">{t.mlTag}</p>
          <p className="landing-ml-eq">{t.mlEq}</p>
          <p className="landing-ml-foot">{t.mlFoot}</p>
        </div>

        <div className="landing-note">
          <p>{t.noteText}</p>
          <p className="landing-attrib">{t.noteAttrib}</p>
        </div>

        <button className="landing-scroll-indicator" onClick={goToRooms} aria-label={t.scrollLabel}>
          <span>{t.scrollLabel}</span>
          <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor" aria-hidden="true">
            <path d="M0 2h10v2H8v2H6v2H4V6H2V4H0V2z" />
          </svg>
        </button>
      </div>

      {/* ---------------------------------------------------------------
          EL ÍNDICE DE SALAS: MISMO MATERIAL, MINIMALISMO Y CUADRADOS
          --------------------------------------------------------------- */}
      <section className="landing-rooms" ref={roomsRef}>
        {/* Línea de cuadrados blancos separadora */}
        <div className="landing-pixel-separator" aria-hidden="true">
          {Array.from({ length: COLS }).map((_, i) => (
            <span key={i} className="pixel-sep-cell" />
          ))}
        </div>

        <div className="landing-rooms-inner" ref={innerRef}>
          <header className="landing-rooms-head">
            <div className="landing-rooms-head-main">
              <h2 className="landing-rooms-title">
                {t.roomsTitle1}
                <br />
                {t.roomsTitle2}
              </h2>
              <p className="landing-rooms-lead">
                {t.roomsLead}
              </p>
            </div>
          </header>

          <ol className="landing-room-list" role="list">
            {t.rooms.map((room) => {
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
            <span>{t.footerAttrib}</span>
            <span className="landing-rooms-links">
              <a href="https://github.com/Jhongdlp/embed" target="_blank" rel="noopener noreferrer">
                {t.footerSource}
              </a>
              <a
                href="https://claude.ai/code/artifact/bb9b0833-4b78-4972-b79e-8bdda5e7b858"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.footerPlan}
              </a>
            </span>
          </footer>
        </div>
      </section>
    </div>
  );
}


