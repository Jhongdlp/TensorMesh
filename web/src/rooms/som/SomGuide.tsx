import {
  useCallback, useEffect, useMemo, useRef, useState, type JSX,
} from "react";

export type SomChapterId =
  | "what" | "bmu" | "sigma" | "cooling"
  | "topo" | "color" | "shapes" | "do" | "glossary";

interface SomChapter {
  id: SomChapterId;
  tab: string;
  head: string;
  lede: string;
  body: string[];
  list?: [string, string][];
  icons?: boolean;
  note: string;
  fig?: string;
}

const ART = { preserveAspectRatio: "xMidYMid meet" };

/* ==========================================================================
   Láminas Interactivas de SOM
   ========================================================================== */

/** 1. Lámina interactiva del BMU (Best Matching Unit) y Vecindad */
function FigSomBmu() {
  const [target, setTarget] = useState<[number, number]>([170, 70]);
  const [sigma, setSigma] = useState(1.4);
  const box = useRef<SVGSVGElement>(null);

  const GRID_SIZE = 7;
  const W = 320, H = 160;
  const SPACING = 20;
  const OX = 40, OY = 20;

  // Calculamos la posición de cada nodo en la rejilla 2D
  const nodes = useMemo(() => {
    const list: { r: number; c: number; x: number; y: number; id: number }[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        list.push({
          r, c,
          x: OX + c * SPACING,
          y: OY + r * SPACING,
          id: r * GRID_SIZE + c,
        });
      }
    }
    return list;
  }, []);

  // Hallamos el BMU por distancia euclidiana en pantalla
  const bmu = useMemo(() => {
    let best = nodes[0];
    let minD2 = Infinity;
    for (const n of nodes) {
      const dx = n.x - target[0];
      const dy = n.y - target[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) {
        minD2 = d2;
        best = n;
      }
    }
    return best;
  }, [nodes, target]);

  const aim = (e: { clientX: number; clientY: number }) => {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    setTarget([Math.min(W - 20, Math.max(20, x)), Math.min(H - 20, Math.max(20, y))]);
  };

  return (
    <div className="gd-fig">
      <svg
        ref={box}
        viewBox="0 0 320 160"
        className="gd-art gd-grab"
        {...ART}
        role="application"
        aria-label="Arrastra la muestra objetivo para ver la neurona ganadora BMU"
        tabIndex={0}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); aim(e); }}
        onPointerMove={e => { if (e.buttons) aim(e); }}
      >
        {/* Líneas de la cuadrícula */}
        {Array.from({ length: GRID_SIZE }, (_, r) => (
          <line
            key={`r-${r}`}
            x1={OX} y1={OY + r * SPACING}
            x2={OX + (GRID_SIZE - 1) * SPACING} y2={OY + r * SPACING}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: GRID_SIZE }, (_, c) => (
          <line
            key={`c-${c}`}
            x1={OX + c * SPACING} y1={OY}
            x2={OX + c * SPACING} y2={OY + (GRID_SIZE - 1) * SPACING}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
          />
        ))}

        {/* Nodos coloreados según la activación gaussiana respecto al BMU */}
        {nodes.map(n => {
          const dr = n.r - bmu.r;
          const dc = n.c - bmu.c;
          const distGrid2 = dr * dr + dc * dc;
          const h = Math.exp(-distGrid2 / (2 * sigma * sigma));
          const isBmu = n.id === bmu.id;

          return (
            <g key={n.id}>
              {h > 0.05 && (
                <circle
                  cx={n.x} cy={n.y}
                  r={isBmu ? 7 : 4 + h * 3}
                  fill={isBmu ? "#f0ff00" : `rgba(0, 240, 255, ${h * 0.85})`}
                />
              )}
              <circle
                cx={n.x} cy={n.y}
                r={isBmu ? 4 : 2}
                fill={isBmu ? "#000" : "#fff"}
              />
            </g>
          );
        })}

        {/* Vector de arrastre hacia la muestra */}
        <line
          x1={bmu.x} y1={bmu.y}
          x2={target[0]} y2={target[1]}
          stroke="#ff4070"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />

        {/* Punto objetivo X (arrastrable) */}
        <circle cx={target[0]} cy={target[1]} r="12" fill="rgba(255, 64, 112, 0.15)" />
        <circle cx={target[0]} cy={target[1]} r="4.5" fill="#ff4070" stroke="#fff" strokeWidth="1" />
        <text x={target[0] + 8} y={target[1] + 4} className="gd-art-w gd-art-sm">Muestra X</text>

        {/* Panel lateral explicativo */}
        <g transform="translate(195, 25)">
          <text x="0" y="10" className="gd-art-n">Neurona BMU: ({bmu.c}, {bmu.r})</text>
          <text x="0" y="26" className="gd-art-n">Distancia: {Math.hypot(bmu.x - target[0], bmu.y - target[1]).toFixed(1)} px</text>
          <text x="0" y="44" className="gd-art-n">Vecindario activo (h &gt; 0,1):</text>
          <text x="0" y="60" className="gd-art-w gd-art-sm">
            {nodes.filter(n => Math.exp(-((n.r - bmu.r) ** 2 + (n.c - bmu.c) ** 2) / (2 * sigma * sigma)) > 0.1).length} de 49 neuronas
          </text>
          <text x="0" y="86" className="gd-art-n">Toca o arrastra la muestra roja</text>
        </g>
      </svg>
      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">Radio vecindad σ:</span>
        <button className={"gd-pill" + (sigma === 0.8 ? " on" : "")} onClick={() => setSigma(0.8)}>Estrecho (0.8)</button>
        <button className={"gd-pill" + (sigma === 1.4 ? " on" : "")} onClick={() => setSigma(1.4)}>Medio (1.4)</button>
        <button className={"gd-pill" + (sigma === 2.5 ? " on" : "")} onClick={() => setSigma(2.5)}>Amplio (2.5)</button>
      </div>
    </div>
  );
}

