import { useCallback, useEffect, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

export type HnswChapterId =
  | "what" | "skiplist" | "greedy" | "ef"
  | "construction" | "params" | "databases" | "controls";

interface HnswChapter {
  id: HnswChapterId;
  tag: string;
  head: string;
  lede: string;
  body: string[];
  list?: [string, string][];
  note: string;
  fig?: ({ lang }: { lang: Lang }) => JSX.Element;
}

const ART = { viewBox: "0 0 320 150", preserveAspectRatio: "xMidYMid meet" };

/* ==========================================================================
   Láminas Interactivas de HNSW
   ========================================================================== */

/** 1. Lámina interactiva del Escalamiento Logarítmico O(log N) */
function FigHnswOverview({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [mode, setMode] = useState<"linear" | "hnsw">("hnsw");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => (t + 1) % 50);
    }, 45);
    return () => clearInterval(timer);
  }, []);

  const progress = (tick % 30) / 29;

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {mode === "linear" ? (
          <g>
            <text x="160" y="25" className="gd-art-n" textAnchor="middle" fill="#ff4070">
              {isEs ? "Búsqueda Exhaustiva O(N): Evalúa los 1.000.000 vectores uno a uno" : "Brute Force O(N): Evaluates all 1,000,000 vectors sequentially"}
            </text>
            {/* Fila de 16 nodos escaneados secuencialmente */}
            {Array.from({ length: 14 }, (_, i) => {
              const x = 30 + i * 19.5;
              const isScanned = i <= progress * 14;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy="75"
                  r="5"
                  fill={isScanned ? "#ff4070" : "rgba(255,255,255,0.15)"}
                />
              );
            })}
            <text x="160" y="115" className="gd-art-n" textAnchor="middle" fill="var(--ink-2)">
              {isEs ? "Latencia: ~120 ms (Inviable en tiempo real)" : "Latency: ~120 ms (Too slow for live LLMs)"}
            </text>
          </g>
        ) : (
          <g>
            <text x="160" y="22" className="gd-art-n" textAnchor="middle" fill="#00f0ff">
              {isEs ? "Grafo Jerárquico HNSW O(log N): Saltos exponenciales" : "HNSW Hierarchical Graph O(log N): Exponential speedup"}
            </text>
            {/* Capa 2 */}
            <circle cx="50" cy="45" r="6" fill="#ff4070" />
            <line x1="50" y1="45" x2="270" y2="45" stroke="#ff4070" strokeWidth="2" />
            <circle cx="270" cy="45" r="6" fill="#ff4070" />

            {/* Capa 1 */}
            <circle cx="50" cy="80" r="5" fill="#00f0ff" />
            <circle cx="160" cy="80" r="5" fill="#00f0ff" />
            <circle cx="270" cy="80" r="5" fill="#00f0ff" />
            <line x1="50" y1="80" x2="160" y2="80" stroke="#00f0ff" strokeWidth="1.5" />
            <line x1="160" y1="80" x2="270" y2="80" stroke="#00f0ff" strokeWidth="1.5" />

            {/* Capa 0 */}
            {Array.from({ length: 8 }, (_, i) => (
              <circle key={i} cx={40 + i * 34} cy="115" r="4" fill="#52e078" />
            ))}

            {/* Salto dinámico */}
            <path
              d="M 50 45 L 270 45 L 270 80 L 244 115"
              stroke="#ffd700"
              strokeWidth="2.5"
              strokeDasharray="4 2"
              fill="none"
            />
            <circle cx="244" cy="115" r="7" stroke="#ffd700" strokeWidth="2" fill="none" />
            <text x="160" y="140" className="gd-art-n" textAnchor="middle" fill="#52e078">
              {isEs ? "Latencia: < 1.2 ms (x100 veces más rápido)" : "Latency: < 1.2 ms (100x faster)"}
            </text>
          </g>
        )}
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (mode === "linear" ? " on" : "")} onClick={() => setMode("linear")}>
          {isEs ? "Búsqueda Exhaustiva O(N)" : "Brute Force O(N)"}
        </button>
        <button className={"gd-pill" + (mode === "hnsw" ? " on" : "")} onClick={() => setMode("hnsw")}>
          {isEs ? "HNSW Multinivel O(log N)" : "HNSW Multilevel O(log N)"}
        </button>
      </div>
    </div>
  );
}

