export interface CollaborateCopy {
  navBack: string;
  badge: string;
  heroTitle: string;
  heroSubtitle: string;
  ctaGithub: string;
  ctaRooms: string;
  ctaTemplate: string;
  
  stats: {
    label: string;
    value: string;
    detail: string;
  }[];

  missionTitle: string;
  missionLead: string;
  
  pillarsTitle: string;
  pillarsLead: string;
  pillars: {
    id: string;
    tag: string;
    title: string;
    desc: string;
    features: string[];
  }[];

  archTitle: string;
  archLead: string;
  archSteps: {
    badge: string;
    title: string;
    desc: string;
    codeLang: string;
    file: string;
  }[];

  wishlistTitle: string;
  wishlistLead: string;
  wishlist: {
    tag: string;
    title: string;
    desc: string;
    difficulty: string;
  }[];

  guideTitle: string;
  guideLead: string;
  steps: {
    num: string;
    title: string;
    desc: string;
    cmd?: string;
  }[];

  ctaBoxTitle: string;
  ctaBoxLead: string;
  ctaBoxBtn: string;
  ctaBoxIssue: string;
}

export const COLLABORATE_COPY: Record<"es" | "en", CollaborateCopy> = {
  es: {
    navBack: "Volver al inicio",
    badge: "Laboratorio Abierto · WebGPU Community",
    heroTitle: "Construyamos la galería pública de algoritmos y computación visual.",
    heroSubtitle:
      "TensorMesh es una plataforma abierta y colaborativa. Nuestra misión es crear una biblioteca viva de algoritmos de inteligencia artificial, matemáticas y física simulados en tiempo real mediante WebGPU, acompañados de cursos y experiencias interactivas.",
    ctaGithub: "Contribuir en GitHub",
    ctaRooms: "Explorar la Galería",
    ctaTemplate: "Ver Estructura de Sala",

    stats: [
      {
        label: "Cómputo Nativo",
        value: "100% WebGPU",
        detail: "Sin servidores pesados: todo corre en la GPU del visitante.",
      },
      {
        label: "Código Libre",
        value: "Open Source",
        detail: "Licencia MIT, revisión por pares y atribución directa al autor.",
      },
      {
        label: "Rendimiento",
        value: "60 FPS",
        detail: "Compute shaders masivamente paralelos y renderizado en vivo.",
      },
      {
        label: "Propósito",
        value: "Educación 3D",
        detail: "Algoritmos explicados paso a paso de forma visual e intuitiva.",
      },
    ],

    missionTitle: "La Visión: democratizar la comprensión profunda de la IA",
    missionLead:
      "Los algoritmos más potentes del mundo suelen estar ocultos tras abstracciones matemáticas complejas o cajas negras opacas. TensorMesh convierte cada modelo en un espacio tridimensional donde puedes tocar los pesos, cambiar los hiperparámetros y ver la convergencia con tus propios ojos.",

    pillarsTitle: "Pilares del Proyecto Colaborativo",
    pillarsLead: "Tres ejes fundamentales diseñados para creadores, educadores e ingenieros de software.",
    pillars: [
      {
        id: "01",
        tag: "WebGPU Shaders",
        title: "Algoritmos y Simulaciones en GPU",
        desc: "Implementa tu propio modelo o algoritmo utilizando shaders en WGSL (WebGPU Shading Language). Desde descenso de gradiente estocástico y grafos k-NN hasta campos de radiación neural y física cuántica.",
        features: [
          "Compute shaders altamente optimizados",
          "Manejo directo de tensores y buffers en VRAM",
          "Interacción 3D suave con ratón, teclado y táctil",
        ],
      },
      {
        id: "02",
        tag: "Pedagogía Visual",
        title: "Cursos y Módulos Interactivos",
        desc: "Cada sala no es solo una demo bonita: es una lección interactiva. Queremos construir cursos visuales donde cualquier estudiante pueda aprender qué hace cada ecuación matemática jugando con ella.",
        features: [
          "Guías paso a paso sincronizadas con la escena 3D",
          "Controles paramétricos en tiempo real",
          "Explicaciones bilingües (Español e Inglés)",
        ],
      },
      {
        id: "03",
        tag: "Comunidad Abierta",
        title: "Galería Pública con Atribución",
        desc: "Cada sala subida por la comunidad incluye la ficha del autor, avatar, enlaces a redes sociales y enlace al código fuente. Tu contribución enriquecerá el conocimiento libre mundial.",
        features: [
          "Perfil de autor destacado en tu sala",
          "Flujo de Pull Requests y feedback técnico",
          "Exposición a nivel internacional",
        ],
      },
    ],

    archTitle: "El Estándar Técnico de TensorMesh",
    archLead: "Creamos una arquitectura modular, ligera y sin dependencias pesadas que permite crear salas WebGPU en minutos.",
    archSteps: [
      {
        badge: "01 / CÓMPUTO",
        title: "Compute Pipeline (WGSL)",
        desc: "La lógica matemática pura (cálculo de gradientes, fuerzas de atracción, actualización de pesos neuronales) se ejecuta en miles de hilos paralelos dentro de la GPU.",
        codeLang: "wgsl",
        file: "engine.wgsl",
      },
      {
        badge: "02 / RENDERIZADO",
        title: "Render Pipeline 3D",
        desc: "Las partículas, grafos, mallas y superficies se dibujan mediante shaders de vértices y fragmentos a 60 cuadros por segundo sin sobrecargar la CPU.",
        codeLang: "wgsl",
        file: "render.wgsl",
      },
      {
        badge: "03 / INTERFAZ",
        title: "Shell React & Parámetros",
        desc: "Un raíl de control minimalista en React permite al usuario pausar la simulación, ajustar la tasa de aprendizaje, rotar la cámara y explorar métricas.",
        codeLang: "tsx",
        file: "Room.tsx",
      },
      {
        badge: "04 / NARRATIVA",
        title: "Guía Interactiva i18n",
        desc: "Tarjetas explicativas paso a paso que desglosan la intuición matemática del algoritmo con soporte para español e inglés.",
        codeLang: "ts",
        file: "guide.ts",
      },
    ],

    wishlistTitle: "Ideas de Algoritmos para la Comunidad",
    wishlistLead: "¿Buscas inspiración? Estos son algunos de los algoritmos y salas que nos encantaría ver en la galería pública:",
    wishlist: [
      {
        tag: "Deep Learning",
        title: "Transformers & Self-Attention 3D",
        desc: "Visualizar las matrices de Query, Key y Value, los mapas de atención softmax multidimensionales y el flujo de tokens en capas Transformer.",
        difficulty: "Intermedio",
      },
      {
        tag: "Generative AI",
        title: "Modelos de Difusión (Denoising)",
        desc: "Simulación del proceso de difusión directa e inversa, transformando ruido gaussiano en imágenes o tensores estructurados paso a paso.",
        difficulty: "Avanzado",
      },
      {
        tag: "Biología Computacional",
        title: "Autómatas Celulares Neuronales (NCA)",
        desc: "Células 3D con redes neuronales locales que aprenden a regenerar patrones complejos y resistir perturbaciones en tiempo real.",
        difficulty: "Intermedio",
      },
      {
        tag: "Astrofísica / Matemáticas",
        title: "Problema de N-Cuerpos (Barnes-Hut)",
        desc: "Simulación gravitacional de 100.000 partículas estelares utilizando partición espacial octree en compute shaders WebGPU.",
        difficulty: "Fácil / Medio",
      },
      {
        tag: "Reducción Dimensional",
        title: "t-SNE & UMAP en Tiempo Real",
        desc: "Visualizar la proyección de un espacio de alta dimensión (ej. MNIST, GloVe) optimizándose dinámicamente sobre la GPU.",
        difficulty: "Intermedio",
      },
      {
        tag: "Física Cuántica",
        title: "Esferas de Bloch & Entrelazamiento",
        desc: "Simulación de estados cuánticos puros y mixtos, superposición y puertas lógicas cuánticas en un entorno tridimensional interactivo.",
        difficulty: "Avanzado",
      },
    ],

    guideTitle: "Guía de Contribución: 4 Pasos",
    guideLead: "El proceso para proponer y subir tu algoritmo a TensorMesh es 100% transparente y directo:",
    steps: [
      {
        num: "01",
        title: "Haz un Fork del Repositorio",
        desc: "Clona el proyecto en tu máquina local y corre el entorno de desarrollo con Node.js y Astro.",
        cmd: "git clone https://github.com/Jhongdlp/TensorMesh.git\ncd TensorMesh/web\nnpm install\nnpm run dev",
      },
      {
        num: "02",
        title: "Crea tu Sala y Shaders",
        desc: "Crea una nueva carpeta en `web/src/rooms/tu-algoritmo/` con tus archivos WGSL de cómputo y render, y el componente React de interfaz.",
      },
      {
        num: "03",
        title: "Añade la Guía y Traducción",
        desc: "Escribe la guía interactiva y los textos en `web/src/i18n/` para que los usuarios puedan entender tu algoritmo en español e inglés.",
      },
      {
        num: "04",
        title: "Abre un Pull Request",
        desc: "Envía tu Pull Request a la rama main. Lo revisaremos contigo, optimizaremos el pipeline y lo publicaremos en la galería con tu autoría.",
      },
    ],

    ctaBoxTitle: "¿Listo para construir el futuro del aprendizaje visual?",
    ctaBoxLead: "Únete a la comunidad de desarrolladores y creadores de TensorMesh. Tu código educará e inspirará a miles de personas.",
    ctaBoxBtn: "Ver Repositorio en GitHub",
    ctaBoxIssue: "Proponer una idea o algoritmo",
  },

  en: {
    navBack: "Back to home",
    badge: "Open Laboratory · WebGPU Community",
    heroTitle: "Let's build the public gallery for visual compute and AI.",
    heroSubtitle:
      "TensorMesh is an open, collaborative platform. Our mission is to build a living library of artificial intelligence, mathematics, and physics algorithms simulated in real time using WebGPU, along with interactive courses and learning experiences.",
    ctaGithub: "Contribute on GitHub",
    ctaRooms: "Explore Gallery",
    ctaTemplate: "View Room Architecture",

    stats: [
      {
        label: "Native Compute",
        value: "100% WebGPU",
        detail: "No heavy backend servers: everything runs locally on the user's GPU.",
      },
      {
        label: "Open Code",
        value: "Open Source",
        detail: "MIT licensed, peer-reviewed, and with direct author attribution.",
      },
      {
        label: "Performance",
        value: "60 FPS",
        detail: "Massively parallel compute shaders and live hardware rendering.",
      },
      {
        label: "Purpose",
        value: "3D Education",
        detail: "Algorithms explained step-by-step visually and intuitively.",
      },
    ],

    missionTitle: "The Vision: democratizing deep intuitive understanding of AI",
    missionLead:
      "The world's most powerful algorithms are often hidden behind complex mathematical abstractions or opaque black boxes. TensorMesh turns each model into a 3D navigable space where you can manipulate weights, tweak hyperparameters, and observe convergence with your own eyes.",

    pillarsTitle: "Pillars of the Collaborative Project",
    pillarsLead: "Three foundational axes built for creators, educators, and software engineers.",
    pillars: [
      {
        id: "01",
        tag: "WebGPU Shaders",
        title: "GPU Algorithms & Simulations",
        desc: "Implement your own algorithm or model using WGSL (WebGPU Shading Language). From stochastic gradient descent and k-NN graphs to neural radiance fields and quantum physics.",
        features: [
          "Highly optimized compute shaders",
          "Direct tensor and buffer allocation in VRAM",
          "Smooth 3D orbit and interaction on mouse & touch",
        ],
      },
      {
        id: "02",
        tag: "Visual Pedagogy",
        title: "Interactive Courses & Modules",
        desc: "Each room is not just a demo: it is an interactive lesson. We aim to construct visual courses where any student can master equations by playing with their live behavior.",
        features: [
          "Step-by-step interactive guides synchronized with 3D space",
          "Real-time parametric controls and sliders",
          "Bilingual explanations (English and Spanish)",
        ],
      },
      {
        id: "03",
        tag: "Open Community",
        title: "Public Gallery with Attribution",
        desc: "Every community room includes the author's card, avatar, social media links, and direct source repository links. Your work enriches the global public knowledge commons.",
        features: [
          "Prominent author showcase in your room",
          "Collaborative PR workflow and technical feedback",
          "Global exposure across AI and graphics communities",
        ],
      },
    ],

    archTitle: "The TensorMesh Technical Standard",
    archLead: "We created a lightweight, zero-bloat modular architecture that enables building WebGPU rooms in minutes.",
    archSteps: [
      {
        badge: "01 / COMPUTE",
        title: "Compute Pipeline (WGSL)",
        desc: "Pure mathematical logic (gradient updates, force-directed springs, neural backprop) executes across thousands of parallel GPU threads.",
        codeLang: "wgsl",
        file: "engine.wgsl",
      },
      {
        badge: "02 / RENDERING",
        title: "3D Render Pipeline",
        desc: "Particles, graphs, meshes, and surfaces render at 60 FPS through custom vertex and fragment shaders without overloading the CPU.",
        codeLang: "wgsl",
        file: "render.wgsl",
      },
      {
        badge: "03 / INTERFACE",
        title: "React Shell & Parameters",
        desc: "A minimalist React control rail lets users pause the simulation, tweak learning rates, rotate the camera, and inspect metrics.",
        codeLang: "tsx",
        file: "Room.tsx",
      },
      {
        badge: "04 / NARRATIVE",
        title: "Interactive i18n Guide",
        desc: "Step-by-step explanatory cards that break down mathematical intuition in both English and Spanish.",
        codeLang: "ts",
        file: "guide.ts",
      },
    ],

    wishlistTitle: "Algorithm Ideas for the Community",
    wishlistLead: "Looking for inspiration? Here are some rooms and algorithms we would love to see in the public gallery:",
    wishlist: [
      {
        tag: "Deep Learning",
        title: "3D Transformers & Self-Attention",
        desc: "Visualize Query, Key, and Value matrices, multidimensional softmax attention maps, and token routing across Transformer layers.",
        difficulty: "Intermediate",
      },
      {
        tag: "Generative AI",
        title: "Diffusion Models (Denoising Process)",
        desc: "Simulate forward and reverse diffusion processes, iteratively transforming Gaussian noise into structured tensors in 3D.",
        difficulty: "Advanced",
      },
      {
        tag: "Computational Biology",
        title: "Neural Cellular Automata (NCA)",
        desc: "3D cellular lattices with local neural update rules that learn to grow, regenerate, and resist morphological damage in real-time.",
        difficulty: "Intermediate",
      },
      {
        tag: "Astrophysics / Math",
        title: "N-Body Simulation (Barnes-Hut)",
        desc: "Gravitational simulation of 100,000 stellar bodies using octree spatial partitioning accelerated with WebGPU compute shaders.",
        difficulty: "Easy / Medium",
      },
      {
        tag: "Dimensionality Reduction",
        title: "Real-time t-SNE & UMAP",
        desc: "Watch high-dimensional embeddings (e.g., MNIST, GloVe vectors) dynamically unfold into cluster manifolds live on the GPU.",
        difficulty: "Intermediate",
      },
      {
        tag: "Quantum Physics",
        title: "Bloch Spheres & Entanglement",
        desc: "Interactive 3D simulation of quantum states, superposition, interference, and quantum logic gates.",
        difficulty: "Advanced",
      },
    ],

    guideTitle: "Contribution Guide: 4 Steps",
    guideLead: "The path to proposing and submitting your algorithm to TensorMesh is 100% open and direct:",
    steps: [
      {
        num: "01",
        title: "Fork the Repository",
        desc: "Clone the project to your local machine and start the Astro + React development environment.",
        cmd: "git clone https://github.com/Jhongdlp/TensorMesh.git\ncd TensorMesh/web\nnpm install\nnpm run dev",
      },
      {
        num: "02",
        title: "Create your Room & Shaders",
        desc: "Create a new folder in `web/src/rooms/your-algorithm/` with your WGSL compute and render shaders and the React UI harness.",
      },
      {
        num: "03",
        title: "Add Interactive Guide & Translations",
        desc: "Write the educational walkthrough in `web/src/i18n/` so visitors can understand your algorithm in both English and Spanish.",
      },
      {
        num: "04",
        title: "Open a Pull Request",
        desc: "Submit your Pull Request to the main branch. We will review it together, optimize shaders, and merge it to the official gallery.",
      },
    ],

    ctaBoxTitle: "Ready to build the future of visual computing?",
    ctaBoxLead: "Join the community of developers, educators, and creators at TensorMesh. Your code will inspire and educate thousands of learners worldwide.",
    ctaBoxBtn: "View Repository on GitHub",
    ctaBoxIssue: "Propose an Idea or Algorithm",
  },
};