/** 2. Lámina interactiva de Topología: Plana vs Toroidal */
function FigSomTopology() {
  const [torus, setTorus] = useState(false);
  const [selectedCol, setSelectedCol] = useState(0);

  const COLS = 8;
  const W = 320, H = 140;

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Nodos de la fila */}
        {Array.from({ length: COLS }, (_, c) => {
          const x = 35 + c * 35;
          const y = 60;
          const isSel = c === selectedCol;
          
          // Distancia topológica
          let dist = Math.abs(c - selectedCol);
          if (torus) {
            dist = Math.min(dist, COLS - dist);
          }
          const h = Math.exp(-(dist * dist) / (2 * 1.5 * 1.5));

          return (
            <g key={c} onClick={() => setSelectedCol(c)} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r={isSel ? 8 : 4 + h * 4} fill={isSel ? "#f0ff00" : `rgba(0, 240, 255, ${h})`} />
              <circle cx={x} cy={y} r={isSel ? 4 : 2} fill={isSel ? "#000" : "#fff"} />
              <text x={x} y={y + 24} className="gd-art-n" textAnchor="middle">N{c}</text>
              <text x={x} y={y - 16} className="gd-art-n" textAnchor="middle">d={dist}</text>
            </g>
          );
        })}

        {/* Línea de conexión */}
        <line x1={35} y1={60} x2={35 + (COLS - 1) * 35} y2={60} stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" />

        {/* Enlace toroidal en los extremos si está activado */}
        {torus && (
          <path
            d={`M 35 60 C 35 15, ${35 + (COLS - 1) * 35} 15, ${35 + (COLS - 1) * 35} 60`}
            stroke="#00f0ff"
            strokeWidth="1.8"
            strokeDasharray="4 3"
            fill="none"
          />
        )}

        <text x={160} y={115} className="gd-art-n" textAnchor="middle">
          {torus
            ? "Topología Toroidal: el extremo izquierdo N0 y el derecho N7 se tocan (d=1)"
            : "Topología Plana: los extremos N0 y N7 están a máxima distancia (d=7)"}
        </text>
      </svg>
      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (!torus ? " on" : "")} onClick={() => setTorus(false)}>
          Hoja Plana (Bordes libres)
        </button>
        <button className={"gd-pill" + (torus ? " on" : "")} onClick={() => setTorus(true)}>
          Toroidal (Dona cerrada)
        </button>
      </div>
    </div>
  );
}