/** 2. Lámina interactiva de la Skip List Multicapa */
function FigHnswSkipList({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [animStep, setAnimStep] = useState(0);

  const reset = () => setAnimStep(0);
  const nextStep = () => setAnimStep(s => (s + 1) % 5);

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-label="Skip List Multicapa interactiva">
        <rect x="20" y="25" width="280" height="24" rx="3" fill="rgba(255, 64, 112, 0.08)" stroke="rgba(255, 64, 112, 0.25)" strokeDasharray="2 2" />
        <text x="25" y="40" fill="#ff4070" fontSize="8" fontFamily="monospace">Layer 2 (Express)</text>

        <rect x="20" y="65" width="280" height="24" rx="3" fill="rgba(0, 240, 255, 0.08)" stroke="rgba(0, 240, 255, 0.25)" strokeDasharray="2 2" />
        <text x="25" y="80" fill="#00f0ff" fontSize="8" fontFamily="monospace">Layer 1 (Medium)</text>

        <rect x="20" y="105" width="280" height="24" rx="3" fill="rgba(82, 224, 120, 0.08)" stroke="rgba(82, 224, 120, 0.25)" strokeDasharray="2 2" />
        <text x="25" y="120" fill="#52e078" fontSize="8" fontFamily="monospace">Layer 0 (All Vectors)</text>

        {[40, 75, 110, 145, 180, 215, 250, 285].map((x, i) => (
          <circle key={`l0-${i}`} cx={x} cy="117" r="4" fill="#52e078" />
        ))}
        {[40, 110, 180, 250].map((x, i) => (
          <circle key={`l1-${i}`} cx={x} cy="77" r="5" fill="#00f0ff" />
        ))}
        {[40, 180].map((x, i) => (
          <circle key={`l2-${i}`} cx={x} cy="37" r="6" fill="#ff4070" />
        ))}

        <line x1="40" y1="37" x2="40" y2="117" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="180" y1="37" x2="180" y2="117" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="110" y1="77" x2="110" y2="117" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="250" y1="77" x2="250" y2="117" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2 2" />

        <line x1="40" y1="37" x2="180" y2="37" stroke="#ff4070" strokeWidth="2" />
        <line x1="40" y1="77" x2="110" y2="77" stroke="#00f0ff" strokeWidth="1.5" />
        <line x1="110" y1="77" x2="180" y2="77" stroke="#00f0ff" strokeWidth="1.5" />
        <line x1="180" y1="77" x2="250" y2="77" stroke="#00f0ff" strokeWidth="1.5" />

        {animStep >= 1 && (
          <path d="M 40 37 L 180 37" stroke="#ffd700" strokeWidth="3" strokeLinecap="round" />
        )}
        {animStep >= 2 && (
          <path d="M 180 37 L 180 77 L 250 77" stroke="#ffd700" strokeWidth="3" strokeLinecap="round" />
        )}
        {animStep >= 3 && (
          <path d="M 250 77 L 250 117 L 285 117" stroke="#ffd700" strokeWidth="3" strokeLinecap="round" />
        )}

        <circle cx="285" cy="117" r="9" fill="none" stroke="#ffd700" strokeWidth="2" strokeDasharray="3 2" />
        <text x="285" y="142" fill="#ffd700" fontSize="8" fontWeight="bold" textAnchor="middle">Query Target</text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className="gd-pill" onClick={reset}>{isEs ? "Reiniciar" : "Reset"}</button>
        <button className="gd-pill on" onClick={nextStep}>
          {animStep === 0 ? (isEs ? "Iniciar Salto" : "Start Jump") : animStep >= 4 ? (isEs ? "Repetir" : "Repeat") : (isEs ? "Siguiente Paso ▶" : "Next Step ▶")}
        </button>
      </div>
    </div>
  );
}

