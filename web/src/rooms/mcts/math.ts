/**
 * Sala 05 — Árboles de Razonamiento MCTS (Monte Carlo Tree Search & Tree-of-Thoughts)
 *
 * Algoritmo de exploración de hipótesis en agentes de IA:
 * 1. Selección (Selection) con PUCT / UCB1
 * 2. Expansión (Expansion) de bifurcaciones de pensamiento
 * 3. Evaluación (Evaluation / Rollout) de verosimilitud y recompensa
 * 4. Retropropagación (Backpropagation) de valores Q(s, a)
 */

export interface Vec3D {
  x: number;
  y: number;
  z: number;
}

export type NodeState = "unvisited" | "selected" | "expanded" | "evaluated" | "backpropagating" | "pruned" | "golden";

export interface MCTSNode {
  id: number;
  parentId: number | null;
  childrenIds: number[];
  depth: number;
  label: string;
  thoughtType: "premise" | "hypothesis" | "verification" | "refinement" | "solution" | "dead_end";
  pos: Vec3D;
  visits: number; // N(s, a)
  totalValue: number; // W(s, a)
  value: number; // Q(s, a) = W / N
  prior: number; // P(s, a)
  reward: number; // Recompensa inmediata (0.0 a 1.0)
  state: NodeState;
  isGolden: boolean;
}

export interface MCTSLink {
  fromId: number;
  toId: number;
  visits: number;
  isGolden: boolean;
}

export type MCTSPhase = "select" | "expand" | "evaluate" | "backprop" | "prune" | "finalize";

export interface MCTSPlaybackStep {
  stepIndex: number;
  phase: MCTSPhase;
  activeNodeId: number;
  activePathIds: number[]; // Ruta desde la raíz hasta el nodo activo
  evaluatedNodeId?: number;
  reward?: number;
  message: string;
  totalSimulations: number;
  bestValue: number;
}

export interface ReasoningPreset {
  id: string;
  name: string;
  desc: string;
  problemStatement: string;
  maxDepth: number;
  branchingFactor: number;
  generateTree: (c_puct: number) => { nodes: MCTSNode[]; links: MCTSLink[]; steps: MCTSPlaybackStep[]; goldenPath: number[] };
}

// ------------------------------------------------------------- Generador Fractal 3D
function calculate3DPos(depth: number, indexInLevel: number, totalInLevel: number, parentPos: Vec3D | null): Vec3D {
  if (depth === 0 || !parentPos) {
    return { x: 0, y: 1.4, z: 0 };
  }

  const levelY = 1.4 - depth * 0.58;
  const spreadRadius = 0.35 + depth * 0.38;

  const angle = (indexInLevel / Math.max(1, totalInLevel)) * Math.PI * 2 + depth * 0.45;
  const jitterX = (Math.sin(indexInLevel * 4.3 + depth) * 0.06);
  const jitterZ = (Math.cos(indexInLevel * 2.7 + depth) * 0.06);

  // Mezcla de la dirección del padre con el abanico radial
  const biasX = parentPos.x * 0.5;
  const biasZ = parentPos.z * 0.5;

  return {
    x: Math.max(-1.8, Math.min(1.8, biasX + Math.cos(angle) * spreadRadius + jitterX)),
    y: levelY,
    z: Math.max(-1.8, Math.min(1.8, biasZ + Math.sin(angle) * spreadRadius + jitterZ)),
  };
}

// ------------------------------------------------------------- PRESETS DE RAZONAMIENTO
export const REASONING_PRESETS: ReasoningPreset[] = [
  {
    id: "math_proof",
    name: "Demostración Matemática",
    desc: "Resolución de un problema de teoría de números con bifurcaciones de hipótesis.",
    problemStatement: "Demostrar que para todo n > 2, a^n + b^n = c^n no tiene soluciones enteras no nulas.",
    maxDepth: 4,
    branchingFactor: 3,
    generateTree: (c_puct) => generateMCTSRun("math", c_puct),
  },
  {
    id: "code_agent",
    name: "Agente de Arquitectura de Software",
    desc: "Exploración de arquitecturas concurrentes y optimizaciones de memoria en GPU.",
    problemStatement: "Diseñar un pipeline WebGPU con cero copias de memoria y buffers de anillo.",
    maxDepth: 4,
    branchingFactor: 3,
    generateTree: (c_puct) => generateMCTSRun("code", c_puct),
  },
  {
    id: "planning_agent",
    name: "Agente Autónomo de Planificación",
    desc: "Planificación de acciones robóticas con evaluación de riesgos y retroceso (backtracking).",
    problemStatement: "Navegar un entorno hostil con recursos limitados garantizando 99.9% de supervivencia.",
    maxDepth: 4,
    branchingFactor: 3,
    generateTree: (c_puct) => generateMCTSRun("planning", c_puct),
  },
];

