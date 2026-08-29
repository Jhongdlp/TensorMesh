import {
  useCallback, useEffect, useMemo, useRef, useState, type JSX,
} from "react";
import type { Lang } from "../../i18n";

export type NnChapterId =
  | "what" | "neuron" | "layers" | "act" | "loss"
  | "backprop" | "rate" | "overfit" | "do" | "glossary";

interface NnChapter {
  id: NnChapterId;
  tab: string;
  head: string;
  lede: string;
  body: string[];
  list?: [string, string][];
  note: string;
  fig?: ({ lang }: { lang: Lang }) => JSX.Element;
}

const ART = { preserveAspectRatio: "xMidYMid meet" };
const ROSE = "#ff4070";
const CYAN = "#00f0ff";
const AMBER = "#ffd28a";

/* ==========================================================================
   Láminas. Las cuatro que se tocan son las que llevan el argumento: leer que
   «una neurona es una recta» no convence a nadie; mover la recta con el
   ratón, sí.
   ========================================================================== */

/** 1. Una neurona = un semiplano. Se mueven sus tres números. */
function FigNeuron({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [w1, setW1] = useState(1.0);
  const [w2, setW2] = useState(0.7);
  const [b, setB] = useState(-0.15);
  const S = 150;

  // El semiplano se dibuja como un polígono recortado al cuadro: una recta
  // suelta no dice de qué lado cae cada punto, y ése es el asunto entero.
  const seg = useMemo(() => {
    const pts: [number, number][] = [];
    const at = (x: number, y: number) => w1 * x + w2 * y + b;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], c = corners[(i + 1) % 4];
      if (at(a[0], a[1]) >= 0) pts.push(a);
      const va = at(a[0], a[1]), vc = at(c[0], c[1]);
      if ((va >= 0) !== (vc >= 0)) {
        const t = va / (va - vc);
        pts.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]);
      }
    }
    return pts.map(([x, y]) => `${(x * 0.5 + 0.5) * S},${(0.5 - y * 0.5) * S}`).join(" ");
  }, [w1, w2, b]);

  return (
    <div className="gd-fig">
      <div className="nn-fig-split">
        <svg viewBox={`0 0 ${S} ${S}`} className="gd-art nn-fig-sq" {...ART} role="img" aria-hidden="true">
          <rect x="0" y="0" width={S} height={S} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" />
          {seg && <polygon points={seg} fill={CYAN} opacity="0.20" />}
          {seg && <polyline points={seg} fill="none" stroke={CYAN} strokeWidth="1.6" opacity="0.9" />}
          <line x1="0" y1={S / 2} x2={S} y2={S / 2} stroke="rgba(255,255,255,0.16)" />
          <line x1={S / 2} y1="0" x2={S / 2} y2={S} stroke="rgba(255,255,255,0.16)" />
        </svg>
        <div className="nn-fig-ctl">
          <label>w₁ <b>{w1.toFixed(2)}</b>
            <input type="range" min={-2} max={2} step={0.05} value={w1}
                   onChange={e => setW1(Number(e.target.value))} />
          </label>
          <label>w₂ <b>{w2.toFixed(2)}</b>
            <input type="range" min={-2} max={2} step={0.05} value={w2}
                   onChange={e => setW2(Number(e.target.value))} />
          </label>
          <label>{isEs ? "sesgo b" : "bias b"} <b>{b.toFixed(2)}</b>
            <input type="range" min={-1.2} max={1.2} step={0.05} value={b}
                   onChange={e => setB(Number(e.target.value))} />
          </label>
        </div>
      </div>
      <p className="gd-cap">
        <b>{isEs ? "Los pesos giran, el sesgo desplaza." : "Weights rotate, the bias shifts."}</b>{" "}
        {isEs
          ? "Con w₁ y w₂ se orienta la recta; con b se mueve sin girarla. Una neurona no sabe hacer nada más que esto."
          : "w₁ and w₂ orient the line; b slides it without rotating it. A single neuron can do nothing else."}
      </p>
    </div>
  );
}

