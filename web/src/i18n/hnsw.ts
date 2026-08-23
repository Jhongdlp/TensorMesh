export interface HnswCopy {
  backHome: string;
  guideBtn: string;
  dataset: string;
  triggerQuery: string;
  layerSpacing: string;
  isolateLayer: string;
  hnswHyperparams: string;
  paramM: string;
  paramEf: string;
  paramK: string;
  multiLayerStructure: string;
  searchEfficiency: string;
  recallLabel: string;
  topKNearest: string;
  resetSearch: string;
  speed: string;
  step: string;
  searchMetric: string;
  randomQuery: string;
  linksPerNode: string;
  efSearch: string;
  efConstruction: string;
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
  currentLayerLabel: string;
  currentNodeLabel: string;
  comparisonsLabel: string;
  bruteForceLabel: string;
  speedupLabel: string;
  topKNeighbors: string;
  greedyLog: string;
  guideTitle: string;
  welcomeTitle: string;
  welcomeClose: string;
  welcomeNext: string;
  welcomePrev: string;
  welcomeStart: string;
}

export const HNSW_COPY: Record<"es" | "en", HnswCopy> = {
  es: {
    backHome: "Volver al Atlas",
    guideBtn: "Guía de HNSW",
    dataset: "Dataset de Embeddings",
    triggerQuery: "Lanzar Query",
    layerSpacing: "Separación vertical",
    isolateLayer: "Aislar Capa Focal",
    hnswHyperparams: "Hiperparámetros HNSW",
    paramM: "Conexiones por nodo (M)",
    paramEf: "Amplitud (efSearch)",
    paramK: "Vecinos deseados (K)",
    multiLayerStructure: "Estructura Multicapa",
    searchEfficiency: "Eficiencia de Búsqueda",
    recallLabel: "Recall@K",
    topKNearest: "Top-K Vecinos Más Cercanos",
    resetSearch: "Reiniciar Búsqueda",
    speed: "Velocidad",
    step: "Paso",
    searchMetric: "Métrica de Distancia",
    randomQuery: "Nueva Consulta Aleatoria",
    linksPerNode: "Enlaces por nodo (M)",
    efSearch: "Amplitud de búsqueda (efSearch)",
    efConstruction: "Calidad de construcción (efConstruction)",
    fullView: "vista completa",
    pause: "pausa",
    resume: "seguir",
    stepForward: "paso adelante",
    stepBackward: "paso atrás",
    fullscreen: "pantalla completa",
    collapse: "plegar",
    expand: "desplegar",
    noGpu: "HNSW Vector Search necesita WebGPU para ejecutarse.",
    noGpuSub: "Tu navegador no tiene WebGPU activado o este dispositivo no lo soporta. Prueba en Chrome, Edge o Firefox Nightly.",
    noGpuBack: "Volver al Inicio",
    roamedNote: "Has desplazado la cámara",
    roamedBack: "Reencuadrar",
    zenOut: "Salir de pantalla completa (Esc)",
    currentLayerLabel: "capa actual",
    currentNodeLabel: "nodo evaluado",
    comparisonsLabel: "comparaciones HNSW",
    bruteForceLabel: "comparaciones fuerza bruta",
    speedupLabel: "aceleración logarítmica",
    topKNeighbors: "Vecinos más cercanos (Top-K)",
    greedyLog: "Registro de saltos voraces",
    guideTitle: "Guía de Búsqueda Vectorial HNSW",
    welcomeTitle: "Búsqueda Vectorial HNSW en 3D",
    welcomeClose: "Saltar",
    welcomeNext: "Siguiente",
    welcomePrev: "Anterior",
    welcomeStart: "Iniciar búsqueda vectorial",
  },
  en: {
    backHome: "Back to Atlas",
    guideBtn: "HNSW Guide",
    dataset: "Embedding Dataset",
    triggerQuery: "Launch Query",
    layerSpacing: "Layer Spacing",
    isolateLayer: "Isolate Focal Layer",
    hnswHyperparams: "HNSW Hyperparameters",
    paramM: "Neighbors per node (M)",
    paramEf: "Beam Size (efSearch)",
    paramK: "Target Neighbors (K)",
    multiLayerStructure: "Multi-Layer Structure",
    searchEfficiency: "Search Efficiency",
    recallLabel: "Recall@K",
    topKNearest: "Top-K Nearest Neighbors",
    resetSearch: "Reset Search",
    speed: "Speed",
    step: "Step",
    searchMetric: "Distance Metric",
    randomQuery: "New Random Query",
    linksPerNode: "Links per node (M)",
    efSearch: "Search Beam (efSearch)",
    efConstruction: "Construction Depth (efConstruction)",
    fullView: "full view",
    pause: "pause",
    resume: "resume",
    stepForward: "step forward",
    stepBackward: "step backward",
    fullscreen: "fullscreen",
    collapse: "collapse",
    expand: "expand",
    noGpu: "HNSW Vector Search requires WebGPU to run.",
    noGpuSub: "Your browser does not have WebGPU enabled or this device does not support it. Try Chrome, Edge or Firefox Nightly.",
    noGpuBack: "Back to Home",
    roamedNote: "You moved the camera",
    roamedBack: "Reset View",
    zenOut: "Exit Fullscreen (Esc)",
    currentLayerLabel: "current layer",
    currentNodeLabel: "evaluated node",
    comparisonsLabel: "HNSW evaluations",
    bruteForceLabel: "brute-force comparisons",
    speedupLabel: "logarithmic speedup",
    topKNeighbors: "Nearest Neighbors (Top-K)",
    greedyLog: "Greedy routing hops trace",
    guideTitle: "HNSW Vector Search Guide",
    welcomeTitle: "HNSW Vector Search in 3D",
    welcomeClose: "Skip",
    welcomeNext: "Next",
    welcomePrev: "Previous",
    welcomeStart: "Start vector search",
  },
};

