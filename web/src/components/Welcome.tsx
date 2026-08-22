import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { rampCss } from "../galaxy/palette.mjs";

/** La presentación: cuatro pantallas que dicen qué se está mirando.
 *
 *  Existe porque la galaxia no se explica sola. Quien llega ve una nube de
 *  cincuenta mil puntos girando y no tiene forma de saber que cada punto es una
 *  palabra, que su sitio lo decidieron unos muelles y no una proyección, ni que
 *  el color dice barrio. Sin eso el atlas es un salvapantallas bonito.
 *
 *  Tres decisiones que no son de adorno:
 *
 *  - **Sale una vez y se recuerda.** Un modal que vuelve en cada visita es un
 *    peaje. La marca lleva versión (`INTRO_KEY`) para poder volver a contarlo si
 *    algún día cambia lo que hay que contar.
 *  - **No sale sobre un enlace compartido.** Si la URL trae `?w=` o `?cmp=`,
 *    alguien mandó este atlas apuntando a algo concreto; taparlo con la
 *    presentación es contestar a una pregunta que nadie hizo.
 *  - **Se puede volver a abrir.** Vive detrás del botón `?` de la barra, que
 *    sigue a la vista con el cajón plegado. Una explicación que sólo existe en
 *    los tres primeros segundos no existe.
 *
 *  Y se sale de ella por tres sitios —`Esc`, el velo y el botón—, que es la
 *  misma regla que gobierna la selección: nada se coge sin poder soltarse.
 */

/** La marca en `localStorage`. Lleva versión en el nombre: subirla es la única
 *  forma de que la presentación vuelva a salirle a quien ya la vio. */
export const INTRO_KEY = "atlas.intro.v1";

/** ¿Toca enseñarla? Todo el acceso a `localStorage` pasa por aquí y va envuelto:
 *  en una ventana privada el propio acceso lanza, y una excepción leyendo una
 *  preferencia no puede llevarse por delante el arranque del visor. */
export function introPending(): boolean {
  if (typeof window === "undefined") return false;
  // Un enlace que apunta a una palabra, un camino o una comparación ya trae su
  // propia intención: se respeta y no se tapa.
  const q = new URLSearchParams(location.search);
  if (q.get("w") || q.get("cmp")) return false;
  try {
    return localStorage.getItem(INTRO_KEY) !== "1";
  } catch {
    // Sin almacenamiento la enseñamos igual: molestar una vez por visita es
    // menos malo que no explicar nunca nada.
    return true;
  }
}

/** Marca la presentación como vista. Nunca lanza. */
function remember() {
  try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* sin sitio donde anotarlo */ }
}

const ico = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

/** Arrastrar: el cursor y el arco que describe la vista al orbitar. */
const IcoDrag = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <path d="M4 15a9 9 0 0116 0" strokeDasharray="2.4 2.2" />
    <path d="M9.5 6.5l9 3.2-3.6 1.5-1 3.7z" />
  </svg>
);

/** Clic: el punto y el golpe encima. */
const IcoClick = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <circle cx="12" cy="14" r="2.6" />
    <path d="M12 7.4V5M7.4 9.4L5.7 7.7M16.6 9.4l1.7-1.7" />
  </svg>
);

/** Buscar. */
const IcoFind = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="5.5" />
    <path d="M14.6 14.6L19 19" />
  </svg>
);

/** Comparar: dos cuerpos y la cuerda que los mide. El mismo de la barra. */
const IcoCompare = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <circle cx="7" cy="8" r="3" />
    <circle cx="17" cy="16" r="3" />
    <path d="M9.2 10.2l5.6 3.6" strokeDasharray="2 1.6" />
  </svg>
);

/* ================= las cuatro láminas =================
   Dibujadas a mano en SVG y no traídas de ningún sitio, por lo mismo que los
   iconos: son cuatro, y cada una enseña exactamente el paso que explica su
   texto. Una ilustración de banco de imágenes ocuparía el mismo hueco sin
   decir nada. Todas miden 320×96 y se escalan con el ancho del cuadro. */

