/** Sala 07 — Red Neuronal. Todo el texto de la sala, en un solo sitio. */

export interface NnCopy {
  backHome: string;
  guideBtn: string;
  /** La misma guía, en el pie de la ficha: ahí sólo caben dos palabras. */
  guideShort: string;

  dataset: string;
  architecture: string;
  addLayer: string;
  removeLayer: string;
  addLayerA: string;
  removeLayerA: string;
  addUnit: string;
  removeUnit: string;
  hiddenLayer: (i: number) => string;
  inputs: string;
  output: string;
  activation: string;
  learnRate: string;
  batch: string;
  noise: string;
  samples: string;
  speed: string;
  fieldAlpha: string;
  edgeAlpha: string;
  showPoints: string;
  showPulses: string;
  on: string;
  off: string;

  fullView: string;
  pause: string;
  resume: string;
  step: string;
  restart: string;
  fullscreen: string;
  collapse: string;
  expand: string;
  zenOut: string;
  roamedBack: string;
  coach: string;
  coachPick: string;

  noGpu: string;
  noGpuSub: string;
  noGpuBack: string;

  hudTitle: string;
  batches: string;
  epochs: string;
  lossTrain: string;
  lossTest: string;
  accuracy: string;
  phaseFwd: string;
  phaseBwd: string;
  phaseUpd: string;
  lossCurve: string;
  deadUnits: (n: number) => string;

  startTitle: string;
  startLede: string;
  readFloor: string;
  readFloorTxt: string;
  readEdges: string;
  readEdgesTxt: string;
  readNodes: string;
  readNodesTxt: string;
  startHint: string;

  held: (tag: string) => string;
  release: string;
  cardInput: string;
  cardHidden: (l: number) => string;
  cardOutput: string;
  cardFloorNote: string;
  cardFloorOut: string;
  cardInputNote: string;
  bias: string;
  meanAct: string;
  weightsIn: string;
  deadNote: string;

  welcomeTitle: string;
  guideTitle: string;
}

