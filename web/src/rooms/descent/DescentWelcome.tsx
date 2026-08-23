import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

/** Clave de persistencia para el pop-up de introducción de Descenso de Gradiente. */
export const DESCENT_INTRO_KEY = "descent.intro.v1";

/** Comprueba si el usuario visita la sala por primera vez. */
export function descentIntroPending(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(location.search);
  if (q.get("surface") || q.get("guide")) return false;
  try {
    return localStorage.getItem(DESCENT_INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Guarda la marca de visto en localStorage. */
export function rememberDescentIntro(): void {
  try {
    localStorage.setItem(DESCENT_INTRO_KEY, "1");
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

const IcoPlanView = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="12" cy="12" r="5" strokeDasharray="2 2" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const ART = { viewBox: "0 0 320 100", preserveAspectRatio: "xMidYMid meet" };

/** Lámina 1: Terreno de pérdida con curvas de nivel y caminantes bajando hacia el valle. */
function ArtDescentTerrain({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="artLossGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff4d29" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#ffc75c" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#73dbff" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Curvas de nivel topográficas */}
      <path d="M 30 75 Q 160 90 290 75" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
      <path d="M 45 60 Q 160 80 275 60" stroke="rgba(255,255,255,0.18)" strokeWidth="1" fill="none" />
      <path d="M 65 45 Q 160 68 255 45" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" />
      <path d="M 90 30 Q 160 55 230 30" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />

      {/* Perfil del valle */}
      <path d="M 30 25 Q 160 85 290 25" stroke="url(#artLossGrad)" strokeWidth="2.5" fill="none" />

      {/* Diana en el mínimo global */}
      <circle cx="160" cy="85" r="7" stroke="#73dbff" strokeWidth="1.5" strokeDasharray="2 2" fill="none" />
      <circle cx="160" cy="85" r="2.5" fill="#73dbff" />

      {/* Caminantes y sus estelas */}
      <path d="M 50 32 Q 95 65 145 80" stroke="rgba(255, 100, 70, 0.6)" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
      <circle cx="50" cy="32" r="3.5" fill="#ff4d29" />
      <circle cx="95" cy="65" r="2" fill="#ffc75c" />
      <circle cx="145" cy="80" r="3.5" fill="#73dbff" />

      <path d="M 270 32 Q 225 65 175 80" stroke="rgba(100, 220, 255, 0.6)" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
      <circle cx="270" cy="32" r="3.5" fill="#ff4d29" />
      <circle cx="225" cy="65" r="2" fill="#ffc75c" />
      <circle cx="175" cy="80" r="3.5" fill="#73dbff" />

      {/* Etiquetas */}
      <text x="50" y="18" className="wl-art-n" textAnchor="middle">{isEs ? "Alto Costo (Pérdida)" : "High Cost (Loss)"}</text>
      <text x="160" y="98" className="wl-art-w" textAnchor="middle" fontSize="10">{isEs ? "Mínimo f(x*)" : "Minimum f(x*)"}</text>
      <text x="270" y="18" className="wl-art-n" textAnchor="middle">{isEs ? "Alto Costo (Pérdida)" : "High Cost (Loss)"}</text>
    </svg>
  );
}

/** Lámina 2: El vector gradiente y la actualización del paso. */
function ArtDescentGradient({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {/* Curva convexa */}
      <path d="M 40 20 Q 160 85 280 20" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />

      {/* Punto de evaluación actual */}
      <circle cx="85" cy="48" r="4.5" fill="#ffc75c" />
      <text x="85" y="36" className="wl-art-w" textAnchor="middle" fontSize="11">x_t</text>

      {/* Vector Gradiente (Subida) */}
      <line x1="85" y1="48" x2="55" y2="30" stroke="#ff4d29" strokeWidth="2" />
      <polygon points="55,30 65,34 62,26" fill="#ff4d29" />
      <text x="48" y="20" className="wl-art-n" textAnchor="middle">{isEs ? "∇f (subida)" : "∇f (ascent)"}</text>

      {/* Vector Paso Opuesto (-η ∇f) */}
      <line x1="85" y1="48" x2="135" y2="72" stroke="#00f0ff" strokeWidth="2.5" />
      <polygon points="135,72 125,66 128,74" fill="#00f0ff" />
      <text x="125" y="60" className="wl-art-w" fill="#00f0ff" fontSize="10">-η·∇f</text>

      {/* Siguiente punto */}
      <circle cx="135" cy="72" r="4.5" fill="#00f0ff" />
      <text x="145" y="86" className="wl-art-w" textAnchor="middle" fontSize="11">x_(t+1)</text>

      {/* Mínimo */}
      <circle cx="160" cy="85" r="3" fill="rgba(255,255,255,0.7)" />
      <text x="160" y="97" className="wl-art-n" textAnchor="middle">{isEs ? "Mínimo" : "Minimum"}</text>
    </svg>
  );
}

/** Lámina 3: Comparativa de optimizadores (SGD vs Momentum vs Adam). */
function ArtDescentOptimizers({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {/* Líneas de nivel de un valle estrecho alargado */}
      <ellipse cx="160" cy="50" rx="130" ry="38" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
      <ellipse cx="160" cy="50" rx="90" ry="24" stroke="rgba(255,255,255,0.18)" strokeWidth="1" fill="none" />
      <ellipse cx="160" cy="50" rx="45" ry="12" stroke="rgba(255,255,255,0.25)" strokeWidth="1" fill="none" />
      <circle cx="160" cy="50" r="3" fill="#fff" />

      {/* SGD: Oscilación en zigzag */}
      <path d="M 45 25 L 75 72 L 105 32 L 125 64 L 140 42 L 152 56 L 158 50"
            stroke="#ff4d29" strokeWidth="1.8" strokeDasharray="2.5 1.5" fill="none" />
      <circle cx="45" cy="25" r="3" fill="#ff4d29" />

      {/* Momentum: Amortigua oscilaciones e impulsa por el centro */}
      <path d="M 45 40 Q 80 62 110 54 Q 135 48 156 50"
            stroke="#ffc75c" strokeWidth="2" fill="none" />
      <circle cx="45" cy="40" r="3" fill="#ffc75c" />

      {/* Adam: Adaptación por coordenada directa y suave */}
      <path d="M 45 65 Q 95 56 130 52 L 158 50"
            stroke="#00f0ff" strokeWidth="2" fill="none" />
      <circle cx="45" cy="65" r="3" fill="#00f0ff" />

      {/* Leyenda a la derecha */}
      <text x="235" y="32" className="wl-art-n" fill="#ff4d29">━ {isEs ? "SGD (Zigzag)" : "SGD (Zigzag)"}</text>
      <text x="235" y="52" className="wl-art-n" fill="#ffc75c">━ {isEs ? "Momento (Inercia)" : "Momentum (Inertia)"}</text>
      <text x="235" y="72" className="wl-art-n" fill="#00f0ff">━ {isEs ? "Adam (Adaptativo)" : "Adam (Adaptive)"}</text>
    </svg>
  );
}

interface Step {
  art: (({ lang }: { lang: Lang }) => JSX.Element) | null;
  head: string;
  body: string;
  note: string;
}

const STEPS_DATA: Record<Lang, Step[]> = {
  es: [
    {
      art: ArtDescentTerrain,
      head: "Miles de caminantes bajando por la pérdida",
      body: "En optimización matemática, el error de un modelo se dibuja como un paisaje montañoso 3D. Soltamos 8.000 partículas en paralelo con WebGPU para explorar cómo descienden hacia el valle del costo mínimo.",
      note: "Cinco caminantes marcados dejan una estela continua para analizar trayectorias individuales.",
    },
    {
      art: ArtDescentGradient,
      head: "El vector gradiente y la tasa de aprendizaje",
      body: "El gradiente ∇f apunta hacia donde la función sube más rápido. Cada partícula da un paso en sentido opuesto: x_(t+1) = x_t - η ∇f. La tasa η determina si el paso avanza, rebota o diverge fuera del mapa.",
      note: "La vertical está escalada en logaritmo (log1p) para que los valles profundos no queden aplastados.",
    },
    {
      art: ArtDescentOptimizers,
      head: "Descenso Clásico vs. Momento vs. Adam",
      body: "El Descenso Puro (SGD) rebota en valles angostos. El Momento añade inercia física cancelando oscilaciones. Adam adapta la tasa en cada coordenada normalizando por la varianza del gradiente.",
      note: "Compara el porcentaje de éxito en las 5 superficies clásicas (Rosenbrock, Himmelblau, Beale, Silla, Rastrigin).",
    },
    {
      art: null,
      head: "Y ahora, a experimentar",
      body: "Controla la simulación con atajos rápidos, ajusta el paso en tiempo real y observa el campo de flujo de los optimizadores en el relieve.",
      note: "WebGPU en vivo · Puedes volver a abrir esta guía en cualquier momento desde la barra lateral.",
    },
  ],
  en: [
    {
      art: ArtDescentTerrain,
      head: "Thousands of walkers rolling down the loss",
      body: "In mathematical optimization, the model error is represented as a 3D mountainous landscape. We release 8,000 particles in parallel using WebGPU to observe how they descend toward the minimum cost basin.",
      note: "Five tracked probes leave continuous trails to analyze individual optimization paths.",
    },
    {
      art: ArtDescentGradient,
      head: "Gradient vector and learning rate",
      body: "The gradient vector ∇f points in the steepest ascent direction. Each particle takes a step in the opposite direction: x_(t+1) = x_t - η ∇f. The rate η dictates whether the step converges, bounces, or diverges.",
      note: "Vertical elevation is scaled logarithmically (log1p) so deep ravines remain readable.",
    },
    {
      art: ArtDescentOptimizers,
      head: "Vanilla SGD vs. Momentum vs. Adam",
      body: "Pure SGD oscillates heavily across narrow ravines. Momentum injects physical inertia to cancel lateral bounces. Adam adapts learning rates coordinate-wise by normalizing historical variance.",
      note: "Compare success convergence rates across 5 benchmark surfaces (Rosenbrock, Himmelblau, Beale, Saddle, Rastrigin).",
    },
    {
      art: null,
      head: "Time to experiment",
      body: "Control the live simulation with keyboard shortcuts, tune step sizes in real-time, and explore optimizer flow fields.",
      note: "Live WebGPU · You can reopen this guide anytime from the sidebar.",
    },
  ],
};

const ACTS_DATA: Record<Lang, { Ico: () => JSX.Element; title: string; desc: string }[]> = {
  es: [
    { Ico: IcoOrbit, title: "Arrastrar el ratón", desc: "gira el relieve 3D en el espacio." },
    { Ico: IcoPlayPause, title: "Espacio", desc: "pausa o reanuda la marcha del enjambre." },
    { Ico: IcoReset, title: "Tecla R", desc: "suelta de nuevo a los caminantes con nueva semilla." },
    { Ico: IcoPlanView, title: "Tecla P", desc: "alterna entre vista de relieve 3D y mapa de planta 2D." },
  ],
  en: [
    { Ico: IcoOrbit, title: "Drag mouse", desc: "orbit the 3D loss surface in space." },
    { Ico: IcoPlayPause, title: "Spacebar", desc: "pause or resume particle descent." },
    { Ico: IcoReset, title: "R key", desc: "respawn walkers with a new random seed." },
    { Ico: IcoPlanView, title: "P key", desc: "toggle between 3D terrain and 2D contour map." },
  ],
};

const UI_DATA = {
  es: {
    eyebrow: "descenso de gradiente · optimización",
    skip: "saltar",
    back: "atrás",
    next: "siguiente",
    done: "entrar a la sala",
    close: "cerrar",
    more: "o léelo entero en la guía del descenso",
    step: (i: number, n: number) => `paso ${i} de ${n}`,
    go: (i: number) => `ir al paso ${i}`,
  },
  en: {
    eyebrow: "gradient descent · optimization",
    skip: "skip",
    back: "back",
    next: "next",
    done: "enter room",
    close: "close",
    more: "or read the comprehensive descent guide",
    step: (i: number, n: number) => `step ${i} of ${n}`,
    go: (i: number) => `go to step ${i}`,
  },
};

export default function DescentWelcome({
  onClose,
  onOpenGuide,
  lang = "es",
}: {
  onClose: () => void;
  onOpenGuide?: () => void;
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
    rememberDescentIntro();
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
        aria-labelledby="descent-wl-head"
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

        <h2 className="wl-head" id="descent-wl-head">{s.head}</h2>
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

        {last && onOpenGuide && (
          <p className="wl-more">
            <button className="link" onClick={() => { rememberDescentIntro(); onOpenGuide(); }}>
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
