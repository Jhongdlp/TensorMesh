import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

const ART = { viewBox: "0 0 320 140", preserveAspectRatio: "xMidYMid meet" };

/* ==========================================================================
   LÁMINAS INTERACTIVAS Y ANIMADAS DE DESCENSO DE GRADIENTE
   ========================================================================== */

/** 1. Lámina interactiva del Paisaje y Vector de Gradiente */
function FigDescentLandscape({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [tick, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"down" | "vector">("down");

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => (t + 1) % 60);
    }, 45);
    return () => clearInterval(timer);
  }, []);

  // 3 partículas descendiendo por la cuenca
  const p1 = (tick % 30) / 30;
  const p2 = ((tick + 10) % 30) / 30;
  const p3 = ((tick + 20) % 30) / 30;

  const getY = (x: number) => 110 - Math.pow((x - 160) / 120, 2) * 80;

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Curva de la cuenca 3D */}
        <path
          d="M 40 30 Q 160 120 280 30"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M 55 45 Q 160 115 265 45"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M 80 65 Q 160 112 240 65"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="1"
          fill="none"
        />

        {/* Mínimo Global */}
        <circle cx="160" cy="115" r="4" stroke="#73dbff" strokeWidth="1.5" fill="none" />
        <circle cx="160" cy="115" r="2" fill="#73dbff" />
        <text x="160" y="132" className="gd-art-n" textAnchor="middle">
          {isEs ? "Mínimo Global ∇f = 0" : "Global Minimum ∇f = 0"}
        </text>

        {/* Partículas animadas en descenso */}
        {[
          { prog: p1, startX: 45, color: "#ff4d29" },
          { prog: p2, startX: 275, color: "#00f0ff" },
          { prog: p3, startX: 75, color: "#ffc75c" },
        ].map((w, idx) => {
          const curX = w.startX + (160 - w.startX) * (w.prog * w.prog);
          const curY = getY(curX);
          const dir = 160 > curX ? 1 : -1;
          return (
            <g key={idx}>
              <circle cx={curX} cy={curY} r={3.5} fill={w.color} />
              {activeTab === "vector" && (
                <line
                  x1={curX}
                  y1={curY}
                  x2={curX + dir * 18}
                  y2={curY + 7}
                  stroke={w.color}
                  strokeWidth="1.5"
                  markerEnd="url(#arrow)"
                />
              )}
            </g>
          );
        })}
      </svg>

      <div className="gd-fig-acts" role="group">
        <button
          className={"gd-pill" + (activeTab === "down" ? " on" : "")}
          onClick={() => setActiveTab("down")}
        >
          {isEs ? "Descenso del Enjambre" : "Swarm Descent"}
        </button>
        <button
          className={"gd-pill" + (activeTab === "vector" ? " on" : "")}
          onClick={() => setActiveTab("vector")}
        >
          {isEs ? "Vector de Fuerza −∇f" : "Force Vector −∇f"}
        </button>
      </div>

      <p className="gd-cap">
        <b>{isEs ? "Topografía Continua:" : "Continuous Topography:"}</b>{" "}
        {isEs
          ? "El gradiente local determina la dirección de máxima caída en cada instante de tiempo."
          : "Local gradient vector governs the trajectory of steepest descent at every millisecond."}
      </p>
    </div>
  );
}

