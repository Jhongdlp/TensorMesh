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

/* ------------------------------------------------------------------ salas */

/* El emblema de cada sala se dibuja con la misma celda que la portada, no con
 * un icono de trazo: un pictograma de línea fina al lado de una rejilla de
 * píxeles se lee como venido de otro sitio. Diez por ocho es el tamaño en el
 * que un dibujo de píxeles todavía dice algo — con 8x8 el valle de la segunda
 * sala se convierte en una uve genérica.
 *
 * Y no son ilustraciones: cada uno enseña lo que la sala hace. Un cúmulo con
 * cuatro rezagados (el grafo podado deja islas), un valle con dos caminantes
 * ya en el fondo, y ruido sin forma para la que no existe. */
const GLYPHS: Record<string, string[]> = {
  nebula: [
    "0010000100",
    "0001110000",
    "0011111000",
    "0111111100",
    "0011111010",
    "1001110000",
    "0010001000",
    "0000100000",
  ],
  descent: [
    "1000000001",
    "1000000001",
    "0100000010",
    "0100000010",
    "0010000100",
    "0011001100",
    "0000110000",
    "0000110000",
  ],
  noise: [
    "0010000100",
    "0000100000",
    "1000000010",
    "0001000000",
    "0000001000",
    "0100000001",
    "0000010000",
    "0010000000",
  ],
};

function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  const rows = GLYPHS[name];
  return (
    <div className="landing-glyph" aria-hidden="true">
      {rows.flatMap((row, r) =>
        [...row].map((ch, c) => (
          <span key={`${r}-${c}`} className={ch === "1" ? "gp gp-on" : "gp"} />
        )),
      )}
    </div>
  );
}

interface Room {
  id: string;
  glyph: keyof typeof GLYPHS;
  status: string;
  title: string;
  desc: string;
  /** Sin `href` la sala no existe todavía y la placa no se pulsa. */
  href?: string;
  action?: string;
  /** Las salas del atlas salen por la transición; el resto son enlaces. */
  intercept?: boolean;
}

const ROOMS: Room[] = [
  {
    id: "01",
    glyph: "nebula",
    status: "Open",
    title: "Embedding Nebula",
    desc:
      "50,000 words placed in 3D by simulating springs over their nearest-neighbor graph — not by dimension reduction. Color is neighborhood; every similarity you read is measured back in the original 300 dimensions.",
    href: "/galaxia",
    action: "Enter the galaxy",
    intercept: true,
  },
  {
    id: "02",
    glyph: "descent",
    status: "Open",
    title: "Gradient Descent",
    desc:
      "Ten thousand walkers dropped at once onto the Rosenbrock surface. They fall onto the parabola within ten steps and then spend four thousand crawling along it — which is the whole trouble with a ravine.",
    href: "/descenso",
    action: "Run the descent",
  },
  {
    id: "03",
    glyph: "noise",
    status: "Unbuilt",
    title: "Next Room",
    desc:
      "Whatever lands here follows the rule the first two follow: no slides, no recorded video. The thing itself, computed in front of you, with the numbers it claims measured where they actually live.",
  },
];

interface LandingPageProps {
  onExplore: () => void;
}

/* La portada va en inglés y sin diccionario, a diferencia del resto del atlas.
 * Es la primera pantalla de un proyecto sobre embeddings y su público llega
 * de fuera; el conmutador de idioma sigue vivo dentro del atlas. */
