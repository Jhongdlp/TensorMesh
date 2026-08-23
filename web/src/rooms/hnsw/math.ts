/** Sala 04 — HNSW (Hierarchical Navigable Small World).
 *
 *  Implementación algorítmica y espacial de HNSW:
 *  - Proyección en plano 2D (X, Z) para que cada capa sea una lámina plana nítida.
 *  - Jerarquía estratificada limpia (L2: ~6 nodos, L1: ~28 nodos, L0: 160 nodos).
 *  - Búsqueda voraz con registro exhaustivo de pasos, sondas evaluadas y comparativa de Recall.
 */

export interface Vec2D {
  x: number;
  z: number;
}

export interface NodeData {
  id: number;
  pos: Vec2D;
  label: string;
  category: number;
  maxLevel: number;
}

export interface SearchStep {
  type: "START" | "ENTER_LAYER" | "EVALUATE_NEIGHBORS" | "GREEDY_STEP" | "DESCEND_LAYER" | "L0_EXPLORE" | "FINISH";
  layer: number;
  currentNodeId: number;
  targetPos: Vec2D;
  evaluatedNeighbors: { nodeId: number; dist: number; isCloser: boolean }[];
  bestNodeId: number;
  candidatesQueue: { nodeId: number; dist: number }[];
  totalComparisons: number;
  message: string;
}

export interface SearchResult {
  steps: SearchStep[];
  topK: { nodeId: number; dist: number }[];
  exactTopK: { nodeId: number; dist: number }[];
  recall: number;
  totalComparisons: number;
  bruteForceComparisons: number;
}

export interface DatasetPreset {
  id: string;
  name: string;
  desc: string;
  generate: () => NodeData[];
}

export function dist2D(a: Vec2D, b: Vec2D): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// --------------------------------------------------------------- Datasets en Plano (X, Z)

// 1. Clusters Semánticos de IA y Ciencia
function generateClusters(): NodeData[] {
  const nodes: NodeData[] = [];
  const clusterCenters = [
    { x: -0.52, z: -0.45, cat: 0, label: "Física Cuántica" },
    { x: 0.52, z: -0.42, cat: 1, label: "Neurociencia" },
    { x: -0.48, z: 0.48, cat: 2, label: "Lingüística & NLP" },
    { x: 0.50, z: 0.50, cat: 3, label: "Geometría & Topología" },
    { x: 0.0, z: 0.02, cat: 4, label: "Agentes & Razonamiento" },
  ];

  const wordsByCat = [
    ["fotón", "entrelazamiento", "qubit", "spin", "onda", "superposición", "vacío", "átomo", "bosón", "fermion", "decoherencia", "matriz"],
    ["sinapsis", "corteza", "axón", "dopamina", "plasticidad", "neurona", "mielina", "dendrita", "lóbulo", "cerebelo", "potencial", "red"],
    ["semántica", "sintaxis", "token", "embedding", "grafo", "morfología", "corpus", "pragmática", "fonema", "léxico", "atención", "prompt"],
    ["variedad", "geodésica", "curvatura", "tensor", "métrica", "topología", "homología", "difeomorfismo", "fibrado", "álgebra", "espacio", "isometría"],
    ["agente", "razonamiento", "mcts", "memoria", "heurística", "planificación", "árbol", "vector", "latente", "inferencia", "consenso", "búsqueda"]
  ];

  let id = 0;
  clusterCenters.forEach((center) => {
    const count = 32;
    for (let i = 0; i < count; i++) {
      // Distribución normal aproximada
      const u = (Math.random() + Math.random() + Math.random() - 1.5) * 0.22;
      const v = (Math.random() + Math.random() + Math.random() - 1.5) * 0.22;
      const wordList = wordsByCat[center.cat];
      const word = wordList[i % wordList.length] + (i >= wordList.length ? ` #${Math.floor(i / wordList.length) + 1}` : "");

      nodes.push({
        id: id++,
        pos: {
          x: Math.max(-0.92, Math.min(0.92, center.x + u)),
          z: Math.max(-0.92, Math.min(0.92, center.z + v)),
        },
        label: word,
        category: center.cat,
        maxLevel: 0,
      });
    }
  });

  return nodes;
}