const ART = { viewBox: "0 0 320 96", preserveAspectRatio: "xMidYMid meet" };

/** Los pies de las láminas, en los dos idiomas del sitio. Van aquí y no dentro
 *  de cada `<text>` porque son cuatro palabras por lámina y sacarlos a un mapa
 *  evita duplicar el SVG entero por idioma. */
const CAP = {
  es: { nums: "300 números", dot: "un punto", dims: "300 dimensiones",
        knit: "3, y con barrios", ring: "la rampa cierra", white: "los puntos, blancos" },
  en: { nums: "300 numbers", dot: "one dot", dims: "300 dimensions",
        knit: "3, with neighbourhoods", ring: "the ramp closes", white: "the dots, white" },
};

/** @param lang idioma del sitio; sólo decide los pies. */
type ArtProps = { lang: string };
const cap = (lang: string) => CAP[lang as keyof typeof CAP] ?? CAP.es;

/** Lámina 1 — la palabra, sus 300 números y el punto en que se convierte.
 *  Las alturas salen de una función, no de un `random`: el dibujo tiene que ser
 *  el mismo en cada render o parpadearía al cambiar de pantalla. */
function ArtVector({ lang }: ArtProps) {
  const c = cap(lang);
  const bars = Array.from({ length: 30 }, (_, i) => {
    const h = 5 + 30 * Math.abs(Math.sin(i * 1.7 + 0.6) * Math.cos(i * 0.41));
    return { x: 60 + i * 6, h };
  });
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      <text x="4" y="52" className="wl-art-w">gato</text>
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={48 - b.h / 2}
          width="3.4"
          height={b.h}
          rx="1.7"
          fill="rgba(255,255,255,0.5)"
        />
      ))}
      <text x="60" y="80" className="wl-art-n">{c.nums}</text>
      <path d="M250 48h20" {...ico} stroke="rgba(255,255,255,0.42)" />
      <path d="M265 43l5 5-5 5" {...ico} stroke="rgba(255,255,255,0.42)" />
      <circle cx="296" cy="48" r="11" fill="rgba(255,255,255,0.09)" />
      <circle cx="296" cy="48" r="3.4" fill="#fff" />
      <text x="296" y="80" className="wl-art-n" textAnchor="middle">{c.dot}</text>
    </svg>
  );
}

/** Lámina 2 — de la nube suelta al grafo asentado. Los dos estados son el mismo
 *  juego de puntos: es lo que dice que nada se ha aplanado, sólo colocado. */
function ArtForces({ lang }: ArtProps) {
  const c = cap(lang);
  const loose = [
    [22, 26], [56, 62], [38, 44], [76, 24], [16, 70],
    [64, 36], [92, 58], [46, 76], [88, 30], [30, 54],
  ];
  const knit = [
    [206, 30], [222, 46], [200, 54], [216, 66],
    [268, 34], [284, 50], [264, 62], [286, 70], [246, 48], [232, 26],
  ];
  const links: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [0, 2], [1, 3], [0, 9], [9, 1],
    [4, 5], [5, 6], [6, 7], [4, 6], [5, 7], [4, 8], [8, 5],
    [1, 8], [8, 4],
  ];
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {loose.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="rgba(255,255,255,0.5)" />
      ))}
      <text x="54" y="90" className="wl-art-n" textAnchor="middle">{c.dims}</text>
      {/* El muelle: es la metáfora entera del layout en doce píxeles. */}
      <path
        d="M124 48h8l3-6 6 12 6-12 6 12 6-12 3 6h8"
        {...ico}
        stroke="rgba(255,255,255,0.42)"
      />
      <path d="M175 43l5 5-5 5" {...ico} stroke="rgba(255,255,255,0.42)" />
      {links.map(([a, b], i) => (
        <line
          key={i}
          x1={knit[a][0]} y1={knit[a][1]}
          x2={knit[b][0]} y2={knit[b][1]}
          stroke="rgba(255,255,255,0.26)"
          strokeWidth="1"
        />
      ))}
      {knit.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.6" fill="#fff" />
      ))}
      <text x="244" y="90" className="wl-art-n" textAnchor="middle">{c.knit}</text>
    </svg>
  );
}