/** 3. Lámina interactiva de Enfriamiento y Decaimiento */
function FigSomCooling() {
  const [sample, setSample] = useState(12000);
  const TOTAL = 30000;
  const p = sample / TOTAL;
  const eta = 0.3 * (1 - p);
  const sigma = 32 * (1 - p);

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Ejes */}
        <line x1="45" y1="20" x2="45" y2="105" stroke="rgba(255,255,255,0.2)" />
        <line x1="45" y1="105" x2="295" y2="105" stroke="rgba(255,255,255,0.2)" />
        
        {/* Curva de aprendizaje η */}
        <path d="M 45 35 L 295 105" stroke="#f0ff00" strokeWidth="1.8" fill="none" />
        {/* Curva de vecindad σ */}
        <path d="M 45 45 L 295 105" stroke="#00f0ff" strokeWidth="1.8" strokeDasharray="4 2" fill="none" />

        {/* Punto actual */}
        const currX = 45 + p * 250;
        <line x1={45 + p * 250} y1="20" x2={45 + p * 250} y2="105" stroke="#ff4070" strokeWidth="1.2" strokeDasharray="2 2" />
        <circle cx={45 + p * 250} cy={35 + p * 70} r="4" fill="#f0ff00" />
        <circle cx={45 + p * 250} cy={45 + p * 60} r="4" fill="#00f0ff" />

        <text x="45" y="15" className="gd-art-n">Valores iniciales (η₀=0.30, σ₀=32px)</text>
        <text x="295" y="120" className="gd-art-n" textAnchor="end">30.000 muestras (Convergencia)</text>
        
        <text x={45 + p * 250 + 6} y="40" className="gd-art-w gd-art-sm">
          η = {eta.toFixed(3)} · σ = {sigma.toFixed(1)} px
        </text>
      </svg>
      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (sample === 0 ? " on" : "")} onClick={() => setSample(0)}>Inicio (0)</button>
        <button className={"gd-pill" + (sample === 10000 ? " on" : "")} onClick={() => setSample(10000)}>10.000 muestras</button>
        <button className={"gd-pill" + (sample === 20000 ? " on" : "")} onClick={() => setSample(20000)}>20.000 muestras</button>
        <button className={"gd-pill" + (sample === 30000 ? " on" : "")} onClick={() => setSample(30000)}>30.000 (Fin)</button>
      </div>
    </div>
  );
}

/** 4. Lámina interactiva de Modos de Color */
function FigSomColor() {
  const [mode, setMode] = useState<0 | 1>(0);

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 130" className="gd-art" {...ART} role="img" aria-hidden="true">
        {mode === 0 ? (
          /* Modo Topología UV */
          <g>
            <defs>
              <linearGradient id="uv-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ff4070" />
                <stop offset="50%" stopColor="#00f0ff" />
                <stop offset="100%" stopColor="#f0ff00" />
              </linearGradient>
            </defs>
            <rect x="50" y="25" width="220" height="60" rx="10" fill="url(#uv-grad)" opacity="0.85" />
            <text x="160" y="60" className="gd-art-w" textAnchor="middle" fill="#000">Topología UV Continua</text>
            <text x="160" y="105" className="gd-art-n" textAnchor="middle">
              Cada neurona conserva su color asignado en el plano inicial. Permite detectar torsiones o pliegues.
            </text>
          </g>
        ) : (
          /* Modo Altura Z */
          <g>
            <defs>
              <linearGradient id="z-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1266f2" />
                <stop offset="33%" stopColor="#24b0f0" />
                <stop offset="66%" stopColor="#f2c420" />
                <stop offset="100%" stopColor="#ff3818" />
              </linearGradient>
            </defs>
            <rect x="50" y="25" width="220" height="60" rx="10" fill="url(#z-grad)" opacity="0.85" />
            <text x="160" y="60" className="gd-art-w" textAnchor="middle" fill="#000">Escala Térmica de Altura Z</text>
            <text x="160" y="105" className="gd-art-n" textAnchor="middle">
              Azul abajo (Z &lt; 0), ámbar en el centro y rojo en las crestas (Z &gt; 0).
            </text>
          </g>
        )}
      </svg>
      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (mode === 0 ? " on" : "")} onClick={() => setMode(0)}>
          Topología UV (Arcoíris)
        </button>
        <button className={"gd-pill" + (mode === 1 ? " on" : "")} onClick={() => setMode(1)}>
          Altura Física Z (Térmico)
        </button>
      </div>
    </div>
  );
}

const FIGS: Record<string, () => JSX.Element> = {
  bmu: FigSomBmu,
  topo: FigSomTopology,
  cooling: FigSomCooling,
  color: FigSomColor,
};

/* ==========================================================================
   Capítulos de la Guía de SOM
   ========================================================================== */

