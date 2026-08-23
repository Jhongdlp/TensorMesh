export interface DescentCopy {
  backHome: string;
  guideBtn: string;
  surface: string;
  optimizer: string;
  walkerColor: string;
  height: string;
  origin: string;
  speed: string;
  probe: string;
  stepSize: string;
  walkers: string;
  trail: string;
  trailPermanent: string;
  frames: string;
  fullView: string;
  pause: string;
  resume: string;
  step: string;
  dropAgain: string;
  topDown: string;
  relief: string;
  fullscreen: string;
  collapse: string;
  expand: string;
  noGpu: string;
  noGpuSub: string;
  noGpuBack: string;
  roamedNote: string;
  roamedBack: string;
  zenOut: string;
  stepsLabel: string;
  liveLabel: string;
  convergedLabel: string;
  surfaceCardTitle: string;
  formulaLabel: string;
  globalMinLabel: string;
  notesLabel: string;
  guideTitle: string;
  welcomeTitle: string;
  welcomeClose: string;
  welcomeNext: string;
  welcomePrev: string;
  welcomeStart: string;
}

export const DESCENT_COPY: Record<"es" | "en", DescentCopy> = {
  es: {
    backHome: "Volver a Inicio",
    guideBtn: "Guía del Descenso",
    surface: "Superficie",
    optimizer: "Optimizador",
    walkerColor: "Color del caminante",
    height: "Altura",
    origin: "Origen",
    speed: "Velocidad del Descenso",
    probe: "Soltar Sonda Exploradora",
    stepSize: "Paso",
    walkers: "Caminantes",
    trail: "Estela",
    trailPermanent: "permanente",
    frames: "frames",
    fullView: "vista completa",
    pause: "pausa",
    resume: "seguir",
    step: "un paso",
    dropAgain: "soltar de nuevo",
    topDown: "planta",
    relief: "relieve",
    fullscreen: "pantalla completa",
    collapse: "plegar",
    expand: "desplegar",
    noGpu: "El descenso de gradiente necesita WebGPU para ejecutarse.",
    noGpuSub: "Tu navegador no tiene WebGPU activado o este dispositivo no lo soporta. Prueba en Chrome, Edge o Firefox Nightly.",
    noGpuBack: "Volver al Inicio",
    roamedNote: "Has desplazado la cámara",
    roamedBack: "Reencuadrar",
    zenOut: "Salir de pantalla completa (Esc)",
    stepsLabel: "pasos",
    liveLabel: "caminantes vivos",
    convergedLabel: "convergidos",
    surfaceCardTitle: "Ficha de Superficie",
    formulaLabel: "Fórmula matemática",
    globalMinLabel: "Mínimo global",
    notesLabel: "Comportamiento del gradiente",
    guideTitle: "Guía Interactiva de Descenso de Gradiente",
    welcomeTitle: "Descenso de Gradiente en 3D",
    welcomeClose: "Saltar",
    welcomeNext: "Siguiente",
    welcomePrev: "Anterior",
    welcomeStart: "Comenzar simulación",
  },
  en: {
    backHome: "Back to Home",
    guideBtn: "Descent Guide",
    surface: "Surface",
    optimizer: "Optimizer",
    walkerColor: "Walker Color",
    height: "Height",
    origin: "Origin",
    speed: "Descent Speed",
    probe: "Drop Explorer Probe",
    stepSize: "Step Size",
    walkers: "Walkers",
    trail: "Trail",
    trailPermanent: "permanent",
    frames: "frames",
    fullView: "full view",
    pause: "pause",
    resume: "resume",
    step: "single step",
    dropAgain: "drop again",
    topDown: "top-down",
    relief: "3D relief",
    fullscreen: "fullscreen",
    collapse: "collapse",
    expand: "expand",
    noGpu: "Gradient descent requires WebGPU to run.",
    noGpuSub: "Your browser does not have WebGPU enabled or this device does not support it. Try Chrome, Edge or Firefox Nightly.",
    noGpuBack: "Back to Home",
    roamedNote: "You moved the camera",
    roamedBack: "Reset View",
    zenOut: "Exit Fullscreen (Esc)",
    stepsLabel: "steps",
    liveLabel: "live walkers",
    convergedLabel: "converged",
    surfaceCardTitle: "Surface Card",
    formulaLabel: "Mathematical formula",
    globalMinLabel: "Global minimum",
    notesLabel: "Gradient behavior",
    guideTitle: "Interactive Gradient Descent Guide",
    welcomeTitle: "Gradient Descent in 3D",
    welcomeClose: "Skip",
    welcomeNext: "Next",
    welcomePrev: "Previous",
    welcomeStart: "Start simulation",
  },
};

export const DESCENT_SURFACES_I18N = {
  es: [
    { name: "Rosenbrock", desc: "El valle curvo clásico («la banana»). Bajar a la parábola es rápido, avanzar por el fondo hacia (1,1) cuesta miles de pasos." },
    { name: "Himmelblau", desc: "Cuatro mínimos globales idénticos. Cada partícula cae en una cuenca distinta según su ángulo de partida." },
    { name: "Rastrigin", desc: "Un campo minado de mínimos locales periódicos. Probar aquí es entender por qué hace falta momento y estocasticidad." },
    { name: "Beale", desc: "Mesetas planas con paredes casi verticales. Los gradientes pequeños en la planicie frenan el avance." },
    { name: "Silla de Montar", desc: "Punto de ensilladura: sube en un eje y baja en el otro. No tiene mínimo local; los caminantes escapan por los extremos." },
  ],
  en: [
    { name: "Rosenbrock", desc: "The classic curved valley ('the banana'). Falling onto the parabola is fast, crawling along the floor to (1,1) takes thousands of steps." },
    { name: "Himmelblau", desc: "Four identical global minima. Each particle falls into a different basin depending on its initial launch angle." },
    { name: "Rastrigin", desc: "A minefield of periodic local minima. Testing here reveals why momentum and stochasticity are critical." },
    { name: "Beale", desc: "Flat plateaus with nearly vertical walls. Tiny gradients on the plain stall standard descent." },
    { name: "Saddle Point", desc: "Saddle inflection point: slopes up along one axis and down along the other. No local minimum; walkers escape towards infinity." },
  ],
};

export const DESCENT_OPTS_I18N = {
  es: {
    sgd: "SGD Puro",
    momentum: "Momento",
    nesterov: "Nesterov",
    adam: "Adam",
    rmsprop: "RMSprop",
  },
  en: {
    sgd: "Vanilla SGD",
    momentum: "Momentum",
    nesterov: "Nesterov",
    adam: "Adam",
    rmsprop: "RMSprop",
  },
};