/** Lámina 3 — la rampa cerrada y una malla teñida por ella.
 *
 *  Los colores salen de `rampCss`, la misma función que colorea la galaxia: si
 *  algún día se cambia la rampa, esta lámina cambia con ella. El anillo se
 *  dibuja con radios y no con arcos porque a 72 tramos el trazo ya cierra
 *  sólido, y son 72 líneas en vez de 72 rutas con trigonometría dentro. */
function ArtRamp({ lang }: ArtProps) {
  const c = cap(lang);
  const N = 72;
  const spokes = Array.from({ length: N }, (_, i) => {
    const t = i / N;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const c = Math.cos(a), s = Math.sin(a);
    return {
      x1: 62 + c * 24, y1: 44 + s * 24,
      x2: 62 + c * 33, y2: 44 + s * 33,
      col: rampCss(t),
    };
  });
  // La malla de la derecha: cada arista se tiñe con el punto de la rampa que le
  // toca por su ángulo, que es literalmente la regla que sigue la galaxia.
  const nodes = [
    [206, 30], [232, 20], [252, 38], [244, 64], [216, 70], [196, 52], [226, 44],
  ];
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
    [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  ];
  return (
    <svg {...ART} className="wl-art" role="img" aria-hidden="true">
      {spokes.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.col} strokeWidth="3.4" />
      ))}
      <text x="62" y="90" className="wl-art-n" textAnchor="middle">{c.ring}</text>
      {edges.map(([a, b], i) => {
        const mx = (nodes[a][0] + nodes[b][0]) / 2 - 224;
        const my = (nodes[a][1] + nodes[b][1]) / 2 - 45;
        const t = (Math.atan2(my, mx) / (Math.PI * 2) + 1.25) % 1;
        return (
          <line
            key={i}
            x1={nodes[a][0]} y1={nodes[a][1]}
            x2={nodes[b][0]} y2={nodes[b][1]}
            stroke={rampCss(t)}
            strokeWidth="1.6"
            opacity="0.9"
          />
        );
      })}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.8" fill="#fff" />
      ))}
      <text x="224" y="90" className="wl-art-n" textAnchor="middle">{c.white}</text>
    </svg>
  );
}

/** Los cuatro gestos. No es una lámina: son filas con icono, porque cada una
 *  nombra algo que existe en la pantalla y hay que poder reconocerlo luego. */
const ACTS = [
  { Ico: IcoDrag, es: ["arrastra", "para orbitar la galaxia"], en: ["drag", "to orbit the galaxy"] },
  { Ico: IcoClick, es: ["clic en un punto", "para abrir su ficha y sus vecinos"], en: ["click a dot", "to open its card and neighbours"] },
  { Ico: IcoFind, es: ["busca una palabra", "y la cámara vuela hasta ella"], en: ["search a word", "and the camera flies to it"] },
  { Ico: IcoCompare, es: ["compara hasta cinco", "y mira cuánto se parecen de verdad"], en: ["compare up to five", "and see how alike they really are"] },
];

interface Step {
  art: null | ((p: ArtProps) => JSX.Element);
  head: string;
  body: string;
  note: string;
}