/** 2. Cuatro semiplanos y su suma: la capa oculta, en un dibujo. */
function FigLayers({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [n, setN] = useState(1);
  const S = 138;
  const RES = 46;

  const lines = [
    [1.0, 0.35, -0.35], [-0.9, 0.55, -0.30],
    [0.15, -1.0, -0.32], [-0.35, -0.95, -0.30],
  ];

  const cells = useMemo(() => {
    const out: { x: number; y: number; v: number }[] = [];
    for (let j = 0; j < RES; j++) {
      for (let i = 0; i < RES; i++) {
        const x = (i / (RES - 1)) * 2 - 1;
        const y = 1 - (j / (RES - 1)) * 2;
        let s = 0;
        for (let k = 0; k < n; k++) {
          const [a, bb, c] = lines[k];
          s += Math.max(0, a * x + bb * y + c);
        }
        out.push({ x: i, y: j, v: Math.min(1, s * 1.5) });
      }
    }
    return out;
  }, [n]);

  const px = S / RES;
  return (
    <div className="gd-fig">
      <svg viewBox={`0 0 ${S} ${S}`} className="gd-art nn-fig-sq" {...ART} role="img" aria-hidden="true">
        {cells.map((c, i) => (
          <rect key={i} x={c.x * px} y={c.y * px} width={px + 0.4} height={px + 0.4}
                fill={c.v > 0.02 ? CYAN : ROSE} opacity={c.v > 0.02 ? 0.10 + c.v * 0.55 : 0.16} />
        ))}
        <rect x="0" y="0" width={S} height={S} fill="none" stroke="rgba(255,255,255,0.14)" />
      </svg>
      <div className="gd-fig-acts" role="group">
        {[1, 2, 3, 4].map(k => (
          <button key={k} className={"gd-pill" + (n === k ? " on" : "")} onClick={() => setN(k)}>
            {k} {isEs ? (k === 1 ? "neurona" : "neuronas") : k === 1 ? "neuron" : "neurons"}
          </button>
        ))}
      </div>
      <p className="gd-cap">
        <b>{isEs ? "Cada neurona añade un corte." : "Each neuron adds one cut."}</b>{" "}
        {isEs
          ? "Con una, medio plano. Con cuatro, una región cerrada que ninguna recta podía delimitar. La capa siguiente sólo tiene que sumarlas."
          : "With one, half a plane. With four, a closed region no straight line could enclose. The next layer only has to add them up."}
      </p>
    </div>
  );
}

/** 3. Las tres activaciones, con su derivada debajo. */
function FigAct({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [kind, setKind] = useState<"relu" | "tanh" | "sigmoid">("relu");
  const W = 300, H = 108;

  const f = (z: number) =>
    kind === "relu" ? Math.max(0, z) : kind === "tanh" ? Math.tanh(z) : 1 / (1 + Math.exp(-z));
  const df = (z: number) => {
    if (kind === "relu") return z > 0 ? 1 : 0;
    if (kind === "tanh") { const a = Math.tanh(z); return 1 - a * a; }
    const a = 1 / (1 + Math.exp(-z));
    return a * (1 - a);
  };

  const path = (fn: (z: number) => number) => {
    let d = "";
    for (let i = 0; i <= 120; i++) {
      const z = -4 + (i / 120) * 8;
      const x = (i / 120) * W;
      const y = H / 2 - Math.max(-1.4, Math.min(1.4, fn(z))) * (H / 3.2);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };

  return (
    <div className="gd-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="gd-art" {...ART} role="img" aria-hidden="true">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.16)" />
        <line x1={W / 2} y1="0" x2={W / 2} y2={H} stroke="rgba(255,255,255,0.16)" />
        <path d={path(df)} fill="none" stroke={AMBER} strokeWidth="1.3" strokeDasharray="4 3" opacity="0.85" />
        <path d={path(f)} fill="none" stroke={CYAN} strokeWidth="2" />
      </svg>
      <div className="gd-fig-acts" role="group">
        {(["relu", "tanh", "sigmoid"] as const).map(k => (
          <button key={k} className={"gd-pill" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>
            {k === "relu" ? "ReLU" : k === "tanh" ? "Tanh" : isEs ? "Sigmoide" : "Sigmoid"}
          </button>
        ))}
      </div>
      <p className="gd-cap">
        <b>{isEs ? "La punteada es la derivada." : "The dashed one is the derivative."}</b>{" "}
        {isEs
          ? "Es la que multiplica al gradiente que vuelve. Donde vale cero, esa neurona deja de aprender: en ReLU es todo el lado izquierdo, y en la sigmoide son los dos extremos."
          : "It is what multiplies the returning gradient. Where it is zero, that neuron stops learning: in ReLU that is the whole left side; in the sigmoid, both tails."}
      </p>
    </div>
  );
}

/** 4. Tres tasas sobre el mismo valle. */
function FigRate({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [lr, setLr] = useState(0.35);
  const W = 300, H = 116;

  const traj = useMemo(() => {
    // Valle cuadrático, mínimo en 0. Es el modelo más pobre posible del
    // problema y aun así reproduce los tres finales: lento, justo y estallido.
    let x = -0.85;
    const pts: [number, number][] = [];
    for (let i = 0; i < 26; i++) {
      pts.push([x, x * x]);
      x = x - lr * 2 * x * 1.55;
      if (!isFinite(x) || Math.abs(x) > 3) break;
    }
    return pts;
  }, [lr]);

  const sx = (x: number) => (x / 2 + 0.5) * W;
  const sy = (y: number) => H - 8 - Math.min(1.35, y) * (H - 24) / 1.4;

  let curve = "";
  for (let i = 0; i <= 100; i++) {
    const x = -1 + (i / 100) * 2;
    curve += `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)} ${sy(x * x).toFixed(1)}`;
  }

  const blew = traj.length < 26;
  return (
    <div className="gd-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="gd-art" {...ART} role="img" aria-hidden="true">
        <path d={curve} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.4" />
        <path d={traj.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(" ")}
              fill="none" stroke={blew ? ROSE : CYAN} strokeWidth="1.4" opacity="0.75" />
        {traj.map(([x, y], i) => (
          <circle key={i} cx={sx(x)} cy={sy(y)} r={i === traj.length - 1 ? 3.4 : 2}
                  fill={blew ? ROSE : CYAN} opacity={0.35 + (i / traj.length) * 0.65} />
        ))}
      </svg>
      <div className="gd-fig-acts" role="group">
        {[0.06, 0.35, 0.68].map(v => (
          <button key={v} className={"gd-pill" + (Math.abs(lr - v) < 0.01 ? " on" : "")} onClick={() => setLr(v)}>
            η = {v}
          </button>
        ))}
      </div>
      <p className="gd-cap">
        <b>{isEs ? "Ni corto ni pasado." : "Neither too small nor too large."}</b>{" "}
        {isEs
          ? "Con la tasa baja llega, pero tarde. Con la justa cae en cuatro pasos. Con la alta salta por encima del fondo cada vez más lejos, y la pérdida se va a infinito."
          : "Too small and it gets there late. Just right and it lands in four steps. Too large and it overshoots further every time, and the loss runs off to infinity."}
      </p>
    </div>
  );
}

/** 5. Retropropagación: la culpa se reparte hacia atrás. */
function FigBackprop({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(v => (v + 1) % 3), 900);
    return () => clearInterval(id);
  }, []);
  const cols = [[26, 60], [110, 34], [110, 86], [196, 60], [268, 60]];
  const edges: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]];
  const lit = (a: number, b: number) => {
    const depth = [2, 1, 1, 0, 0];
    return Math.min(depth[a], depth[b]) === t;
  };
  return (
    <div className="gd-fig">
      <svg viewBox="0 0 300 120" className="gd-art" {...ART} role="img" aria-hidden="true">
        {edges.map(([a, b], i) => (
          <line key={i} x1={cols[a][0]} y1={cols[a][1]} x2={cols[b][0]} y2={cols[b][1]}
                stroke={lit(a, b) ? AMBER : "rgba(255,255,255,0.18)"}
                strokeWidth={lit(a, b) ? 2.2 : 1.1} />
        ))}
        {cols.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="6" fill="#fff" opacity={i === 4 ? 1 : 0.9} />
        ))}
        <text x="268" y="42" className="gd-art-w" textAnchor="middle">{isEs ? "error" : "error"}</text>
        <text x="26" y="88" className="gd-art-n" textAnchor="middle">x</text>
        <text x="150" y="112" className="gd-art-n" textAnchor="middle">
          {isEs ? "la culpa se reparte capa a capa, hacia atrás" : "blame is split layer by layer, backwards"}
        </text>
      </svg>
      <p className="gd-cap">
        <b>{isEs ? "Regla de la cadena, y nada más." : "The chain rule, and nothing else."}</b>{" "}
        {isEs
          ? "El error se mide sólo al final. Retropropagar es repartirlo hacia atrás: cada peso recibe la parte que le toca, multiplicada por lo que dejó pasar su activación."
          : "The error is measured only at the end. Backpropagation splits it backwards: every weight gets its share, multiplied by whatever its activation let through."}
      </p>
    </div>
  );
}

