/**
 * Sala 06 — K-Means Clustering & Celdas de Voronoi 3D
 * Algoritmo de Aprendizaje No Supervisado con Semántica y Constelaciones.
 */

export interface Vec3D {
  x: number;
  y: number;
  z: number;
}

export interface DataPoint {
  id: number;
  label: string;
  domain: string;
  pos: Vec3D;
  cluster: number; // Índice de centroide asignado (0 a K-1)
  prevCluster: number;
  distToCentroid: number;
  neighbors: number[]; // Vecinos cercanos intra-cluster
}

export interface Centroid {
  id: number;
  label: string;
  pos: Vec3D;
  prevPos: Vec3D;
  color: [number, number, number];
  pointsCount: number;
  inertia: number;
}

export interface IntraEdge {
  p1: Vec3D;
  p2: Vec3D;
  cluster: number;
}

export type KmeansPhase = "init" | "assign_e" | "update_m" | "converged";

export interface KmeansStep {
  stepIndex: number;
  iteration: number;
  phase: KmeansPhase;
  centroids: Centroid[];
  pointAssignments: number[]; // cluster por cada punto
  inertia: number; // WCSS total
  maxDelta: number; // Mayor desplazamiento de un centroide
  message: string;
}

export interface DatasetPreset {
  id: string;
  name: string;
  desc: string;
  generatePoints: (targetCount: number) => { points: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[]; domainNames: string[] };
}

export const CLUSTER_PALETTE: [number, number, number][] = [
  [1.00, 0.84, 0.15], // 0: Oro (Cosmología)
  [0.00, 0.82, 1.00], // 1: Cian (Neurociencia)
  [0.32, 0.88, 0.47], // 2: Esmeralda (NLP & Lenguaje)
  [1.00, 0.42, 0.58], // 3: Coral (Física Cuántica)
  [0.72, 0.45, 1.00], // 4: Violeta (Matemáticas)
  [1.00, 0.55, 0.15], // 5: Ámbar
  [0.20, 0.95, 0.85], // 6: Turquesa
  [0.95, 0.30, 0.90], // 7: Magenta
  [0.50, 0.90, 0.20], // 8: Lima
  [0.40, 0.70, 1.00], // 9: Azul cielo
];

