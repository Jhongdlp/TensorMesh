export interface SomCopy {
  backHome: string;
  guideBtn: string;
  targetShape: string;
  topology: string;
  planar: string;
  toroidal: string;
  gridColor: string;
  colorTopology: string;
  colorHeight: string;
  speed: string;
  initialEta: string;
  initialSigma: string;
  decayRate: string;
  alpha: string;
  fullView: string;
  pause: string;
  resume: string;
  step: string;
  restart: string;
  fullscreen: string;
  collapse: string;
  expand: string;
  noGpu: string;
  noGpuSub: string;
  noGpuBack: string;
  roamedNote: string;
  roamedBack: string;
  zenOut: string;
  epochLabel: string;
  nodesLabel: string;
  quantErrorLabel: string;
  currentEtaLabel: string;
  currentSigmaLabel: string;
  guideTitle: string;
  welcomeTitle: string;
  welcomeClose: string;
  welcomeNext: string;
  welcomePrev: string;
  welcomeStart: string;
}

export const SOM_COPY: Record<"es" | "en", SomCopy> = {
  es: {
    backHome: "Volver a Inicio",
    guideBtn: "Guía de Mapas SOM",
    targetShape: "Figura Objetivo",
    topology: "Topología de la Red",
    planar: "Plana (Hoja)",
    toroidal: "Toroidal (Dona)",
    gridColor: "Color de la Red",
    colorTopology: "Topología",
    colorHeight: "Altura Z",
    speed: "Velocidad",
    initialEta: "Tasa inicial (η₀)",
    initialSigma: "Vecindad inicial (σ₀)",
    decayRate: "Decaimiento",
    alpha: "Opacidad de la Malla",
    fullView: "vista completa",
    pause: "pausa",
    resume: "seguir",
    step: "un paso",
    restart: "reiniciar",
    fullscreen: "pantalla completa",
    collapse: "plegar",
    expand: "desplegar",
    noGpu: "Los Mapas Autoorganizados necesitan WebGPU para ejecutarse.",
    noGpuSub: "Tu navegador no tiene WebGPU activado o este dispositivo no lo soporta. Prueba en Chrome, Edge o Firefox Nightly.",
    noGpuBack: "Volver al Inicio",
    roamedNote: "Has desplazado la cámara",
    roamedBack: "Reencuadrar",
    zenOut: "Salir de pantalla completa (Esc)",
    epochLabel: "época",
    nodesLabel: "nodos neuronales",
    quantErrorLabel: "error de cuantización",
    currentEtaLabel: "tasa de aprendizaje (η)",
    currentSigmaLabel: "radio de vecindad (σ)",
    guideTitle: "Guía de Redes Autoorganizadas de Kohonen (SOM)",
    welcomeTitle: "Mapas Autoorganizados en 3D",
    welcomeClose: "Saltar",
    welcomeNext: "Siguiente",
    welcomePrev: "Anterior",
    welcomeStart: "Iniciar autoorganización",
  },
  en: {
    backHome: "Back to Home",
    guideBtn: "SOM Guide",
    targetShape: "Target Shape",
    topology: "Lattice Topology",
    planar: "Planar (Sheet)",
    toroidal: "Toroidal (Donut)",
    gridColor: "Lattice Color",
    colorTopology: "Topology",
    colorHeight: "Z-Height",
    speed: "Speed",
    initialEta: "Initial Rate (η₀)",
    initialSigma: "Initial Radius (σ₀)",
    decayRate: "Decay Schedule",
    alpha: "Mesh Opacity",
    fullView: "full view",
    pause: "pause",
    resume: "resume",
    step: "single step",
    restart: "restart",
    fullscreen: "fullscreen",
    collapse: "collapse",
    expand: "expand",
    noGpu: "Self-Organizing Maps requires WebGPU to run.",
    noGpuSub: "Your browser does not have WebGPU enabled or this device does not support it. Try Chrome, Edge or Firefox Nightly.",
    noGpuBack: "Back to Home",
    roamedNote: "You moved the camera",
    roamedBack: "Reset View",
    zenOut: "Exit Fullscreen (Esc)",
    epochLabel: "epoch",
    nodesLabel: "neural nodes",
    quantErrorLabel: "quantization error",
    currentEtaLabel: "learning rate (η)",
    currentSigmaLabel: "neighborhood radius (σ)",
    guideTitle: "Kohonen Self-Organizing Maps Guide (SOM)",
    welcomeTitle: "Self-Organizing Maps in 3D",
    welcomeClose: "Skip",
    welcomeNext: "Next",
    welcomePrev: "Previous",
    welcomeStart: "Start self-organization",
  },
};

export const SOM_SHAPES_I18N = {
  es: [
    { name: "Esfera 3D", desc: "Superficie cerrada sin bordes. La malla debe envolver la esfera sin arrugas ni auto-intersecciones." },
    { name: "Toro (Dona)", desc: "Geometría toroidal con agujero central. Excelente para poner a prueba la topología periódica." },
    { name: "Doble Hélice", desc: "Dos filamentos entrelazados con separación continua. Exige una gran plasticidad en la red." },
    { name: "Atractor de Lorenz", desc: "Estructura caótica en forma de mariposa. Prueba la capacidad de aproximar atractores no lineales." },
    { name: "Cubo 3D", desc: "Superficie poliédrica con aristas marcadas y vértices agudos." },
    { name: "Plano Ondulado", desc: "Superficie 2D continua con pliegues sinusoidales armónicos." },
  ],
  en: [
    { name: "3D Sphere", desc: "Closed manifold with zero boundary. Lattice must enclose the sphere without pinching or self-intersection." },
    { name: "Torus (Donut)", desc: "Toroidal geometry with center hole. Optimal benchmark for periodic boundary topology." },
    { name: "Double Helix", desc: "Two intertwined strands with continuous gap. Demands high structural plasticity." },
    { name: "Lorenz Attractor", desc: "Chaotic butterfly fractal manifold. Stretches the network across non-linear attractors." },
    { name: "3D Cube", desc: "Polyhedral box with sharp perpendicular edges and vertices." },
    { name: "Wavy Plane", desc: "Continuous 2D Euclidean surface with harmonic sinusoidal ripples." },
  ],
};
