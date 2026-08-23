import { useCallback, useEffect, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

export type MctsChapterId =
  | "what" | "puct" | "phases" | "o1"
  | "pruning" | "testtime" | "controls";

interface MctsChapter {
  id: MctsChapterId;
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
   Láminas Interactivas de MCTS / Tree-of-Thoughts
   ========================================================================== */

/** 1. Lámina interactiva de Árbol de Pensamientos (Tree-of-Thoughts) */
function FigMctsTreeOfThoughts({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [selectedBranch, setSelectedBranch] = useState<number>(0);

  const branches = [
    { id: 0, label: isEs ? "Hipótesis A (Óptima)" : "Hypothesis A (Optimal)", score: 0.94, color: "#ffd700", desc: isEs ? "Paso deductivo válido verificado por el modelo de recompensa." : "Sound deductive step validated by reward model." },
    { id: 1, label: isEs ? "Hipótesis B (Poda)" : "Hypothesis B (Pruned)", score: 0.32, color: "#ff4070", desc: isEs ? "Alucinación o error lógico detectado en la bifurcación." : "Hallucination or logical error detected and pruned." },
    { id: 2, label: isEs ? "Hipótesis C (Explorada)" : "Hypothesis C (Explored)", score: 0.76, color: "#00d2ff", desc: isEs ? "Camino alternativo válido con menor recompensa esperada." : "Alternative valid path with lower expected value." },
  ];

  const cur = branches[selectedBranch];

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Raíz (Prompt Inicial) */}
        <circle cx="160" cy="25" r="8" fill="#fff" />
        <text x="160" y="15" className="gd-art-n" textAnchor="middle">Prompt Raíz</text>

        {/* 3 Ramas Hijas */}
        {[
          { x: 70, y: 75, b: branches[0] },
          { x: 160, y: 75, b: branches[1] },
          { x: 250, y: 75, b: branches[2] },
        ].map((node, i) => {
          const isSel = selectedBranch === i;
          return (
            <g key={i} onClick={() => setSelectedBranch(i)} style={{ cursor: "pointer" }}>
              <line
                x1="160"
                y1="25"
                x2={node.x}
                y2={node.y}
                stroke={isSel ? node.b.color : "rgba(255,255,255,0.2)"}
                strokeWidth={isSel ? 2.5 : 1}
              />
              <circle
                cx={node.x}
                cy={node.y}
                r={isSel ? 10 : 7}
                fill={node.b.color}
                stroke="#fff"
                strokeWidth={isSel ? 1.5 : 0}
              />
              <text x={node.x} y={node.y + 18} className="gd-art-n" textAnchor="middle">
                R={node.b.score}
              </text>
            </g>
          );
        })}

        {/* Sub-nodos del camino seleccionado */}
        {selectedBranch === 0 && (
          <g>
            <line x1="70" y1="75" x2="45" y2="120" stroke="#ffd700" strokeWidth="2" />
            <line x1="70" y1="75" x2="95" y2="120" stroke="#ffd700" strokeWidth="2" />
            <circle cx="45" cy="120" r="5" fill="#ffd700" />
            <circle cx="95" cy="120" r="5" fill="#ffd700" />
          </g>
        )}
      </svg>

      <div className="gd-fig-acts" role="group">
        {branches.map((b, i) => (
          <button
            key={b.id}
            className={"gd-pill" + (selectedBranch === i ? " on" : "")}
            onClick={() => setSelectedBranch(i)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <p className="gd-cap">
        <b style={{ color: cur.color }}>{cur.label} (Score Q = {cur.score}):</b> {cur.desc}
      </p>
    </div>
  );
}

/** 2. Lámina interactiva de la Fórmula PUCT */
function FigPuctFormula({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [cPuct, setCPuct] = useState(1.414);

  const nA = 50, qA = 0.82, pA = 0.5;
  const ucbA = qA + cPuct * pA * (Math.sqrt(100) / (1 + nA));

  const nB = 3, qB = 0.65, pB = 0.5;
  const ucbB = qB + cPuct * pB * (Math.sqrt(100) / (1 + nB));

  const winner = ucbA >= ucbB ? "A" : "B";

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-label="Fórmula PUCT interactiva">
        <g>
          <circle cx="90" cy="55" r="22" fill={winner === "A" ? "rgba(255, 215, 0, 0.2)" : "rgba(255, 255, 255, 0.05)"} stroke={winner === "A" ? "#ffd700" : "rgba(255, 255, 255, 0.2)"} strokeWidth="1.5" />
          <text x="90" y="52" fill={winner === "A" ? "#ffd700" : "#fff"} fontSize="9" fontWeight="bold" textAnchor="middle">{isEs ? "Rama A" : "Branch A"}</text>
          <text x="90" y="64" fill="var(--ink-2)" fontSize="7" textAnchor="middle">Q=0.82 · N=50</text>
          <text x="90" y="92" fill={winner === "A" ? "#ffd700" : "var(--ink-3)"} fontSize="8" fontWeight="bold" textAnchor="middle">Score: {ucbA.toFixed(3)}</text>
          <text x="90" y="104" fill="var(--ink-3)" fontSize="6.5" textAnchor="middle">{isEs ? "(Explotación)" : "(Exploitation)"}</text>
        </g>

        <text x="160" y="60" fill="var(--ink-3)" fontSize="10" fontWeight="bold" textAnchor="middle">vs</text>

        <g>
          <circle cx="230" cy="55" r="22" fill={winner === "B" ? "rgba(0, 210, 255, 0.2)" : "rgba(255, 255, 255, 0.05)"} stroke={winner === "B" ? "#00d2ff" : "rgba(255, 255, 255, 0.2)"} strokeWidth="1.5" />
          <text x="230" y="52" fill={winner === "B" ? "#00d2ff" : "#fff"} fontSize="9" fontWeight="bold" textAnchor="middle">{isEs ? "Rama B" : "Branch B"}</text>
          <text x="230" y="64" fill="var(--ink-2)" fontSize="7" textAnchor="middle">Q=0.65 · N=3</text>
          <text x="230" y="92" fill={winner === "B" ? "#00d2ff" : "var(--ink-3)"} fontSize="8" fontWeight="bold" textAnchor="middle">Score: {ucbB.toFixed(3)}</text>
          <text x="230" y="104" fill="var(--ink-3)" fontSize="6.5" textAnchor="middle">{isEs ? "(Exploración/Curiosidad)" : "(Exploration/Curiosity)"}</text>
        </g>

        <text x="160" y="132" fill={winner === "A" ? "#ffd700" : "#00d2ff"} fontSize="8" fontWeight="bold" textAnchor="middle">
          {winner === "A"
            ? (isEs ? "El Agente Elige Explotar Rama A (Camino Seguro)" : "Agent Chooses to Exploit Branch A (Safe Path)")
            : (isEs ? "El Agente Elige Explorar Rama B (Incentivo de Novedad)" : "Agent Chooses to Explore Branch B (Curiosity Incentive)")}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">{isEs ? "Constante de Curiosidad (c_puct):" : "Curiosity Constant (c_puct):"} <b>{cPuct.toFixed(2)}</b></span>
        <button className={"gd-pill" + (cPuct <= 0.5 ? " on" : "")} onClick={() => setCPuct(0.4)}>0.40 (Conservador)</button>
        <button className={"gd-pill" + (cPuct > 0.5 && cPuct <= 1.8 ? " on" : "")} onClick={() => setCPuct(1.41)}>1.41 (Estándar UCB)</button>
        <button className={"gd-pill" + (cPuct > 1.8 ? " on" : "")} onClick={() => setCPuct(2.6)}>2.60 (Alta Exploración)</button>
      </div>
    </div>
  );
}

/** 3. Lámina interactiva de las 4 Fases MCTS */
function FigMctsPhases({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [phase, setPhase] = useState<number>(0);

  const phases = [
    { title: isEs ? "1. Selección" : "1. Selection", desc: isEs ? "Desciende por el árbol eligiendo la hipótesis con mayor PUCT hasta llegar a un nodo frontera." : "Traverses down the tree choosing children with maximum PUCT until reaching an unexpanded frontier leaf.", col: "#52e078" },
    { title: isEs ? "2. Expansión" : "2. Expansion", desc: isEs ? "El LLM genera 2 o 3 nuevos pensamientos derivados (ramas hijas alternativas)." : "The generative LLM branches out 2 or 3 alternative sub-hypotheses (child thoughts).", col: "#00d2ff" },
    { title: isEs ? "3. Evaluación" : "3. Evaluation", desc: isEs ? "Un modelo de crítica (Reward Model) o verificador asigna una recompensa R de 0 a 1." : "A critique model (Reward Model) or verifier assigns a scalar reward R from 0 to 1.", col: "#ffd700" },
    { title: isEs ? "4. Retropropagación" : "4. Backpropagation", desc: isEs ? "La recompensa sube hacia la raíz actualizando N(s,a) y el valor medio Q(s,a)." : "The reward propagates back up to root, updating N(s,a) and mean expected value Q(s,a).", col: "#ff6b8b" },
  ];

  const cur = phases[phase];

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-label="4 Fases de MCTS">
        {/* Árbol esquemático */}
        <circle cx="160" cy="25" r="7" fill={phase === 3 ? cur.col : "#fff"} />
        <line x1="160" y1="25" x2="110" y2="65" stroke={phase === 0 || phase === 3 ? cur.col : "rgba(255,255,255,0.2)"} strokeWidth={phase === 0 || phase === 3 ? 2.5 : 1} />
        <line x1="160" y1="25" x2="210" y2="65" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <circle cx="110" cy="65" r="6" fill={phase === 0 || phase === 3 ? cur.col : "#00d2ff"} />
        <circle cx="210" cy="65" r="6" fill="rgba(255,255,255,0.3)" />

        <line x1="110" y1="65" x2="80" y2="105" stroke={phase === 1 ? cur.col : "rgba(255,255,255,0.2)"} strokeWidth={phase === 1 ? 2.5 : 1} strokeDasharray={phase === 1 ? "3 2" : "none"} />
        <line x1="110" y1="65" x2="140" y2="105" stroke={phase === 1 ? cur.col : "rgba(255,255,255,0.2)"} strokeWidth={phase === 1 ? 2.5 : 1} strokeDasharray={phase === 1 ? "3 2" : "none"} />
        <circle cx="80" cy="105" r="6" fill={phase === 2 ? cur.col : phase === 1 ? cur.col : "#ffd700"} />
        <circle cx="140" cy="105" r="6" fill={phase === 1 ? cur.col : "rgba(255,255,255,0.3)"} />
      </svg>

      <div className="gd-fig-acts" role="group">
        {phases.map((p, i) => (
          <button
            key={i}
            className={"gd-pill" + (phase === i ? " on" : "")}
            onClick={() => setPhase(i)}
          >
            {p.title}
          </button>
        ))}
      </div>

      <p className="gd-cap">
        <b style={{ color: cur.col }}>{cur.title}:</b> {cur.desc}
      </p>
    </div>
  );
}

/** 4. Lámina interactiva de Ley de Escalamiento en Inferencia (Test-Time Compute) */
function FigMctsTestTimeCompute({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [budget, setBudget] = useState<number>(3);

  const budgets = [
    { k: 1, label: isEs ? "Paso Directo (Zero-Shot)" : "Zero-Shot Direct", tokens: "1k tokens", acc: "42%", color: "#ff4070" },
    { k: 2, label: isEs ? "MCTS 10 Iteraciones" : "MCTS 10 Iterations", tokens: "8k tokens", acc: "74%", color: "#00d2ff" },
    { k: 3, label: isEs ? "MCTS 50 Iteraciones (o1)" : "MCTS 50 Iterations (o1)", tokens: "32k tokens", acc: "91%", color: "#ffd700" },
  ];

  const cur = budgets[budget - 1];

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Curva de precisión vs cómputo */}
        <path d="M 40 120 Q 140 50 280 30" stroke="#00f0ff" strokeWidth="2.5" fill="none" />
        <line x1="40" y1="125" x2="280" y2="125" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

        {/* Punto activo */}
        <circle
          cx={budget === 1 ? 40 : budget === 2 ? 140 : 280}
          cy={budget === 1 ? 120 : budget === 2 ? 65 : 30}
          r="6"
          fill={cur.color}
          stroke="#fff"
          strokeWidth="1.5"
        />

        <text x="40" y="140" className="gd-art-n">1x Compute</text>
        <text x="140" y="140" className="gd-art-n" textAnchor="middle">10x Compute</text>
        <text x="280" y="140" className="gd-art-n" textAnchor="end">50x Compute</text>
      </svg>

      <div className="gd-fig-acts" role="group">
        {budgets.map(b => (
          <button
            key={b.k}
            className={"gd-pill" + (budget === b.k ? " on" : "")}
            onClick={() => setBudget(b.k)}
          >
            {b.label}
          </button>
        ))}
      </div>

      <p className="gd-cap">
        <b style={{ color: cur.color }}>Precisión de Razonamiento: {cur.acc}</b> ({cur.tokens})
      </p>
    </div>
  );
}

const CHAPTERS_DATA: Record<Lang, MctsChapter[]> = {
  es: [
    {
      id: "what",
      tag: "1. ¿Qué es MCTS?",
      head: "De Búsqueda en Juegos a Razonamiento en LLMs",
      lede: "Monte Carlo Tree Search (MCTS) es la arquitectura de búsqueda deliberativa que permite a los modelos de lenguaje pensar paso a paso antes de responder.",
      body: [
        "Mientras que un LLM estándar predice token a token de forma lineal (sin posibilidad de rectificar un error inicial), MCTS explora el espacio de razonamiento como un árbol de hipótesis bifurcadas.",
        "El algoritmo simula múltiples caminos deductivos, evalúa su coherencia con modelos de recompensa (Reward Models) y retropropaga el valor para elegir el camino óptimo.",
      ],
      fig: FigMctsTreeOfThoughts,
      note: "Popularizado históricamente por AlphaGo y AlphaZero, y hoy adaptado en modelos como OpenAI o1, DeepSeek-R1 y QwQ.",
    },
    {
      id: "puct",
      tag: "2. Fórmula PUCT",
      head: "El Balance entre Explotación y Curiosidad",
      lede: "Cómo el algoritmo decide cuándo seguir profundizando en una buena idea o explorar una nueva.",
      body: [
        "En cada nodo, la fórmula PUCT calcula: Score = Q(s,a) + c_puct * P(s,a) * (sqrt(N_padre) / (1 + N_hijo)).",
        "Término de Explotación Q(s,a): Recompensa media acumulada de esa rama en simulaciones previas.",
        "Término de Exploración (Curiosidad): Bonificación inversamente proporcional a las visitas del hijo.",
      ],
      fig: FigPuctFormula,
      note: "En la lámina superior, ajusta la constante c_puct para ver el cambio de decisión del agente.",
    },
    {
      id: "phases",
      tag: "3. Las 4 Fases",
      head: "El Ciclo Recursivo de Monte Carlo",
      lede: "Cuatro pasos coordinados que se repiten cientos de veces por segundo.",
      body: [
        "1. Selección: Desciende desde la raíz eligiendo hijos con máximo PUCT.",
        "2. Expansión: Si el nodo no ha sido explorado, genera nuevas hipótesis hijas.",
        "3. Evaluación: Calcula el valor heurístico o recompensa terminal del nuevo estado.",
        "4. Retropropagación: Actualiza las estadísticas N y Q de todos los ancestros hasta la raíz.",
      ],
      fig: FigMctsPhases,
      note: "En la sala 3D, puedes seguir este ciclo en tiempo real pulsando 'Paso a Paso' o la tecla N.",
    },
    {
      id: "o1",
      tag: "4. Test-Time Compute",
      head: "La Nueva Ley de Escalamiento en Inferencia",
      lede: "Invertir más cómputo durante el pensamiento supera a modelos diez veces más grandes.",
      body: [
        "La era de sólo escalar parámetros y tokens de preentrenamiento ha dado paso al escalamiento en tiempo de prueba (Inference Scaling).",
        "Dedicar 30 segundos de búsqueda MCTS en GPU permite a un modelo resolver problemas matemáticos, de código y deducción que fallaría en una pasada directa.",
      ],
      fig: FigMctsTestTimeCompute,
      note: "MCTS permite desacoplar el tamaño del modelo de su capacidad de razonamiento lógico profundo.",
    },
    {
      id: "pruning",
      tag: "5. Poda y Backtracking",
      head: "Detección Temprana de Alucinaciones",
      lede: "Cortar ramas muertas antes de que contaminen la respuesta final.",
      body: [
        "Cuando un verificador detecta un paso inválido (premisa falsa o cálculo erróneo), el valor Q de esa rama cae a 0.",
        "El término PUCT redirige inmediatamente la búsqueda hacia caminos alternativos sin desperdiciar tokens en ramas condenadas al fracaso.",
      ],
      note: "La poda heurística reduce exponencialmente el espacio combinatorio de búsqueda.",
    },
    {
      id: "testtime",
      tag: "6. Modelos de Crítica",
      head: "Process Reward Models (PRMs)",
      lede: "Evaluar cada paso intermedio en lugar de sólo la respuesta final.",
      body: [
        "Outcome Reward Models (ORMs): Sólo evalúan si el resultado final es correcto.",
        "Process Reward Models (PRMs): Supervisan cada paso lógico individual del razonamiento.",
        "Los PRMs son el combustible ideal para MCTS porque permiten guiar la búsqueda con recompensas densas en cada nodo.",
      ],
      note: "Investigaciones de OpenAI muestran que los PRMs reducen drásticamente las alucinaciones matemáticas.",
    },
    {
      id: "controls",
      tag: "7. Controles 3D",
      head: "Guía de Exploración de Árboles",
      lede: "Herramientas de inspección visual en la escena.",
      body: [
        "Arrastrar / Zoom: Navega libremente por la estructura tridimensional del árbol.",
        "Paso a Paso (N): Observa la selección y backpropagation paso a paso.",
        "Presets de Problemas: Prueba problemas matemáticos, lógica formal y cadenas de deducción.",
      ],
      note: "Puedes pausar con la barra espaciadora en cualquier momento.",
    },
  ],
  en: [
    {
      id: "what",
      tag: "1. What is MCTS?",
      head: "From Game Search to LLM Reasoning",
      lede: "Monte Carlo Tree Search (MCTS) is the deliberative search framework enabling language models to think step-by-step before answering.",
      body: [
        "While standard LLMs predict tokens linearly without recovery from early errors, MCTS explores reasoning space as a branching tree of alternative hypotheses.",
        "The system simulates multiple deductive trajectories, scores them via critique reward models, and backpropagates value to commit to the optimal response.",
      ],
      fig: FigMctsTreeOfThoughts,
      note: "Historically pioneered by AlphaGo and AlphaZero, now powering OpenAI o1, DeepSeek-R1, and QwQ.",
    },
    {
      id: "puct",
      tag: "2. PUCT Formula",
      head: "Balancing Exploitation and Curiosity",
      lede: "How the search algorithm arbitrates between drilling down a proven hypothesis versus exploring novel thoughts.",
      body: [
        "At every node, PUCT calculates: Score = Q(s,a) + c_puct * P(s,a) * (sqrt(N_parent) / (1 + N_child)).",
        "Exploitation term Q(s,a): Mean historical reward observed along that subtree.",
        "Exploration term: Curiosity bonus scaling inversely with child visit count.",
      ],
      fig: FigPuctFormula,
      note: "In the interactive widget above, slide c_puct to witness the agent's trade-off shift.",
    },
    {
      id: "phases",
      tag: "3. The 4 Phases",
      head: "The Recursive Monte Carlo Cycle",
      lede: "Four synchronized stages executing hundreds of times per second.",
      body: [
        "1. Selection: Descends from root selecting children with maximal PUCT.",
        "2. Expansion: When reaching an unvisited frontier leaf, spawns candidate thoughts.",
        "3. Evaluation: Scores the newly expanded node using a process reward model.",
        "4. Backpropagation: Updates visit counts N and mean values Q along the ancestor chain.",
      ],
      fig: FigMctsPhases,
      note: "In the 3D room, advance step-by-step using the N key to trace this cycle live.",
    },
    {
      id: "o1",
      tag: "4. Test-Time Compute",
      head: "The Inference Scaling Law",
      lede: "Spending more compute at inference time outperforms models ten times larger.",
      body: [
        "Scaling parameters is yielding ground to test-time search compute scaling.",
        "Allocating 30 seconds of GPU search allows a compact model to crack complex mathematical proofs that defeat raw zero-shot giants.",
      ],
      fig: FigMctsTestTimeCompute,
      note: "MCTS decouples raw parameter count from profound deductive capability.",
    },
    {
      id: "pruning",
      tag: "5. Pruning & Backtracking",
      head: "Early Hallucination Pruning",
      lede: "Trimming flawed branches before they contaminate the final output.",
      body: [
        "When a verifier detects an invalid deduction, the branch's Q-value collapses.",
        "The PUCT mechanism automatically steers compute toward promising alternatives without wasting generation budget on dead ends.",
      ],
      note: "Heuristic pruning exponentially reduces combinatorial reasoning spaces.",
    },
    {
      id: "testtime",
      tag: "6. Process Reward Models",
      head: "Process Reward Models (PRMs)",
      lede: "Evaluating intermediate steps rather than solely final answers.",
      body: [
        "Outcome Reward Models (ORMs): Evaluate whether the end response is correct.",
        "Process Reward Models (PRMs): Grade each intermediate deductive token step.",
        "PRMs provide dense guidance signals essential for efficient MCTS tree search.",
      ],
      note: "OpenAI research confirms PRMs drastically curtail mathematical hallucinations.",
    },
    {
      id: "controls",
      tag: "7. 3D Navigation",
      head: "Tree Exploration Guide",
      lede: "Visual inspection controls in the 3D canvas.",
      body: [
        "Drag / Zoom: Freely inspect the 3D tree layout and branch topology.",
        "Step by Step (N): Watch selection and backpropagation one step at a time.",
        "Reasoning Presets: Test classic math puzzles, logic proofs, and deduction paths.",
      ],
      note: "Pause anytime using the Spacebar.",
    },
  ],
};

export default function MctsGuide({
  onClose,
  initialChapter = "what",
  lang = "es",
}: {
  onClose: () => void;
  initialChapter?: MctsChapterId;
  lang?: Lang;
}) {
  const chapters = CHAPTERS_DATA[lang] ?? CHAPTERS_DATA.es;
  const [currentId, setCurrentId] = useState<MctsChapterId>(initialChapter);

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
      <div className="gd" role="dialog" aria-modal="true" aria-labelledby="mcts-guide-title">
        <header className="gd-top">
          <p className="eyebrow">{lang === "es" ? "guía de árboles de razonamiento · mcts" : "mcts reasoning tree guide"}</p>
          <div className="gd-top-acts">
            <button className="gd-ghost" onClick={onClose}>
              <span>{lang === "es" ? "cerrar" : "close"}</span> <kbd>esc</kbd>
            </button>
          </div>
        </header>

        <div className="gd-main">
          <nav className="gd-toc" aria-label="Capítulos de la guía MCTS">
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
            <h2 className="gd-head" id="mcts-guide-title">{currentChapter.head}</h2>
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