const CHAPTERS: SomChapter[] = [
  {
    id: "what",
    tab: "los principios",
    head: "¿Qué es un Mapa Autoorganizado?",
    lede: "Una tela elástica de neuronas que aprende a envolver geometrías 3D sin perder su orden interno.",
    body: [
      "Inventados por el profesor Teuvo Kohonen en 1982, los Mapas Autoorganizados (Self-Organizing Maps o SOM) son redes neuronales no supervisadas capaces de proyectar y aproximar variedades de datos de alta dimensión sobre una cuadrícula regular de menor dimensión (aquí, una malla 2D desplegada en 3D).",
      "A diferencia de una proyección lineal rígida como PCA (que aplana como una sombra y junta puntos que estaban lejos), un SOM actúa como una malla elástica: se estira, dobla y acomoda sobre la nube de datos, preservando las relaciones de vecindad topológica.",
      "Debajo puedes interactuar con el corazón del algoritmo: la búsqueda de la neurona ganadora (BMU) y la activación de su vecindario.",
    ],
    note: "4.096 neuronas (rejilla 64×64) entrenadas simultáneamente en WebGPU Compute a más de 60 FPS.",
    fig: "bmu",
  },
  {
    id: "bmu",
    tab: "la competencia",
    head: "Competencia: La neurona ganadora (BMU)",
    lede: "Para cada dato de entrada, las 4.096 neuronas compiten. La más cercana se proclama Best Matching Unit.",
    body: [
      "En cada paso del entrenamiento, la GPU selecciona una muestra aleatoria X del cuerpo objetivo tridimensional.",
      "Cada neurona i posee un vector de posición W_i. La red calcula la distancia euclidiana de todas las neuronas a X y selecciona la que tiene la distancia mínima: i* = argmin_i ||X - W_i||.",
      "En el lienzo de juguete inferior, arrastra el punto rojo y observa cómo la neurona más cercana se ilumina en amarillo brillante de inmediato.",
    ],
    note: "En WebGPU, 256 hilos de cómputo buscan el mínimo en paralelo mediante reducción en memoria compartida.",
    fig: "bmu",
  },
  {
    id: "sigma",
    tab: "la cooperación",
    head: "Cooperación: El radio de vecindad σ",
    lede: "El ganador no viaja solo: arrastra consigo a sus neuronas vecinas según una campana de Gauss.",
    body: [
      "Si sólo se moviera la neurona ganadora, la red se fragmentaría en miles de puntos inconexos como confeti. La magia de Kohonen reside en la cooperación topológica.",
      "Al ganar la neurona i*, todas las neuronas de la cuadrícula experimentan una fuerza de atracción modulada por la función de vecindad gaussiana: h_{i,i*} = exp(-d² / 2σ²), donde d es la distancia topológica en la cuadrícula.",
      "Las neuronas inmediatamente contiguas al BMU se desplazan con fuerza; las que están a media distancia se mueven ligeramente; y las lejanas apenas se inmutan.",
    ],
    note: "Al inicio, un radio σ grande (32 px) dobla la malla globalmente; al final, un radio pequeño afina detalles locales.",
    fig: "bmu",
  },
  {
    id: "cooling",
    tab: "el enfriamiento",
    head: "Adaptación y Enfriamiento progresivo",
    lede: "Aprender rápido y a gran escala al inicio; asentarse y congelar la forma al final.",
    body: [
      "El desplazamiento de cada neurona se rige por: ΔW_i = η · h_{i,i*} · (X - W_i), donde η es la tasa de aprendizaje.",
      "Tanto la tasa η como el radio de vecindad σ decaen lineal o exponencialmente con cada muestra procesada a lo largo de las 30.000 iteraciones totales.",
      "Esta dinámica simula un recocido térmico: la red comienza fluida y flexible (ordenación global) y termina rígida y precisa (ajuste fino).",
    ],
    note: "Puedes reiniciar la simulación con la tecla R o ajustar la tasa inicial η₀ desde el panel de mandos.",
    fig: "cooling",
  },
  {
    id: "topo",
    tab: "la topología",
    head: "Topología: Hoja Plana vs Toroide",
    lede: "La diferencia entre una hoja con bordes abiertos y una dona continua sin costuras.",
    body: [
      "En una red plana, la distancia topológica entre la columna 0 y la 63 es de 63 unidades. La red tiene 4 bordes libres y 4 esquinas, ideales para superficies abiertas.",
      "En una red toroidal, la distancia envuelve los bordes: la columna 0 y la 63 son vecinas directas (distancia = 1). Esto permite a la malla cerrarse sobre sí misma sin formar costuras ni tensiones en las orillas.",
      "Para envolver figuras cerradas como el Toroide o la Esfera, la topología toroidal evita que la red se pellizque o se muerda la cola.",
    ],
    note: "Puedes alternar entre Plana y Toroidal en cualquier momento desde el selector del panel izquierdo.",
    fig: "topo",
  },
  {
    id: "color",
    tab: "el color",
    head: "Diagnóstico visual: Topología UV vs Altura Z",
    lede: "El color no es decoración: es la herramienta para saber si la malla está doblada o retorcida.",
    body: [
      "Modo Topología UV: Cada neurona recibe un color basado en sus coordenadas originales en el plano (U, V). Si en el espacio 3D ves una transición suave de color, la red ha preservado la topología perfectamente. Si ves líneas de colores opuestos cruzándose, la malla se ha retorcido.",
      "Modo Altura Z: Tiñe las neuronas según su elevación vertical (azul abajo, cian en el medio, ámbar y rojo en las crestas altas).",
    ],
    note: "Ambos modos se computan por fragmento en WebGPU con interpolación suave.",
    fig: "color",
  },
  {
    id: "shapes",
    tab: "las 5 figuras",
    head: "Los retos geométricos de las figuras objetivo",
    lede: "Cinco distribuciones matemáticas que ponen a prueba la elasticidad del mapa.",
    body: [
      "Cada figura presenta un desafío topológico distinto para las 4.096 neuronas:",
    ],
    list: [
      ["Esfera de Puntos", "Una superficie continua y cerrada. La red plana debe doblarse como un envoltorio esférico; la red toroidal la abraza con facilidad."],
      ["Toroide (Dona)", "Una variedad con un agujero central. La red plana forma un cilindro hueco; la red toroidal encaja como una piel perfecta."],
      ["Doble Hélice", "Dos filamentos entrelazados en espiral. La malla debe estirarse a lo largo del canal vertical y dividirse conceptualmente en dos ramas."],
      ["Cubo Macizo", "Un volumen 3D sólido. La red 2D debe plegarse sobre sí misma mediante una curva fractal de llenado de espacio (curva de Peano)."],
      ["Atractor de Lorenz", "El atractor caótico de la mariposa fractal. Las neuronas se concentran en las dos alas donde la densidad de órbitas es máxima."],
    ],
    note: "Las muestras se generan proceduralmente en CPU y se transfieren al buffer de almacenamiento WebGPU.",
  },
  {
    id: "do",
    tab: "qué hacer",
    head: "Qué puedes hacer en esta sala",
    lede: "Controles, gestos y atajos de teclado para explorar la simulación.",
    body: [],
    icons: true,
    list: [
      ["Orbitar y Zoom", "Arrastra con el ratón o usa las flechas del teclado. La rueda acerca y aleja."],
      ["Pausar / Reanudar", "Pulsa la barra espaciadora o el botón de la barra lateral."],
      ["Paso a paso", "Pulsa la tecla N para que la red procese un único lote de muestras."],
      ["Reiniciar", "Pulsa la tecla R para restablecer la cuadrícula a su plano inicial."],
      ["Pantalla Completa", "Pulsa la tecla F para sumergirte en el modo inmersivo sin paneles."],
      ["Ajustar Parámetros", "Modifica la tasa de aprendizaje η₀, el radio σ₀, la velocidad y la opacidad desde el cajón izquierdo."],
    ],
    note: "La tecla Inicio o el botón de vista completa reencuadran la cámara si te alejas.",
  },
  {
    id: "glossary",
    tab: "glosario",
    head: "Glosario de Términos SOM",
    lede: "Los conceptos fundamentales de las redes autoorganizadas de Kohonen.",
    body: [],
    list: [
      ["SOM (Self-Organizing Map)", "Red neuronal no supervisada que aprende representaciones de baja dimensión preservando la topología."],
      ["BMU (Best Matching Unit)", "La neurona cuyos pesos o posición en el espacio están más próximos a la muestra actual."],
      ["Distancia Euclidiana", "Distancia geométrica ordinaria en el espacio 3D: ||X - W|| = √(dx² + dy² + dz²)."],
      ["Distancia Topológica", "Distancia entre dos neuronas dentro de la cuadrícula o rejilla 2D."],
      ["Función de Vecindad (h)", "Ponderación gaussiana que determina cuánto se desplazan las neuronas vecinas al BMU."],
      ["Tasa de Aprendizaje (η)", "Factor de paso que modula la velocidad de desplazamiento hacia la muestra."],
      ["Topología Toroidal", "Conexión periódica de los bordes opuestos de la rejilla para formar un toroide continuo."],
      ["WebGPU Compute", "Cálculo masivo en paralelo donde miles de hilos de la tarjeta gráfica ejecutan el entrenamiento en tiempo real."],
    ],
    note: "Algoritmo original de Teuvo Kohonen (1982), acelerado sobre hardware moderno con WGSL.",
  },
];