// 2. Anillos Concéntricos
function generateRings(): NodeData[] {
  const nodes: NodeData[] = [];
  const radii = [0.28, 0.58, 0.88];
  let id = 0;
  radii.forEach((r, cat) => {
    const count = cat === 0 ? 30 : cat === 1 ? 55 : 75;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI + (Math.random() - 0.5) * 0.12;
      const jitter = (Math.random() - 0.5) * 0.06;
      nodes.push({
        id: id++,
        pos: {
          x: (r + jitter) * Math.cos(angle),
          z: (r + jitter) * Math.sin(angle),
        },
        label: `Ring_${cat + 1}_#${i + 1}`,
        category: cat,
        maxLevel: 0,
      });
    }
  });
  return nodes;
}

// 3. Espiral Doble (Manifold)
function generateSpiral(): NodeData[] {
  const nodes: NodeData[] = [];
  const N = 160;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 4 * Math.PI;
    const r = 0.1 + 0.8 * (i / N);
    const sign = i % 2 === 0 ? 1 : -1;
    const jitterX = (Math.random() - 0.5) * 0.05;
    const jitterZ = (Math.random() - 0.5) * 0.05;
    nodes.push({
      id: i,
      pos: {
        x: r * Math.cos(t * sign) + jitterX,
        z: r * Math.sin(t * sign) + jitterZ,
      },
      label: `Espiral_${i % 2 === 0 ? 'A' : 'B'}_#${i}`,
      category: i % 2 === 0 ? 0 : 2,
      maxLevel: 0,
    });
  }
  return nodes;
}

export const DATASET_PRESETS: DatasetPreset[] = [
  {
    id: "clusters",
    name: "Clústeres Semánticos",
    desc: "160 embeddings de palabras agrupados en 5 conceptos temáticos clave de IA.",
    generate: generateClusters,
  },
  {
    id: "rings",
    name: "Anillos Concéntricos",
    desc: "Estructuras radiales que desafían la búsqueda de vecinos euclidianos.",
    generate: generateRings,
  },
  {
    id: "spiral",
    name: "Espiral Manifold",
    desc: "Bifurcación de dos brazos espirales entrelazados.",
    generate: generateSpiral,
  },
];

// --------------------------------------------------------------- Grafo HNSW
export class HNSWIndex {
  nodes: NodeData[] = [];
  layers: Map<number, number[]>[] = [];
  entryPointId = 0;
  maxLevel = 2;
  M = 8;
  M0 = 16;
  efConstruction = 32;

  constructor(nodes: NodeData[], M = 8, efConstruction = 32) {
    this.M = M;
    this.M0 = 2 * M;
    this.efConstruction = efConstruction;
    this.buildIndex(nodes);
  }

  private buildIndex(nodes: NodeData[]) {
    this.nodes = nodes.map(n => ({ ...n }));
    this.maxLevel = 2; // Exactamente 3 capas: L2 (Cumbre), L1 (Media), L0 (Base)
    this.layers = [new Map(), new Map(), new Map()];

    if (this.nodes.length === 0) return;

    // Asignación controlada para máxima legibilidad didáctica
    // L0: Todos los nodos (100%)
    // L1: ~18% de los nodos (~28 nodos)
    // L2: ~4% de los nodos (~6 nodos, uno por clúster/zona)
    const targetL2Count = Math.max(4, Math.min(7, Math.floor(this.nodes.length * 0.04)));
    const targetL1Count = Math.max(22, Math.min(35, Math.floor(this.nodes.length * 0.18)));

    // Escoger representantes bien distribuidos para L2
    const stepL2 = Math.floor(this.nodes.length / targetL2Count);
    for (let i = 0; i < targetL2Count; i++) {
      const idx = Math.min(this.nodes.length - 1, i * stepL2 + 2);
      this.nodes[idx].maxLevel = 2;
    }

    // Escoger representantes para L1
    const stepL1 = Math.floor(this.nodes.length / targetL1Count);
    for (let i = 0; i < targetL1Count; i++) {
      const idx = Math.min(this.nodes.length - 1, i * stepL1);
      if (this.nodes[idx].maxLevel < 1) {
        this.nodes[idx].maxLevel = 1;
      }
    }

    // Inicializar mapas de capas
    for (let l = 0; l <= 2; l++) {
      for (const n of this.nodes) {
        if (n.maxLevel >= l) {
          this.layers[l].set(n.id, []);
        }
      }
    }

    // Encontrar el primer nodo de L2 para entryPoint
    const l2Nodes = this.nodes.filter(n => n.maxLevel === 2);
    this.entryPointId = l2Nodes[0]?.id ?? 0;

    // Construir conexiones capa a capa
    for (let l = 2; l >= 0; l--) {
      const layerNodeIds = Array.from(this.layers[l].keys());
      const maxConn = l === 0 ? this.M0 : this.M;

      for (const uId of layerNodeIds) {
        const uPos = this.nodes[uId].pos;
        // Ordenar otros nodos de la capa por distancia
        const candidates = layerNodeIds
          .filter(vId => vId !== uId)
          .map(vId => ({ id: vId, dist: dist2D(uPos, this.nodes[vId].pos) }))
          .sort((a, b) => a.dist - b.dist);

        // Selección heurística de vecinos (evitar enlaces casi paralelos redundantes)
        const selected: number[] = [];
        for (const c of candidates) {
          if (selected.length >= maxConn) break;
          let keep = true;
          for (const s of selected) {
            if (dist2D(this.nodes[c.id].pos, this.nodes[s].pos) < c.dist * 0.75) {
              keep = false;
              break;
            }
          }
          if (keep || selected.length < 2) {
            selected.push(c.id);
          }
        }

        this.layers[l].set(uId, selected);
      }
    }
  }

