import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { SURFACES } from "./field.mjs";

const ART = { viewBox: "0 0 320 140", preserveAspectRatio: "xMidYMid meet" };

/** 1. Lámina interactiva de Tasa de Aprendizaje (η) */
function FigDescentLr() {
  const [lr, setLr] = useState(0.4);
  const [steps, setSteps] = useState<number[]>([1.8]);

  const reset = () => setSteps([1.8]);

  const stepForward = () => {
    setSteps(prev => {
      if (prev.length >= 10) return prev;
      const currentX = prev[prev.length - 1];
      const nextX = currentX - lr * currentX * 1.8;
      return [...prev, Math.max(-2.5, Math.min(2.5, nextX))];
    });
  };

  const getVerdict = () => {
    if (lr < 0.25) return { text: "Paso subamortiguado: convergencia muy lenta.", color: "#73dbff" };
    if (lr <= 0.6) return { text: "Paso óptimo: converge en pocos saltos al mínimo.", color: "#00f0ff" };
    if (lr <= 0.95) return { text: "Paso oscilante: rebota entre las paredes del valle.", color: "#ffc75c" };
    return { text: "Paso divergente: la energía crece y se dispara al infinito.", color: "#ff4d29" };
  };

  const verdict = getVerdict();

  const toSvgX = (x: number) => 160 + x * 60;
  const toSvgY = (x: number) => 105 - (0.5 * x * x) * 24;

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Curva f(x) = 0.5 * x^2 */}
        <path
          d="M 30 20 Q 160 115 290 20"
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth="1.5"
          fill="none"
        />

        {/* Eje X y mínimo */}
        <line x1="30" y1="105" x2="290" y2="105" stroke="rgba(255, 255, 255, 0.12)" strokeDasharray="3 3" />
        <circle cx="160" cy="105" r="4" stroke="#73dbff" strokeWidth="1.5" fill="none" />
        <circle cx="160" cy="105" r="1.5" fill="#73dbff" />
        <text x="160" y="122" className="gd-art-n" textAnchor="middle">Mínimo x*=0</text>

        {/* Trayectoria */}
        {steps.map((x, i) => {
          if (i === 0) return null;
          const prevX = steps[i - 1];
          return (
            <line
              key={`line-${i}`}
              x1={toSvgX(prevX)}
              y1={toSvgY(prevX)}
              x2={toSvgX(x)}
              y2={toSvgY(x)}
              stroke={verdict.color}
              strokeWidth="1.5"
              strokeDasharray="2 2"
            />
          );
        })}

        {/* Puntos evaluados */}
        {steps.map((x, i) => (
          <circle
            key={`pt-${i}`}
            cx={toSvgX(x)}
            cy={toSvgY(x)}
            r={i === steps.length - 1 ? 4.5 : 2.5}
            fill={i === steps.length - 1 ? verdict.color : "rgba(255, 255, 255, 0.6)"}
          />
        ))}
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (lr <= 0.2 ? " on" : "")} onClick={() => { setLr(0.15); reset(); }}>
          Pequeño (η=0.15)
        </button>
        <button className={"gd-pill" + (lr > 0.2 && lr <= 0.6 ? " on" : "")} onClick={() => { setLr(0.45); reset(); }}>
          Óptimo (η=0.45)
        </button>
        <button className={"gd-pill" + (lr > 0.6 && lr <= 0.95 ? " on" : "")} onClick={() => { setLr(0.85); reset(); }}>
          Oscilante (η=0.85)
        </button>
        <button className={"gd-pill" + (lr > 0.95 ? " on" : "")} onClick={() => { setLr(1.05); reset(); }}>
          Divergente (η=1.05)
        </button>
        <button className="gd-pill" onClick={stepForward} disabled={steps.length >= 10}>
          +1 Paso ({steps.length - 1}/9)
        </button>
      </div>

      <p className="gd-cap">
        <b style={{ color: verdict.color }}>{verdict.text}</b>
      </p>
    </div>
  );
}

