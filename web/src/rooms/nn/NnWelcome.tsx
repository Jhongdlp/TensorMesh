import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

/** Clave de persistencia de la presentación de la sala. */
export const NN_INTRO_KEY = "nn.intro.v1";

/** ¿Primera visita? No sale sobre un enlace con estado: si alguien apuntó a
 *  algo concreto, taparlo es contestar a una pregunta que nadie hizo. */
export function nnIntroPending(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(location.search);
  if (q.get("data") || q.get("guide")) return false;
  try {
    return localStorage.getItem(NN_INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

export function rememberNnIntro(): void {
  try { localStorage.setItem(NN_INTRO_KEY, "1"); } catch {}
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

const IcoPick = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <circle cx="9" cy="9" r="4" />
    <path d="M13 13l6.5 6.5M12.5 16.5l4-4" />
  </svg>
);

const IcoPlayPause = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <rect x="5" y="4" width="4" height="16" rx="1" fill="currentColor" />
    <rect x="15" y="4" width="4" height="16" rx="1" fill="currentColor" />
  </svg>
);

const IcoArch = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <circle cx="4.5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="6.5" r="1.8" fill="currentColor" />
    <circle cx="12" cy="17.5" r="1.8" fill="currentColor" />
    <circle cx="19.5" cy="12" r="1.8" fill="currentColor" />
    <path d="M6 11l4.4-3.4M6 13l4.4 3.4M13.6 7.6L18 11M13.6 16.4L18 13" />
  </svg>
);

const ART = { viewBox: "0 0 320 106", preserveAspectRatio: "xMidYMid meet" };
const ROSE = "#ff4070";
const CYAN = "#00f0ff";

/** Lámina 1: una recta no separa un anillo; dos capas sí. */
function ArtWhy({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      <g transform="translate(28, 10)">
        <rect x="0" y="0" width="76" height="76" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" />
        {[[38, 38, 9], [30, 44, 7], [46, 32, 7]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r * 0.42} fill={CYAN} opacity="0.9" />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <circle key={i} cx={38 + Math.cos(a) * 29} cy={38 + Math.sin(a) * 29} r="3" fill={ROSE} opacity="0.85" />;
        })}
        <path d="M4 62L72 14" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" strokeDasharray="4 3" />
        <text x="38" y="96" className="wl-art-n" textAnchor="middle">
          {isEs ? "una recta" : "one line"}
        </text>
      </g>

      <path d="M118 48h20M132 43l6 5-6 5" {...ico} stroke="rgba(255,255,255,0.42)" strokeWidth="1.8" />

      <g transform="translate(160, 10)">
        <rect x="0" y="0" width="76" height="76" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.14)" />
        <circle cx="38" cy="38" r="17" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" strokeDasharray="4 3" />
        {[[38, 38, 9], [30, 44, 7], [46, 32, 7]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r * 0.42} fill={CYAN} opacity="0.9" />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <circle key={i} cx={38 + Math.cos(a) * 29} cy={38 + Math.sin(a) * 29} r="3" fill={ROSE} opacity="0.85" />;
        })}
        <text x="38" y="96" className="wl-art-n" textAnchor="middle">
          {isEs ? "cuatro rectas combinadas" : "four lines combined"}
        </text>
      </g>
    </svg>
  );
}