export const NN_COPY: Record<"es" | "en", NnCopy> = {
  es: {
    backHome: "Volver a Inicio",
    guideBtn: "Guía de Redes Neuronales",
    guideShort: "abrir la guía",

    dataset: "Problema",
    architecture: "Arquitectura",
    addLayer: "capa",
    removeLayer: "capa",
    addLayerA: "añadir una capa oculta",
    removeLayerA: "quitar la última capa oculta",
    addUnit: "añadir neurona",
    removeUnit: "quitar neurona",
    hiddenLayer: (i) => `capa oculta ${i}`,
    inputs: "entradas",
    output: "salida",
    activation: "Activación",
    learnRate: "Tasa de aprendizaje (η)",
    batch: "Tamaño de lote",
    noise: "Ruido en los datos",
    samples: "Muestras",
    speed: "Velocidad",
    fieldAlpha: "Opacidad del suelo",
    edgeAlpha: "Brillo de los pesos",
    showPoints: "Puntos",
    showPulses: "Pulsos de señal",
    on: "Sí",
    off: "No",

    fullView: "vista completa",
    pause: "pausa",
    resume: "seguir",
    step: "un lote",
    restart: "reiniciar pesos",
    fullscreen: "pantalla completa",
    collapse: "plegar",
    expand: "desplegar",
    zenOut: "Salir de pantalla completa (Esc)",
    roamedBack: "Reencuadrar",
    coach: "arrastra para orbitar · rueda para acercar · espacio para pausar",
    coachPick: "pincha una neurona: el suelo pasa a enseñar lo que ella mira",

    noGpu: "La sala de Redes Neuronales necesita WebGPU.",
    noGpuSub: "Tu navegador no tiene WebGPU activado o este equipo no lo admite. Prueba con Chrome, Edge u Opera actualizados.",
    noGpuBack: "Volver al Inicio",

    hudTitle: "Entrenamiento en vivo",
    batches: "lotes",
    epochs: "vueltas",
    lossTrain: "pérdida (entrenamiento)",
    lossTest: "pérdida (prueba)",
    accuracy: "acierto",
    phaseFwd: "paso hacia delante",
    phaseBwd: "retropropagación",
    phaseUpd: "actualización de pesos",
    lossCurve: "curva de pérdida",
    deadUnits: (n) => (n === 1 ? "1 neurona apagada" : `${n} neuronas apagadas`),

    startTitle: "Cómo se lee",
    startLede: "Arriba están los coeficientes. Abajo, la función que forman. Son la misma cosa vista de dos maneras.",
    readFloor: "El suelo",
    readFloorTxt: "es el cuadrado de entrada entero: para cada punto, el color dice qué contestaría la red. La zanja oscura es la frontera de decisión.",
    readEdges: "Las aristas",
    readEdgesTxt: "son los pesos. Cian si suman, rosa si restan; el brillo es su magnitud. Cambian mientras miras.",
    readNodes: "Las neuronas",
    readNodesTxt: "brillan según cuánto se encienden con estos datos. Una que se queda oscura está muerta y no aporta nada.",
    startHint: "Pincha cualquier neurona oculta para ver su parte del trabajo.",

    held: (tag) => `neurona ${tag}`,
    release: "soltar",
    cardInput: "entrada",
    cardHidden: (l) => `capa oculta ${l}`,
    cardOutput: "salida",
    cardFloorNote: "El suelo enseña ahora la activación de esta neurona sobre el cuadrado de entrada: eso es lo único que ella sabe distinguir.",
    cardFloorOut: "El suelo enseña la respuesta de la red entera: la combinación de todas las de la última capa oculta.",
    cardInputNote: "Las dos entradas son las coordenadas del punto. No calculan nada: son el dato.",
    bias: "sesgo",
    meanAct: "activación media",
    weightsIn: "Pesos que entran",
    deadNote: "Esta neurona no se enciende con ningún dato: su gradiente es cero y ya no puede aprender. Baja la tasa, cambia de activación o reinicia los pesos.",

    welcomeTitle: "Red Neuronal en 3D",
    guideTitle: "Guía de Redes Neuronales y Retropropagación",
  },
  en: {
    backHome: "Back to Home",
    guideBtn: "Neural Network Guide",
    guideShort: "open the guide",

    dataset: "Problem",
    architecture: "Architecture",
    addLayer: "layer",
    removeLayer: "layer",
    addLayerA: "add a hidden layer",
    removeLayerA: "remove the last hidden layer",
    addUnit: "add neuron",
    removeUnit: "remove neuron",
    hiddenLayer: (i) => `hidden layer ${i}`,
    inputs: "inputs",
    output: "output",
    activation: "Activation",
    learnRate: "Learning rate (η)",
    batch: "Batch size",
    noise: "Data noise",
    samples: "Samples",
    speed: "Speed",
    fieldAlpha: "Floor opacity",
    edgeAlpha: "Weight brightness",
    showPoints: "Points",
    showPulses: "Signal pulses",
    on: "On",
    off: "Off",

    fullView: "full view",
    pause: "pause",
    resume: "resume",
    step: "one batch",
    restart: "reset weights",
    fullscreen: "fullscreen",
    collapse: "collapse",
    expand: "expand",
    zenOut: "Exit fullscreen (Esc)",
    roamedBack: "Reset view",
    coach: "drag to orbit · wheel to zoom · space to pause",
    coachPick: "click a neuron: the floor switches to what that neuron sees",

    noGpu: "The Neural Network room needs WebGPU.",
    noGpuSub: "Your browser has WebGPU disabled or this device does not support it. Try an up-to-date Chrome, Edge or Opera.",
    noGpuBack: "Back to Home",

    hudTitle: "Live training",
    batches: "batches",
    epochs: "epochs",
    lossTrain: "loss (train)",
    lossTest: "loss (test)",
    accuracy: "accuracy",
    phaseFwd: "forward pass",
    phaseBwd: "backpropagation",
    phaseUpd: "weight update",
    lossCurve: "loss curve",
    deadUnits: (n) => (n === 1 ? "1 dead neuron" : `${n} dead neurons`),

    startTitle: "How to read it",
    startLede: "Above are the coefficients. Below, the function they make. They are the same thing seen two ways.",
    readFloor: "The floor",
    readFloorTxt: "is the whole input square: for every point, the color is what the network would answer. The dark trench is the decision boundary.",
    readEdges: "The edges",
    readEdgesTxt: "are the weights. Cyan adds, rose subtracts; brightness is magnitude. They change while you watch.",
    readNodes: "The neurons",
    readNodesTxt: "glow with how strongly this data lights them up. One that stays dark is dead and contributes nothing.",
    startHint: "Click any hidden neuron to see its share of the work.",

    held: (tag) => `neuron ${tag}`,
    release: "release",
    cardInput: "input",
    cardHidden: (l) => `hidden layer ${l}`,
    cardOutput: "output",
    cardFloorNote: "The floor now shows this neuron's activation over the input square: that is the only thing it knows how to tell apart.",
    cardFloorOut: "The floor shows the whole network's answer: the combination of every unit in the last hidden layer.",
    cardInputNote: "The two inputs are the point's coordinates. They compute nothing: they are the data.",
    bias: "bias",
    meanAct: "mean activation",
    weightsIn: "Incoming weights",
    deadNote: "This neuron never fires on any sample: its gradient is zero and it can no longer learn. Lower the rate, change the activation, or reset the weights.",

    welcomeTitle: "Neural Network in 3D",
    guideTitle: "Neural Networks & Backpropagation Guide",
  },
};