/** 2. Lámina interactiva de Tasa de Aprendizaje (η) */
function FigDescentLr({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [lr, setLr] = useState(0.45);
  const [steps, setSteps] = useState<number[]>([1.8]);

  const reset = (val = lr) => setSteps([1.8]);

  const stepForward = () => {
    setSteps(prev => {
      if (prev.length >= 10) return prev;
      const currentX = prev[prev.length - 1];
      const nextX = currentX - lr * currentX * 1.8;
      return [...prev, Math.max(-2.5, Math.min(2.5, nextX))];
    });
  };

  const getVerdict = () => {
    if (lr < 0.25) {
      return {
        text: isEs ? "Paso subamortiguado: convergencia muy lenta." : "Underdamped step: very slow convergence.",
        color: "#73dbff",
      };
    }
    if (lr <= 0.6) {
      return {
        text: isEs ? "Paso óptimo: converge en pocos saltos al mínimo." : "Optimal step: converges in few steps to minimum.",
        color: "#00f0ff",
      };
    }
    if (lr <= 0.95) {
      return {
        text: isEs ? "Paso oscilante: rebota entre las paredes del valle." : "Oscillating step: bounces across valley walls.",
        color: "#ffc75c",
      };
    }
    return {
      text: isEs ? "Paso divergente: la energía crece y se dispara al infinito." : "Divergent step: energy explodes to infinity.",
      color: "#ff4d29",
    };
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
        <text x="160" y="122" className="gd-art-n" textAnchor="middle">{isEs ? "Mínimo x*=0" : "Minimum x*=0"}</text>

        {/* Trayectoria */}
        {steps.map((x, idx) => {
          if (idx === 0) return null;
          const prevX = steps[idx - 1];
          return (
            <line
              key={`line-${idx}`}
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
        {steps.map((x, idx) => (
          <circle
            key={`pt-${idx}`}
            cx={toSvgX(x)}
            cy={toSvgY(x)}
            r={idx === steps.length - 1 ? 4.5 : 2.5}
            fill={idx === steps.length - 1 ? verdict.color : "rgba(255, 255, 255, 0.6)"}
          />
        ))}
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (lr <= 0.2 ? " on" : "")} onClick={() => { setLr(0.15); reset(0.15); }}>
          {isEs ? "Pequeño (η=0.15)" : "Small (η=0.15)"}
        </button>
        <button className={"gd-pill" + (lr > 0.2 && lr <= 0.6 ? " on" : "")} onClick={() => { setLr(0.45); reset(0.45); }}>
          {isEs ? "Óptimo (η=0.45)" : "Optimal (η=0.45)"}
        </button>
        <button className={"gd-pill" + (lr > 0.6 && lr <= 0.95 ? " on" : "")} onClick={() => { setLr(0.85); reset(0.85); }}>
          {isEs ? "Oscilante (η=0.85)" : "Oscillating (η=0.85)"}
        </button>
        <button className={"gd-pill" + (lr > 0.95 ? " on" : "")} onClick={() => { setLr(1.05); reset(1.05); }}>
          {isEs ? "Divergente (η=1.05)" : "Divergent (η=1.05)"}
        </button>
        <button className="gd-pill" onClick={stepForward} disabled={steps.length >= 10}>
          {isEs ? `+1 Paso (${steps.length - 1}/9)` : `+1 Step (${steps.length - 1}/9)`}
        </button>
      </div>

      <p className="gd-cap">
        <b style={{ color: verdict.color }}>{verdict.text}</b>
      </p>
    </div>
  );
}

/** 3. Lámina interactiva de Comparación de Optimizadores (SGD vs Momentum vs Adam) */
function FigDescentOpts({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [opt, setOpt] = useState<"sgd" | "momentum" | "adam">("adam");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => (t + 1) % 40);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  const optsData = {
    sgd: {
      name: isEs ? "SGD Puro" : "Vanilla SGD",
      color: "#ff4d29",
      desc: isEs
        ? "Rebota fuertemente entre las paredes del valle estrecho sin acelerar a lo largo del suelo."
        : "Oscillates heavily between steep ravine walls without moving fast along the base.",
      points: [
        [40, 25], [75, 75], [110, 30], [135, 68], [155, 40], [170, 58], [180, 50],
      ],
      path: "M 40 25 L 75 75 L 110 30 L 135 68 L 155 40 L 170 58 L 180 50",
    },
    momentum: {
      name: isEs ? "Momento Poliak (Inercia)" : "Polyak Momentum (Inertia)",
      color: "#ffc75c",
      desc: isEs
        ? "Acumula inercia física en la dirección persistente, amortiguando los rebotes perpendiculares."
        : "Builds velocity along persistent direction, damping out transverse oscillations.",
      points: [
        [40, 35], [85, 70], [120, 56], [150, 46], [180, 50],
      ],
      path: "M 40 35 Q 85 70 120 56 Q 150 46 180 50",
    },
    adam: {
      name: isEs ? "Adam (Adaptativo)" : "Adam (Adaptive)",
      color: "#00f0ff",
      desc: isEs
        ? "Escala cada coordenada por su varianza histórica, logrando un avance suave y directo."
        : "Scales each axis by historical second moments, producing smooth and balanced descent.",
      points: [
        [40, 60], [100, 52], [145, 51], [180, 50],
      ],
      path: "M 40 60 Q 100 52 145 51 L 180 50",
    },
  };

  const cur = optsData[opt];
  const progress = (tick % 25) / 24;

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Curvas de nivel del valle alargado */}
        <ellipse cx="180" cy="50" rx="130" ry="40" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
        <ellipse cx="180" cy="50" rx="90" ry="26" stroke="rgba(255,255,255,0.18)" strokeWidth="1" fill="none" />
        <ellipse cx="180" cy="50" rx="45" ry="12" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" />
        <circle cx="180" cy="50" r="3.5" fill="#fff" />
        <text x="180" y="38" className="gd-art-n" textAnchor="middle">{isEs ? "Mínimo" : "Minimum"}</text>

        {/* Trayectoria seleccionada */}
        <path
          d={cur.path}
          stroke={cur.color}
          strokeWidth="2"
          strokeDasharray="4 2"
          fill="none"
        />

        {/* Partícula en movimiento continuo */}
        <circle
          cx={40 + progress * 140}
          cy={opt === "sgd" ? (50 + Math.sin(progress * 14) * 20 * (1 - progress)) : opt === "momentum" ? (50 + Math.sin(progress * 7) * 12 * (1 - progress)) : 50 + (1 - progress) * 8}
          r="4.5"
          fill={cur.color}
        />
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (opt === "sgd" ? " on" : "")} onClick={() => setOpt("sgd")}>
          {isEs ? "SGD (Zigzag)" : "SGD (Zigzag)"}
        </button>
        <button className={"gd-pill" + (opt === "momentum" ? " on" : "")} onClick={() => setOpt("momentum")}>
          {isEs ? "Momento (Inercia)" : "Momentum (Inertia)"}
        </button>
        <button className={"gd-pill" + (opt === "adam" ? " on" : "")} onClick={() => setOpt("adam")}>
          {isEs ? "Adam (Adaptativo)" : "Adam (Adaptive)"}
        </button>
      </div>

      <p className="gd-cap">
        <b style={{ color: cur.color }}>{cur.name}:</b> {cur.desc}
      </p>
    </div>
  );
}

/** 4. Lámina interactiva de Superficies Topológicas */
function FigDescentSurfaces({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [surfIdx, setSurfIdx] = useState(0);

  const surfaces = [
    {
      id: "rosenbrock",
      name: isEs ? "Rosenbrock (Banana)" : "Rosenbrock (Banana)",
      desc: isEs ? "Valle parabólico estrecho: caída inmediata al canal, avance lento." : "Narrow parabolic valley: instant fall to valley, slow traverse.",
      color: "#00f0ff",
      minima: [{ x: 210, y: 55 }],
      contours: [
        "M 50 30 Q 130 95 240 40",
        "M 60 40 Q 130 85 230 48",
        "M 80 52 Q 140 75 220 54",
      ],
    },
    {
      id: "himmelblau",
      name: isEs ? "Himmelblau (4 Mínimos)" : "Himmelblau (4 Minima)",
      desc: isEs ? "Cuatro pozos simétricos idénticos con f(x, y) = 0." : "Four identical symmetric minima basins with f(x, y) = 0.",
      color: "#ffc75c",
      minima: [{ x: 100, y: 40 }, { x: 220, y: 40 }, { x: 100, y: 100 }, { x: 220, y: 100 }],
      contours: [
        "M 70 20 Q 160 65 250 20",
        "M 70 120 Q 160 75 250 120",
      ],
    },
    {
      id: "rastrigin",
      name: isEs ? "Rastrigin (Campo Minado)" : "Rastrigin (Minefield)",
      desc: isEs ? "Decenas de mínimos locales periódicos donde el 91% se estanca." : "Dozens of periodic traps where 91% of walkers get trapped.",
      color: "#ff4d29",
      minima: [{ x: 160, y: 70 }],
      contours: [
        "M 40 70 Q 100 40 160 70 Q 220 100 280 70",
      ],
    },
  ];

  const cur = surfaces[surfIdx];

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {cur.contours.map((d, idx) => (
          <path
            key={idx}
            d={d}
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth="1.5"
            fill="none"
          />
        ))}

        {cur.minima.map((m, idx) => (
          <g key={idx}>
            <circle cx={m.x} cy={m.y} r="5" stroke={cur.color} strokeWidth="1.5" fill="none" />
            <circle cx={m.x} cy={m.y} r="2" fill={cur.color} />
          </g>
        ))}
      </svg>

      <div className="gd-fig-acts" role="group">
        {surfaces.map((s, idx) => (
          <button
            key={s.id}
            className={"gd-pill" + (surfIdx === idx ? " on" : "")}
            onClick={() => setSurfIdx(idx)}
          >
            {s.name}
          </button>
        ))}
      </div>

      <p className="gd-cap">
        <b style={{ color: cur.color }}>{cur.name}:</b> {cur.desc}
      </p>
    </div>
  );
}

/** 5. Lámina interactiva de Sonda Exploradora */
function FigDescentProbe({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => (t + 1) % 36);
    }, 45);
    return () => clearInterval(timer);
  }, []);

  const t = (tick % 24) / 23;

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Línea central de cresta divisoria */}
        <line x1="160" y1="20" x2="160" y2="120" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
        <text x="160" y="15" className="gd-art-n" textAnchor="middle">
          {isEs ? "Cresta Divisoria de Cuencas" : "Basin Boundary Ridge"}
        </text>

        {/* 5 partículas que divergen */}
        {[
          { angle: -0.4, color: "#ff428a" },
          { angle: -0.15, color: "#ff7a29" },
          { angle: 0.05, color: "#00f0ff" },
          { angle: 0.25, color: "#a6e22e" },
          { angle: 0.45, color: "#8b49ff" },
        ].map((p, idx) => {
          const startX = 158 + idx * 1.2;
          const startY = 30;
          const endX = 160 + p.angle * 220;
          const endY = 110;
          const curX = startX + (endX - startX) * t;
          const curY = startY + (endY - startY) * (t * t);

          return (
            <g key={idx}>
              <line
                x1={startX}
                y1={startY}
                x2={curX}
                y2={curY}
                stroke={p.color}
                strokeWidth="1.5"
                strokeOpacity="0.7"
              />
              <circle cx={curX} cy={curY} r="3.5" fill={p.color} />
            </g>
          );
        })}
      </svg>

      <p className="gd-cap">
        <b>{isEs ? "Sensibilidad a Condiciones Iniciales:" : "Initial Condition Sensitivity:"}</b>{" "}
        {isEs
          ? "5 partículas lanzadas a milímetros de distancia se separan hacia cuencas distintas."
          : "5 particles launched fractions of a millimeter apart diverge into distinct basins."}
      </p>
    </div>
  );
}