export const HNSW_DATASETS_I18N = {
  es: [
    { id: "wiki_semantic", name: "Conceptos Wikipedia (300D)", desc: "Embeddings semánticos de entidades reales extraídos de fastText y GloVe." },
    { id: "gaussian_spheres", name: "Cúmulos Gaussianos 3D", desc: "Clusters esféricos con densidades asimétricas para probar la dispersión de saltos." },
    { id: "swiss_roll", name: "Manifold Espiral Suizo", desc: "Superficie no convexa enrollada para evaluar la navegación a través de curvas continuas." },
  ],
  en: [
    { id: "wiki_semantic", name: "Wikipedia Concepts (300D)", desc: "Semantic entity embeddings extracted from fastText and GloVe." },
    { id: "gaussian_spheres", name: "3D Gaussian Clusters", desc: "Spherical clusters with asymmetric densities benchmark for jump dispersion." },
    { id: "swiss_roll", name: "Swiss Roll Manifold", desc: "Curled non-convex surface to evaluate continuous curvilinear graph routing." },
  ],
};

export const HNSW_LAYERS_I18N = {
  es: [
    { name: "L0 (Base)", desc: "Contiene el 100% de los vectores con máxima densidad de enlaces para refinamiento local." },
    { name: "L1 (Media)", desc: "Densidad intermedia (~20% de vectores) para aproximación rápida al cluster objetivo." },
    { name: "L2 (Cumbre)", desc: "Capa dispersa (~5% de vectores) con enlaces de larga distancia para saltos iniciales tipo autopista." },
  ],
  en: [
    { name: "L0 (Base)", desc: "Contains 100% of vectors with fine-grained local connectivity." },
    { name: "L1 (Medium)", desc: "Intermediate density (~20% vectors) bridging highway entry to target clusters." },
    { name: "L2 (Express)", desc: "Sparse highway layer (~5% vectors) spanning broad long-range jumps." },
  ],
};