/** 3. Lámina interactiva de Saltos Voraces (Greedy Search) */
function FigHnswGreedy({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [target, setTarget] = useState({ x: 230, y: 40 });
  const [activeNode, setActiveNode] = useState(0);

  const nodes = [
    { id: 0, x: 50, y: 110, label: isEs ? "Entrada #0" : "Entry #0", nbs: [1, 2] },
    { id: 1, x: 120, y: 70, label: isEs ? "Nodo #1" : "Node #1", nbs: [0, 2, 3] },
    { id: 2, x: 110, y: 125, label: isEs ? "Nodo #2" : "Node #2", nbs: [0, 1, 4] },
    { id: 3, x: 200, y: 55, label: isEs ? "Nodo #3" : "Node #3", nbs: [1, 4] },
    { id: 4, x: 210, y: 115, label: isEs ? "Nodo #4" : "Node #4", nbs: [2, 3] },
  ];

  const curr = nodes[activeNode];
  const currDist = Math.hypot(curr.x - target.x, curr.y - target.y);

  const evaluated = curr.nbs.map(nbId => {
    const nb = nodes[nbId];
    const d = Math.hypot(nb.x - target.x, nb.y - target.y);
    return { ...nb, dist: d, closer: d < currDist };
  });

  const bestNb = evaluated.reduce((prev, c) => (c.dist < prev.dist ? c : prev), { dist: currDist, id: curr.id, closer: false });

  return (
    <div className="gd-fig">
      <svg
        className="gd-art gd-grab"
        {...ART}
        role="application"
        tabIndex={0}
        onPointerDown={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          setTarget({
            x: ((e.clientX - rect.left) / rect.width) * 320,
            y: ((e.clientY - rect.top) / rect.height) * 150,
          });
        }}
      >
        {/* Aristas del grafo */}
        <line x1="50" y1="110" x2="120" y2="70" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <line x1="50" y1="110" x2="110" y2="125" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <line x1="120" y1="70" x2="110" y2="125" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <line x1="120" y1="70" x2="200" y2="55" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <line x1="110" y1="125" x2="210" y2="115" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <line x1="200" y1="55" x2="210" y2="115" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

        {/* Rayos de evaluación */}
        {evaluated.map(nb => (
          <line
            key={`eval-${nb.id}`}
            x1={nb.x} y1={nb.y}
            x2={target.x} y2={target.y}
            stroke={nb.closer ? "#52e078" : "#ff4070"}
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        ))}

        {/* Nodos */}
        {nodes.map(n => {
          const isCurrent = n.id === curr.id;
          return (
            <g key={n.id} onClick={() => setActiveNode(n.id)} style={{ cursor: "pointer" }}>
              <circle cx={n.x} cy={n.y} r={isCurrent ? 9 : 6} fill={isCurrent ? "#ffd700" : "#00f0ff"} />
              <text x={n.x} y={n.y + 16} className="gd-art-n" textAnchor="middle">{n.label}</text>
            </g>
          );
        })}

        {/* Query */}
        <circle cx={target.x} cy={target.y} r="6" fill="#ff4070" stroke="#fff" strokeWidth="1.5" />
        <text x={target.x + 10} y={target.y + 4} className="gd-art-w gd-art-sm">Query Q</text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">{isEs ? "Nodo actual:" : "Current Node:"}</span>
        {nodes.map(n => (
          <button key={n.id} className={"gd-pill" + (activeNode === n.id ? " on" : "")} onClick={() => setActiveNode(n.id)}>
            #{n.id}
          </button>
        ))}
        {bestNb.closer && (
          <button className="gd-pill on" onClick={() => setActiveNode(bestNb.id)}>
            {isEs ? `Saltar a #${bestNb.id} ▶` : `Jump to #${bestNb.id} ▶`}
          </button>
        )}
      </div>
    </div>
  );
}