/** 2. Lámina interactiva de Comparación de Optimizadores */
function FigDescentOpts() {
  const [opt, setOpt] = useState<"sgd" | "momentum" | "adam">("sgd");

  const optsData = {
    sgd: {
      name: "SGD Puro",
      color: "#ff4d29",
      desc: "Rebota entre las paredes del valle alargado sin avanzar con rapidez hacia el mínimo.",
      path: "M 40 25 L 75 75 L 110 30 L 135 68 L 155 40 L 170 58 L 180 50",
    },
    momentum: {
      name: "Momento Poliak (Inercia)",
      color: "#ffc75c",
      desc: "Acumula velocidad en la dirección persistente cancelando los rebotes perpendiculares.",
      path: "M 40 35 Q 85 70 120 56 Q 150 46 180 50",
    },
    adam: {
      name: "Adam (Adaptativo)",
      color: "#00f0ff",
      desc: "Escala cada eje por la varianza histórica, avanzando de forma equilibrada y suave.",
      path: "M 40 60 Q 100 52 145 51 L 180 50",
    },
  };

  const cur = optsData[opt];

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Curvas de nivel del valle alargado */}
        <ellipse cx="180" cy="50" rx="130" ry="40" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
        <ellipse cx="180" cy="50" rx="90" ry="26" stroke="rgba(255,255,255,0.18)" strokeWidth="1" fill="none" />
        <ellipse cx="180" cy="50" rx="45" ry="12" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" />
        <circle cx="180" cy="50" r="3" fill="#fff" />
        <text x="180" y="44" className="gd-art-n" textAnchor="middle">Mínimo</text>

        {/* Trayectoria seleccionada */}
        <path
          d={cur.path}
          stroke={cur.color}
          strokeWidth="2.5"
          fill="none"
        />
        <circle cx="40" cy={opt === "sgd" ? 25 : opt === "momentum" ? 35 : 60} r="4" fill={cur.color} />
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (opt === "sgd" ? " on" : "")} onClick={() => setOpt("sgd")}>
          SGD (Zigzag)
        </button>
        <button className={"gd-pill" + (opt === "momentum" ? " on" : "")} onClick={() => setOpt("momentum")}>
          Momento (Inercia)
        </button>
        <button className={"gd-pill" + (opt === "adam" ? " on" : "")} onClick={() => setOpt("adam")}>
          Adam (Adaptativo)
        </button>
      </div>

      <p className="gd-cap">
        <b style={{ color: cur.color }}>{cur.name}:</b> {cur.desc}
      </p>
    </div>
  );
}

interface Page {
  tag: string;
  head: string;
  lede: string;
  body: string;
  list?: { k: string; t: string; d: string }[];
  fig?: () => JSX.Element;
  note: string;
}