export default function SomGuide({
  at,
  onClose,
  onIntro,
}: {
  at?: SomChapterId;
  onClose: () => void;
  onIntro?: () => void;
}) {
  const [currentId, setCurrentId] = useState<SomChapterId>(at ?? "what");
  const boxRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const idx = CHAPTERS.findIndex(c => c.id === currentId);
  const currentChapter = CHAPTERS[idx >= 0 ? idx : 0];
  const Fig = currentChapter.fig ? FIGS[currentChapter.fig] : null;

  const nextChapter = useCallback(() => {
    const nextIdx = (idx + 1) % CHAPTERS.length;
    setCurrentId(CHAPTERS[nextIdx].id);
  }, [idx]);

  const prevChapter = useCallback(() => {
    const prevIdx = (idx - 1 + CHAPTERS.length) % CHAPTERS.length;
    setCurrentId(CHAPTERS[prevIdx].id);
  }, [idx]);

  useEffect(() => {
    from.current = document.activeElement;
    boxRef.current?.focus();
    return () => {
      const el = from.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowRight" && e.altKey) {
        e.preventDefault();
        nextChapter();
        return;
      }
      if (e.key === "ArrowLeft" && e.altKey) {
        e.preventDefault();
        prevChapter();
        return;
      }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [nextChapter, prevChapter, onClose]);

  return (
    <div className="gd-veil" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className="gd"
        role="dialog"
        aria-modal="true"
        aria-labelledby="som-gd-title"
        tabIndex={-1}
      >
        <header className="gd-top">
          <p className="eyebrow">guía de mapas autoorganizados (som)</p>
          <div className="gd-top-acts">
            {onIntro && (
              <button className="gd-ghost" onClick={onIntro}>
                <span>ver presentación rápida</span>
              </button>
            )}
            <button className="gd-ghost" onClick={onClose}>
              <span>cerrar</span> <kbd>esc</kbd>
            </button>
          </div>
        </header>

        <div className="gd-main">
          {/* Índice lateral */}
          <nav className="gd-toc" aria-label="Capítulos de la guía SOM">
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                className={"gd-toc-i" + (c.id === currentId ? " on" : "")}
                onClick={() => setCurrentId(c.id)}
                aria-current={c.id === currentId}
              >
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{c.tab}</span>
              </button>
            ))}
          </nav>

          {/* Cuerpo del capítulo */}
          <article className="gd-page">
            <h2 className="gd-head" id="som-gd-title">{currentChapter.head}</h2>
            <p className="gd-lede">{currentChapter.lede}</p>

            {currentChapter.body.map((p, k) => (
              <p key={k} className="gd-body">{p}</p>
            ))}

            {Fig && (
              <div className="gd-stage">
                <Fig />
              </div>
            )}

            {currentChapter.list && (
              <ul className="gd-list">
                {currentChapter.list.map(([title, desc], k) => (
                  <li key={k}>
                    <div>
                      <b>{title}</b>
                      <span className="gd-list-t"> — {desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="gd-note">{currentChapter.note}</p>
          </article>
        </div>

        <footer className="gd-foot">
          <span className="gd-count">
            capítulo {idx + 1} de {CHAPTERS.length} · {currentChapter.tab}
          </span>
          <div className="gd-foot-acts">
            {idx > 0 && (
              <button className="gd-back" onClick={prevChapter}>
                anterior
              </button>
            )}
            <button
              className="gd-go"
              onClick={() => (idx === CHAPTERS.length - 1 ? onClose() : nextChapter())}
            >
              {idx === CHAPTERS.length - 1 ? "cerrar guía" : "siguiente capítulo"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