/** 6. Lámina interactiva de Codificación de Color */
function FigDescentColor({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [mode, setMode] = useState<"heat" | "origin">("heat");

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Barra de degradado */}
        <rect
          x="40"
          y="45"
          width="240"
          height="16"
          rx="3"
          fill={
            mode === "heat"
              ? "url(#grad-heat)"
              : "url(#grad-origin)"
          }
        />

        <defs>
          <linearGradient id="grad-heat" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="50%" stopColor="#ffc75c" />
            <stop offset="100%" stopColor="#ff4d29" />
          </linearGradient>
          <linearGradient id="grad-origin" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff4242" />
            <stop offset="25%" stopColor="#a6e22e" />
            <stop offset="50%" stopColor="#00f0ff" />
            <stop offset="75%" stopColor="#8b49ff" />
            <stop offset="100%" stopColor="#ff4242" />
          </linearGradient>
        </defs>

        <text x="40" y="80" className="gd-art-n">
          {mode === "heat" ? (isEs ? "Baja Pérdida (Mínimo)" : "Low Loss (Minimum)") : "0°"}
        </text>
        <text x="280" y="80" className="gd-art-n" textAnchor="end">
          {mode === "heat" ? (isEs ? "Alta Pérdida (Cima)" : "High Loss (Peak)") : "360°"}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <button
          className={"gd-pill" + (mode === "heat" ? " on" : "")}
          onClick={() => setMode("heat")}
        >
          {isEs ? "Modo Altura (Gradiente Térmico)" : "Height Mode (Thermal Ramp)"}
        </button>
        <button
          className={"gd-pill" + (mode === "origin" ? " on" : "")}
          onClick={() => setMode("origin")}
        >
          {isEs ? "Modo Origen (Cuencas)" : "Origin Mode (Basins)"}
        </button>
      </div>

      <p className="gd-cap">
        <b>{mode === "heat" ? (isEs ? "Gradiente Térmico:" : "Thermal Gradient:") : (isEs ? "Mapa de Cuencas:" : "Basin Mapping:")}</b>{" "}
        {mode === "heat"
          ? (isEs ? "El enjambre se enfría de rojo a cian a medida que desciende al mínimo." : "The swarm cools from red to cyan as it descends into the minimum.")
          : (isEs ? "El color revela qué zona de partida atrae a cada grupo de caminantes." : "Color reveals which launching perimeter feeds into each basin.")}
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
  fig?: ({ lang }: { lang: Lang }) => JSX.Element;
  note: string;
}