const PAGES: Page[] = [
  {
    tag: "El Paisaje",
    head: "Por qué optimizar es descender montañas",
    lede: "El descenso de gradiente es el algoritmo que entrena las redes neuronales y calibra modelos de miles de millones de parámetros.",
    body: "Toda función de pérdida matemática f(x, y) puede entenderse como una superficie montañosa 3D. El objetivo es encontrar el punto más bajo (mínimo global) donde el error del modelo es mínimo. En lugar de evaluar una partícula solitaria, soltamos 8.000 caminantes en simultáneo con WebGPU para mapear el comportamiento global del campo de fuerzas.",
    note: "WebGPU calcula la posición, velocidad y estela de los 8.000 caminantes a 60 fps.",
  },
  {
    tag: "La Tasa",
    head: "Tasa de Aprendizaje (η): El paso óptimo",
    lede: "La longitud de cada paso determina la diferencia entre aprender rápido, rebotar eternamente o divergir.",
    body: "El vector gradiente ∇f apunta hacia la subida más empinada. La regla x_(t+1) = x_t - η ∇f da un paso en sentido opuesto. Si η es muy bajo, los caminantes se estancan en mesetas; si es excesivo, saltan por encima de los valles y escapan al infinito.",
    fig: FigDescentLr,
    note: "En la sala, el control de paso está calibrado en escala logarítmica para abarcar dos órdenes de magnitud sin perder precisión.",
  },
  {
    tag: "Optimizadores",
    head: "La Física de los Optimizadores",
    lede: "Tres enfoques para resolver la asimetría y los cañones estrechos.",
    body: "SGD puro se mueve siempre perpendicular a las curvas de nivel, generando zigzags lentos. El Momento introduce inercia física, sumando velocidad a lo largo del valle y anulando rebotes transversales. Adam normaliza individualmente cada dimensión calculando la varianza cuadrática de los gradientes históricos.",
    fig: FigDescentOpts,
    list: [
      { k: "SGD", t: "Descenso Puro", d: "Sigue la pendiente instantánea sin memoria." },
      { k: "Momento", t: "Inercia de Poliak", d: "v_t = γ v_(t-1) + η ∇f. Acelera en valles planos." },
      { k: "Adam", t: "Tasas Adaptativas", d: "Combina momento con varianza por coordenada (RMSprop)." },
    ],
    note: "El parámetro de fricción del Momento es β₁ = 0.9; en Adam β₁ = 0.9 y β₂ = 0.999.",
  },
  {
    tag: "Superficies",
    head: "El Catálogo de Superficies de Prueba",
    lede: "Cinco geometrías matemáticas clásicas de banco de pruebas (benchmarks).",
    body: "Cada superficie enseña un desafío topológico específico:",
    list: [
      { k: "Rosenbrock", t: "Valle Curvo (Banana)", d: "Bajar es inmediato, pero avanzar por el suelo curvado toma miles de pasos." },
      { k: "Himmelblau", t: "Cuatro Mínimos Idénticos", d: "El origen de cada partícula determina en cuál de las 4 cuencas cae." },
      { k: "Beale", t: "Meseta con Paredes Verticales", d: "Pérdida de gradiente en la planicie; sólo el 60% alcanza el fondo." },
      { k: "Silla (Saddle)", t: "Punto de Inflexión", d: "Sube en un eje y baja en otro. No tiene mínimo: escapan todos." },
      { k: "Rastrigin", t: "Campo Minado de Mínimos", d: "Decenas de pozos locales periódicos. Sólo el 9% halla el mínimo global." },
    ],
    note: "La escala vertical de las 5 superficies está normalizada por el percentil 99 con log1p.",
  },
  {
    tag: "Sonda",
    head: "Sonda Exploratoria y Caminantes Seguidos",
    lede: "Microscopía y macroscopía en una misma visualización interactiva.",
    body: "El enjambre de 8.000 caminantes muestra el comportamiento global, pero no permite seguir una trayectoria individual. El botón «Soltar Sonda Exploradora» lanza 5 partículas con mayor radio que arrastran una estela continua de 384 pasos en la GPU.",
    list: [
      { k: "Divergencia", t: "Sensibilidad Inicial", d: "Al soltar 5 partículas juntas, se observa cómo mínimas diferencias de posición las separan en cuencas distintas." },
      { k: "Estela 3D", t: "Trazado Histórico", d: "Dibuja el camino exacto recorrido, revelando rebotes de SGD, curvas de Momento y rutas adaptativas de Adam." },
      { k: "Interacción", t: "Exploración en Vivo", d: "Permite probar laderas específicas y observar cómo el gradiente local guía el descenso." },
    ],
    note: "Las estelas de la sonda se registran en un búfer circular en GPU para coste constante.",
  },
  {
    tag: "Color",
    head: "Codificación del Color y Curvas de Nivel",
    lede: "Lectura visual directa de altitud, pendientes y cuencas de atracción.",
    body: "Por defecto, el color de la bolita representa su Altura (gradiente térmico: rojo arriba en pérdida alta, celeste en transición, azul/blanco en el valle mínimo). Al cambiar a modo Origen, cada partícula se tiñe según el ángulo desde el que fue soltada, transformando el enjambre en un mapa cromático de cuencas de atracción.",
    note: "Las curvas de nivel del terreno representan escalones homogéneos de la pérdida logarítmica.",
  },
  {
    tag: "Atajos",
    head: "Atajos de Teclado y Controles",
    lede: "Manejo completo con teclado, ratón y gestos táctiles.",
    body: "Acelera tu flujo de exploración con los siguientes controles:",
    list: [
      { k: "Espacio", t: "Pausa / Reanudar", d: "Detiene o continúa la marcha del enjambre." },
      { k: "N", t: "Paso a Paso", d: "Avanza un solo frame numérico en la GPU." },
      { k: "R", t: "Resembrar", d: "Suelta de nuevo a los 8.000 caminantes con una nueva semilla." },
      { k: "P", t: "Vista Planta 2D", d: "Alterna entre relieve 3D y mapa de contorno superior." },
      { k: "F", t: "Pantalla Completa", d: "Modo inmersivo zen sin distracciones." },
      { k: "WASD", t: "Órbita 3D", d: "Rota la cámara alrededor del centro del relieve." },
    ],
    note: "Arrastra el ratón para rotar libremente; usa la rueda para hacer zoom.",
  },
];

