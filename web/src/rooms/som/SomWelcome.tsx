import { useCallback, useEffect, useRef, useState, type JSX } from "react";

/** Clave de persistencia para el pop-up de introducción de Mapas Autoorganizados. */
export const SOM_INTRO_KEY = "som.intro.v1";

/** Comprueba si el usuario visita la sala por primera vez. */
export function somIntroPending(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(location.search);
  if (q.get("shape") || q.get("guide")) return false;
  try {
    return localStorage.getItem(SOM_INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Guarda la marca de visto en localStorage. */
export function rememberSomIntro(): void {
  try {
    localStorage.setItem(SOM_INTRO_KEY, "1");
  } catch {}
}

const ico = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IcoOrbit = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <path d="M4 15a9 9 0 0116 0" strokeDasharray="2.4 2.2" />
    <path d="M9.5 6.5l9 3.2-3.6 1.5-1 3.7z" />
  </svg>
);

const IcoPlayPause = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <rect x="5" y="4" width="4" height="16" rx="1" fill="currentColor" />
    <rect x="15" y="4" width="4" height="16" rx="1" fill="currentColor" />
  </svg>
);

const IcoReset = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const IcoTopology = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
    <circle cx="16" cy="8" r="2" fill="currentColor" />
    <circle cx="8" cy="16" r="2" fill="currentColor" />
    <circle cx="16" cy="16" r="2" fill="currentColor" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="16" x2="16" y2="16" />
    <line x1="8" y1="8" x2="8" y2="16" />
    <line x1="16" y1="8" x2="16" y2="16" />
  </svg>
);

const ART = { viewBox: "0 0 320 100", preserveAspectRatio: "xMidYMid meet" };

/** Lámina 1: La cuadrícula neuronal 2D estirándose para abrazar el espacio 3D. */
function ArtSomGrid() {
  const N = 6;
  const nodes: [number, number][] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const u = c / (N - 1) - 0.5;
      const v = r / (N - 1) - 0.5;
      // Proyección isométrica con distorsión elástica suave
      const px = 60 + (u - v) * 32;
      const py = 48 + (u + v) * 16;
      nodes.push([px, py]);
    }
  }

  // Puntos de datos objetivo a la derecha
  const targets = [
    [240, 24], [258, 32], [270, 48], [262, 68], [242, 78],
    [222, 68], [214, 48], [226, 32], [242, 50], [252, 42],
  ];

  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {/* Malla 2D */}
      {Array.from({ length: N }, (_, r) => (
        <path
          key={`r-${r}`}
          d={Array.from({ length: N }, (_, c) => `${c === 0 ? "M" : "L"} ${nodes[r * N + c][0]} ${nodes[r * N + c][1]}`).join(" ")}
          stroke="rgba(0, 240, 255, 0.45)"
          strokeWidth="1.2"
          fill="none"
        />
      ))}
      {Array.from({ length: N }, (_, c) => (
        <path
          key={`c-${c}`}
          d={Array.from({ length: N }, (_, r) => `${r === 0 ? "M" : "L"} ${nodes[r * N + c][0]} ${nodes[r * N + c][1]}`).join(" ")}
          stroke="rgba(255, 64, 112, 0.45)"
          strokeWidth="1.2"
          fill="none"
        />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#fff" />
      ))}
      <text x="60" y="88" className="wl-art-n" textAnchor="middle">cuadrícula 2D (4.096 neuronas)</text>

      {/* Flecha de mapeo */}
      <path d="M116 48h40" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" strokeDasharray="3 3" />
      <path d="M152 43l5 5-5 5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <text x="136" y="38" className="wl-art-n" textAnchor="middle">se adapta a</text>

      {/* Nube de datos 3D */}
      <circle cx="242" cy="50" r="32" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 2" />
      {targets.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.2" fill="#00f0ff" opacity="0.85" />
      ))}
      <text x="242" y="88" className="wl-art-n" textAnchor="middle">espacio 3D objetivo</text>
    </svg>
  );
}