/** 4. Lámina interactiva del parámetro efSearch (Haz de Exploración) */
function FigHnswEfSearch({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [ef, setEf] = useState<number>(4);

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Haz de búsqueda en abanico */}
        <path
          d={`M 40 75 L 280 ${75 - ef * 7} L 280 ${75 + ef * 7} Z`}
          fill="rgba(0, 240, 255, 0.12)"
          stroke="#00f0ff"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />

        <circle cx="40" cy="75" r="6" fill="#ffd700" />
        <text x="40" y="95" className="gd-art-n" textAnchor="middle">Entry</text>

        {/* Nodos explorados simultáneos */}
        {Array.from({ length: ef }, (_, i) => {
          const y = 75 - (ef - 1) * 6 + i * 12;
          return (
            <g key={i}>
              <line x1="40" y1="75" x2="260" y2={y} stroke="rgba(0,240,255,0.4)" strokeWidth="1" />
              <circle cx="260" cy={y} r="4" fill="#52e078" />
            </g>
          );
        })}

        <text x="280" y="30" className="gd-art-n" textAnchor="end" fill="#52e078">
          {ef === 1 ? (isEs ? "Recall: 72% (Atrapado en mínimo local)" : "Recall: 72% (Trapped in local min)") : ef <= 4 ? (isEs ? "Recall: 94% (Rápido y preciso)" : "Recall: 94% (Fast & precise)") : (isEs ? "Recall: 99.8% (Precisión exacta)" : "Recall: 99.8% (Exact precision)")}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">efSearch:</span>
        <button className={"gd-pill" + (ef === 1 ? " on" : "")} onClick={() => setEf(1)}>ef = 1 (Voraz Puro)</button>
        <button className={"gd-pill" + (ef === 4 ? " on" : "")} onClick={() => setEf(4)}>ef = 4 (Equilibrado)</button>
        <button className={"gd-pill" + (ef === 8 ? " on" : "")} onClick={() => setEf(8)}>ef = 8 (Alta Fidelidad)</button>
      </div>
    </div>
  );
}