const UI = {
  eyebrow: "guía de descenso de gradiente · optimización",
  close: "cerrar",
  next: "siguiente",
  prev: "anterior",
  page: (i: number, n: number) => `capítulo ${i + 1} de ${n}`,
};

export default function DescentGuide({
  onClose,
  initialChapter = 0,
}: {
  onClose: () => void;
  initialChapter?: number;
}) {
  const [i, setI] = useState(initialChapter);
  const boxRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const pages = PAGES;
  const last = i === pages.length - 1;

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
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setI(k => Math.min(k + 1, pages.length - 1));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setI(k => Math.max(k - 1, 0));
        return;
      }
      if (e.key !== "Tab") return;
      const box = boxRef.current;
      if (!box) return;
      const f = [...box.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!f.length) return;
      const first = f[0], lastEl = f[f.length - 1];
      const now = document.activeElement;
      if (e.shiftKey && (now === first || now === box)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && now === lastEl) {
        e.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [onClose, pages.length]);

  const p = pages[i];
  const Fig = p.fig;

  return (
    <div className="gd-veil" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className="gd"
        role="dialog"
        aria-modal="true"
        aria-labelledby="descent-gd-head"
        tabIndex={-1}
      >
        <header className="gd-top">
          <p className="eyebrow">{UI.eyebrow}</p>
          <span className="gd-top-acts">
            <button className="gd-ghost" onClick={onClose}>
              {UI.close} <kbd>esc</kbd>
            </button>
          </span>
        </header>

        <div className="gd-main">
          {/* Índice lateral */}
          <nav className="gd-toc" aria-label="Capítulos de la guía">
            {pages.map((item, k) => (
              <button
                key={k}
                className={"gd-toc-i" + (k === i ? " on" : "")}
                onClick={() => setI(k)}
                aria-current={k === i}
              >
                <b>0{k + 1}</b>
                <span>{item.tag}</span>
              </button>
            ))}
          </nav>

          {/* Página activa */}
          <article className="gd-page" key={i}>
            <h2 className="gd-head" id="descent-gd-head">{p.head}</h2>
            <p className="gd-lede">{p.lede}</p>
            <p className="gd-body">{p.body}</p>

            {Fig && (
              <div className="gd-stage">
                <Fig />
              </div>
            )}

            {p.list && (
              <ul className="gd-list">
                {p.list.map(({ k, t, d }) => (
                  <li key={k}>
                    <span className="gd-list-t"><b>{t}</b> · {d}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="gd-note">{p.note}</p>
          </article>
        </div>

        <footer className="gd-foot">
          <span className="gd-count">
            capítulo {i + 1} de {pages.length} · {p.tag}
          </span>
          <div className="gd-foot-acts">
            {i > 0 && (
              <button className="gd-back" onClick={() => setI(k => k - 1)}>
                {UI.prev}
              </button>
            )}
            <button
              className="gd-go"
              onClick={() => (last ? onClose() : setI(k => k + 1))}
            >
              {last ? UI.close : UI.next}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