/** Lámina 2: Competencia (BMU) y Cooperación (Campana Gaussiana σ). */
function ArtSomBmu() {
  const target = [200, 42];
  const bmu = [164, 48];
  const neighbors = [
    [130, 48, 0.6], [164, 20, 0.6], [198, 48, 0.6], [164, 76, 0.6],
    [130, 20, 0.3], [198, 20, 0.3], [130, 76, 0.3], [198, 76, 0.3],
  ];

  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {/* Halo gaussiano de vecindad */}
      <circle cx={bmu[0]} cy={bmu[1]} r="40" fill="rgba(240, 255, 0, 0.05)" stroke="rgba(240, 255, 0, 0.2)" strokeDasharray="3 3" />
      <circle cx={bmu[0]} cy={bmu[1]} r="24" fill="rgba(240, 255, 0, 0.08)" stroke="rgba(240, 255, 0, 0.35)" />
      
      {/* Conexiones de arrastre */}
      {neighbors.map(([x, y], i) => (
        <line
          key={i}
          x1={bmu[0]} y1={bmu[1]} x2={x} y2={y}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
      ))}

      {/* Neuronas vecinas */}
      {neighbors.map(([x, y, act], i) => (
        <circle key={i} cx={x} cy={y} r="2.8" fill={`rgba(255, 255, 255, ${act})`} />
      ))}

      {/* Vector hacia la muestra */}
      <line x1={bmu[0]} y1={bmu[1]} x2={target[0]} y2={target[1]} stroke="#f0ff00" strokeWidth="1.6" strokeDasharray="2 2" />
      
      {/* BMU ganador */}
      <circle cx={bmu[0]} cy={bmu[1]} r="5" fill="#f0ff00" />
      <text x={bmu[0]} y={bmu[1] + 16} className="wl-art-n" textAnchor="middle">BMU (ganadora)</text>

      {/* Punto de muestra X */}
      <circle cx={target[0]} cy={target[1]} r="4" fill="#ff4070" />
      <text x={target[0]} y={target[1] - 8} className="wl-art-n" textAnchor="middle">muestra X</text>

      <text x="50" y="36" className="wl-art-n">1. Distancia mín: i* = argmin ||X - W||</text>
      <text x="50" y="54" className="wl-art-n">2. Vecindad: h = exp(-d² / 2σ²)</text>
      <text x="50" y="72" className="wl-art-n">3. Desplazamiento: ΔW = η · h · (X - W)</text>
    </svg>
  );
}

/** Lámina 3: Topología Plana vs Toroidal. */
function ArtSomTopology() {
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {/* Red plana (Hoja) */}
      <g transform="translate(48, 20)">
        <rect x="0" y="0" width="70" height="50" rx="3" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
        <line x1="23" y1="0" x2="23" y2="50" stroke="rgba(255,255,255,0.15)" />
        <line x1="47" y1="0" x2="47" y2="50" stroke="rgba(255,255,255,0.15)" />
        <line x1="0" y1="17" x2="70" y2="17" stroke="rgba(255,255,255,0.15)" />
        <line x1="0" y1="34" x2="70" y2="34" stroke="rgba(255,255,255,0.15)" />
        <circle cx="4" cy="4" r="2" fill="#ff4070" />
        <circle cx="66" cy="4" r="2" fill="#00f0ff" />
        <circle cx="4" cy="46" r="2" fill="#f0ff00" />
        <circle cx="66" cy="46" r="2" fill="#fff" />
        <text x="35" y="66" className="wl-art-n" textAnchor="middle">Plana · 4 esquinas libres</text>
      </g>

      {/* Red toroidal (Dona) */}
      <g transform="translate(196, 20)">
        <ellipse cx="40" cy="25" rx="36" ry="20" fill="none" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.4" />
        <ellipse cx="40" cy="25" rx="14" ry="7" fill="none" stroke="rgba(255, 64, 112, 0.4)" strokeWidth="1.4" />
        {/* Curvas de envoltura */}
        <path d="M12 25 C12 12, 68 12, 68 25" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 2" fill="none" />
        <path d="M12 25 C12 38, 68 38, 68 25" stroke="rgba(255,255,255,0.25)" fill="none" />
        <text x="40" y="66" className="wl-art-n" textAnchor="middle">Toroidal · bordes continuos</text>
      </g>
    </svg>
  );
}

const ACTS = [
  { Ico: IcoOrbit, title: "arrastra y rueda", desc: "para orbitar y hacer zoom en la escena 3D" },
  { Ico: IcoPlayPause, title: "espacio y tecla N", desc: "pausa/reanuda o avanza paso a paso" },
  { Ico: IcoReset, title: "tecla R", desc: "reinicia la malla neuronal a su plano original" },
  { Ico: IcoTopology, title: "menú lateral", desc: "cambia de figura objetivo y topología plana/toroide" },
];