// ------------------------------------------------------------- VOCABULARIO SEMÁNTICO
const SEMANTIC_CLUSTERS = [
  {
    domain: "Cosmología & Gravitación",
    center: { x: -0.85, y: 0.75, z: -0.65 },
    words: [
      "supernova", "agujero negro", "quásar", "relatividad", "espaciotiempo", "singularidad",
      "galaxia", "púlsar", "astrofísica", "horizonte de sucesos", "nebulosa", "materia oscura",
      "energía oscura", "radiación cósmica", "telescopio", "vía láctea", "onda gravitacional",
      "estrellas de neutrones", "interferometría", "exoplaneta", "curvatura métrica", "lente gravitacional",
      "espectrometría", "magnetar", "paralaje", "redshift", "big bang", "inflación cósmica"
    ]
  },
  {
    domain: "Neurociencia & Cognición",
    center: { x: 0.80, y: 0.85, z: 0.55 },
    words: [
      "sinapsis", "corteza prefrontal", "dopamina", "plasticidad", "axón", "neurona",
      "lóbulo temporal", "dendrita", "mielina", "cerebelo", "neurotransmisor", "serotonina",
      "potencial de acción", "hipocampo", "memoria de trabajo", "sinaptogénesis", "astrocito",
      "electroencefalograma", "percepción sensorial", "corteza visual", "engrama", "homeostasis",
      "neuromodulación", "glia", "ínsula", "amígdala", "corteza motora", "red neuronal biológica"
    ]
  },
  {
    domain: "Modelos de Lenguaje & NLP",
    center: { x: 0.00, y: -0.75, z: -0.75 },
    words: [
      "semántica", "tokenización", "atención multi-head", "embedding vectorial", "corpus",
      "sintaxis", "gramática generativa", "transformer", "prompt engineering", "pragmática",
      "fonología", "espacio latente", "máscara causal", "autoatención", "decodificador",
      "entropía cruzada", "perplejidad", "fine-tuning", "rlhf", "context window", "vocabulario",
      "recuperación densa", "rag", "distancia coseno", "vectores de palabra", "representación distribuida"
    ]
  },
  {
    domain: "Física Cuántica & Partículas",
    center: { x: -0.75, y: -0.65, z: 0.75 },
    words: [
      "entrelazamiento", "fotón", "qubit", "superposición", "bosón de Higgs", "decoherencia",
      "spin cuántico", "función de onda", "efecto túnel", "electrodinámica", "cuerdas",
      "antimateria", "hadron", "gluon", "fermión", "condensado de Bose", "colapsador",
      "incertidumbre de Heisenberg", "teoría de campos", "dualidad onda-partícula", "teletransportación",
      "cromodinámica", "computación cuántica", "puerta de Hadamard", "ecuación de Dirac", "matriz densidad"
    ]
  },
  {
    domain: "Matemáticas Puras & Topología",
    center: { x: 0.85, y: -0.55, z: -0.55 },
    words: [
      "variedad diferenciable", "geodésica", "álgebra de Lie", "homología", "curvatura de Riemann",
      "tensor métrico", "grupo de simetría", "isomorfismo", "difeomorfismo", "espacio de Hilbert",
      "fibrado tangente", "topología algebraica", "forma diferencial", "fibración de Hopf",
      "cohómología", "campo vectorial", "gradiente covariante", "matriz hermitiana", "transformada de Fourier",
      "variedad compacta", "flujo de Ricci", "teoría de categorías", "análisis complejo", "invariante topológico"
    ]
  },
];