const THOUGHT_LABELS: Record<string, string[][]> = {
  math: [
    ["Premisa: Analizar paridad modular", "Premisa: Aplicar curvas elípticas", "Premisa: Inducción directa"],
    ["Lema 1: Modularidad de formas de Frey", "Hipótesis A: Factorización en ideales", "Lema 2: Descenso infinito de Fermat", "Hipótesis B: Reducción módulo p"],
    ["Paso clave: Teorema de Taniyama-Shimura", "Verificación: Rango de la curva = 0", "Contradicción: Solución nula", "Refinamiento de cotas"],
    ["Q.E.D.: Demostración Concluida", "Solución verificada", "Invariante demostrada"],
  ],
  code: [
    ["Estrategia 1: Ring Buffer con Atomics", "Estrategia 2: Pings-Pongs secuenciales", "Estrategia 3: Render Pass fusionado"],
    ["Diseño: Shader de Cómputo indirecto", "Hipótesis: Lock-free con Subgroups", "Manejo: Barrier explícito", "Fallback: Malla estática"],
    ["Optimización: 0 copias en VRAM", "Benchmarking: 120 fps estables", "Poda: Demasiada contención", "Verificación de carreras"],
    ["Arquitectura Óptima Aprobada", "Pipeline GPU Desplegado"],
  ],
  planning: [
    ["Ruta Norte: Cañón con niebla", "Ruta Central: Meseta abierta", "Ruta Sur: Túnel protegido"],
    ["Acción: Sondear con drones", "Plan B: Activar escudo de plasma", "Acción: Sigilo térmico", "Riesgo: Trampa detectada"],
    ["Transición: Bajar consumo 40%", "Verificación: 0% probabilidad de fallo", "Punto seguro alcanzado", "Backtracking necesario"],
    ["Misión Cumplida con Éxito", "Objetivo Asegurado"],
  ],
};