const STEPS: Record<string, Step[]> = {
  es: [
    {
      art: ArtVector,
      head: "Cada palabra es una lista de 300 números",
      body: "Un modelo leyó millones de textos y le dio a cada palabra un vector de 300 números. Las que se usan en los mismos sitios acabaron con números parecidos. Eso es un embedding — y es lo único que hay debajo de todo esto.",
      note: "50.000 palabras por idioma, de los vectores fastText.",
    },
    {
      art: ArtForces,
      head: "300 dimensiones no se pueden mirar",
      body: "Así que aquí no se aplanan: cada palabra se ata con un muelle a las que más se le parecen en 300D y se suelta el conjunto entero. Lo que ves es ese amasijo buscando su sitio, en vivo. Los barrios que salen no se pidieron: aparecen.",
      note: "Simulación de fuerzas sobre el grafo de vecinos, no PCA ni t-SNE.",
    },
    {
      art: ArtRamp,
      head: "Los puntos son blancos; el color lo pone la malla",
      body: "Cada hebra de luz se tiñe según dónde vive su región dentro de la nube, siguiendo una rampa que cierra sobre sí misma. Dos zonas que se tocan reciben tonos contiguos, así que el color se lee como vecindad y no como etiqueta.",
      note: "Cian, violeta, magenta, ámbar… y de vuelta al cian.",
    },
    {
      art: null,
      head: "Y ahora, a moverse",
      body: "Cuatro gestos y ya está todo. Puedes volver a esta explicación cuando quieras con el botón «?» de la barra de la izquierda.",
      note: "Cada número que verás está medido en 300D, nunca en la imagen: dos palabras pueden salir juntas en pantalla sin parecerse.",
    },
  ],
  en: [
    {
      art: ArtVector,
      head: "Every word is a list of 300 numbers",
      body: "A model read millions of texts and gave each word a vector of 300 numbers. Words used in the same places ended up with similar numbers. That is an embedding — and it is the only thing underneath all of this.",
      note: "50,000 words per language, from the fastText vectors.",
    },
    {
      art: ArtForces,
      head: "300 dimensions cannot be looked at",
      body: "So nothing gets flattened here: each word is tied by a spring to the ones it most resembles in 300D, and the whole thing is let go. What you see is that tangle finding its place, live. The neighbourhoods that emerge were never asked for.",
      note: "Force simulation over the nearest-neighbour graph — not PCA, not t-SNE.",
    },
    {
      art: ArtRamp,
      head: "The dots are white; the mesh carries the colour",
      body: "Each thread of light is tinted by where its region sits inside the cloud, following a ramp that closes on itself. Two zones that touch get neighbouring hues, so colour reads as nearness rather than as a label.",
      note: "Cyan, violet, magenta, amber… and back to cyan.",
    },
    {
      art: null,
      head: "Now go and move around",
      body: "Four gestures and that is all of it. You can bring this explanation back any time with the “?” button on the left bar.",
      note: "Every number you will see is measured in 300D, never on the image: two words can land side by side on screen without being alike.",
    },
  ],
};

const UI = {
  es: {
    eyebrow: "atlas vectorial",
    skip: "saltar",
    back: "atrás",
    next: "siguiente",
    done: "entrar en la galaxia",
    close: "cerrar",
    more: "o léelo entero en la guía",
    step: (i: number, n: number) => `paso ${i} de ${n}`,
    go: (i: number) => `ir al paso ${i}`,
  },
  en: {
    eyebrow: "vector atlas",
    skip: "skip",
    back: "back",
    next: "next",
    done: "enter the galaxy",
    close: "close",
    more: "or read the whole thing in the guide",
    step: (i: number, n: number) => `step ${i} of ${n}`,
    go: (i: number) => `go to step ${i}`,
  },
};