  // ------------------------------------------------------------- Búsqueda Paso a Paso
  searchRecorded(queryPos: Vec2D, K = 5, efSearch = 16): SearchResult {
    const steps: SearchStep[] = [];
    let comparisons = 0;

    let currObj = this.entryPointId;
    let currDist = dist2D(queryPos, this.nodes[currObj].pos);
    comparisons++;

    steps.push({
      type: "START",
      layer: 2,
      currentNodeId: currObj,
      targetPos: queryPos,
      evaluatedNeighbors: [],
      bestNodeId: currObj,
      candidatesQueue: [{ nodeId: currObj, dist: currDist }],
      totalComparisons: comparisons,
      message: `Paso 1: Iniciando búsqueda en nodo de entrada #${currObj} ("${this.nodes[currObj].label}") en la Cumbre L2.`,
    });

    // 1. Capas Superiores (L2 y L1 con saltos voraces de largo alcance)
    for (let l = 2; l > 0; l--) {
      steps.push({
        type: "ENTER_LAYER",
        layer: l,
        currentNodeId: currObj,
        targetPos: queryPos,
        evaluatedNeighbors: [],
        bestNodeId: currObj,
        candidatesQueue: [{ nodeId: currObj, dist: currDist }],
        totalComparisons: comparisons,
        message: `Navegando en Capa L${l} (${this.layers[l].size} nodos, enlaces rápidos). Evaluando vecinos...`,
      });

      let changed = true;
      let hopsInLayer = 0;
      while (changed && hopsInLayer < 10) {
        changed = false;
        hopsInLayer++;
        const neighbors = this.layers[l]?.get(currObj) || [];
        const evaluated: { nodeId: number; dist: number; isCloser: boolean }[] = [];

        for (const nb of neighbors) {
          const d = dist2D(queryPos, this.nodes[nb].pos);
          comparisons++;
          const closer = d < currDist;
          evaluated.push({ nodeId: nb, dist: d, isCloser: closer });
          if (closer) {
            currDist = d;
            currObj = nb;
            changed = true;
          }
        }

        if (evaluated.length > 0) {
          steps.push({
            type: "EVALUATE_NEIGHBORS",
            layer: l,
            currentNodeId: currObj,
            targetPos: queryPos,
            evaluatedNeighbors: evaluated,
            bestNodeId: currObj,
            candidatesQueue: [{ nodeId: currObj, dist: currDist }],
            totalComparisons: comparisons,
            message: changed
              ? `Salto voraz en L${l} hacia #${currObj} ("${this.nodes[currObj].label}", d=${currDist.toFixed(3)}).`
              : `Mínimo local en L${l}: ningún vecino mejora la distancia (d=${currDist.toFixed(3)}).`,
          });
        }
      }

      steps.push({
        type: "DESCEND_LAYER",
        layer: l - 1,
        currentNodeId: currObj,
        targetPos: queryPos,
        evaluatedNeighbors: [],
        bestNodeId: currObj,
        candidatesQueue: [{ nodeId: currObj, dist: currDist }],
        totalComparisons: comparisons,
        message: `Descenso vertical de L${l} → L${l - 1} manteniendo el nodo #${currObj} como nuevo punto de entrada.`,
      });
    }

    // 2. Capa Base L0 (Beam Search con efSearch)
    const visited = new Set<number>([currObj]);
    const candidates: { id: number; dist: number }[] = [{ id: currObj, dist: currDist }];
    const w: { id: number; dist: number }[] = [{ id: currObj, dist: currDist }];

    steps.push({
      type: "ENTER_LAYER",
      layer: 0,
      currentNodeId: currObj,
      targetPos: queryPos,
      evaluatedNeighbors: [],
      bestNodeId: currObj,
      candidatesQueue: w.map(c => ({ nodeId: c.id, dist: c.dist })),
      totalComparisons: comparisons,
      message: `Entrando en la Capa Base L0 (${this.nodes.length} nodos). Ejecutando Beam Search (ef=${efSearch}).`,
    });

    while (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      const curr = candidates.shift()!;
      w.sort((a, b) => a.dist - b.dist);
      const furthestInW = w[w.length - 1];

      if (curr.dist > furthestInW.dist && w.length >= efSearch) {
        break;
      }

      const neighbors = this.layers[0]?.get(curr.id) || [];
      const evaluated: { nodeId: number; dist: number; isCloser: boolean }[] = [];

      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          const d = dist2D(queryPos, this.nodes[nb].pos);
          comparisons++;
          const closer = w.length < efSearch || d < furthestInW.dist;
          evaluated.push({ nodeId: nb, dist: d, isCloser: closer });

          if (closer) {
            candidates.push({ id: nb, dist: d });
            w.push({ id: nb, dist: d });
            w.sort((a, b) => a.dist - b.dist);
            if (w.length > efSearch) {
              w.pop();
            }
          }
        }
      }