export const DATASET_PRESETS: DatasetPreset[] = [
  {
    id: "blobs",
    name: "5 Clústeres Gaussianos",
    desc: "5 cúmulos con conceptos de Cosmología, Neurociencia, NLP, Física Cuántica y Matemáticas.",
    generatePoints: (targetCount) => {
      const points: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[] = [];
      const domainNames = SEMANTIC_CLUSTERS.map(c => c.domain);
      const pointsPerDomain = Math.floor(targetCount / SEMANTIC_CLUSTERS.length);

      let id = 0;
      for (const group of SEMANTIC_CLUSTERS) {
        for (let i = 0; i < pointsPerDomain; i++) {
          const s = 0.26;
          const u = (Math.random() + Math.random() + Math.random() - 1.5) * s;
          const v = (Math.random() + Math.random() + Math.random() - 1.5) * s;
          const w = (Math.random() + Math.random() + Math.random() - 1.5) * s;

          const baseWord = group.words[i % group.words.length];
          const label = i >= group.words.length ? `${baseWord} #${Math.floor(i / group.words.length) + 1}` : baseWord;

          points.push({
            id: id++,
            label,
            domain: group.domain,
            pos: {
              x: group.center.x + u,
              y: group.center.y + v,
              z: group.center.z + w,
            },
          });
        }
      }

      return { points, domainNames };
    },
  },
  {
    id: "bio",
    name: "Bioesfera & Ecosistemas",
    desc: "Clustering de especies: Genómica, Cetáceos, Botánica y Microbiología.",
    generatePoints: (targetCount) => {
      const bioGroups = [
        { domain: "Genómica & ADN", center: { x: -0.7, y: 0.6, z: -0.5 }, words: ["secuencia ADN", "telómero", "nucleótido", "crispr", "ribosoma", "metilación", "polimerasa", "alelo", "genoma", "ARN mensajero"] },
        { domain: "Cetáceos & Océanos", center: { x: 0.7, y: 0.7, z: 0.5 }, words: ["ballena azul", "ecolocalización", "delfín", "plancton", "arrecife", "bentos", "orcas", "abisal", "fitoplancton", "marea"] },
        { domain: "Flora & Fotosíntesis", center: { x: 0.0, y: -0.8, z: -0.6 }, words: ["clorofila", "estomas", "xilema", "gimnosperma", "angiosperma", "micorriza", "savila", "espora", "cloroplasto", "floema"] },
        { domain: "Microbiología", center: { x: -0.6, y: -0.6, z: 0.7 }, words: ["arquea", "fago", "bacilo", "mitocondria", "flagelo", "procarionte", "lisosoma", "plásmido", "peptidoglicano", "endospora"] },
      ];
      const points: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[] = [];
      const domainNames = bioGroups.map(c => c.domain);
      const pointsPerDomain = Math.floor(targetCount / bioGroups.length);

      let id = 0;
      for (const group of bioGroups) {
        for (let i = 0; i < pointsPerDomain; i++) {
          const s = 0.28;
          const u = (Math.random() + Math.random() + Math.random() - 1.5) * s;
          const v = (Math.random() + Math.random() + Math.random() - 1.5) * s;
          const w = (Math.random() + Math.random() + Math.random() - 1.5) * s;
          const baseWord = group.words[i % group.words.length];
          const label = i >= group.words.length ? `${baseWord} #${Math.floor(i / group.words.length) + 1}` : baseWord;
          points.push({
            id: id++,
            label,
            domain: group.domain,
            pos: { x: group.center.x + u, y: group.center.y + v, z: group.center.z + w },
          });
        }
      }
      return { points, domainNames };
    },
  },
  {
    id: "rings",
    name: "Anillos Concéntricos",
    desc: "Estructuras toroidales concéntricas (desafío no convexo para K-Means).",
    generatePoints: (targetCount) => {
      const points: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[] = [];
      const domainNames = ["Anillo Exterior", "Anillo Medio", "Núcleo Interior"];
      let id = 0;
      for (let i = 0; i < targetCount; i++) {
        const roll = Math.random();
        const tier = roll > 0.6 ? 0 : roll > 0.25 ? 1 : 2;
        const r = tier === 0 ? 1.35 : tier === 1 ? 0.85 : 0.40;
        const angle = Math.random() * Math.PI * 2;
        const jitterR = (Math.random() - 0.5) * 0.15;
        const height = (Math.random() - 0.5) * (tier === 0 ? 0.35 : tier === 1 ? 0.55 : 0.75);

        points.push({
          id: id++,
          label: `${domainNames[tier]} #${(i % 40) + 1}`,
          domain: domainNames[tier],
          pos: {
            x: Math.cos(angle) * (r + jitterR),
            y: height,
            z: Math.sin(angle) * (r + jitterR),
          },
        });
      }
      return { points, domainNames };
    },
  },
  {
    id: "spiral",
    name: "Doble Hélice 3D",
    desc: "Dos hebras espirales entrelazadas en forma de ADN.",
    generatePoints: (targetCount) => {
      const points: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[] = [];
      const domainNames = ["Hebra Alfa (3')", "Hebra Beta (5')", "Eje Central"];
      let id = 0;
      for (let i = 0; i < targetCount; i++) {
        const strand = i % 2 === 0 ? 0 : Math.PI;
        const t = (i / targetCount) * 5.0 * Math.PI;
        const y = (i / targetCount) * 2.6 - 1.3;
        const r = 0.85 + (Math.random() - 0.5) * 0.14;
        const strandName = i % 2 === 0 ? domainNames[0] : domainNames[1];

        points.push({
          id: id++,
          label: `${strandName} #${(i % 30) + 1}`,
          domain: strandName,
          pos: {
            x: Math.cos(t + strand) * r + (Math.random() - 0.5) * 0.08,
            y: y + (Math.random() - 0.5) * 0.08,
            z: Math.sin(t + strand) * r + (Math.random() - 0.5) * 0.08,
          },
        });
      }
      return { points, domainNames };
    },
  },
  {
    id: "cube",
    name: "Vértices de Hipercubo 3D",
    desc: "8 esquinas ortogonales simétricas (clustering de alta simetría tridimensional).",
    generatePoints: (targetCount) => {
      const corners = [
        { name: "Octante (+,+,+)", center: { x:  0.8, y:  0.8, z:  0.8 } },
        { name: "Octante (+,+,-)", center: { x:  0.8, y:  0.8, z: -0.8 } },
        { name: "Octante (+,-,+)", center: { x:  0.8, y: -0.8, z:  0.8 } },
        { name: "Octante (+,-,-)", center: { x:  0.8, y: -0.8, z: -0.8 } },
        { name: "Octante (-,+,+)", center: { x: -0.8, y:  0.8, z:  0.8 } },
        { name: "Octante (-,+,-)", center: { x: -0.8, y:  0.8, z: -0.8 } },
        { name: "Octante (-,-,+)", center: { x: -0.8, y: -0.8, z:  0.8 } },
        { name: "Octante (-,-,-)", center: { x: -0.8, y: -0.8, z: -0.8 } },
      ];
      const points: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[] = [];
      const domainNames = corners.map(c => c.name);
      const perCorner = Math.floor(targetCount / corners.length);
      let id = 0;

      for (const c of corners) {
        for (let i = 0; i < perCorner; i++) {
          const s = 0.20;
          const u = (Math.random() + Math.random() - 1) * s;
          const v = (Math.random() + Math.random() - 1) * s;
          const w = (Math.random() + Math.random() - 1) * s;
          points.push({
            id: id++,
            label: `${c.name} #${i + 1}`,
            domain: c.name,
            pos: { x: c.center.x + u, y: c.center.y + v, z: c.center.z + w },
          });
        }
      }
      return { points, domainNames };
    },
  },
  {
    id: "density",
    name: "Densidades Asimétricas",
    desc: "Cúmulos con tamaños, varianzas y densidades heterogéneas.",
    generatePoints: (targetCount) => {
      const groups = [
        { name: "Núcleo Ultra-Denso", center: { x: -0.75, y: 0.5, z: 0.0 }, spread: 0.14, countRatio: 0.50 },
        { name: "Nube Difusa Gigante", center: { x: 0.70, y: -0.3, z: 0.4 }, spread: 0.55, countRatio: 0.35 },
        { name: "Puente Filamentoso", center: { x: 0.00, y: 0.6, z: -0.7 }, spread: 0.28, countRatio: 0.15 },
      ];
      const points: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[] = [];
      const domainNames = groups.map(g => g.name);
      let id = 0;

      for (const g of groups) {
        const count = Math.floor(targetCount * g.countRatio);
        for (let i = 0; i < count; i++) {
          const u = (Math.random() + Math.random() + Math.random() - 1.5) * g.spread;
          const v = (Math.random() + Math.random() + Math.random() - 1.5) * g.spread;
          const w = (Math.random() + Math.random() + Math.random() - 1.5) * g.spread;
          points.push({
            id: id++,
            label: `${g.name} #${i + 1}`,
            domain: g.name,
            pos: { x: g.center.x + u, y: g.center.y + v, z: g.center.z + w },
          });
        }
      }
      return { points, domainNames };
    },
  },
];

