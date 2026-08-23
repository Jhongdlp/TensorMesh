export interface MctsCopy {
  backHome: string;
  guideBtn: string;
  preset: string;
  explorationDials: string;
  paramCpuct: string;
  viz3D: string;
  levelRings: string;
  reasoningTree: string;
  rootValue: string;
  totalNodes: string;
  pruningEfficiency: string;
  resetSearch: string;
  step: string;
  speed: string;
  reasoningScenario: string;
  explorationConstant: string;
  maxDepth: string;
  computeBudget: string;
  fullView: string;
  pause: string;
  resume: string;
  stepForward: string;
  stepBackward: string;
  fullscreen: string;
  collapse: string;
  expand: string;
  noGpu: string;
  noGpuSub: string;
  noGpuBack: string;
  roamedNote: string;
  roamedBack: string;
  zenOut: string;
  totalNodesLabel: string;
  totalLinksLabel: string;
  currentPhaseLabel: string;
  rootValueLabel: string;
  goldenLengthLabel: string;
  prunedCountLabel: string;
  thoughtTraceTitle: string;
  guideTitle: string;
}

export const MCTS_COPY: Record<"es" | "en", MctsCopy> = {
  es: {
    backHome: "Volver al Atlas",
    guideBtn: "Guía de Razonamiento",
    preset: "Problema a Resolver",
    explorationDials: "Diales de Exploración",
    paramCpuct: "Curiosidad PUCT (c_puct)",
    viz3D: "Visualización 3D",
    levelRings: "Anillos de Profundidad",
    reasoningTree: "Árbol de Razonamiento",
    rootValue: "Valor Raíz Q",
    totalNodes: "Nodos Generados",
    pruningEfficiency: "Eficiencia de Poda",
    resetSearch: "Reiniciar",
    step: "Paso",
    speed: "Velocidad",
    reasoningScenario: "Escenario de Razonamiento",
    explorationConstant: "Constante de Exploración (Cp)",
    maxDepth: "Profundidad Máxima",
    computeBudget: "Presupuesto de Cómputo (Rollouts)",
    fullView: "vista completa",
    pause: "pausa",
    resume: "seguir",
    stepForward: "paso adelante",
    stepBackward: "paso atrás",
    fullscreen: "pantalla completa",
    collapse: "plegar",
    expand: "desplegar",
    noGpu: "MCTS Reasoning Trees necesita WebGPU para ejecutarse.",
    noGpuSub: "Tu navegador no tiene WebGPU activado o este dispositivo no lo soporta. Prueba en Chrome, Edge o Firefox Nightly.",
    noGpuBack: "Volver al Inicio",
    roamedNote: "Has desplazado la cámara",
    roamedBack: "Reencuadrar",
    zenOut: "Salir de pantalla completa (Esc)",
    totalNodesLabel: "nodos en el árbol",
    totalLinksLabel: "ramas exploradas",
    currentPhaseLabel: "fase de razonamiento",
    rootValueLabel: "valor raíz (Q)",
    goldenLengthLabel: "longitud vía dorada",
    prunedCountLabel: "hipótesis podadas",
    thoughtTraceTitle: "Traza de Pensamiento (Inference-Time)",
    guideTitle: "Guía de Árboles de Razonamiento MCTS",
  },
  en: {
    backHome: "Back to Atlas",
    guideBtn: "Reasoning Guide",
    preset: "Reasoning Problem",
    explorationDials: "Exploration Dials",
    paramCpuct: "PUCT Curiosity (c_puct)",
    viz3D: "3D Visualization",
    levelRings: "Depth Rings",
    reasoningTree: "Reasoning Tree",
    rootValue: "Root Value Q",
    totalNodes: "Generated Nodes",
    pruningEfficiency: "Pruning Efficiency",
    resetSearch: "Reset",
    step: "Step",
    speed: "Speed",
    reasoningScenario: "Reasoning Scenario",
    explorationConstant: "Exploration Constant (Cp)",
    maxDepth: "Max Tree Depth",
    computeBudget: "Compute Budget (Rollouts)",
    fullView: "full view",
    pause: "pause",
    resume: "resume",
    stepForward: "step forward",
    stepBackward: "step backward",
    fullscreen: "fullscreen",
    collapse: "collapse",
    expand: "expand",
    noGpu: "MCTS Reasoning Trees requires WebGPU to run.",
    noGpuSub: "Your browser does not have WebGPU enabled or this device does not support it. Try Chrome, Edge or Firefox Nightly.",
    noGpuBack: "Back to Home",
    roamedNote: "You moved the camera",
    roamedBack: "Reset View",
    zenOut: "Exit Fullscreen (Esc)",
    totalNodesLabel: "tree nodes",
    totalLinksLabel: "explored branches",
    currentPhaseLabel: "reasoning phase",
    rootValueLabel: "root confidence (Q)",
    goldenLengthLabel: "golden path length",
    prunedCountLabel: "pruned hypotheses",
    thoughtTraceTitle: "Reasoning Thought Trace (Inference-Time)",
    guideTitle: "MCTS Reasoning Trees Guide",
  },
};