      if (evaluated.length > 0) {
        steps.push({
          type: "L0_EXPLORE",
          layer: 0,
          currentNodeId: curr.id,
          targetPos: queryPos,
          evaluatedNeighbors: evaluated,
          bestNodeId: w[0].id,
          candidatesQueue: w.map(c => ({ nodeId: c.id, dist: c.dist })),
          totalComparisons: comparisons,
          message: `Explorando vecindario denso de #${curr.id} en L0. ${evaluated.filter(e => e.isCloser).length} vecinos más cercanos añadidos.`,
        });
      }
    }

    w.sort((a, b) => a.dist - b.dist);
    const topK = w.slice(0, K).map(c => ({ nodeId: c.id, dist: c.dist }));

    // 3. Ground Truth (Fuerza Bruta)
    const exactDistances = this.nodes.map(n => ({
      nodeId: n.id,
      dist: dist2D(queryPos, n.pos),
    }));
    exactDistances.sort((a, b) => a.dist - b.dist);
    const exactTopK = exactDistances.slice(0, K);

    const topKSet = new Set(topK.map(t => t.nodeId));
    let matches = 0;
    exactTopK.forEach(e => {
      if (topKSet.has(e.nodeId)) matches++;
    });
    const recall = matches / K;

    steps.push({
      type: "FINISH",
      layer: 0,
      currentNodeId: topK[0]?.nodeId ?? currObj,
      targetPos: queryPos,
      evaluatedNeighbors: [],
      bestNodeId: topK[0]?.nodeId ?? currObj,
      candidatesQueue: topK,
      totalComparisons: comparisons,
      message: `¡Búsqueda completada! Top-${K} encontrados en ${comparisons} comparaciones (${((comparisons / this.nodes.length) * 100).toFixed(0)}% del espacio). Recall: ${(recall * 100).toFixed(0)}%.`,
    });

    return {
      steps,
      topK,
      exactTopK,
      recall,
      totalComparisons: comparisons,
      bruteForceComparisons: this.nodes.length,
    };
  }
}