/** Lámina 2: los coeficientes arriba, la función abajo. */
function ArtTwoHalves({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const cols = [2, 4, 4, 1];
  const xs = [58, 118, 178, 238];
  const pts: [number, number][][] = cols.map((n, l) =>
    Array.from({ length: n }, (_, i) => [xs[l], 30 - ((i - (n - 1) / 2) * 13)] as [number, number]),
  );
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {pts.slice(0, -1).flatMap((layer, l) =>
        layer.flatMap((a, i) =>
          pts[l + 1].map((b, j) => (
            <line key={`${l}-${i}-${j}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                  stroke={(i + j + l) % 2 ? CYAN : ROSE} strokeWidth="0.9"
                  opacity={0.18 + ((i * 3 + j * 5 + l) % 5) * 0.13} />
          )),
        ),
      )}
      {pts.flat().map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.1" fill="#fff" />
      ))}

      <rect x="46" y="58" width="204" height="26" rx="3" fill="url(#nnFieldGrad)" opacity="0.9" />
      <defs>
        <linearGradient id="nnFieldGrad" x1="0" x2="1">
          <stop offset="0%" stopColor={ROSE} />
          <stop offset="46%" stopColor="#0b0d12" />
          <stop offset="54%" stopColor="#0b0d12" />
          <stop offset="100%" stopColor={CYAN} />
        </linearGradient>
      </defs>
      <path d="M238 34v20M58 34v20" stroke="rgba(255,255,255,0.28)" strokeWidth="1" strokeDasharray="2 3" />
      <text x="148" y="98" className="wl-art-n" textAnchor="middle">
        {isEs ? "los pesos, arriba · lo que contestan, abajo" : "the weights above · what they answer below"}
      </text>
    </svg>
  );
}

/** Lámina 3: ida, vuelta y corrección. */
function ArtLoop({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      <g transform="translate(0,6)">
        <path d="M40 30h230" stroke={CYAN} strokeWidth="1.6" opacity="0.55" />
        {[70, 120, 170, 220].map((x, i) => <circle key={i} cx={x} cy={30} r="3.4" fill={CYAN} />)}
        <path d="M262 25l8 5-8 5" fill="none" stroke={CYAN} strokeWidth="1.6" />
        <text x="40" y="20" className="wl-art-w">{isEs ? "1 · adelante: una respuesta" : "1 · forward: an answer"}</text>

        <path d="M270 62H40" stroke="#ffd28a" strokeWidth="1.6" opacity="0.6" />
        {[220, 170, 120, 70].map((x, i) => <circle key={i} cx={x} cy={62} r="3.4" fill="#ffd28a" />)}
        <path d="M48 57l-8 5 8 5" fill="none" stroke="#ffd28a" strokeWidth="1.6" />
        <text x="40" y="52" className="wl-art-n">{isEs ? "2 · atrás: de quién es la culpa" : "2 · backward: who is to blame"}</text>

        <text x="40" y="86" className="wl-art-n">
          {isEs ? "3 · cada peso se mueve un poco en contra de su culpa" : "3 · each weight moves a little against its blame"}
        </text>
      </g>
    </svg>
  );
}

const STEPS_DATA: Record<Lang, { art: (({ lang }: { lang: Lang }) => JSX.Element) | null; head: string; body: string; note: string }[]> = {
  es: [
    {
      art: ArtWhy,
      head: "Por qué hace falta una capa oculta",
      body: "Una neurona sola traza una recta y reparte el plano en dos. Con eso no hay forma de separar un anillo de su centro. Varias neuronas trazan varias rectas y una segunda capa las combina: de ahí sale una frontera curva, y de ahí sale todo lo demás.",
      note: "Es el problema que dejó parada la investigación en redes entre 1969 y 1986.",
    },
    {
      art: ArtTwoHalves,
      head: "Arriba los coeficientes, abajo la función",
      body: "En el suelo está el cuadrado de entradas entero, y el color dice qué contestaría la red en cada punto. Arriba están los pesos que producen esa respuesta. Cuando un peso cambia, la frontera de abajo se dobla: es la misma cosa vista de dos maneras.",
      note: "Cada punto del suelo es una pasada completa por la red. Se recalculan 16.384 cinco veces por segundo.",
    },
    {
      art: ArtLoop,
      head: "El ciclo: adelante, atrás, corregir",
      body: "Los pulsos que recorren la red son el ciclo del entrenamiento. De ida llevan señal —cuánto aporta cada peso a la respuesta—. De vuelta llevan culpa: cuánto habría que cambiar cada peso para fallar menos. Y no son las mismas aristas las que se encienden en cada sentido.",
      note: "Con la pausa puesta, la tecla N ejecuta un lote exacto y dibuja su ciclo entero.",
    },
    {
      art: null,
      head: "Y ahora, a romperla",
      body: "Sube la tasa de aprendizaje hasta que estalle. Quita capas hasta que la espiral sea imposible. Pincha una neurona y mira qué mira ella. Nada de esto está grabado: se calcula mientras lo tocas.",
      note: "WebGPU en vivo · esta presentación se reabre con el botón ? de la barra.",
    },
  ],
  en: [
    {
      art: ArtWhy,
      head: "Why a hidden layer is needed",
      body: "A single neuron draws one straight line and splits the plane in two. That can never separate a ring from its center. Several neurons draw several lines and a second layer combines them: that is where a curved boundary comes from — and everything else after it.",
      note: "This is the problem that stalled neural network research between 1969 and 1986.",
    },
    {
      art: ArtTwoHalves,
      head: "Coefficients above, function below",
      body: "The floor is the entire input square, and its color is what the network would answer at every point. Above are the weights that produce that answer. When a weight changes, the boundary below bends: it is the same thing seen two ways.",
      note: "Every pixel of the floor is a full forward pass. 16,384 of them, recomputed five times a second.",
    },
    {
      art: ArtLoop,
      head: "The loop: forward, backward, correct",
      body: "The pulses running through the network are the training loop. Forward they carry signal — how much each weight contributes to the answer. Backward they carry blame: how much each weight should change to be less wrong. And the edges that light up are not the same in both directions.",
      note: "While paused, the N key runs exactly one batch and draws its whole cycle.",
    },
    {
      art: null,
      head: "Now go break it",
      body: "Push the learning rate until it explodes. Strip layers until the spiral becomes impossible. Click a neuron and see what it sees. None of this is recorded: it is computed while you touch it.",
      note: "Live WebGPU · reopen this intro from the ? button in the toolbar.",
    },
  ],
};

const ACTS_DATA: Record<Lang, { Ico: () => JSX.Element; title: string; desc: string }[]> = {
  es: [
    { Ico: IcoOrbit, title: "arrastra y rueda", desc: "para orbitar la red y acercarte al suelo" },
    { Ico: IcoPick, title: "pincha una neurona", desc: "y el suelo pasa a enseñar lo que ella mira" },
    { Ico: IcoPlayPause, title: "espacio y tecla N", desc: "pausa, o ejecuta un lote y su ciclo entero" },
    { Ico: IcoArch, title: "menú lateral", desc: "cambia el problema, las capas y la tasa de aprendizaje" },
  ],
  en: [
    { Ico: IcoOrbit, title: "drag & wheel", desc: "orbit the network and get close to the floor" },
    { Ico: IcoPick, title: "click a neuron", desc: "and the floor switches to what that neuron sees" },
    { Ico: IcoPlayPause, title: "space & N key", desc: "pause, or run one batch and its whole cycle" },
    { Ico: IcoArch, title: "sidebar menu", desc: "change the problem, the layers and the learning rate" },
  ],
};

const UI_DATA = {
  es: {
    eyebrow: "red neuronal · retropropagación",
    skip: "saltar",
    back: "atrás",
    next: "siguiente",
    done: "entrar a la sala",
    close: "cerrar",
    more: "o léela entera en la guía",
    step: (i: number, n: number) => `paso ${i} de ${n}`,
    go: (i: number) => `ir al paso ${i}`,
  },
  en: {
    eyebrow: "neural network · backpropagation",
    skip: "skip",
    back: "back",
    next: "next",
    done: "enter room",
    close: "close",
    more: "or read the complete guide",
    step: (i: number, n: number) => `step ${i} of ${n}`,
    go: (i: number) => `go to step ${i}`,
  },
};

export default function NnWelcome({
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
    rememberNnIntro();
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

  // En captura: el `Escape` de la sala escucha en `window` y soltaría la
  // selección de debajo en vez de cerrar este cuadro.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        shut();
        return;
      }
      if (e.key === "ArrowRight") { e.preventDefault(); setI(k => Math.min(k + 1, steps.length - 1)); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); setI(k => Math.max(k - 1, 0)); return; }
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
  }, [shut, steps.length]);

  const s = steps[i];
  const Art = s.art;

  return (
    <div className="wl-veil" onPointerDown={e => { if (e.target === e.currentTarget) shut(); }}>
      <div ref={boxRef} className="wl" role="dialog" aria-modal="true"
           aria-labelledby="nn-wl-head" tabIndex={-1}>
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

        <h2 className="wl-head" id="nn-wl-head">{s.head}</h2>
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
            <button className="link" onClick={() => { rememberNnIntro(); onGuide(); }}>
              {ui.more}
            </button>
          </p>
        )}

        <footer className="wl-foot">
          <nav className="wl-dots" aria-label={ui.step(i + 1, steps.length)}>
            {steps.map((_, k) => (
              <button key={k} className={"wl-dot" + (k === i ? " on" : "")}
                      onClick={() => setI(k)} aria-label={ui.go(k + 1)} aria-current={k === i} />
            ))}
          </nav>
          <span className="wl-acts-n">
            {i > 0 && <button className="wl-back" onClick={() => setI(k => k - 1)}>{ui.back}</button>}
            <button className="wl-go" onClick={() => (last ? shut() : setI(k => k + 1))}>
              {last ? ui.done : ui.next}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