export const MCTS_PRESETS_I18N = {
  es: [
    {
      id: "math_proof",
      name: "Demostración: Raíz de 2 es Irracional",
      desc: "Demostración por contradicción y teoría de números.",
      problemStatement: "Demostrar rigurosamente que √2 no puede expresarse como fracción irreductible a/b.",
    },
    {
      id: "game_24",
      name: "Puzle Aritmético: Juego del 24",
      desc: "Búsqueda combinatoria de operaciones con backtracking.",
      problemStatement: "Combinar [4, 7, 8, 8] con operadores (+, -, *, /) para obtener exactamente 24.",
    },
    {
      id: "logic_einstein",
      name: "Acertijo de Lógica Deductiva",
      desc: "Satisfacción de restricciones y poda de contradicciones.",
      problemStatement: "Deducir quién es el dueño del pez a partir de 5 casas, colores y profesiones.",
    },
    {
      id: "chess_tactics",
      name: "Ajedrez Táctico: Mate en 3",
      desc: "Cálculo de variantes tácticas y árboles de juego minimax.",
      problemStatement: "Encontrar la combinación ganadora forzada de sacrificio de dama.",
    },
  ],
  en: [
    {
      id: "math_proof",
      name: "Proof: Square Root of 2 is Irrational",
      desc: "Proof by contradiction and number theory decomposition.",
      problemStatement: "Formally prove that √2 cannot be expressed as an irreducible fraction a/b.",
    },
    {
      id: "game_24",
      name: "Arithmetic Puzzle: Game of 24",
      desc: "Combinatorial operation search with deductive backtracking.",
      problemStatement: "Combine numbers [4, 7, 8, 8] using (+, -, *, /) to evaluate to exactly 24.",
    },
    {
      id: "logic_einstein",
      name: "Deductive Logic Riddle",
      desc: "Constraint satisfaction and pruning of impossible deductions.",
      problemStatement: "Deduce who owns the fish given 5 houses, colors, and attributes.",
    },
    {
      id: "chess_tactics",
      name: "Tactical Chess: Mate in 3",
      desc: "Deep tactical calculation and minimax tree exploration.",
      problemStatement: "Find the forced queen-sacrifice winning tactical combination.",
    },
  ],
};

export const MCTS_PHASES_I18N: Record<"es" | "en", Record<string, string>> = {
  es: {
    select: "Selección PUCT",
    expand: "Expansión",
    evaluate: "Evaluación",
    backprop: "Retropropagación",
    prune: "Poda",
    finalize: "Vía Dorada",
  },
  en: {
    select: "PUCT Selection",
    expand: "Expansion",
    evaluate: "Evaluation",
    backprop: "Backpropagation",
    prune: "Pruning",
    finalize: "Golden Path",
  },
};