/** Los cinco problemas. El orden es de fácil a imposible-sin-capas-ocultas, y
 *  ése es el argumento entero de la sala. */
export const NN_DATASETS_I18N = {
  es: [
    { name: "Dos nubes", desc: "Separables por una recta. Una red sin capas ocultas ya las resuelve: es el perceptrón de 1958." },
    { name: "Anillo", desc: "Un blanco rodeado. Ninguna recta lo separa; hacen falta varias rectas combinadas, que es lo que hace una capa oculta." },
    { name: "XOR", desc: "El problema que paró la investigación en redes durante quince años. Dos rectas cruzadas bastan — pero hay que poder combinarlas." },
    { name: "Lunas", desc: "Dos medialunas engarzadas. La frontera es curva y continua: se ve cómo la red la va doblando." },
    { name: "Espiral", desc: "El caso duro. Con dos capas de seis casi nunca sale; con más ancho y paciencia, sí. Enseña que la arquitectura es parte del problema." },
  ],
  en: [
    { name: "Two blobs", desc: "Linearly separable. A network with no hidden layer already solves it: this is the 1958 perceptron." },
    { name: "Ring", desc: "A bullseye. No straight line separates it; you need several lines combined, which is exactly what a hidden layer does." },
    { name: "XOR", desc: "The problem that stalled neural network research for fifteen years. Two crossed lines are enough — if you can combine them." },
    { name: "Moons", desc: "Two interlocking crescents. The boundary is curved and continuous: you can watch the network bend it." },
    { name: "Spiral", desc: "The hard one. Two layers of six rarely make it; wider and patient, they do. Architecture is part of the problem." },
  ],
};

export const NN_ACTS_I18N = {
  es: [
    { id: "relu", name: "ReLU", desc: "max(0, z). Barata y sin saturar, la de casa en la práctica — pero una neurona que cae del lado apagado ya no vuelve." },
    { id: "tanh", name: "Tanh", desc: "Suave y centrada en cero. Aprende deprisa en redes pequeñas y no deja neuronas muertas." },
    { id: "sigmoid", name: "Sigmoide", desc: "La clásica. Satura por los dos lados, así que el gradiente se apaga en cuanto la red se hace profunda." },
  ],
  en: [
    { id: "relu", name: "ReLU", desc: "max(0, z). Cheap and non-saturating, the practical default — but a unit that falls on the off side never comes back." },
    { id: "tanh", name: "Tanh", desc: "Smooth and zero-centered. Learns fast in small networks and leaves no dead units." },
    { id: "sigmoid", name: "Sigmoid", desc: "The classic. Saturates on both sides, so the gradient dies as soon as the network gets deep." },
  ],
};