/** 6. Entrenamiento contra prueba: dónde empieza a memorizar. */
function FigOverfit({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const W = 300, H = 104;
  const tr = (i: number) => 0.72 * Math.exp(-i / 26) + 0.02;
  const te = (i: number) => 0.72 * Math.exp(-i / 30) + 0.06 + Math.max(0, (i - 46) / 100) * 0.55;
  const path = (fn: (i: number) => number) => {
    let d = "";
    for (let i = 0; i <= 100; i++) {
      d += `${i === 0 ? "M" : "L"}${((i / 100) * W).toFixed(1)} ${(H - 8 - fn(i) * (H - 20)).toFixed(1)}`;
    }
    return d;
  };
  return (
    <div className="gd-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="gd-art" {...ART} role="img" aria-hidden="true">
        <line x1={W * 0.46} y1="4" x2={W * 0.46} y2={H - 6} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />
        <path d={path(te)} fill="none" stroke="rgba(242,239,233,0.55)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d={path(tr)} fill="none" stroke={CYAN} strokeWidth="1.8" />
        <text x={W * 0.46 + 6} y="16" className="gd-art-n">
          {isEs ? "aquí empieza a memorizar" : "memorising starts here"}
        </text>
      </svg>
      <p className="gd-cap">
        <b>{isEs ? "Dos curvas, no una." : "Two curves, not one."}</b>{" "}
        {isEs
          ? "La continua es la pérdida sobre lo que la red ha visto; la punteada, sobre lo que no. Mientras bajen juntas, aprende. Cuando se separan, memoriza. Sube el ruido y verás separarse las de la sala."
          : "The solid line is the loss on what the network has seen; the dashed one, on what it hasn't. While they fall together, it is learning. When they split, it is memorising. Raise the noise slider and watch the room's own curves split."}
      </p>
    </div>
  );
}

const CHAPTERS_DATA: Record<Lang, NnChapter[]> = {
  es: [
    {
      id: "what",
      tab: "1. Qué es",
      head: "Una red neuronal es una función con mandos",
      lede: "Entran dos números, sale uno entre 0 y 1. Todo lo demás son coeficientes.",
      body: [
        "Esta sala entrena una red diminuta —dos entradas, unas decenas de pesos— para separar dos colores de puntos en un plano. Es el problema más pequeño que sigue siendo el problema de verdad: exactamente el mismo bucle entrena un modelo de lenguaje, sólo que con mil millones de coeficientes en vez de cincuenta.",
        "El suelo de la escena es el cuadrado de entradas entero. Para cada punto de ese cuadrado, la red contesta un número entre 0 y 1, y ese número es el color. La zanja oscura del medio es donde la red duda: la frontera de decisión.",
        "La malla de arriba son los coeficientes que producen esa respuesta. Mirar las dos mitades a la vez es lo único que convierte «una matriz cambió» en «la frontera se dobló».",
      ],
      note: "Nada está pregrabado: cada refresco del suelo son 16.384 pasadas por la red, calculadas en tu máquina.",
    },
    {
      id: "neuron",
      tab: "2. La neurona",
      head: "Una neurona sola es una recta",
      lede: "Dos pesos que la giran, un sesgo que la desplaza y una función que decide de qué lado.",
      body: [
        "Una neurona calcula w₁·x₁ + w₂·x₂ + b y le aplica una función. El signo de esa suma parte el plano en dos: es una recta, ni más ni menos. Los dos pesos la orientan y el sesgo la mueve sin girarla.",
        "De ahí sale el límite del perceptrón de 1958, y también su fama: con una sola neurona se resuelve «dos nubes» y no se resuelve nada más.",
      ],
      fig: FigNeuron,
      note: "En la sala, pincha cualquier neurona de la primera capa oculta: el suelo enseñará exactamente su recta.",
    },
    {
      id: "layers",
      tab: "3. La capa oculta",
      head: "Varias rectas, y alguien que las sume",
      lede: "Ahí es donde aparece la curva. Y por eso «profundo» quiere decir algo.",
      body: [
        "Si cada neurona traza una recta, una capa de ocho traza ocho. La capa siguiente recibe esas ocho respuestas y las combina con sus propios pesos: puede pedir «que se cumplan las cuatro» y obtener una región cerrada, o «que se cumpla una u otra» y obtener dos manchas separadas.",
        "Eso es todo lo que hace la profundidad: cada capa trabaja sobre las respuestas de la anterior, no sobre los datos. La segunda capa oculta ya no ve x₁ y x₂; ve conceptos que la primera se inventó.",
        "Prueba la espiral con una sola capa de dos neuronas y luego con dos de ocho. No es que la primera aprenda peor: es que la frontera que hace falta no está entre las que puede dibujar.",
      ],
      fig: FigLayers,
      note: "El máximo de la sala son cuatro capas ocultas de doce. Con más, lo que falla es la paciencia, no la GPU.",
    },
    {
      id: "act",
      tab: "4. Activaciones",
      head: "Sin la función no lineal, todo se derrumba a una recta",
      lede: "Diez capas lineales encadenadas son una sola capa lineal. Literalmente.",
      body: [
        "Si una neurona sólo sumara y multiplicara, componer capas daría otra combinación lineal: la red entera colapsaría a una única recta por muchas capas que tuviera. La función de activación es lo que impide ese derrumbe.",
        "ReLU —max(0, z)— es la de casa: barata y sin saturar. Su defecto está en la derivada: a la izquierda vale cero, y una neurona que cae ahí para todos los datos deja de recibir gradiente y no vuelve nunca. La sala las cuenta y te avisa.",
        "Tanh y sigmoide son suaves, pero saturan por los extremos: con la red profunda, el gradiente se multiplica por números menores que uno capa tras capa hasta desaparecer. Es el gradiente que se desvanece, y es la razón histórica de que ReLU ganara.",
      ],
      fig: FigAct,
      note: "En una red de dos capas pequeñas, tanh suele converger antes que ReLU. La ventaja de ReLU aparece con profundidad.",
    },
    {
      id: "loss",
      tab: "5. La pérdida",
      head: "Un solo número que dice cuánto se falla",
      lede: "Entropía cruzada binaria: castiga estar seguro y equivocado.",
      body: [
        "La salida pasa por una sigmoide, así que es una probabilidad. La pérdida compara esa probabilidad con la etiqueta verdadera: si la red dice 0,9 y acierta, casi no paga; si dice 0,9 y falla, paga muchísimo. Estar seguro y equivocado es lo más caro que hay.",
        "Fíjate en que el acierto y la pérdida no se mueven juntos. El acierto sólo mira de qué lado del 0,5 cae cada punto y avanza a saltos; la pérdida mide también la confianza, y por eso sigue bajando cuando el acierto ya se ha clavado en su techo.",
      ],
      note: "El acierto es la cifra que se enseña; la pérdida es la que se optimiza. No son la misma pregunta.",
    },
    {
      id: "backprop",
      tab: "6. Retropropagación",
      head: "Repartir la culpa hacia atrás",
      lede: "El error se mide al final, pero hay que corregir pesos que están al principio.",
      body: [
        "El paso hacia delante produce una respuesta. El error se conoce sólo ahí, en la salida. Retropropagar es aplicar la regla de la cadena para saber cuánto de ese error le corresponde a cada peso, capa a capa hacia atrás.",
        "En la sala, los pulsos de ida y los de vuelta no encienden las mismas aristas, y eso no es un adorno: de ida el brillo es |w·a| —cuánta señal lleva esa conexión—; de vuelta es |∂L/∂w| —cuánto habría que cambiarla—. Una arista con un peso enorme sobre una neurona apagada lleva mucho peso y ninguna culpa.",
        "Con la pausa puesta, la tecla N ejecuta un lote exacto y dibuja el ciclo entero: ida, vuelta y actualización.",
      ],
      fig: FigBackprop,
      note: "El algoritmo es de 1970 y se popularizó en 1986. Lo que cambió en 2012 no fue la idea: fue la GPU.",
    },
    {
      id: "rate",
      tab: "7. Tasa y lote",
      head: "Cuánto se mueve cada peso, y con cuántos datos se decide",
      lede: "Los dos mandos que más rompen la sala, y por motivos opuestos.",
      body: [
        "La tasa de aprendizaje η multiplica al gradiente. Corta, la red aprende pero tarda una eternidad. Larga, cada paso salta por encima del fondo del valle y la pérdida se dispara: en la sala se ve como una frontera que da bandazos y un acierto que baja.",
        "El tamaño de lote es cuántos ejemplos se miran antes de mover un peso. Con lotes de uno el camino es ruidoso —y ese ruido a veces ayuda a salirse de un mínimo malo—; con lotes grandes el paso es más fiable y más caro.",
        "La velocidad no es un parámetro del modelo: son lotes por segundo, y sólo cambia cuánto tienes que esperar. Los pulsos siguen su propio ciclo de un segundo y medio; a velocidad alta, la red hace cientos de lotes por cada pulso que ves.",
      ],
      fig: FigRate,
      note: "Si la pérdida sube de golpe y no vuelve, casi siempre es η. Baja la tasa y reinicia los pesos.",
    },
    {
      id: "overfit",
      tab: "8. Generalizar",
      head: "Aprender no es memorizar",
      lede: "Por eso hay dos curvas y sólo una de ellas importa.",
      body: [
        "Los puntos se reparten 70/30: la red entrena con los primeros y nunca ve los segundos. Los apagados del suelo son los de prueba.",
        "Mientras las dos pérdidas bajan juntas, la red está encontrando la regla. Cuando la de entrenamiento sigue bajando y la de prueba empieza a subir, la red ha dejado de aprender la regla y está memorizando el ruido de los ejemplos que le tocaron.",
        "Es fácil de provocar: sube el ruido, pon cuatro capas de doce sobre las lunas y espera. La frontera se vuelve una filigrana que rodea puntos sueltos, y esa filigrana es exactamente lo que no sirve para nada.",
      ],
      fig: FigOverfit,
      note: "Una red más pequeña que generaliza vale más que una grande que memoriza. Ésa es media práctica del oficio.",
    },
    {
      id: "do",
      tab: "9. Controles",
      head: "Todo lo que se toca",
      lede: "Navegación, teclas y mandos.",
      body: [
        "Arrastrar: orbitar alrededor de la escena. Rueda: acercarse. Inicio: volver al encuadre.",
        "Pinchar una neurona: el suelo pasa a enseñar la activación de esa neurona. Pinchar en el vacío, el botón de la píldora, el de la ficha o Esc: soltarla. Las cuatro salidas hacen lo mismo.",
        "Espacio: pausa. N: un lote exacto con su ciclo entero. R: reiniciar los pesos con otra semilla. P: esconder los puntos. F: pantalla completa.",
      ],
      list: [
        ["Problema", "las cinco nubes, de separable por una recta a espiral."],
        ["Arquitectura", "capas ocultas y neuronas por capa. Cambiarla reinicia los pesos: no hay forma honesta de trasplantar una matriz a otra de otro tamaño."],
        ["Tasa, lote y ruido", "los tres mandos del capítulo 7 y el 8."],
        ["Opacidad del suelo y brillo de los pesos", "para mirar una mitad sin la otra."],
      ],
      note: "Todo se calcula en tu equipo. No hay servidor, ni modelo descargado, ni nada pregrabado.",
    },
    {
      id: "glossary",
      tab: "10. Glosario",
      head: "Las palabras, en una línea cada una",
      lede: "Lo justo para leer un artículo sin tropezar.",
      body: [
        "Peso: el número que multiplica a una entrada. Es lo que se aprende.",
        "Sesgo (bias): el término suelto que desplaza la recta sin girarla.",
        "Activación: la función no lineal que aplica cada neurona, y también el valor que sale de ella.",
        "Gradiente: la dirección en la que la pérdida sube más deprisa. Se avanza justo al revés.",
        "Época: una pasada completa por todos los ejemplos de entrenamiento.",
        "Lote (batch): los ejemplos que se miran antes de mover un peso.",
        "Neurona muerta: una unidad ReLU que no se enciende con ningún dato. Su gradiente es cero para siempre.",
      ],
      note: "Perceptrón multicapa (MLP) es el nombre formal de la red de esta sala.",
    },
  ],
  en: [
    {
      id: "what",
      tab: "1. What it is",
      head: "A neural network is a function with knobs",
      lede: "Two numbers go in, one number between 0 and 1 comes out. Everything else is coefficients.",
      body: [
        "This room trains a tiny network — two inputs, a few dozen weights — to separate two colors of points on a plane. It is the smallest problem that is still the real problem: the exact same loop trains a language model, only with a billion coefficients instead of fifty.",
        "The floor of the scene is the entire input square. For every point in it, the network answers a number between 0 and 1, and that number is the color. The dark trench through the middle is where the network is unsure: the decision boundary.",
        "The mesh above is the set of coefficients that produce that answer. Watching both halves at once is the only thing that turns \"a matrix changed\" into \"the boundary bent\".",
      ],
      note: "Nothing is pre-recorded: every floor refresh is 16,384 forward passes, computed on your machine.",
    },
    {
      id: "neuron",
      tab: "2. The neuron",
      head: "A single neuron is a straight line",
      lede: "Two weights that rotate it, a bias that shifts it, and a function that picks a side.",
      body: [
        "A neuron computes w₁·x₁ + w₂·x₂ + b and applies a function to it. The sign of that sum splits the plane in two: it is a line, no more and no less. The two weights orient it and the bias moves it without rotating it.",
        "That is the limit of the 1958 perceptron, and also its fame: one neuron solves \"two blobs\" and nothing else.",
      ],
      fig: FigNeuron,
      note: "In the room, click any neuron of the first hidden layer: the floor will show exactly its line.",
    },
    {
      id: "layers",
      tab: "3. Hidden layers",
      head: "Several lines, and someone to add them up",
      lede: "That is where curvature appears. And why \"deep\" means something.",
      body: [
        "If each neuron draws a line, a layer of eight draws eight. The next layer receives those eight answers and combines them with its own weights: it can ask for \"all four at once\" and get a closed region, or \"either one\" and get two separate blobs.",
        "That is all depth does: each layer works on the previous layer's answers, not on the data. The second hidden layer no longer sees x₁ and x₂; it sees concepts the first one invented.",
        "Try the spiral with a single layer of two units, then with two of eight. The first is not learning worse: the boundary it needs is simply not among the ones it can draw.",
      ],
      fig: FigLayers,
      note: "The room caps out at four hidden layers of twelve. Past that what runs out is patience, not GPU.",
    },
    {
      id: "act",
      tab: "4. Activations",
      head: "Without the non-linearity, everything collapses to one line",
      lede: "Ten stacked linear layers are one linear layer. Literally.",
      body: [
        "If a neuron only added and multiplied, stacking layers would give another linear combination: the whole network would collapse to a single line no matter how deep. The activation function is what prevents that collapse.",
        "ReLU — max(0, z) — is the practical default: cheap and non-saturating. Its flaw is in the derivative: on the left it is exactly zero, and a unit that lands there for every sample stops receiving gradient and never comes back. The room counts them and warns you.",
        "Tanh and sigmoid are smooth, but they saturate at both ends: in a deep network the gradient gets multiplied by numbers below one layer after layer until it vanishes. That is the vanishing gradient, and the historical reason ReLU won.",
      ],
      fig: FigAct,
      note: "In a small two-layer network tanh usually converges sooner than ReLU. ReLU's edge shows up with depth.",
    },
    {
      id: "loss",
      tab: "5. The loss",
      head: "One number saying how wrong it is",
      lede: "Binary cross-entropy: it punishes being confident and wrong.",
      body: [
        "The output goes through a sigmoid, so it is a probability. The loss compares that probability with the true label: say 0.9 and be right, you pay almost nothing; say 0.9 and be wrong, you pay a fortune. Confident and wrong is the most expensive thing there is.",
        "Notice accuracy and loss do not move together. Accuracy only asks which side of 0.5 each point falls on and moves in jumps; the loss also measures confidence, which is why it keeps dropping long after accuracy has flatlined at its ceiling.",
      ],
      note: "Accuracy is the number you show; loss is the number you optimize. They are not the same question.",
    },
    {
      id: "backprop",
      tab: "6. Backpropagation",
      head: "Splitting the blame backwards",
      lede: "The error is measured at the end, but the weights to fix are at the start.",
      body: [
        "The forward pass produces an answer. The error is known only there, at the output. Backpropagation applies the chain rule to work out how much of that error belongs to each weight, layer by layer backwards.",
        "In the room the forward and backward pulses do not light the same edges, and that is not decoration: forward, brightness is |w·a| — how much signal the connection carries; backward it is |∂L/∂w| — how much it should change. An edge with a huge weight feeding a silent neuron carries a lot of weight and no blame at all.",
        "While paused, the N key runs exactly one batch and draws the whole cycle: forward, backward, update.",
      ],
      fig: FigBackprop,
      note: "The algorithm is from 1970 and went mainstream in 1986. What changed in 2012 was not the idea: it was the GPU.",
    },
    {
      id: "rate",
      tab: "7. Rate & batch",
      head: "How far each weight moves, and how much data decides it",
      lede: "The two knobs that break the room most, for opposite reasons.",
      body: [
        "The learning rate η multiplies the gradient. Too small and the network learns but takes forever. Too large and every step overshoots the bottom of the valley and the loss explodes: in the room you see a boundary lurching about and accuracy going down.",
        "Batch size is how many examples are looked at before a weight moves. Batches of one give a noisy path — and that noise sometimes helps escape a bad minimum; large batches give a step that is more reliable and more expensive.",
        "Speed is not a model parameter: it is batches per second, and it only changes how long you wait. The pulses keep their own one-and-a-half-second cycle; at high speed the network runs hundreds of batches per pulse you see.",
      ],
      fig: FigRate,
      note: "If the loss jumps and never recovers, it is almost always η. Lower the rate and reset the weights.",
    },
    {
      id: "overfit",
      tab: "8. Generalizing",
      head: "Learning is not memorizing",
      lede: "That is why there are two curves and only one of them matters.",
      body: [
        "Points are split 70/30: the network trains on the first set and never sees the second. The dimmed points on the floor are the test set.",
        "While both losses fall together, the network is finding the rule. When the training loss keeps falling and the test loss starts to rise, it has stopped learning the rule and started memorizing the noise of the examples it happened to get.",
        "It is easy to provoke: raise the noise, put four layers of twelve on the moons, and wait. The boundary turns into filigree wrapped around individual points, and that filigree is exactly the part that is worth nothing.",
      ],
      fig: FigOverfit,
      note: "A smaller network that generalizes beats a big one that memorizes. That is half the craft.",
    },
    {
      id: "do",
      tab: "9. Controls",
      head: "Everything you can touch",
      lede: "Navigation, keys and knobs.",
      body: [
        "Drag: orbit the scene. Wheel: zoom. Home: back to the framing.",
        "Click a neuron: the floor switches to that neuron's activation. Click empty space, the pill button, the card button or Esc: release it. All four exits do the same thing.",
        "Space: pause. N: exactly one batch with its whole cycle. R: reset the weights with a new seed. P: hide the points. F: fullscreen.",
      ],
      list: [
        ["Problem", "the five clouds, from linearly separable to spiral."],
        ["Architecture", "hidden layers and units per layer. Changing it resets the weights: there is no honest way to transplant a matrix into one of a different size."],
        ["Rate, batch and noise", "the three knobs of chapters 7 and 8."],
        ["Floor opacity and weight brightness", "to look at one half without the other."],
      ],
      note: "Everything runs on your machine. No server, no downloaded model, nothing pre-recorded.",
    },
    {
      id: "glossary",
      tab: "10. Glossary",
      head: "The words, one line each",
      lede: "Enough to read a paper without tripping.",
      body: [
        "Weight: the number multiplying an input. It is what gets learned.",
        "Bias: the standalone term that shifts the line without rotating it.",
        "Activation: the non-linear function each neuron applies, and also the value coming out of it.",
        "Gradient: the direction in which the loss rises fastest. You move exactly the other way.",
        "Epoch: one full pass over every training example.",
        "Batch: the examples looked at before a weight moves.",
        "Dead unit: a ReLU neuron that never fires on any sample. Its gradient is zero forever.",
      ],
      note: "Multilayer perceptron (MLP) is the formal name of this room's network.",
    },
  ],
};

export default function NnGuide({
  onClose,
  initialChapter = "what",
  onIntro,
  lang = "es",
}: {
  onClose: () => void;
  initialChapter?: NnChapterId;
  onIntro?: () => void;
  lang?: Lang;
}) {
  const chapters = CHAPTERS_DATA[lang] ?? CHAPTERS_DATA.es;
  const [currentId, setCurrentId] = useState<NnChapterId>(initialChapter);
  const boxRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const idx = chapters.findIndex(c => c.id === currentId);
  const chapter = chapters[idx >= 0 ? idx : 0];
  const Fig = chapter.fig;

  const next = useCallback(() => {
    if (idx < chapters.length - 1) setCurrentId(chapters[idx + 1].id);
  }, [idx, chapters]);
  const prev = useCallback(() => {
    if (idx > 0) setCurrentId(chapters[idx - 1].id);
  }, [idx, chapters]);

  useEffect(() => {
    from.current = document.activeElement;
    boxRef.current?.focus();
    return () => {
      const el = from.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); next(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); return; }
      if (e.key !== "Tab") return;
      const box = boxRef.current;
      if (!box) return;
      const f = [...box.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!f.length) return;
      const first = f[0], lastEl = f[f.length - 1];
      const now = document.activeElement;
      if (e.shiftKey && (now === first || now === box)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && now === lastEl) { e.preventDefault(); first.focus(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [next, onClose, prev]);

  const isEs = lang === "es";
  return (
    <div className="gd-veil" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} className="gd" role="dialog" aria-modal="true"
           aria-labelledby="nn-gd-title" tabIndex={-1}>
        <header className="gd-top">
          <p className="eyebrow">
            {isEs ? "guía de redes neuronales · retropropagación" : "neural network guide · backpropagation"}
          </p>
          <div className="gd-top-acts">
            {onIntro && (
              <button className="gd-ghost" onClick={onIntro}>
                <span>{isEs ? "ver presentación rápida" : "quick intro"}</span>
              </button>
            )}
            <button className="gd-ghost" onClick={onClose}>
              <span>{isEs ? "cerrar" : "close"}</span> <kbd>esc</kbd>
            </button>
          </div>
        </header>

        <div className="gd-main">
          <nav className="gd-toc" aria-label={isEs ? "Capítulos de la guía" : "Guide chapters"}>
            {chapters.map((c, i) => (
              <button key={c.id} className={"gd-toc-i" + (c.id === currentId ? " on" : "")}
                      onClick={() => setCurrentId(c.id)} aria-current={c.id === currentId}>
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{c.tab}</span>
              </button>
            ))}
          </nav>

          <article className="gd-page">
            <h2 className="gd-head" id="nn-gd-title">{chapter.head}</h2>
            <p className="gd-lede">{chapter.lede}</p>

            {chapter.body.map((p, k) => <p key={k} className="gd-body">{p}</p>)}

            {Fig && (
              <div className="gd-stage">
                <Fig lang={lang} />
              </div>
            )}

            {chapter.list && (
              <ul className="gd-list">
                {chapter.list.map(([title, desc], k) => (
                  <li key={k}>
                    <div>
                      <b>{title}</b>
                      <span className="gd-list-t"> — {desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="gd-note">{chapter.note}</p>
          </article>
        </div>

        <footer className="gd-foot">
          <span className="gd-count">
            {isEs
              ? `capítulo ${idx + 1} de ${chapters.length} · ${chapter.tab}`
              : `chapter ${idx + 1} of ${chapters.length} · ${chapter.tab}`}
          </span>
          <div className="gd-foot-acts">
            {idx > 0 && <button className="gd-back" onClick={prev}>{isEs ? "anterior" : "previous"}</button>}
            <button className="gd-go" onClick={() => (idx === chapters.length - 1 ? onClose() : next())}>
              {idx === chapters.length - 1
                ? (isEs ? "cerrar guía" : "close guide")
                : (isEs ? "siguiente capítulo" : "next chapter")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
