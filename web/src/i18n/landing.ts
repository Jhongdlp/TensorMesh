export interface LandingRoomCopy {
  id: string;
  glyph: "nebula" | "descent" | "som" | "hnsw" | "mcts" | "kmeans" | "nn";
  previewImg: string;
  previewAlt: string;
  status: string;
  title: string;
  desc: string;
  href: string;
  action: string;
  intercept?: boolean;
}

export interface LandingCopy {
  brandFirst: string;
  brandSecond: string;
  navEnter: string;
  navRooms: string;
  navAlgorithm: string;
  navSource: string;
  titleLine1: string;
  titleLine2: string;
  titleLine3: string;
  noteText: string;
  noteAttrib: string;
  scrollLabel: string;
  roomsTitle1: string;
  roomsTitle2: string;
  roomsLead: string;
  rooms: LandingRoomCopy[];
  footerAttrib: string;
  footerSource: string;
  footerPlan: string;
  /** Volver arriba, en el pie. */
  footerTop: string;
  builtBy: string;
}

export const LANDING_COPY: Record<"es" | "en", LandingCopy> = {
  es: {
    brandFirst: "Tensor",
    brandSecond: "Mesh",
    navEnter: "Entrar",
    navRooms: "Galería",
    navAlgorithm: "Algoritmos",
    navSource: "Código",
    builtBy: "Construido por",
    titleLine1: "la forma",
    titleLine2: "de la mente",
    titleLine3: "artificial.",
    noteText: "Un laboratorio inmersivo para explorar algoritmos de optimización, grafos de alta dimensión, redes neuronales y modelos matemáticos de IA renderizados en tiempo real en tu GPU.",
    noteAttrib: "Cómputo en tiempo real · Laboratorio 3D",
    scrollLabel: "Explorar galería",
    roomsTitle1: "galería interactiva",
    roomsTitle2: "en tres dimensiones.",
    roomsLead: "Cada sala convierte una estructura matemática y un algoritmo de aprendizaje automático en un espacio 3D navegable. Nada está pregrabado: las físicas, los tensores y las partículas se calculan en tu GPU mientras los exploras.",
    rooms: [
      {
        id: "01",
        glyph: "nebula",
        previewImg: "/previews/nebula-es.png",
        previewAlt: "Nebulosa de Embeddings (50.000 palabras en 3D)",
        status: "Abierta",
        title: "Nebulosa de Embeddings",
        desc: "50.000 palabras colocadas en 3D simulando resortes sobre su grafo de vecinos más cercanos, no por reducción de dimensiones. El color es vecindad; cada similitud se mide en las 300 dimensiones originales.",
        href: "/embedding-nebula",
        action: "Entrar a la galaxia",
      },
      {
        id: "02",
        glyph: "descent",
        previewImg: "/previews/descent.png",
        previewAlt: "Descenso de Gradiente (Superficie de Rosenbrock y 40.000 caminantes GPU)",
        status: "Abierta",
        title: "Descenso de Gradiente",
        desc: "Diez mil caminantes soltados a la vez sobre la superficie de Rosenbrock. Caen al cañón en diez pasos y luego pasan cuatro mil avanzando por él, que es todo el dilema de un desfiladero.",
        href: "/gradient-descent",
        action: "Ejecutar el descenso",
      },
      {
        id: "03",
        glyph: "som",
        previewImg: "/previews/som.png",
        previewAlt: "Mapas Autoorganizados (Malla neuronal topológica 3D)",
        status: "Abierta",
        title: "Mapas Autoorganizados",
        desc: "Una malla 3D de nodos neuronales que se estira y pliega en tiempo real para adaptarse a una nube de puntos 3D. Elige diferentes figuras (esferas, toros, hélices, atractor de Lorenz) y observa la adaptación topológica mediante compute shaders WebGPU.",
        href: "/self-organizing-maps",
        action: "Ejecutar el mapa",
      },
      {
        id: "04",
        glyph: "hnsw",
        previewImg: "/previews/hnsw.png",
        previewAlt: "Búsqueda Vectorial HNSW (Navegación de grafo jerárquico multicapa)",
        status: "Abierta",
        title: "Búsqueda Vectorial HNSW",
        desc: "Grafos Navigable Small World jerárquicos en 3D. Observa cómo las bases de datos vectoriales y motores de recuperación de LLMs realizan saltos voraces a través de capas estratificadas a velocidad logarítmica.",
        href: "/hnsw",
        action: "Explorar las capas",
      },
      {
        id: "05",
        glyph: "mcts",
        previewImg: "/previews/mcts.png",
        previewAlt: "Árboles de Razonamiento MCTS (Tree-of-Thoughts y Cómputo en Inferencia)",
        status: "Abierta",
        title: "Árboles de Razonamiento MCTS",
        desc: "Árboles de pensamiento (Tree-of-Thoughts) y búsqueda Monte Carlo Tree Search en 3D. Observa cómo agentes de razonamiento modernos (DeepSeek-R1, OpenAI o1) exploran hipótesis, retropropagan recompensas y podan caminos para hallar demostraciones lógicas verificadas.",
        href: "/mcts",
        action: "Explorar el árbol",
      },
      {
        id: "06",
        glyph: "kmeans",
        previewImg: "/previews/kmeans.png",
        previewAlt: "Agrupamiento K-Means y Voronoi 3D (Expectation-Maximization)",
        status: "Abierta",
        title: "Agrupamiento K-Means",
        desc: "Agrupamiento no supervisado y particiones de Voronoi 3D en tiempo real. Observa cómo centroides gravitacionales iteran mediante Expectation-Maximization para minimizar la inercia intracluster en nubes de puntos complejas.",
        href: "/kmeans",
        action: "Agrupar los puntos",
      },
      {
        id: "07",
        glyph: "nn",
        previewImg: "/previews/nn.png",
        previewAlt: "Red Neuronal en 3D (perceptrón multicapa y frontera de decisión)",
        status: "Abierta",
        title: "Red Neuronal",
        desc: "Un perceptrón multicapa entrenándose delante de ti: arriba los pesos, abajo la frontera de decisión que dibujan, y los pulsos de la retropropagación cruzando la red. Pincha una neurona y el suelo pasa a enseñar lo que sólo ella mira.",
        href: "/neural-network",
        action: "Entrenar la red",
      },
    ],
    footerAttrib: "Laboratorio Interactivo · WebGPU & 3D Shaders",
    footerSource: "Código fuente",
    footerPlan: "Plan técnico",
    footerTop: "Arriba",
  },
  en: {
    brandFirst: "Tensor",
    brandSecond: "Mesh",
    navEnter: "Enter",
    navRooms: "Gallery",
    navAlgorithm: "Algorithms",
    navSource: "Source",
    builtBy: "Built by",
    titleLine1: "the shape",
    titleLine2: "of artificial",
    titleLine3: "mind.",
    noteText: "An immersive gallery to explore optimization algorithms, high-dimensional graphs, neural structures, and mathematical models simulated live on your GPU.",
    noteAttrib: "Real-time Compute · 3D Lab",
    scrollLabel: "Explore gallery",
    roomsTitle1: "interactive gallery",
    roomsTitle2: "in three dimensions.",
    roomsLead: "Each room turns a mathematical structure and machine learning algorithm into a navigable 3D space. Nothing is pre-rendered: physics, tensors, and particles compute live on your GPU.",
    rooms: [
      {
        id: "01",
        glyph: "nebula",
        previewImg: "/previews/nebula-en.png",
        previewAlt: "Embedding Nebula (50,000 words in 3D, English graph)",
        status: "Open",
        title: "Embedding Nebula",
        desc: "50,000 words placed in 3D by simulating springs over their nearest-neighbor graph — not by dimension reduction. Color is neighborhood; every similarity you read is measured back in the original 300 dimensions.",
        href: "/embedding-nebula",
        action: "Enter the galaxy",
      },
      {
        id: "02",
        glyph: "descent",
        previewImg: "/previews/descent.png",
        previewAlt: "Gradient Descent (Rosenbrock surface & 40,000 GPU walkers)",
        status: "Open",
        title: "Gradient Descent",
        desc: "Ten thousand walkers dropped at once onto the Rosenbrock surface. They fall onto the parabola within ten steps and then spend four thousand crawling along it — which is the whole trouble with a ravine.",
        href: "/gradient-descent",
        action: "Run the descent",
      },
      {
        id: "03",
        glyph: "som",
        previewImg: "/previews/som.png",
        previewAlt: "Self-Organizing Maps (3D neural topological sheet adaptation)",
        status: "Open",
        title: "Self-Organizing Maps",
        desc: "A 3D grid of neural nodes stretching and folding in real-time to fit a 3D point cloud. You can choose different target shapes (spheres, toruses, double helices, Lorenz attractors) and watch the topological sheet adapt using WebGPU compute shaders.",
        href: "/self-organizing-maps",
        action: "Run the map",
      },
      {
        id: "04",
        glyph: "hnsw",
        previewImg: "/previews/hnsw.png",
        previewAlt: "HNSW Vector Search (Multi-layer hierarchical graph navigation)",
        status: "Open",
        title: "HNSW Vector Search",
        desc: "Hierarchical Navigable Small World graphs in 3D. Watch how vector databases and LLM retrieval engines perform greedy jumps across stratified layers to find nearest neighbors at logarithmic speed.",
        href: "/hnsw",
        action: "Search the layers",
      },
      {
        id: "05",
        glyph: "mcts",
        previewImg: "/previews/mcts.png",
        previewAlt: "MCTS Reasoning Trees (Tree-of-Thoughts & Inference-time Compute)",
        status: "Open",
        title: "MCTS Reasoning Trees",
        desc: "Tree-of-Thoughts and Monte Carlo Tree Search in 3D. Watch how modern reasoning agents (DeepSeek-R1, OpenAI o1) explore hypotheses, backpropagate rewards, and prune dead ends to discover verified logical proofs.",
        href: "/mcts",
        action: "Explore the reasoning tree",
      },
      {
        id: "06",
        glyph: "kmeans",
        previewImg: "/previews/kmeans.png",
        previewAlt: "K-Means Clustering & Voronoi 3D (Expectation-Maximization)",
        status: "Open",
        title: "K-Means Clustering",
        desc: "Unsupervised clustering and 3D Voronoi partitions in real-time. Watch gravitational centroids iterate through Expectation-Maximization steps to minimize intra-cluster inertia on complex point clouds.",
        href: "/kmeans",
        action: "Cluster the points",
      },
      {
        id: "07",
        glyph: "nn",
        previewImg: "/previews/nn.png",
        previewAlt: "Neural Network in 3D (multilayer perceptron and decision boundary)",
        status: "Open",
        title: "Neural Network",
        desc: "A multilayer perceptron training in front of you: the weights above, the decision boundary they draw below, and backpropagation pulses crossing the net. Click a neuron and the floor switches to what only that unit sees.",
        href: "/neural-network",
        action: "Train the network",
      },
    ],
    footerAttrib: "Interactive Lab · WebGPU & 3D Shaders",
    footerSource: "Source",
    footerPlan: "Technical plan",
    footerTop: "Top",
  },
};
