export interface KmeansCopy {
  backHome: string;
  guideBtn: string;
  searchPlaceholder: string;
  dataset: string;
  numClustersK: string;
  initStrategy: string;
  kmeansPlusPlus: string;
  randomForgy: string;
  vizVoronoi: string;
  voronoiPlanes: string;
  knnConstellations: string;
  trajectories: string;
  semanticConcept: string;
  clickIn3D: string;
  elbowMethod: string;
  selectedK: string;
  silhouette: string;
  wcssInertia: string;
  deltaCentroids: string;
  semanticDomains: string;
  reinitialize: string;
  step: string;
  stepForward: string;
  stepBackward: string;
  speed: string;
  pause: string;
  resume: string;
  fullView: string;
  collapse: string;
  expand: string;
  fullscreen: string;
  noGpu: string;
  noGpuSub: string;
  noGpuBack: string;
  roamedNote: string;
  roamedBack: string;
  zenOut: string;
  guideTitle: string;
}

export const KMEANS_COPY: Record<"es" | "en", KmeansCopy> = {
  es: {
    backHome: "Volver al Atlas",
    guideBtn: "Guía de K-Means",
    searchPlaceholder: "Buscar concepto...",
    dataset: "Dataset de Nodos Semánticos",
    numClustersK: "Número de Clusters (K)",
    initStrategy: "Estrategia de Inicialización",
    kmeansPlusPlus: "K-Means++ (Óptimo)",
    randomForgy: "Aleatorio (Forgy)",
    vizVoronoi: "Visualización 3D & Voronoi",
    voronoiPlanes: "Planos de Voronoi",
    knnConstellations: "Constelaciones k-NN",
    trajectories: "Trayectorias",
    semanticConcept: "Concepto Semántico",
    clickIn3D: "Click en 3D",
    elbowMethod: "Método del Codo",
    selectedK: "K Seleccionado",
    silhouette: "Silueta",
    wcssInertia: "Inercia Intra-Cluster (WCSS)",
    deltaCentroids: "Delta Centroides",
    semanticDomains: "Dominios Semánticos",
    reinitialize: "Reiniciar Simulación",
    step: "Paso",
    stepForward: "paso adelante",
    stepBackward: "paso atrás",
    speed: "Velocidad",
    pause: "pausa",
    resume: "seguir",
    fullView: "vista completa",
    collapse: "plegar",
    expand: "desplegar",
    fullscreen: "pantalla completa",
    noGpu: "K-Means Clustering 3D necesita WebGPU para ejecutarse.",
    noGpuSub: "Tu navegador no tiene WebGPU activado o este dispositivo no lo soporta. Prueba en Chrome, Edge o Firefox Nightly.",
    noGpuBack: "Volver al Inicio",
    roamedNote: "Has desplazado la cámara",
    roamedBack: "Reencuadrar",
    zenOut: "Salir de pantalla completa (Esc)",
    guideTitle: "Guía de K-Means Clustering & Voronoi 3D",
  },
  en: {
    backHome: "Back to Atlas",
    guideBtn: "K-Means Guide",
    searchPlaceholder: "Search concept...",
    dataset: "Semantic Node Dataset",
    numClustersK: "Number of Clusters (K)",
    initStrategy: "Initialization Strategy",
    kmeansPlusPlus: "K-Means++ (Optimal)",
    randomForgy: "Random (Forgy)",
    vizVoronoi: "3D Visualization & Voronoi",
    voronoiPlanes: "Voronoi Partition Planes",
    knnConstellations: "k-NN Constellations",
    trajectories: "Trajectories",
    semanticConcept: "Semantic Concept",
    clickIn3D: "Click in 3D",
    elbowMethod: "Elbow Method",
    selectedK: "Selected K",
    silhouette: "Silhouette",
    wcssInertia: "Intra-Cluster Inertia (WCSS)",
    deltaCentroids: "Centroid Delta",
    semanticDomains: "Semantic Domains",
    reinitialize: "Restart Simulation",
    step: "Step",
    stepForward: "step forward",
    stepBackward: "step backward",
    speed: "Speed",
    pause: "pause",
    resume: "resume",
    fullView: "full view",
    collapse: "collapse",
    expand: "expand",
    fullscreen: "fullscreen",
    noGpu: "K-Means Clustering 3D requires WebGPU to run.",
    noGpuSub: "Your browser does not have WebGPU enabled or this device does not support it. Try Chrome, Edge or Firefox Nightly.",
    noGpuBack: "Back to Home",
    roamedNote: "You moved the camera",
    roamedBack: "Reset View",
    zenOut: "Exit Fullscreen (Esc)",
    guideTitle: "K-Means Clustering & Voronoi 3D Guide",
  },
};

export const KMEANS_PRESETS_I18N = {
  es: [
    { id: "blobs", name: "Cúmulos Gaussianos 3D", desc: "Nubes esféricas separables con densidades gaussianas multivariadas." },
    { id: "moebius", name: "Cinta de Moebius Entrelazada", desc: "Superficie no orientable con torsión continua para evaluar particiones topológicas complejas." },
    { id: "spiral_galaxy", name: "Galaxia Espiral Logarítmica", desc: "Brazos espirales curvos con densidad decreciente desde el bulbo central." },
    { id: "uniform_cube", name: "Nube Uniforme (Hipercubo)", desc: "Distribución homogénea sin clusters intrínsecos para probar teselaciones de Voronoi puras." },
  ],
  en: [
    { id: "blobs", name: "3D Gaussian Clusters", desc: "Separable spherical point clouds with multivariate Gaussian distributions." },
    { id: "moebius", name: "Twisted Moebius Strip", desc: "Non-orientable twisted manifold benchmark for complex topological partitions." },
    { id: "spiral_galaxy", name: "Logarithmic Spiral Galaxy", desc: "Curved spiral arms with decaying radial density from central bulge." },
    { id: "uniform_cube", name: "Uniform Cloud (Hypercube)", desc: "Homogeneous distribution without intrinsic clusters for pure Voronoi tessellations." },
  ],
};

export const KMEANS_PHASES_I18N: Record<"es" | "en", Record<string, string>> = {
  es: {
    init: "Inicialización K-Means++",
    assign_e: "Paso E · Asignación",
    update_m: "Paso M · Centroides",
    converged: "Convergencia",
  },
  en: {
    init: "K-Means++ Initialization",
    assign_e: "E-Step · Assignment",
    update_m: "M-Step · Centroids",
    converged: "Convergence",
  },
};
