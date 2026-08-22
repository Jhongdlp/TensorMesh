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
      let n = 0;
      if (light) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            if (MASK[nr][nc] === "0") n++;
          }
        }
      }
      out.push({ light, n });
    }
  }
  return out;
}

const CELLS = buildCells();

interface LandingPageProps {
  onExplore: () => void;
}

/* La portada va en inglés y sin diccionario, a diferencia del resto del atlas.
 * Es la primera pantalla de un proyecto sobre embeddings y su público llega
 * de fuera; el conmutador de idioma sigue vivo dentro del atlas. */
export default function LandingPage({ onExplore }: LandingPageProps) {
  const [transitioning, setTransitioning] = useState(false);
  const glowRef = useRef<HTMLDivElement | null>(null);

  /* El resplandor sigue al puntero con `mix-blend-mode: screen`: sobre el
   * oscuro suma luz azul y sobre el claro no se nota, que es exactamente lo
   * que hace la referencia. Va por `ref` y no por estado para no rehacer las
   * 1.440 celdas en cada `mousemove`. */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = glowRef.current;
      if (!g) return;
      g.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      g.style.opacity = "1";
    };
    const leave = () => {
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
    <div className={`landing-overlay ${transitioning ? "transitioning" : ""}`}>
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

        {/* Scroll down indicator */}
        <div className="landing-scroll-indicator">
          <span>Deslizar</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* New section describing AI algorithms and tools */}
      <div className="landing-info-section">
        <div className="landing-info-content">
          <h2 className="landing-info-title">Algoritmos e Instrumentos de IA</h2>
          <p className="landing-info-subtitle">
            Visualizaciones interactivas y herramientas de Machine Learning que permiten explorar el comportamiento y la geometría oculta de los modelos de inteligencia artificial de forma intuitiva.
          </p>

          <div className="landing-cards-container">
            {/* Card 1: Embedding Nebula / interactive galaxy */}
            <a href="/galaxia" className="landing-card" onClick={(e) => { e.preventDefault(); handleExploreClick(); }}>
              <div className="landing-card-header">
                <span className="landing-card-number">SALA 01</span>
                <h3 className="landing-card-title">Nebulosa de Embeddings</h3>
              </div>
              <p className="landing-card-desc">
                Navega en una nube semántica de 50.000 palabras organizadas por similitud vectorial. Descubre analogías lingüísticas y relaciones espaciales mediante una simulación de fuerzas físicas en tiempo real.
              </p>
              <div className="landing-card-action">
                <span>Explorar Galaxia</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </a>

            {/* Card 2: Gradient descent */}
            <a href="/descenso" className="landing-card">
              <div className="landing-card-header">
                <span className="landing-card-number">SALA 02</span>
                <h3 className="landing-card-title">Descenso de Gradiente</h3>
              </div>
              <p className="landing-card-desc">
                Observa cómo se optimizan las redes neuronales. Visualiza a diez mil caminantes soltados en simultáneo recorriendo el relieve matemático de la función de Rosenbrock hasta converger en sus mínimos locales.
              </p>
              <div className="landing-card-action">
                <span>Ver Simulación</span>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