function generateMCTSRun(type: "math" | "code" | "planning", c_puct: number) {
  const nodes: MCTSNode[] = [];
  const links: MCTSLink[] = [];
  const steps: MCTSPlaybackStep[] = [];

  // 1. Nodo Raíz (Estado Inicial)
  const rootNode: MCTSNode = {
    id: 0,
    parentId: null,
    childrenIds: [],
    depth: 0,
    label: type === "math" ? "Problema Raíz: Teorema" : type === "code" ? "Requisito: Pipeline 0-copy" : "Misión: Plan de Acción",
    thoughtType: "premise",
    pos: { x: 0, y: 1.4, z: 0 },
    visits: 1,
    totalValue: 0.5,
    value: 0.5,
    prior: 1.0,
    reward: 0.5,
    state: "selected",
    isGolden: true,
  };
  nodes.push(rootNode);

  steps.push({
    stepIndex: 0,
    phase: "select",
    activeNodeId: 0,
    activePathIds: [0],
    message: `Iniciando búsqueda de razonamiento Tree-of-Thoughts desde la raíz (${rootNode.label}).`,
    totalSimulations: 1,
    bestValue: 0.5,
  });

  const labels = THOUGHT_LABELS[type];
  let nextNodeId = 1;

  // 2. Simulación de 22 iteraciones MCTS
  const TOTAL_SIMULATIONS = 22;

  for (let sim = 1; sim <= TOTAL_SIMULATIONS; sim++) {
    // FASE 1: SELECCIÓN (Selection) mediante PUCT
    let currentId = 0;
    const path: number[] = [0];

    while (nodes[currentId].childrenIds.length > 0) {
      const parent = nodes[currentId];
      let bestChildId = parent.childrenIds[0];
      let bestScore = -Infinity;

      const totalVisits = parent.childrenIds.reduce((sum, cid) => sum + nodes[cid].visits, 0);

      for (const cid of parent.childrenIds) {
        const child = nodes[cid];
        // Fórmula PUCT (AlphaZero / OpenAI o1): Q + c_puct * P * sqrt(N_parent) / (1 + N_child)
        const ucb = child.value + c_puct * child.prior * (Math.sqrt(totalVisits + 1) / (1 + child.visits));
        if (ucb > bestScore) {
          bestScore = ucb;
          bestChildId = cid;
        }
      }

      currentId = bestChildId;
      path.push(currentId);
    }

    const selNode = nodes[currentId];

    steps.push({
      stepIndex: steps.length,
      phase: "select",
      activeNodeId: currentId,
      activePathIds: [...path],
      message: `Fase 1 (Selección PUCT): Descendiendo por la hipótesis más prometedora '${selNode.label}' (N=${selNode.visits}, Q=${selNode.value.toFixed(2)}).`,
      totalSimulations: sim,
      bestValue: nodes[0].value,
    });

    // FASE 2: EXPANSIÓN (Expansion)
    if (selNode.depth < 3 && (selNode.visits >= 1 || selNode.id === 0)) {
      const depthLabels = labels[selNode.depth] || ["Hipótesis alternativa", "Refinamiento", "Validación"];
      const numBranches = Math.min(3, depthLabels.length);
      const newChildIds: number[] = [];

      for (let b = 0; b < numBranches; b++) {
        const childId = nextNodeId++;
        const labelIdx = (selNode.id + b) % depthLabels.length;
        const thoughtLabel = depthLabels[labelIdx];

        // Posición espacial 3D
        const pos = calculate3DPos(selNode.depth + 1, b, numBranches, selNode.pos);

        // Calidad / Recompensa probabilística
        const isPromising = (b === 0 && (selNode.id === 0 || selNode.id % 2 === 1)) || (b === 1 && selNode.id % 2 === 0);
        const reward = isPromising ? 0.75 + Math.random() * 0.22 : 0.15 + Math.random() * 0.35;

        const isDeadEnd = reward < 0.40;
        const isSolution = selNode.depth + 1 === 3 && reward >= 0.85;

        const childNode: MCTSNode = {
          id: childId,
          parentId: currentId,
          childrenIds: [],
          depth: selNode.depth + 1,
          label: isSolution ? `Solución: ${thoughtLabel}` : isDeadEnd ? `Callejón: ${thoughtLabel}` : thoughtLabel,
          thoughtType: isSolution ? "solution" : isDeadEnd ? "dead_end" : "hypothesis",
          pos,
          visits: 0,
          totalValue: 0,
          value: reward * 0.5,
          prior: 1.0 / numBranches,
          reward,
          state: "expanded",
          isGolden: false,
        };

        nodes.push(childNode);
        newChildIds.push(childId);
        links.push({ fromId: currentId, toId: childId, visits: 0, isGolden: false });
      }

      selNode.childrenIds = newChildIds;

      steps.push({
        stepIndex: steps.length,
        phase: "expand",
        activeNodeId: currentId,
        activePathIds: [...path],
        message: `Fase 2 (Expansión): Ramificando ${newChildIds.length} nuevas hipótesis de pensamiento (Tree-of-Thoughts).`,
        totalSimulations: sim,
        bestValue: nodes[0].value,
      });

      // Evaluar el primer hijo expandido
      currentId = newChildIds[0];
      path.push(currentId);
    }

    // FASE 3: EVALUACIÓN (Evaluation / Rollout)
    const evalNode = nodes[currentId];
    const reward = evalNode.reward;

    steps.push({
      stepIndex: steps.length,
      phase: "evaluate",
      activeNodeId: currentId,
      activePathIds: [...path],
      evaluatedNodeId: currentId,
      reward,
      message: `Fase 3 (Evaluación): Asignando valor heurístico a '${evalNode.label}' → Recompensa R=${reward >= 0.7 ? "+" : ""}${reward.toFixed(2)} ${reward >= 0.7 ? "🌟 (Alta verosimilitud)" : "⚠️ (Camino débil)"}.`,
      totalSimulations: sim,
      bestValue: Math.max(...nodes.map(n => n.value)),
    });

    // FASE 4: RETROPROPAGACIÓN (Backpropagation)
    for (let i = path.length - 1; i >= 0; i--) {
      const node = nodes[path[i]];
      node.visits += 1;
      node.totalValue += reward;
      node.value = node.totalValue / node.visits;
      node.state = "backpropagating";

      if (i > 0) {
        const link = links.find(l => l.fromId === path[i - 1] && l.toId === path[i]);
        if (link) link.visits += 1;
      }
    }

    steps.push({
      stepIndex: steps.length,
      phase: "backprop",
      activeNodeId: 0,
      activePathIds: [...path],
      message: `Fase 4 (Retropropagación): Ondas de energía actualizan el valor Q a lo largo de ${path.length} nodos hasta la raíz (Q_root=${nodes[0].value.toFixed(2)}).`,
      totalSimulations: sim,
      bestValue: nodes[0].value,
    });
  }

  // FASE FINAL: PODA Y DETERMINACIÓN DE LA VÍA DORADA (Golden Path)
  // Encontrar la hoja con mayor valor acumulado
  let bestLeaf = nodes[0];
  for (const n of nodes) {
    if (n.depth >= 2 && n.value > bestLeaf.value) {
      bestLeaf = n;
    }
  }

  const goldenPath: number[] = [];
  let curr: MCTSNode | null = bestLeaf;
  while (curr) {
    goldenPath.unshift(curr.id);
    curr.isGolden = true;
    curr.state = "golden";
    curr = curr.parentId !== null ? nodes[curr.parentId] : null;
  }

  for (const l of links) {
    if (goldenPath.includes(l.fromId) && goldenPath.includes(l.toId)) {
      l.isGolden = true;
    }
  }

  // Marcar ramas podadas con recompensa baja
  for (const n of nodes) {
    if (!goldenPath.includes(n.id) && n.value < 0.40 && n.visits >= 2) {
      n.state = "pruned";
    }
  }

  steps.push({
    stepIndex: steps.length,
    phase: "finalize",
    activeNodeId: bestLeaf.id,
    activePathIds: goldenPath,
    message: `¡Razonamiento Concluido! Vía Dorada descubierta con éxito (${goldenPath.length} pasos de deducción). Ramas fallidas podadas.`,
    totalSimulations: TOTAL_SIMULATIONS,
    bestValue: bestLeaf.value,
  });

  return { nodes, links, steps, goldenPath };
}