export default function Welcome({
  lang, onClose, onGuide,
}: {
  lang: string;
  onClose: () => void;
  /** Pasar a la guía larga. La presentación tiene que quedarse en treinta
   *  segundos —es lo que la hace pasable— y a la vez no puede ser todo lo que
   *  el atlas sabe explicar de sí mismo. Esto es la costura entre las dos. */
  onGuide?: () => void;
}) {
  const [i, setI] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  /** A quién se le devuelve el foco al cerrar. Sin esto, cerrar la presentación
   *  con `Esc` deja el foco en `<body>` y el siguiente tabulador empieza desde
   *  arriba, no desde el botón que la abrió. */
  const from = useRef<Element | null>(null);

  const steps = STEPS[lang] ?? STEPS.es;
  const t = UI[lang as keyof typeof UI] ?? UI.es;
  const last = i === steps.length - 1;

  const shut = useCallback(() => {
    remember();
    onClose();
  }, [onClose]);

  useEffect(() => {
    from.current = document.activeElement;
    // El foco entra en el cuadro, no en el botón: así el lector de pantalla lee
    // el título antes que la acción, y `Tab` sigue el orden natural de dentro.
    boxRef.current?.focus();
    return () => {
      const el = from.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  /** Teclado del cuadro. `Esc` cierra, las flechas pasan de lámina y `Tab` se
   *  queda dentro: mientras la presentación está puesta no hay nada más con lo
   *  que interactuar, y dejar salir el foco al buscador de detrás es como se
   *  pierde la gente que navega con teclado. */
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); shut(); return; }
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
    // En captura: el `Escape` de la galaxia escucha en `window` y soltaría la
    // selección de debajo en vez de cerrar esto.
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
        aria-labelledby="wl-head"
        tabIndex={-1}
      >
        <header className="wl-top">
          <p className="eyebrow">{t.eyebrow}</p>
          <button className="wl-skip" onClick={shut}>
            {last ? t.close : t.skip} <kbd>esc</kbd>
          </button>
        </header>

        {/* La lámina, encima del titular: es la que se mira primero y la que
            hace que el titular se entienda al leerlo. `key` es el paso — sin él
            React reaprovecha el mismo <svg> y el cambio no se anima. */}
        {Art && <div className="wl-stage" key={i}><Art lang={lang} /></div>}

        <h2 className="wl-head" id="wl-head">{s.head}</h2>
        <p className="wl-body">{s.body}</p>

        {/* Los gestos van **debajo** del titular y no en el sitio de la lámina:
            no son una ilustración de lo que dice el texto, son la lista que el
            texto anuncia. Puestos arriba, la última pantalla empezaba por su
            propio pie de página. */}
        {!Art && (
          <ul className="wl-acts" key={i}>
            {ACTS.map(({ Ico, es, en }, k) => {
              const [w, rest] = lang === "en" ? en : es;
              return (
                <li key={k}>
                  <span className="wl-acts-i"><Ico /></span>
                  <span><b>{w}</b> {rest}</span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="wl-note">{s.note}</p>

        {/* La puerta a la guía, sólo en la última pantalla. Antes de que
            alguien sepa qué hay dentro, ofrecerle diez capítulos es un muro;
            en la pantalla que dice «y ahora, a moverse» es la respuesta a la
            pregunta que acaba de quedar abierta. Va sobre el pie y no en él:
            el pie es «siguiente», y competir con el botón que avanza es la
            forma de que no se pulse ninguno de los dos. */}
        {last && onGuide && (
          <p className="wl-more">
            <button className="link" onClick={() => { remember(); onGuide(); }}>
              {t.more}
            </button>
          </p>
        )}

        <footer className="wl-foot">
          {/* Los puntos son también botones: en una presentación de cuatro
              pantallas, el indicador de dónde estás es el sitio donde la gente
              intenta pinchar para volver. */}
          <nav className="wl-dots" aria-label={t.step(i + 1, steps.length)}>
            {steps.map((_, k) => (
              <button
                key={k}
                className={"wl-dot" + (k === i ? " on" : "")}
                onClick={() => setI(k)}
                aria-label={t.go(k + 1)}
                aria-current={k === i}
              />
            ))}
          </nav>
          <span className="wl-acts-n">
            {i > 0 && (
              <button className="wl-back" onClick={() => setI(k => k - 1)}>{t.back}</button>
            )}
            <button
              className="wl-go"
              onClick={() => (last ? shut() : setI(k => k + 1))}
            >
              {last ? t.done : t.next}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
