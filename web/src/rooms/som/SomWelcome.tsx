import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

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
function ArtSomGrid({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const N = 6;
  const nodes: [number, number][] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const u = c / (N - 1) - 0.5;
      const v = r / (N - 1) - 0.5;
      const px = 60 + (u - v) * 32;
      const py = 48 + (u + v) * 16;
      nodes.push([px, py]);
    }
  }

  const targets = [
    [240, 24], [258, 32], [270, 48], [262, 68], [242, 78],
    [222, 68], [214, 48], [226, 32], [242, 50], [252, 42],
  ];

  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
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
          stroke="rgba(0, 240, 255, 0.45)"
          strokeWidth="1.2"
          fill="none"
        />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.8" fill="#fff" />
      ))}
      <text x="60" y="86" className="wl-art-n" textAnchor="middle">{isEs ? "Rejilla 2D (4.096 nodos)" : "2D Grid (4,096 nodes)"}</text>

      <path d="M125 48h22" {...ico} stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" />
      <path d="M140 43l6 5-6 5" {...ico} stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" />

      {targets.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#ff4070" opacity="0.85" />
      ))}
      <ellipse cx="242" cy="50" rx="28" ry="28" fill="none" stroke="rgba(255,64,112,0.3)" strokeDasharray="3 3" strokeWidth="1.2" />
      <text x="242" y="92" className="wl-art-w" textAnchor="middle">{isEs ? "Nube de datos 3D" : "3D Data Cloud"}</text>
    </svg>
  );
}