const STEPS = [
  {
    art: ArtSomGrid,
    head: "Una malla elástica que aprende geometrías 3D",
    body: "Un Mapa Autoorganizado (SOM o red de Kohonen) es una rejilla de neuronas conectadas que se deforma en el espacio tridimensional para envolver y aproximar la nube de datos, preservando la cercanía entre vecinos.",
    note: "4.096 neuronas (64×64) entrenadas en paralelo en GPU con WebGPU Compute.",
  },
  {
    art: ArtSomBmu,
    head: "Competencia, Cooperación y Adaptación",
    body: "En cada muestra, la neurona más cercana (BMU) gana y se desplaza hacia el dato. Pero no viaja sola: un halo gaussiano arrastra a sus vecinas en la cuadrícula, manteniendo la continuidad de la tela.",
    note: "La tasa de aprendizaje η y el radio σ decaen con el tiempo para congelar la forma.",
  },
  {
    art: ArtSomTopology,
    head: "Topología: Hoja Plana vs Toroide continuo",
    body: "Una red plana tiene 4 bordes libres (ideal para superficies abiertas). Una red toroidal une sus bordes opuestos como una dona, permitiendo envolver cuerpos cerrados sin costuras ni desgarros.",
    note: "El color UV permite diagnosticar si la red está plegada, estirada o retorcida.",
  },
  {
    art: null,
    head: "Y ahora, a experimentar",
    body: "Controla la simulación con atajos rápidos, prueba diferentes figuras y observa cómo la red compite y se autoorganiza en tiempo real.",
    note: "WebGPU en vivo · Puedes volver a abrir esta guía con el botón de la barra.",
  },
];

const UI = {
  eyebrow: "mapas autoorganizados · kohonen som",
  skip: "saltar",
  back: "atrás",
  next: "siguiente",
  done: "entrar a la sala",
  close: "cerrar",
  more: "o léelo entero en la guía SOM",
  step: (i: number, n: number) => `paso ${i} de ${n}`,
  go: (i: number) => `ir al paso ${i}`,
};

export default function SomWelcome({
  onClose,
  onGuide,
}: {
  onClose: () => void;
  onGuide?: () => void;
}) {
  const [i, setI] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const steps = STEPS;
  const last = i === steps.length - 1;

  const shut = useCallback(() => {
    rememberSomIntro();
    onClose();
  }, [onClose]);

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
        shut();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setI(k => Math.min(k + 1, steps.length - 1));
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
  }, [shut, steps.length]);

  const s = steps[i];
  const Art = s.art;

  return (
    <div className="wl-veil" onPointerDown={e => { if (e.target === e.currentTarget) shut(); }}>
      <div
        ref={boxRef}
        className="wl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="som-wl-head"
        tabIndex={-1}
      >
        <header className="wl-top">
          <p className="eyebrow">{UI.eyebrow}</p>
          <button className="wl-skip" onClick={shut}>
            {last ? UI.close : UI.skip} <kbd>esc</kbd>
          </button>
        </header>

        {Art && (
          <div className="wl-stage" key={i}>
            <Art />
          </div>
        )}

        <h2 className="wl-head" id="som-wl-head">{s.head}</h2>
        <p className="wl-body">{s.body}</p>

        {!Art && (
          <ul className="wl-acts" key={i}>
            {ACTS.map(({ Ico, title, desc }, k) => (
              <li key={k}>
                <span className="wl-acts-i"><Ico /></span>
                <span><b>{title}</b> {desc}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="wl-note">{s.note}</p>

        {last && onGuide && (
          <p className="wl-more">
            <button className="link" onClick={() => { rememberSomIntro(); onGuide(); }}>
              {UI.more}
            </button>
          </p>
        )}

        <footer className="wl-foot">
          <nav className="wl-dots" aria-label={UI.step(i + 1, steps.length)}>
            {steps.map((_, k) => (
              <button
                key={k}
                className={"wl-dot" + (k === i ? " on" : "")}
                onClick={() => setI(k)}
                aria-label={UI.go(k + 1)}
                aria-current={k === i}
              />
            ))}
          </nav>
          <span className="wl-acts-n">
            {i > 0 && (
              <button className="wl-back" onClick={() => setI(k => k - 1)}>
                {UI.back}
              </button>
            )}
            <button
              className="wl-go"
              onClick={() => (last ? shut() : setI(k => k + 1))}
            >
              {last ? UI.done : UI.next}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