const CHAPTERS_DATA: Record<Lang, HnswChapter[]> = {
  es: [
    {
      id: "what",
      tag: "1. ¿Qué es HNSW?",
      head: "Búsqueda Vectorial a Escala Planetaria",
      lede: "HNSW (Hierarchical Navigable Small World) es el algoritmo estándar de la industria que impulsa las bases de datos vectoriales modernas.",
      body: [
        "En inteligencia artificial moderna (LLMs, embeddings, RAG), cada concepto se representa como un vector de alta dimensión (ej. 1536 dimensiones en OpenAI, 768 en BERT).",
        "Calcular la distancia exhaustiva de una consulta (query) contra millones de vectores tomaría segundos. HNSW resuelve esto organizando el espacio como un grafo navegable estratificado, reduciendo el tiempo de búsqueda de O(N) a O(log N).",
      ],
      fig: FigHnswOverview,
      note: "HNSW fue formulado por Yury Malkov y Dmitry Yashunin en 2016.",
    },
    {
      id: "skiplist",
      tag: "2. Skip List",
      head: "Inspiración en la Skip List 1D",
      lede: "De listas enlazadas probabilísticas a grafos geométricos multidimensionales.",
      body: [
        "Una Skip List tradicional mantiene niveles jerárquicos: las capas superiores tienen pocos elementos con saltos largos (autopistas), mientras que la capa base contiene todos los elementos.",
        "HNSW traslada este concepto a grafos multidimensionales: en lugar de punteros hacia adelante, cada capa es un grafo de proximidad de Delaunay aproximado.",
      ],
      fig: FigHnswSkipList,
      note: "La probabilidad de que un vector aparezca en la capa L decae exponencialmente según p = 1 / ln(M).",
    },
    {
      id: "greedy",
      tag: "3. Salto Voraz",
      head: "Descenso Voraz (Greedy Routing)",
      lede: "Cómo navega la consulta a través de los nodos vecinos.",
      body: [
        "En una capa dada, el algoritmo comienza en un nodo de entrada y evalúa la distancia de todos sus vecinos hacia la query.",
        "Si encuentra un vecino más cercano que el nodo actual, salta vorazmente hacia él y repite. Cuando ningún vecino mejora la distancia, hemos alcanzado el mínimo local de esa capa y descendemos verticalmente a la siguiente.",
      ],
      fig: FigHnswGreedy,
      note: "En la lámina interactiva superior, puedes arrastrar la Query Q y ver las sondas verdes (mejora) y rojas (descarte).",
    },
    {
      id: "ef",
      tag: "4. Parámetro ef",
      head: "Tamaño de la Cola de Exploración (efSearch)",
      lede: "El compromiso fundamental entre velocidad de consulta y precisión (Recall).",
      body: [
        "La búsqueda puramente voraz (ef=1) puede quedar atrapada en mínimos locales. Para evitarlo, HNSW mantiene una lista de prioridad de tamaño ef (exploration factor).",
        "ef pequeño (ej. 4-8): Búsqueda ultrarrápida (submilisegundo), pero puede perder el vecino óptimo.",
        "ef grande (ej. 32-128): Explora múltiples ramas simultáneamente, alcanzando más del 99% de Recall.",
      ],
      fig: FigHnswEfSearch,
      note: "En la sala interactiva, prueba a subir efSearch en la barra lateral para ver cómo se ensancha el haz de búsqueda.",
    },
    {
      id: "construction",
      tag: "5. Construcción",
      head: "Inserción y Poda Heurística de Enlaces",
      lede: "Cómo se construye el grafo sin saturar de aristas redundantes.",
      body: [
        "Al insertar un nuevo vector, se determina su capa máxima aleatoriamente. Luego se busca vorazmente desde la cima y se conecta con sus M vecinos más cercanos.",
        "Para evitar aglomeraciones que degraden la navegabilidad, HNSW aplica una regla de diversidad heurística: prefiere vecinos que cubran diferentes direcciones espaciales en lugar de un cúmulo cerrado.",
      ],
      note: "El parámetro M define el número máximo de conexiones bidireccionales por nodo.",
    },
    {
      id: "params",
      tag: "6. Parámetros",
      head: "Calibración en Producción: M, efConstruction y efSearch",
      lede: "Las tres perillas maestras de configuración en sistemas reales.",
      body: [
        "M (8 a 64): Grado máximo de salida. Valores más altos mejoran la precisión en dimensiones elevadas a costa de mayor consumo de memoria.",
        "efConstruction (64 a 200): Calidad del grafo durante la indexación inicial. Mayor valor produce mejores enlaces.",
        "efSearch (16 a 128): Parámetro de consulta en tiempo de ejecución. Permite ajustar dinámicamente la latencia según la carga del servidor.",
      ],
      note: "Memoria RAM típica: ~1.5 KB a 4 KB por vector indexado dependiendo de M y dimensiones.",
    },
    {
      id: "databases",
      tag: "7. Motores IA",
      head: "HNSW en la Industria del Software",
      lede: "El motor detrás de la revolución de Retrieval-Augmented Generation (RAG).",
      body: [
        "Motores Vectoriales Nativos: Qdrant (Rust), Milvus (Go/C++), Weaviate (Go), Pinecone.",
        "Extensiones para Bases Tradicionales: pgvector (PostgreSQL), Redis Search, ElasticSearch, Apache Lucene.",
        "Librerías Core: FAISS (Meta AI), hnswlib (Yury Malkov), USearch.",
      ],
      note: "Prácticamente todos los sistemas de búsqueda de contexto para LLMs confían en HNSW o variantes cuantizadas (IVF-PQ).",
    },
    {
      id: "controls",
      tag: "8. Controles",
      head: "Guía de Mandos de la Sala 3D",
      lede: "Aprovecha todas las herramientas interactivas.",
      body: [
        "Arrastrar / Rueda: Orbita y haz zoom libremente en la nube 3D estratificada.",
        "Botón 'Lanzar Query': Dispara una consulta aleatoria y visualiza el descenso entre capas.",
        "Paso a Paso (Tecla N): Examina cada salto individual y las evaluaciones de distancia.",
        "Cambio de Capas: Activa o desactiva capas individuales para aislar la estructura interna del grafo.",
      ],
      note: "Puedes pausar con la barra espaciadora en cualquier momento.",
    },
  ],
  en: [
    {
      id: "what",
      tag: "1. What is HNSW?",
      head: "Vector Search at Planetary Scale",
      lede: "HNSW (Hierarchical Navigable Small World) is the industry-standard algorithm powering modern vector databases.",
      body: [
        "In modern AI (LLMs, embeddings, RAG), semantic concepts are encoded as high-dimensional vectors (e.g. 1536 dims in OpenAI, 768 in BERT).",
        "Exhaustive brute-force search over millions of vectors takes seconds. HNSW organizes Euclidean space as a stratified navigable graph, slashing search complexity from O(N) to O(log N).",
      ],
      fig: FigHnswOverview,
      note: "HNSW was introduced by Yury Malkov and Dmitry Yashunin in 2016.",
    },
    {
      id: "skiplist",
      tag: "2. Skip List",
      head: "Inspiration from 1D Skip Lists",
      lede: "From probabilistic linked lists to geometric high-dimensional graphs.",
      body: [
        "A classic 1D Skip List maintains tiered express hierarchies: top layers contain few elements with long spans (express highways); the bottom layer holds every element.",
        "HNSW generalizes this paradigm to high-dimensional proximity graphs: instead of forward pointers, each tier forms an approximate Delaunay proximity subgraph.",
      ],
      fig: FigHnswSkipList,
      note: "The probability of a vector surviving up to layer L decays exponentially as p = 1 / ln(M).",
    },
    {
      id: "greedy",
      tag: "3. Greedy Routing",
      head: "Greedy Routing & Gradient Step",
      lede: "How queries navigate through spatial neighbors.",
      body: [
        "At any given layer, the query starts at an entry point and evaluates Euclidean distances to all its neighbors.",
        "If a neighbor is closer to the query than the current node, the algorithm greedily hops to it and repeats. When no neighbor improves distance, a local minimum is reached and search descends to the next layer.",
      ],
      fig: FigHnswGreedy,
      note: "In the interactive diagram above, drag Query Q to witness green improvement probes vs red rejected links.",
    },
    {
      id: "ef",
      tag: "4. Parameter ef",
      head: "Exploration Queue Capacity (efSearch)",
      lede: "The core trade-off between query speed and search Recall.",
      body: [
        "Pure greedy search (ef=1) can get stuck in local graph minima. To prevent this, HNSW maintains a priority queue of capacity ef.",
        "Small ef (4-8): Blazing fast sub-millisecond query latency with minor recall drop.",
        "Large ef (32-128): Explores multiple parallel branches simultaneously, delivering >99% Recall.",
      ],
      fig: FigHnswEfSearch,
      note: "In the 3D room, tune efSearch in the sidebar to watch the search beam widen.",
    },
    {
      id: "construction",
      tag: "5. Graph Construction",
      head: "Insertion & Heuristic Edge Pruning",
      lede: "How graphs are built without creating redundant dense clusters.",
      body: [
        "When inserting a vector, its top layer is assigned probabilistically. A top-down greedy search locates the closest M neighbors.",
        "To prevent topological bottlenecks, HNSW applies a heuristic diversity rule: it favors neighbors in distinct angular directions over redundant clusters.",
      ],
      note: "Parameter M controls the maximum degree of bi-directional connections per node.",
    },
    {
      id: "params",
      tag: "6. Production Tuning",
      head: "Production Knobs: M, efConstruction & efSearch",
      lede: "The three master calibration parameters in production vector systems.",
      body: [
        "M (8 to 64): Max degree. Higher M improves high-dimensional recall at the cost of higher RAM usage.",
        "efConstruction (64 to 200): Graph quality during initial index build.",
        "efSearch (16 to 128): Runtime query budget. Dynamically adjustable based on traffic load.",
      ],
      note: "Typical memory: ~1.5 KB to 4 KB per indexed vector depending on M and dimensions.",
    },
    {
      id: "databases",
      tag: "7. AI Engines",
      head: "HNSW in Modern Software Architecture",
      lede: "The foundational engine powering Retrieval-Augmented Generation (RAG).",
      body: [
        "Native Vector DBs: Qdrant (Rust), Milvus (Go/C++), Weaviate (Go), Pinecone.",
        "Traditional DB Extensions: pgvector (PostgreSQL), Redis Search, ElasticSearch, Apache Lucene.",
        "Core Libraries: FAISS (Meta AI), hnswlib (Yury Malkov), USearch.",
      ],
      note: "Virtually all enterprise context retrieval pipelines for LLMs rely on HNSW or quantized variants.",
    },
    {
      id: "controls",
      tag: "8. Controls",
      head: "3D Room Controls & Keybindings",
      lede: "Maximize your interactive exploration experience.",
      body: [
        "Drag / Scroll: Orbit and zoom freely within the 3D stratified vector cloud.",
        "Launch Query: Dispatches a real-time query vector down through the layers.",
        "Step by Step (N key): Inspect individual routing hops and distance checks.",
        "Layer Visibility: Toggle individual layers on/off to isolate graph topology.",
      ],
      note: "You can pause simulation anytime with Spacebar.",
    },
  ],
};