export default function LandingPage({ onExplore }: LandingPageProps) {
  const [transitioning, setTransitioning] = useState(false);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const roomsRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  /* El resplandor lo escriben dos manos —el puntero y el scroll— y ninguna
   * puede pisar a la otra, así que las dos leen de aquí. */
  const glow = useRef({ near: 0, depth: 1 });

  /* `--p`: la posición de scroll en alturas de ventana. Es lo único que la
   * página lee del recorrido, y lo leen las 336 celdas de la costura.
   *
   * Dos cosas lo hacen barato, y las dos importan en la Vega 6 integrada:
   *
   * - va **acumulado en rAF**, no por evento: el scroll dispara docenas de
   *   eventos por frame y aquí sólo interesa el último;
   * - va **cuantizado** a 1/64 de altura de ventana (~12 px). Cambiar una
   *   propiedad personalizada del contenedor invalida el estilo de todas las
   *   celdas que la leen, así que sin cuantizar eso pasaba en cada frame del
   *   recorrido; así pasa 64 veces en total. Y de paso el corte a saltos es
   *   el que le toca a una rejilla de píxeles: un desvanecido continuo aquí
   *   se lee como una máscara de degradado, no como celdas apagándose. */
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
      /* Pasada la portada el resplandor sobra: `screen` sobre el oscuro del
         índice deja una mancha azul encima de las placas. Se apaga entre 0,35
         y 0,85 alturas de ventana. */
      glow.current.depth = Math.max(0, Math.min(1, (0.85 - q) / 0.5));
      const g = glowRef.current;
      if (g) g.style.opacity = String(glow.current.near * glow.current.depth);
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

  /* La llegada del índice. Un solo observador sobre el cuerpo entero —cabecera
   * y placas— y se desconecta al primer disparo: esto pasa una vez, no cada
   * vez que se cruza el borde. El `rootMargin` negativo por abajo es lo que
   * evita que la secuencia se gaste en la última franja de la pantalla, donde
   * nadie la está mirando todavía. */
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

  /* El resplandor sigue al puntero con `mix-blend-mode: screen`: sobre el
   * oscuro suma luz azul y sobre el claro no se nota, que es exactamente lo
   * que hace la referencia. Va por `ref` y no por estado para no rehacer las
   * 1.440 celdas en cada `mousemove`. */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = glowRef.current;
      if (!g) return;
      g.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      glow.current.near = 1;
      g.style.opacity = String(glow.current.depth);
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
            {/* Marca de píxeles: la misma rejilla de la portada, en pequeño. */}
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
          <a href="/galaxia" className="landing-nav-item" onClick={(e) => { e.preventDefault(); handleExploreClick(); }}>
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

        {/* Guiño al aprendizaje profundo, en el hueco oscuro de abajo a la
            izquierda —el único rincón grande que la silueta deja vacío, y el
            que equilibra la nota de la esquina opuesta.

            El 0,72 **no es decorativo**: es el coseno real entre `king − man
            + woman` y `queen`, calculado sobre el mismo `vecs.bin` que
            publica el sitio (0,7158 exacto, int8 con escala por vector). La
            regla del proyecto es que toda afirmación se calcula en 300D, y
            una portada no está exenta: si alguien cambia el modelo o el
            recorte de vocabulario, este número hay que volver a medirlo.

            Que la analogía salga es justamente lo que hace el guiño: nadie
            programó esa resta. La red la dejó ahí al aprender a predecir
            contextos. */}
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
          {/* Requisito de licencia: la atribución a fastText no se esconde. */}
          <p className="landing-attrib">fastText Crawl Vectors · CC BY-SA 3.0</p>
        </div>

        <button className="landing-scroll-indicator" onClick={goToRooms}>
          <span>Scroll</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* ---------------------------------------------------------------
          El índice de salas. Mismo material que la portada: masa plana, celda
          cuadrada, dígitos de buscaminas y **cero radio de borde**. La placa
          de una sala abierta no se ilumina al pasar por encima: **se
          invierte**, como una celda de la rejilla que cambia de bit. Es el
          único gesto de hover que la portada ya tenía a mano y el que dice de
          qué está hecha la página.
          --------------------------------------------------------------- */}
      <section className="landing-rooms" ref={roomsRef}>
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

        <div className="landing-rooms-inner" ref={innerRef}>
          <header className="landing-rooms-head">
            <p className="landing-rooms-tag">
              <span>Index</span>
              <span className="landing-rooms-rule" />
              <span>03 rooms · 02 open</span>
            </p>
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
          </header>

          <ol className="landing-room-list" role="list">
            {ROOMS.map((room) => {
              const open = Boolean(room.href);
              const inner = (
                <>
                  <div className="landing-room-top">
                    <span className="landing-room-id">{room.id}</span>
                    <span className="landing-room-status">
                      <i className={open ? "dot-on" : undefined} />
                      {room.status}
                    </span>
                  </div>
                  <Glyph name={room.glyph} />
                  <h3 className="landing-room-title">{room.title}</h3>
                  <p className="landing-room-desc">{room.desc}</p>
                  <div className="landing-room-action">
                    {open ? (
                      <>
                        <span>{room.action}</span>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                             stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </>
                    ) : (
                      <span>Phase 03 · not open yet</span>
                    )}
                  </div>
                </>
              );

              return (
                <li key={room.id}>
                  {open ? (
                    <a
                      className="landing-room"
                      href={room.href}
                      onClick={
                        room.intercept
                          ? (e) => { e.preventDefault(); handleExploreClick(); }
                          : undefined
                      }
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="landing-room landing-room-shut">{inner}</div>
                  )}
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