const PAGES_DATA: Record<Lang, Page[]> = {
  es: [
    {
      tag: "El Paisaje",
      head: "Por qué optimizar es descender montañas",
      lede: "El descenso de gradiente es el algoritmo fundamental que entrena redes neuronales y calibra modelos de inteligencia artificial.",
      body: "Toda función de pérdida matemática f(x, y) puede entenderse como una superficie montañosa 3D. El objetivo es encontrar el punto más bajo (mínimo global) donde el error del modelo es mínimo. En lugar de evaluar una partícula solitaria, soltamos 8.000 caminantes en simultáneo con WebGPU para mapear el comportamiento global del campo de fuerzas.",
      fig: FigDescentLandscape,
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
      fig: FigDescentSurfaces,
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
      fig: FigDescentProbe,
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
      fig: FigDescentColor,
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
  ],
  en: [
    {
      tag: "Landscape",
      head: "Why optimization is mountain descent",
      lede: "Gradient descent is the bedrock algorithm training modern neural networks and billion-parameter models.",
      body: "Every mathematical loss function f(x, y) forms a 3D topographic terrain. The objective is to discover the lowest global minimum where model error vanishes. Instead of tracking a single particle, we dispatch 8,000 parallel walkers via WebGPU to map the full vector force field.",
      fig: FigDescentLandscape,
      note: "WebGPU updates position, velocity and trails of all 8,000 particles at 60 fps.",
    },
    {
      tag: "Learning Rate",
      head: "Learning Rate (η): The optimal step",
      lede: "Step length determines whether learning progresses quickly, oscillates indefinitely, or diverges into chaos.",
      body: "The gradient vector ∇f points towards steepest ascent. Update rule x_(t+1) = x_t - η ∇f steps in opposite descent direction. Too small η gets stuck on flat plateaus; too large η overshoots narrow ravines and explodes.",
      fig: FigDescentLr,
      note: "Step size slider is logarithmically calibrated across two full orders of magnitude.",
    },
    {
      tag: "Optimizers",
      head: "The Physics of Optimizers",
      lede: "Three mathematical paradigms resolving anisotropic curvature and narrow ravines.",
      body: "Pure SGD moves orthogonally to level curves, creating slow zigzags. Polyak Momentum introduces physical momentum, accumulating speed along valley floors while canceling lateral bounce. Adam normalizes each dimension individually via historical gradient variance.",
      fig: FigDescentOpts,
      list: [
        { k: "SGD", t: "Pure Gradient", d: "Follows instantaneous slope without memory." },
        { k: "Momentum", t: "Polyak Inertia", d: "v_t = γ v_(t-1) + η ∇f. Accelerates down flat valleys." },
        { k: "Adam", t: "Adaptive Rates", d: "Combines momentum with coordinate-wise variance scaling." },
      ],
      note: "Momentum friction parameter is β₁ = 0.9; Adam uses β₁ = 0.9 and β₂ = 0.999.",
    },
    {
      tag: "Surfaces",
      head: "Benchmark Optimization Surfaces",
      lede: "Five classic mathematical test functions posing unique topological challenges.",
      body: "Each test surface illustrates a distinct loss geometry dilemma:",
      fig: FigDescentSurfaces,
      list: [
        { k: "Rosenbrock", t: "Curved Valley (Banana)", d: "Descent to parabolic floor is instant, but traversing to (1,1) takes thousands of steps." },
        { k: "Himmelblau", t: "Four Identical Minima", d: "Initial launch coordinate dictates which of 4 basins captures the particle." },
        { k: "Beale", t: "Flat Plateau & Steep Walls", d: "Zero gradient on wide plateau; only 60% reach true global minimum." },
        { k: "Saddle", t: "Inflection Saddle", d: "Slopes up on one axis and down on another. No local minimum: all escape." },
        { k: "Rastrigin", t: "Minefield of Local Minima", d: "Dozens of periodic traps. Only 9% find true global minimum." },
      ],
      note: "Vertical terrain elevation is normalized by 99th percentile via log1p.",
    },
    {
      tag: "Probe",
      head: "Exploratory Probes & Tracked Trajectories",
      lede: "Simultaneous microscopic and macroscopic observation.",
      body: "While the 8,000 swarm shows global basin coverage, individual routes can be hard to track. The 'Drop Explorer Probe' button launches 5 larger particles dragging continuous 384-step GPU trails.",
      fig: FigDescentProbe,
      list: [
        { k: "Divergence", t: "Initial Sensitivity", d: "Dropping 5 adjacent particles shows how minuscule positional offsets split into separate basins." },
        { k: "3D Trails", t: "Historical Curves", d: "Traces exact trajectories, exposing SGD zigzags, Momentum arcs, and Adam adaptation." },
        { k: "Interactive", t: "Live Testing", d: "Allows probing specific slopes to observe how local gradients guide the descent." },
      ],
      note: "Probe trails are recorded in GPU circular ring buffers for zero CPU overhead.",
    },
    {
      tag: "Color",
      head: "Color Coding & Topographic Contours",
      lede: "Direct visual feedback for elevation, slopes, and basins of attraction.",
      body: "By default, particle color denotes Height (thermal ramp: red in high loss, cyan in transit, blue/white at global minimum). Switching to Origin mode colors each particle by its launch angle, converting the swarm into a basin-of-attraction chromatic map.",
      fig: FigDescentColor,
      note: "Terrain contour lines represent equal logarithmic loss intervals.",
    },
    {
      tag: "Shortcuts",
      head: "Keyboard Shortcuts & Controls",
      lede: "Complete navigation via keyboard, mouse, and touch gestures.",
      body: "Speed up your exploration workflow:",
      list: [
        { k: "Spacebar", t: "Pause / Resume", d: "Stops or resumes particle descent." },
        { k: "N", t: "Single Step", d: "Advances a single GPU compute step." },
        { k: "R", t: "Reseed", d: "Respawns all 8,000 walkers with a new random seed." },
        { k: "P", t: "2D Plan View", d: "Toggles between 3D relief and top-down contour map." },
        { k: "F", t: "Fullscreen", d: "Immersive zen mode without distractions." },
        { k: "WASD", t: "3D Orbit", d: "Rotates camera view around terrain center." },
      ],
      note: "Drag mouse to orbit freely; use scroll wheel to zoom.",
    },
  ],
};

const UI_DATA = {
  es: {
    eyebrow: "guía de descenso de gradiente · optimización",
    close: "cerrar",
    next: "siguiente",
    prev: "anterior",
    page: (i: number, n: number) => `capítulo ${i + 1} de ${n}`,
  },
  en: {
    eyebrow: "gradient descent guide · optimization",
    close: "close",
    next: "next",
    prev: "previous",
    page: (i: number, n: number) => `chapter ${i + 1} of ${n}`,
  },
};

export default function DescentGuide({
  onClose,
  initialChapter = 0,
  lang = "es",
}: {
  onClose: () => void;
  initialChapter?: number;
  lang?: Lang;
}) {
  const [i, setI] = useState(initialChapter);
  const boxRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const pages = PAGES_DATA[lang] ?? PAGES_DATA.es;
  const ui = UI_DATA[lang] ?? UI_DATA.es;
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
          <p className="eyebrow">{ui.eyebrow}</p>
          <span className="gd-top-acts">
            <button className="gd-ghost" onClick={onClose}>
              {ui.close} <kbd>esc</kbd>
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
                <Fig lang={lang} />
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
            {ui.page(i, pages.length)} · {p.tag}
          </span>
          <div className="gd-foot-acts">
            {i > 0 && (
              <button className="gd-back" onClick={() => setI(k => k - 1)}>
                {ui.prev}
              </button>
            )}
            <button
              className="gd-go"
              onClick={() => (last ? onClose() : setI(k => k + 1))}
            >
              {last ? ui.close : ui.next}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