/** Lámina 2: Neurona Ganadora (BMU) y halo gaussiano de arrastre. */
function ArtSomBmu({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      <defs>
        <radialGradient id="bmuGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#00f0ff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="50" r="38" fill="url(#bmuGlow)" />
      <ellipse cx="120" cy="50" rx="34" ry="24" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.2" strokeDasharray="3 2" fill="none" />

      <line x1="60" y1="50" x2="180" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" />
      <line x1="120" y1="15" x2="120" y2="85" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" />

      {[-2, -1, 1, 2].map(d => (
        <circle key={`h-${d}`} cx={120 + d * 25} cy="50" r={3 - Math.abs(d) * 0.6} fill="rgba(0, 240, 255, 0.7)" />
      ))}
      {[-1, 1].map(d => (
        <circle key={`v-${d}`} cx={120} cy={50 + d * 22} r="2.2" fill="rgba(0, 240, 255, 0.7)" />
      ))}

      <circle cx="120" cy="50" r="5" fill="#00f0ff" />
      <text x="120" y="40" className="wl-art-w" textAnchor="middle" fontSize="10">BMU</text>

      <circle cx="215" cy="35" r="4" fill="#ffc75c" />
      <text x="222" y="30" className="wl-art-n" fill="#ffc75c">{isEs ? "Muestra x" : "Sample x"}</text>
      <path d="M124 48 L210 37" stroke="#ffc75c" strokeWidth="1.6" strokeDasharray="3 2" />

      <text x="120" y="92" className="wl-art-n" textAnchor="middle">{isEs ? "Vecindad Gaussiana h(i, BMU)" : "Gaussian Neighborhood h(i, BMU)"}</text>
    </svg>
  );
}

/** Lámina 3: Topología plana vs toroidal. */
function ArtSomTopology({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      <g transform="translate(45, 15)">
        <rect x="0" y="0" width="70" height="50" rx="3" fill="rgba(0, 240, 255, 0.08)" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.4" />
        <line x1="0" y1="17" x2="70" y2="17" stroke="rgba(255,255,255,0.15)" />
        <line x1="0" y1="34" x2="70" y2="34" stroke="rgba(255,255,255,0.15)" />
        <line x1="23" y1="0" x2="23" y2="50" stroke="rgba(255,255,255,0.15)" />
        <line x1="47" y1="0" x2="47" y2="50" stroke="rgba(255,255,255,0.15)" />
        <text x="35" y="66" className="wl-art-n" textAnchor="middle">{isEs ? "Plana · bordes abiertos" : "Planar · open borders"}</text>
      </g>

      <g transform="translate(195, 15)">
        <ellipse cx="40" cy="25" rx="36" ry="20" fill="none" stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.4" />
        <ellipse cx="40" cy="25" rx="14" ry="7" fill="none" stroke="rgba(255, 64, 112, 0.4)" strokeWidth="1.4" />
        <path d="M12 25 C12 12, 68 12, 68 25" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 2" fill="none" />
        <path d="M12 25 C12 38, 68 38, 68 25" stroke="rgba(255,255,255,0.25)" fill="none" />
        <text x="40" y="66" className="wl-art-n" textAnchor="middle">{isEs ? "Toroidal · bordes continuos" : "Toroidal · seamless wraps"}</text>
      </g>
    </svg>
  );
}

const STEPS_DATA: Record<Lang, { art: (({ lang }: { lang: Lang }) => JSX.Element) | null; head: string; body: string; note: string }[]> = {
  es: [
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
  ],
  en: [
    {
      art: ArtSomGrid,
      head: "An elastic manifold learning 3D geometry",
      body: "A Self-Organizing Map (SOM or Kohonen neural network) is a 2D lattice of neurons stretching in 3D Euclidean space to envelope and approximate data manifolds while preserving topological neighborhood.",
      note: "4,096 neurons (64×64) trained concurrently via WebGPU Compute shaders.",
    },
    {
      art: ArtSomBmu,
      head: "Competition, Cooperation & Adaptation",
      body: "For every input sample, the closest neuron (BMU) wins and moves toward the data vector. Neighboring neurons within a Gaussian radius are pulled along to maintain mesh continuity.",
      note: "Learning rate η and radius σ decay monotonically over epochs to crystallize the shape.",
    },
    {
      art: ArtSomTopology,
      head: "Topology: Planar Sheet vs Toroidal Donut",
      body: "A planar grid has 4 open edges (suited for open manifolds). A toroidal grid wraps opposing edges seamlessly into a 3D donut, allowing it to envelop closed manifolds without seam stress.",
      note: "UV coordinate coloring instantly diagnoses folding, stretching, or knotting.",
    },
    {
      art: null,
      head: "Time to experiment",
      body: "Control the live simulation, test complex target manifolds, and watch the topological sheet adapt in real-time.",
      note: "Live WebGPU · Reopen this guide anytime via the toolbar button.",
    },
  ],
};

const ACTS_DATA: Record<Lang, { Ico: () => JSX.Element; title: string; desc: string }[]> = {
  es: [
    { Ico: IcoOrbit, title: "arrastra y rueda", desc: "para orbitar y hacer zoom en la escena 3D" },
    { Ico: IcoPlayPause, title: "espacio y tecla N", desc: "pausa/reanuda o avanza paso a paso" },
    { Ico: IcoReset, title: "tecla R", desc: "reinicia la malla neuronal a su plano original" },
    { Ico: IcoTopology, title: "menú lateral", desc: "cambia de figura objetivo y topología plana/toroide" },
  ],
  en: [
    { Ico: IcoOrbit, title: "drag & wheel", desc: "orbit and zoom inside 3D space" },
    { Ico: IcoPlayPause, title: "space & N key", desc: "pause/resume or advance step by step" },
    { Ico: IcoReset, title: "R key", desc: "reset neural lattice to planar origin" },
    { Ico: IcoTopology, title: "sidebar menu", desc: "switch target shape and sheet/toroid topology" },
  ],
};

const UI_DATA = {
  es: {
    eyebrow: "mapas autoorganizados · kohonen som",
    skip: "saltar",
    back: "atrás",
    next: "siguiente",
    done: "entrar a la sala",
    close: "cerrar",
    more: "o léelo entero en la guía SOM",
    step: (i: number, n: number) => `paso ${i} de ${n}`,
    go: (i: number) => `ir al paso ${i}`,
  },
  en: {
    eyebrow: "self-organizing maps · kohonen som",
    skip: "skip",
    back: "back",
    next: "next",
    done: "enter room",
    close: "close",
    more: "or read the complete SOM guide",
    step: (i: number, n: number) => `step ${i} of ${n}`,
    go: (i: number) => `go to step ${i}`,
  },
};

export default function SomWelcome({
  onClose,
  onGuide,
  lang = "es",
}: {
  onClose: () => void;
  onGuide?: () => void;
  lang?: Lang;
}) {
  const [i, setI] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const steps = STEPS_DATA[lang] ?? STEPS_DATA.es;
  const acts = ACTS_DATA[lang] ?? ACTS_DATA.es;
  const ui = UI_DATA[lang] ?? UI_DATA.es;
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
          <p className="eyebrow">{ui.eyebrow}</p>
          <button className="wl-skip" onClick={shut}>
            {last ? ui.close : ui.skip} <kbd>esc</kbd>
          </button>
        </header>

        {Art && (
          <div className="wl-stage" key={i}>
            <Art lang={lang} />
          </div>
        )}

        <h2 className="wl-head" id="som-wl-head">{s.head}</h2>
        <p className="wl-body">{s.body}</p>

        {!Art && (
          <ul className="wl-acts" key={i}>
            {acts.map(({ Ico, title, desc }, k) => (
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
              {ui.more}
            </button>
          </p>
        )}

        <footer className="wl-foot">
          <nav className="wl-dots" aria-label={ui.step(i + 1, steps.length)}>
            {steps.map((_, k) => (
              <button
                key={k}
                className={"wl-dot" + (k === i ? " on" : "")}
                onClick={() => setI(k)}
                aria-label={ui.go(k + 1)}
                aria-current={k === i}
              />
            ))}
          </nav>
          <span className="wl-acts-n">
            {i > 0 && (
              <button className="wl-back" onClick={() => setI(k => k - 1)}>
                {ui.back}
              </button>
            )}
            <button
              className="wl-go"
              onClick={() => (last ? shut() : setI(k => k + 1))}
            >
              {last ? ui.done : ui.next}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