export default function HnswGuide({
  onClose,
  initialChapter = "what",
  lang = "es",
}: {
  onClose: () => void;
  initialChapter?: HnswChapterId;
  lang?: Lang;
}) {
  const chapters = CHAPTERS_DATA[lang] ?? CHAPTERS_DATA.es;
  const [currentId, setCurrentId] = useState<HnswChapterId>(initialChapter);

  const idx = chapters.findIndex(c => c.id === currentId);
  const currentChapter = chapters[idx >= 0 ? idx : 0];
  const Fig = currentChapter.fig;

  const nextChapter = useCallback(() => {
    if (idx < chapters.length - 1) {
      setCurrentId(chapters[idx + 1].id);
    }
  }, [idx, chapters]);

  const prevChapter = useCallback(() => {
    if (idx > 0) {
      setCurrentId(chapters[idx - 1].id);
    }
  }, [idx, chapters]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        nextChapter();
      } else if (e.key === "ArrowLeft") {
        prevChapter();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextChapter, onClose, prevChapter]);

  return (
    <div className="gd-veil" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gd" role="dialog" aria-modal="true" aria-labelledby="hnsw-guide-title">
        <header className="gd-top">
          <p className="eyebrow">{lang === "es" ? "guía técnica de búsqueda vectorial · hnsw" : "hnsw vector search guide"}</p>
          <div className="gd-top-acts">
            <button className="gd-ghost" onClick={onClose}>
              <span>{lang === "es" ? "cerrar" : "close"}</span> <kbd>esc</kbd>
            </button>
          </div>
        </header>

        <div className="gd-main">
          <nav className="gd-toc" aria-label="Capítulos de la guía HNSW">
            {chapters.map((c, i) => (
              <button
                key={c.id}
                className={"gd-toc-i" + (c.id === currentId ? " on" : "")}
                onClick={() => setCurrentId(c.id)}
                aria-current={c.id === currentId}
              >
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{c.tag}</span>
              </button>
            ))}
          </nav>

          <article className="gd-page">
            <h2 className="gd-head" id="hnsw-guide-title">{currentChapter.head}</h2>
            <p className="gd-lede">{currentChapter.lede}</p>

            {currentChapter.body.map((p, k) => (
              <p key={k} className="gd-body">{p}</p>
            ))}

            {Fig && (
              <div className="gd-stage">
                <Fig lang={lang} />
              </div>
            )}

            <p className="gd-note">{currentChapter.note}</p>
          </article>
        </div>

        <footer className="gd-foot">
          <span className="gd-count">
            {lang === "es" ? `capítulo ${idx + 1} de ${chapters.length} · ${currentChapter.tag}` : `chapter ${idx + 1} of ${chapters.length} · ${currentChapter.tag}`}
          </span>
          <div className="gd-foot-acts">
            {idx > 0 && (
              <button className="gd-back" onClick={prevChapter}>
                {lang === "es" ? "anterior" : "previous"}
              </button>
            )}
            <button
              className="gd-go"
              onClick={() => (idx === chapters.length - 1 ? onClose() : nextChapter())}
            >
              {idx === chapters.length - 1 ? (lang === "es" ? "cerrar guía" : "close guide") : (lang === "es" ? "siguiente capítulo" : "next chapter")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