function distSq(a: Vec3D, b: Vec3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

// ------------------------------------------------------------- SIMULADOR K-MEANS
export function runKmeansSimulation(
  rawPoints: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[],
  domainNames: string[],
  k: number,
  initMethod: "kmeans_plus_plus" | "random"
): { points: DataPoint[]; steps: KmeansStep[]; intraEdges: IntraEdge[] } {
  const N = rawPoints.length;
  const dataPoints: DataPoint[] = rawPoints.map((p) => ({
    ...p,
    cluster: 0,
    prevCluster: 0,
    distToCentroid: 0,
    neighbors: [],
  }));

  const steps: KmeansStep[] = [];
  let centroids: Centroid[] = [];

  // FASE 1: INICIALIZACIÓN
  if (initMethod === "kmeans_plus_plus") {
    const firstIdx = Math.floor(Math.random() * N);
    centroids.push({
      id: 0,
      label: domainNames[0] || "Cluster 1",
      pos: { ...rawPoints[firstIdx].pos },
      prevPos: { ...rawPoints[firstIdx].pos },
      color: CLUSTER_PALETTE[0],
      pointsCount: 0,
      inertia: 0,
    });

    for (let c = 1; c < k; c++) {
      const distances: number[] = new Array(N);
      let sumDistSq = 0;

      for (let i = 0; i < N; i++) {
        let minDist = Infinity;
        for (const cent of centroids) {
          const d = distSq(rawPoints[i].pos, cent.pos);
          if (d < minDist) minDist = d;
        }
        distances[i] = minDist;
        sumDistSq += minDist;
      }

      let r = Math.random() * sumDistSq;
      let chosenIdx = 0;
      for (let i = 0; i < N; i++) {
        r -= distances[i];
        if (r <= 0) {
          chosenIdx = i;
          break;
        }
      }

      centroids.push({
        id: c,
        label: domainNames[c % domainNames.length] || `Cluster ${c + 1}`,
        pos: { ...rawPoints[chosenIdx].pos },
        prevPos: { ...rawPoints[chosenIdx].pos },
        color: CLUSTER_PALETTE[c % CLUSTER_PALETTE.length],
        pointsCount: 0,
        inertia: 0,
      });
    }
  } else {
    // Inicialización Aleatoria Uniforme
    const chosen = new Set<number>();
    while (centroids.length < k) {
      const idx = Math.floor(Math.random() * N);
      if (!chosen.has(idx)) {
        chosen.add(idx);
        const c = centroids.length;
        centroids.push({
          id: c,
          label: domainNames[c % domainNames.length] || `Cluster ${c + 1}`,
          pos: { ...rawPoints[idx].pos },
          prevPos: { ...rawPoints[idx].pos },
          color: CLUSTER_PALETTE[c % CLUSTER_PALETTE.length],
          pointsCount: 0,
          inertia: 0,
        });
      }
    }
  }

  steps.push({
    stepIndex: 0,
    iteration: 0,
    phase: "init",
    centroids: centroids.map(c => ({ ...c, pos: { ...c.pos }, prevPos: { ...c.prevPos } })),
    pointAssignments: new Array(N).fill(-1),
    inertia: 0,
    maxDelta: 1.0,
    message: `Inicialización (${initMethod === "kmeans_plus_plus" ? "K-Means++" : "Aleatoria"}): ${k} centroides sembrados en el espacio semántico.`,
  });

  const MAX_ITERATIONS = 15;
  const CONVERGENCE_EPSILON = 0.0005;

  let iter = 1;
  let converged = false;

  while (iter <= MAX_ITERATIONS && !converged) {
    // ------------------------------------------------------------- PASO E: ASIGNACIÓN
    let currentInertia = 0;
    const clusterSizes = new Array(k).fill(0);
    const clusterInertias = new Array(k).fill(0);
    const assignments: number[] = new Array(N);

    for (let i = 0; i < N; i++) {
      const p = dataPoints[i].pos;
      let bestCentroid = 0;
      let minD = Infinity;

      for (let c = 0; c < k; c++) {
        const d = distSq(p, centroids[c].pos);
        if (d < minD) {
          minD = d;
          bestCentroid = c;
        }
      }

      dataPoints[i].prevCluster = dataPoints[i].cluster;
      dataPoints[i].cluster = bestCentroid;
      dataPoints[i].distToCentroid = Math.sqrt(minD);

      assignments[i] = bestCentroid;
      clusterSizes[bestCentroid]++;
      clusterInertias[bestCentroid] += minD;
      currentInertia += minD;
    }

    for (let c = 0; c < k; c++) {
      centroids[c].pointsCount = clusterSizes[c];
      centroids[c].inertia = clusterInertias[c];
    }

    steps.push({
      stepIndex: steps.length,
      iteration: iter,
      phase: "assign_e",
      centroids: centroids.map(c => ({ ...c, pos: { ...c.pos }, prevPos: { ...c.prevPos } })),
      pointAssignments: [...assignments],
      inertia: currentInertia,
      maxDelta: 0,
      message: `Iteración ${iter} · Paso E (Expectation): ${N} conceptos asignados a su centroide de Voronoi más cercano (Inercia WCSS=${currentInertia.toFixed(1)}).`,
    });

    // ------------------------------------------------------------- PASO M: ACTUALIZACIÓN
    const sumX = new Array(k).fill(0);
    const sumY = new Array(k).fill(0);
    const sumZ = new Array(k).fill(0);

    for (let i = 0; i < N; i++) {
      const c = dataPoints[i].cluster;
      sumX[c] += dataPoints[i].pos.x;
      sumY[c] += dataPoints[i].pos.y;
      sumZ[c] += dataPoints[i].pos.z;
    }

    let maxDelta = 0;
    const updatedCentroids: Centroid[] = [];

    for (let c = 0; c < k; c++) {
      const count = clusterSizes[c];
      const prevPos = { ...centroids[c].pos };
      let newPos = { ...centroids[c].pos };

      if (count > 0) {
        newPos = {
          x: sumX[c] / count,
          y: sumY[c] / count,
          z: sumZ[c] / count,
        };
      }

      const delta = Math.sqrt(distSq(prevPos, newPos));
      if (delta > maxDelta) maxDelta = delta;

      updatedCentroids.push({
        ...centroids[c],
        prevPos,
        pos: newPos,
      });
    }

    centroids = updatedCentroids;

    steps.push({
      stepIndex: steps.length,
      iteration: iter,
      phase: "update_m",
      centroids: centroids.map(c => ({ ...c, pos: { ...c.pos }, prevPos: { ...c.prevPos } })),
      pointAssignments: [...assignments],
      inertia: currentInertia,
      maxDelta,
      message: `Iteración ${iter} · Paso M (Maximization): Los ${k} centroides gravitan a su centro de masa (Desplazamiento Δ=${maxDelta.toFixed(4)}).`,
    });

    if (maxDelta < CONVERGENCE_EPSILON) {
      converged = true;
    }

    iter++;
  }

  // ------------------------------------------------------------- CONSTELACIONES INTRA-CLUSTER (k-NN)
  const intraEdges: IntraEdge[] = [];
  const maxEdgesPerCluster = 120;

  for (let c = 0; c < k; c++) {
    const clusterPoints = dataPoints.filter(p => p.cluster === c);
    let edgeCount = 0;

    for (let i = 0; i < clusterPoints.length && edgeCount < maxEdgesPerCluster; i++) {
      for (let j = i + 1; j < clusterPoints.length && edgeCount < maxEdgesPerCluster; j++) {
        const d = Math.sqrt(distSq(clusterPoints[i].pos, clusterPoints[j].pos));
        if (d < 0.22) {
          intraEdges.push({
            p1: clusterPoints[i].pos,
            p2: clusterPoints[j].pos,
            cluster: c,
          });
          edgeCount++;
        }
      }
    }
  }

  steps.push({
    stepIndex: steps.length,
    iteration: iter - 1,
    phase: "converged",
    centroids: centroids.map(c => ({ ...c, pos: { ...c.pos }, prevPos: { ...c.prevPos } })),
    pointAssignments: dataPoints.map(p => p.cluster),
    inertia: steps[steps.length - 1].inertia,
    maxDelta: 0,
    message: `¡K-Means Convergió! Centroides semánticos estabilizados en ${iter - 1} iteraciones con mínima inercia.`,
  });

  return { points: dataPoints, steps, intraEdges };
}

// ------------------------------------------------------------- 5. MÉTODO DEL CODO & ANALÍTICA DE K ÓPTIMO
export interface ElbowPoint {
  k: number;
  inertia: number;
  silhouette: number;
  isOptimal: boolean;
}

export function computeElbowAnalysis(
  rawPoints: Omit<DataPoint, "cluster" | "prevCluster" | "distToCentroid" | "neighbors">[],
  maxK = 8
): { curve: ElbowPoint[]; optimalK: number } {
  const curve: ElbowPoint[] = [];
  const N = rawPoints.length;
  const dummyNames = Array.from({ length: maxK }, (_, i) => `Cluster ${i + 1}`);

  // 1. Calcular inercia y silueta para cada K
  for (let k = 1; k <= maxK; k++) {
    const res = runKmeansSimulation(rawPoints, dummyNames, k, "kmeans_plus_plus");
    const lastStep = res.steps[res.steps.length - 1];
    const inertia = lastStep ? lastStep.inertia : 0;

    // Estimación rápida de Silueta sobre submuestra de 150 puntos para 60fps instantáneos
    let silSum = 0;
    let sampleSize = Math.min(150, N);
    const stepSample = Math.max(1, Math.floor(N / sampleSize));

    if (k > 1) {
      for (let i = 0; i < N; i += stepSample) {
        const p = res.points[i];
        if (!p) continue;

        // a(i): distancia media intra-cluster
        let aDist = 0;
        let aCount = 0;
        // b(i): distancia media al cluster vecino más cercano
        const otherDistSums = new Array(k).fill(0);
        const otherCounts = new Array(k).fill(0);

        for (let j = 0; j < N; j += stepSample * 2) {
          if (i === j) continue;
          const other = res.points[j];
          if (!other) continue;
          const d = Math.sqrt(distSq(p.pos, other.pos));

          if (other.cluster === p.cluster) {
            aDist += d;
            aCount++;
          } else {
            otherDistSums[other.cluster] += d;
            otherCounts[other.cluster]++;
          }
        }

        const a = aCount > 0 ? aDist / aCount : 0;
        let b = Infinity;
        for (let c = 0; c < k; c++) {
          if (c !== p.cluster && otherCounts[c] > 0) {
            const meanD = otherDistSums[c] / otherCounts[c];
            if (meanD < b) b = meanD;
          }
        }
        if (b === Infinity) b = 0;

        const s = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
        silSum += s;
      }
    }

    const avgSilhouette = k > 1 ? silSum / sampleSize : 0;
    curve.push({
      k,
      inertia,
      silhouette: Math.max(-1, Math.min(1, avgSilhouette)),
      isOptimal: false,
    });
  }

  // 2. Detección geométrica del Codo (Knee Point)
  // Hallar el punto k con la máxima distancia a la recta secante (1, WCSS_1) -> (maxK, WCSS_maxK)
  const y0 = curve[0].inertia;
  const yMax = curve[curve.length - 1].inertia;
  const yRange = y0 - yMax || 1;
  const xRange = maxK - 1 || 1;

  let maxDist = -1;
  let optimalK = Math.min(5, Math.max(2, Math.floor(maxK / 2)));

  for (let i = 1; i < curve.length - 1; i++) {
    const kVal = curve[i].k;
    const normX = (kVal - 1) / xRange;
    const normY = (curve[i].inertia - yMax) / yRange;

    // Distancia perpendicular a la diagonal normalizada
    const dist = Math.abs((1 - 0) * (0 - normY) - (0 - 1) * (normX - 0)) / Math.SQRT2;
    if (dist > maxDist) {
      maxDist = dist;
      optimalK = kVal;
    }
  }

  for (const pt of curve) {
    if (pt.k === optimalK) {
      pt.isOptimal = true;
    }
  }

  return { curve, optimalK };
}
