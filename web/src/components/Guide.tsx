import {
  useCallback, useEffect, useMemo, useRef, useState, type JSX,
} from "react";
import { rampCss } from "../galaxy/palette.mjs";
import {
  TOY, TOY_DIMS, toyCos, miniGraph, miniStep, miniHeat, type Mini,
} from "../galaxy/guide.mjs";

/** La guía: qué es esto, contado entero y con dibujos que se tocan.
 *
 *  `Welcome` son cuatro pantallas de treinta segundos que sirven para no
 *  quedarse mirando un salvapantallas. Esto es otra cosa: el sitio donde alguien
 *  que nunca ha oído la palabra «embedding» puede enterarse de qué está mirando,
 *  de dónde salen los números, por qué el parecido es un ángulo y qué es lo que
 *  este mapa **no** dice. Diez capítulos, cada uno con su lámina.
 *
 *  Tres decisiones que la separan de la presentación:
 *
 *  - **no sale sola nunca.** Se abre desde el botón «qué es esto» y desde el
 *    panel de arranque, y sólo desde ahí. Un tratado de diez capítulos delante
 *    de quien acaba de llegar es un muro; la presentación corta sigue siendo la
 *    que recibe.
 *  - **las láminas se tocan.** Arrastrar la flecha del coseno y ver el número
 *    moverse enseña en tres segundos lo que un párrafo no consigue en tres
 *    intentos. Las que no se pueden tocar, al menos se mueven solas.
 *  - **la aritmética de las láminas está en `galaxy/guide.mjs` y con test.** Un
 *    dibujo que dice «estas dos se parecen» y enseña dos siluetas distintas
 *    enseña lo contrario de lo que afirma, y eso no se ve leyendo el código.
 *
 *  Se sale por `Esc`, por el velo y por el botón, como todo lo que se coge en
 *  este atlas.
 */

/* =========================== los dibujos =========================== */

const ico = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

/** Todas las láminas miden lo mismo y se escalan con el ancho de la página. */
const ART = { preserveAspectRatio: "xMidYMid meet" };

/** Los textos que van **dentro** de las láminas. Van aparte del cuerpo de los
 *  capítulos porque son etiquetas de dibujo —dos y tres palabras— y mezclarlas
 *  con la prosa obligaba a repetir el SVG entero por idioma. */
interface FigCopy {
  /** Las tres palabras de la primera lámina: dos que se parecen y una que no. */
  words: [string, string, string];
  pairNear: string;
  pairFar: string;
  cos: string;
  /** Frases con hueco, y a cuáles de las tres palabras les vale el hueco. */
  frames: { text: string; fits: number[] }[];
  ctxPick: string;
  ctxFits: (n: number) => string;
  /** La rueda del coseno. */
  angle: string;
  same: string;
  none: string;
  opposite: string;
  neigh: string;
  drag: string;
  /** El aplanado. */
  far3d: string;
  near2d: string;
  shadow: string;
  /** Los muelles. */
  loose: string;
  settled: string;
  again: string;
  /** La rampa. */
  ring: string;
  zones: string;
  /** La analogía. */
  ana: [string, string, string, string];
  /** La polisemia. */
  sense: { word: string; left: string[]; right: string[] };
}

/* ---- 1. la palabra y sus números ---- */

/** Dos filas de barras, la misma silueta o no, y el coseno debajo.
 *
 *  Interactiva porque el punto entero es la **comparación**: una sola fila de
 *  barras es un adorno, dos filas puestas a la vez son un argumento. El botón
 *  cambia con quién se compara, y el número de abajo cambia con él. */
function FigBars({ t }: { t: FigCopy }) {
  const [far, setFar] = useState(false);
  const other = far ? TOY.c : TOY.b;
  const c = toyCos(TOY.a, other);
  const W = 320, PAD = 58, BW = (W - PAD - 8) / TOY_DIMS;

  /** Una fila de barras alrededor de su línea. */
  const row = (v: Float32Array, y: number, op: number) =>
    Array.from({ length: TOY_DIMS }, (_, i) => {
      const h = v[i] * 62;
      return (
        <rect
          key={i}
          x={PAD + i * BW}
          y={h < 0 ? y : y - h}
          width={BW - 1.6}
          height={Math.max(Math.abs(h), 1)}
          rx="0.8"
          fill={`rgba(255,255,255,${op})`}
        />
      );
    });

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 132" className="gd-art" {...ART} role="img" aria-hidden="true">
        <line x1={PAD} y1="34" x2={W - 8} y2="34" stroke="#ffffff1f" />
        <line x1={PAD} y1="90" x2={W - 8} y2="90" stroke="#ffffff1f" />
        {row(TOY.a, 34, 0.72)}
        {row(other, 90, 0.72)}
        <text x="4" y="37" className="gd-art-w">{t.words[0]}</text>
        <text x="4" y="93" className="gd-art-w">{far ? t.words[2] : t.words[1]}</text>
        <text x={PAD} y="122" className="gd-art-n">
          {t.cos} {c.toFixed(2).replace(".", ",")}
        </text>
        {/* La barra del parecido: el número solo no dice si 0,70 es mucho. */}
        <rect x={PAD + 96} y="115" width="160" height="6" rx="3" fill="#ffffff14" />
        <rect
          x={PAD + 96} y="115"
          width={Math.max(0, c) * 160} height="6" rx="3"
          fill="#fff"
        />
      </svg>
      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (far ? "" : " on")} onClick={() => setFar(false)}>
          {t.pairNear}
        </button>
        <button className={"gd-pill" + (far ? " on" : "")} onClick={() => setFar(true)}>
          {t.pairFar}
        </button>
      </div>
    </div>
  );
}

/* ---- 2. los huecos ---- */

/** Frases con un hueco y tres palabras que pueden ir dentro.
 *
 *  Va en HTML y no en SVG: son frases, y una frase dentro de un `<text>` no se
 *  parte de línea ni se puede leer con un lector de pantalla. */
function FigContext({ t }: { t: FigCopy }) {
  const [pick, setPick] = useState(0);
  const hits = t.frames.filter(f => f.fits.includes(pick)).length;
  return (
    <div className="gd-fig">
      <div className="gd-fig-acts" role="group">
        {t.words.map((w, i) => (
          <button
            key={w}
            className={"gd-pill" + (i === pick ? " on" : "")}
            onClick={() => setPick(i)}
            aria-pressed={i === pick}
          >
            {w}
          </button>
        ))}
      </div>
      <ul className="gd-ctx">
        {t.frames.map((f, i) => {
          const ok = f.fits.includes(pick);
          const [before, after] = f.text.split("___");
          return (
            <li key={i} className={ok ? "on" : ""}>
              {before}
              <i className="gd-slot">{ok ? t.words[pick] : "—"}</i>
              {after}
            </li>
          );
        })}
      </ul>
      <p className="gd-cap">{t.ctxFits(hits)}</p>
    </div>
  );
}

/* ---- 3. el ángulo ---- */

/** El coseno, arrastrable.
 *
 *  Es la lámina que más trabaja de las diez: el coseno es el único número que
 *  el atlas enseña, y hasta aquí no se explicaba en ninguna parte. Se arrastra
 *  con el ratón y se mueve con las flechas cuando tiene el foco — un mando que
 *  sólo responde al puntero deja fuera a quien navega con teclado, y este es el
 *  mando que hay que tocar para entender el capítulo.
 *
 *  @param ref el parecido típico entre vecinos **de esta galaxia**, si está
 *  cargada. Sin una referencia medida, 0,50 no significa nada.
 */
function FigCos({ t, ref }: { t: FigCopy; ref?: number }) {
  const [deg, setDeg] = useState(38);
  const box = useRef<SVGSVGElement>(null);
  const OX = 96, OY = 96, R = 66;
  const c = Math.cos((deg * Math.PI) / 180);

  /** Del punto del puntero al ángulo, pasando por el sistema del `viewBox`.
   *  El SVG se escala con el ancho de la página, así que el píxel de pantalla
   *  no vale: hay que llevarlo a las 320 unidades del dibujo. */
  const aim = (e: { clientX: number; clientY: number }) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 320 - OX;
    const y = ((e.clientY - r.top) / r.height) * 160 - OY;
    const a = (Math.atan2(-y, x) * 180) / Math.PI;
    setDeg(Math.min(180, Math.max(0, a)));
  };

  const arrow = (a: number, colour: string, dash?: string) => {
    const rad = (a * Math.PI) / 180;
    const x = OX + Math.cos(rad) * R, y = OY - Math.sin(rad) * R;
    return (
      <g>
        <line x1={OX} y1={OY} x2={x} y2={y} stroke={colour} strokeWidth="2" strokeDasharray={dash} />
        <circle cx={x} cy={y} r="4" fill={colour} />
      </g>
    );
  };

  return (
    <div className="gd-fig">
      <svg
        ref={box}
        viewBox="0 0 320 160"
        className="gd-art gd-grab"
        {...ART}
        data-own-keys=""
        role="slider"
        tabIndex={0}
        aria-label={t.angle}
        aria-valuemin={0}
        aria-valuemax={180}
        aria-valuenow={Math.round(deg)}
        aria-valuetext={`${Math.round(deg)}° · ${t.cos} ${c.toFixed(2)}`}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); aim(e); }}
        onPointerMove={e => { if (e.buttons) aim(e); }}
        onKeyDown={e => {
          const d = e.key === "ArrowLeft" ? 4 : e.key === "ArrowRight" ? -4 : 0;
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          setDeg(v => Math.min(180, Math.max(0, v + d)));
        }}
      >
        {/* El arco del ángulo, entre las dos flechas. */}
        <path
          d={`M ${OX + 26} ${OY} A 26 26 0 0 0 ${OX + Math.cos((deg * Math.PI) / 180) * 26} ${OY - Math.sin((deg * Math.PI) / 180) * 26}`}
          fill="none"
          stroke="#ffffff5c"
          strokeWidth="1.2"
        />
        <text x={OX + 32} y={OY - 12} className="gd-art-n">{Math.round(deg)}°</text>
        {arrow(0, "rgba(255,255,255,0.42)")}
        {arrow(deg, "#fff")}
        <circle cx={OX} cy={OY} r="2" fill="#ffffff5c" />
        <text x="4" y="18" className="gd-art-n">{t.drag}</text>

        {/* La regla del coseno, a la derecha: dónde cae este ángulo entre «la
            misma palabra» y «lo contrario». Sin las marcas, el número flota. */}
        <g transform="translate(232, 22)">
          <rect x="0" y="0" width="10" height="116" rx="5" fill="#ffffff14" />
          <rect
            x="0"
            y={(1 - c) * 58}
            width="10"
            height={Math.max(2, Math.abs(c) * 58)}
            rx="5"
            fill="#fff"
            transform={c >= 0 ? "" : `translate(0, ${-Math.abs(c) * 58})`}
          />
          <line x1="-4" y1="0" x2="14" y2="0" stroke="#ffffff5c" strokeWidth="1" />
          <line x1="-4" y1="58" x2="14" y2="58" stroke="#ffffff5c" strokeWidth="1" />
          <line x1="-4" y1="116" x2="14" y2="116" stroke="#ffffff5c" strokeWidth="1" />
          <text x="18" y="4" className="gd-art-n">1 · {t.same}</text>
          <text x="18" y="62" className="gd-art-n">0 · {t.none}</text>
          <text x="18" y="119" className="gd-art-n">−1 · {t.opposite}</text>
          {ref !== undefined && (
            <>
              <line
                x1="-4" y1={(1 - ref) * 58} x2="14" y2={(1 - ref) * 58}
                stroke="#fff" strokeWidth="1" strokeDasharray="2 2"
              />
              <text x="18" y={(1 - ref) * 58 + 4} className="gd-art-n">
                {ref.toFixed(2).replace(".", ",")} · {t.neigh}
              </text>
            </>
          )}
        </g>
      </svg>
      <p className="gd-cap">
        {t.cos} <b>{c.toFixed(2).replace(".", ",")}</b>
      </p>
    </div>
  );
}

/* ---- 4. el aplanado ---- */

/** Tres puntos en una caja y sus tres sombras en el suelo: dos que estaban
 *  lejos caen juntas. Es el argumento entero contra proyectar, en un dibujo. */
function FigFlat({ t }: { t: FigCopy }) {
  // Los dos primeros comparten sombra; el tercero está lejos de los dos.
  const pts: [number, number, number][] = [[96, 34, 0], [148, 66, 0], [214, 44, 1]];
  const floor = (x: number, y: number) => [x + 22, 118 - (y - 34) * 0.06] as const;
  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 148" className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* La caja: sólo las tres aristas que dan la sensación de fondo. */}
        <path d="M62 22h196v72H62z" fill="none" stroke="#ffffff14" />
        <path d="M84 112h196V40M84 112l-22-18M280 40l-22-18M280 112l0 0" fill="none" stroke="#ffffff14" />
        <path d="M84 112L62 94M62 22l22 18M84 40h196M84 40v72" fill="none" stroke="#ffffff14" />
        {pts.map(([x, y], i) => {
          const [fx, fy] = floor(x, y);
          return (
            <g key={i}>
              <line x1={x} y1={y} x2={fx} y2={fy} stroke="#ffffff2b" strokeDasharray="2 3" />
              <circle cx={fx} cy={fy} r="3.4" fill="rgba(255,255,255,0.42)" />
              <circle cx={x} cy={y} r="4" fill="#fff" />
            </g>
          );
        })}
        <text x="66" y="16" className="gd-art-n">{t.far3d}</text>
        <text x="106" y="136" className="gd-art-n">{t.near2d}</text>
        <text x="248" y="136" className="gd-art-n" textAnchor="end">{t.shadow}</text>
      </svg>
    </div>
  );
}

/* ---- 5. los muelles ---- */

/** El grafo de juguete, soltándose de verdad.
 *
 *  Es la única lámina con bucle de render, y se apaga sola: en cuanto la
 *  simulación se enfría por debajo de `COLD` deja de pedir cuadros. Un panel de
 *  texto con un `requestAnimationFrame` encendido para siempre es una batería
 *  que se va sin que nadie mire nada.
 *
 *  Con `prefers-reduced-motion` no se anima: se dan los pasos de golpe y se
 *  enseña el resultado, que sigue siendo el argumento (los dos grupos salen
 *  solos) sin nada moviéndose en pantalla. */
function FigSpring({ t }: { t: FigCopy }) {
  const [seed, setSeed] = useState(7);
  const [, tick] = useState(0);
  const mini = useRef<Mini | null>(null);
  const still = useMemo(
    () => typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  if (!mini.current) mini.current = miniGraph(seed);

  useEffect(() => {
    const m = miniGraph(seed);
    mini.current = m;
    if (still) { miniStep(m, 240); tick(k => k + 1); return; }
    let raf = 0;
    const COLD = 2e-4;
    const loop = () => {
      miniStep(m, 1);
      tick(k => k + 1);
      if (miniHeat(m) > COLD) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [seed, still]);

  const m = mini.current;
  // De las unidades de la caja (± 1,2 largos) a las 320×150 del dibujo.
  const SX = 62, X0 = 160, Y0 = 74;
  const px = (i: number) => X0 + m.pos[i * 2] * SX;
  const py = (i: number) => Y0 + m.pos[i * 2 + 1] * SX;
  const col = ["#fff", "#fff"];
  const edge = [rampCss(0.08), rampCss(0.55)];

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 150" className="gd-art" {...ART} role="img" aria-hidden="true">
        {m.links.map(([a, b], i) => (
          <line
            key={i}
            x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)}
            stroke={m.group[a] === m.group[b] ? edge[m.group[a]] : "rgba(255,255,255,0.34)"}
            strokeWidth={m.group[a] === m.group[b] ? 1.2 : 1}
            strokeDasharray={m.group[a] === m.group[b] ? undefined : "2 2"}
          />
        ))}
        {Array.from({ length: m.group.length }, (_, i) => (
          <circle key={i} cx={px(i)} cy={py(i)} r="2.8" fill={col[m.group[i]]} />
        ))}
      </svg>
      <div className="gd-fig-acts">
        <button className="gd-pill" onClick={() => setSeed(Math.floor(Math.random() * 1e6))}>
          {t.again}
        </button>
        <span className="gd-cap">{miniHeat(m) > 2e-4 ? t.loose : t.settled}</span>
      </div>
    </div>
  );
}

/* ---- 6. la rampa ---- */

/** El anillo de tonos y tres regiones que sacan su color de él por su ángulo.
 *
 *  Los colores salen de `rampCss`, la misma función que tiñe la galaxia: una
 *  segunda rampa copiada aquí se quedaría desfasada en cuanto se toque la
 *  primera, y entonces la explicación del color dejaría de describir el color.
 *  Es la misma regla que ya sigue la tercera lámina de la presentación. */
function FigRamp({ t }: { t: FigCopy }) {
  const N = 72;
  const CX = 76, CY = 70;
  const spokes = Array.from({ length: N }, (_, i) => {
    const p = i / N;
    const a = p * Math.PI * 2 - Math.PI / 2;
    const co = Math.cos(a), si = Math.sin(a);
    return {
      x1: CX + co * 26, y1: CY + si * 26,
      x2: CX + co * 36, y2: CY + si * 36,
      col: rampCss(p),
    };
  });
  // Tres barrios en la nube de la derecha, con el ángulo de su centro medido
  // desde el centro de la nube: es literalmente la regla del atlas.
  const BX = 232, BY = 70;
  const blobs = [
    { a: 0.06, r: 30 }, { a: 0.20, r: 34 }, { a: 0.62, r: 28 },
  ].map(({ a, r }) => {
    const rad = a * Math.PI * 2 - Math.PI / 2;
    return { x: BX + Math.cos(rad) * r, y: BY + Math.sin(rad) * r, col: rampCss(a), a };
  });
  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 150" className="gd-art" {...ART} role="img" aria-hidden="true">
        {spokes.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.col} strokeWidth="3.4" />
        ))}
        <text x={CX} y="132" className="gd-art-n" textAnchor="middle">{t.ring}</text>

        <circle cx={BX} cy={BY} r="42" fill="none" stroke="#ffffff14" strokeDasharray="3 3" />
        {blobs.map((b, i) => (
          <g key={i}>
            <line x1={BX} y1={BY} x2={b.x} y2={b.y} stroke="#ffffff2b" strokeWidth="1" />
            {/* Cada barrio: media docena de nodos blancos sobre su propia malla
                teñida, que es como se ve en la galaxia de detrás. */}
            {Array.from({ length: 6 }, (_, k) => {
              const an = (k / 6) * Math.PI * 2 + i;
              const x = b.x + Math.cos(an) * 9, y = b.y + Math.sin(an) * 9;
              const nx = b.x + Math.cos(an + 1.05) * 9, ny = b.y + Math.sin(an + 1.05) * 9;
              return (
                <g key={k}>
                  <line x1={x} y1={y} x2={nx} y2={ny} stroke={b.col} strokeWidth="1.4" />
                  <circle cx={x} cy={y} r="1.9" fill="#fff" />
                </g>
              );
            })}
          </g>
        ))}
        <text x={BX} y="132" className="gd-art-n" textAnchor="middle">{t.zones}</text>
      </svg>
    </div>
  );
}

/* ---- 7. la analogía ---- */

/** El paralelogramo. Dos flechas paralelas: la que va de «hombre» a «rey» y la
 *  misma, calcada, saliendo de «mujer». Donde cae la punta no hay ninguna
 *  palabra; la más cercana es la respuesta. */
function FigAnalogy({ t }: { t: FigCopy }) {
  const A: [number, number] = [78, 104];   // hombre
  const B: [number, number] = [78, 40];    // rey
  const C: [number, number] = [206, 112];  // mujer
  const D: [number, number] = [206, 48];   // reina
  const dot = (p: [number, number], w: string, ghost = false) => (
    <g>
      <circle cx={p[0]} cy={p[1]} r={ghost ? 5 : 4} fill={ghost ? "none" : "#fff"}
        stroke={ghost ? "#ffffff5c" : "none"} strokeDasharray={ghost ? "2 2" : undefined} />
      <text x={p[0] + 9} y={p[1] + 4} className="gd-art-w gd-art-sm">{w}</text>
    </g>
  );
  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 148" className="gd-art" {...ART} role="img" aria-hidden="true">
        <defs>
          <marker id="gd-tip" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M1 1l5 3-5 3" fill="none" stroke="#fff" strokeWidth="1.3" />
          </marker>
        </defs>
        <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1] + 8} stroke="#fff" strokeWidth="1.6" markerEnd="url(#gd-tip)" />
        <line x1={C[0]} y1={C[1]} x2={D[0]} y2={D[1] + 8} stroke="#fff" strokeWidth="1.6"
          strokeDasharray="4 3" markerEnd="url(#gd-tip)" />
        {dot(A, t.ana[1])}
        {dot(B, t.ana[0])}
        {dot(C, t.ana[2])}
        {dot(D, t.ana[3], true)}
        <text x="96" y="76" className="gd-art-n">{t.ana[0]} − {t.ana[1]}</text>
        <text x="224" y="84" className="gd-art-n">+ {t.ana[2]}</text>
      </svg>
    </div>
  );
}

/* ---- 8. un vector, dos sentidos ---- */

/** Dos barrios y una sola palabra atada a los dos: el punto acaba en un sitio
 *  donde no está ninguno de sus dos sentidos del todo. */
function FigSense({ t }: { t: FigCopy }) {
  const left = t.sense.left.map((w, i) => ({ w, x: 46, y: 34 + i * 30 }));
  const right = t.sense.right.map((w, i) => ({ w, x: 258, y: 34 + i * 30 }));
  const MX = 152, MY = 64;
  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 132" className="gd-art" {...ART} role="img" aria-hidden="true">
        {[...left, ...right].map((p, i) => (
          <g key={i}>
            <line x1={p.x} y1={p.y} x2={MX} y2={MY} stroke="#ffffff1f" strokeWidth="1" />
            <circle cx={p.x} cy={p.y} r="2.6" fill="rgba(255,255,255,0.5)" />
            <text
              x={p.x + (p.x < MX ? -7 : 7)} y={p.y + 4}
              className="gd-art-w gd-art-sm"
              textAnchor={p.x < MX ? "end" : "start"}
            >
              {p.w}
            </text>
          </g>
        ))}
        <circle cx={MX} cy={MY} r="12" fill="rgba(255,255,255,0.09)" />
        <circle cx={MX} cy={MY} r="4.4" fill="#fff" />
        <text x={MX} y={MY + 34} className="gd-art-w" textAnchor="middle">{t.sense.word}</text>
      </svg>
    </div>
  );
}

/* =========================== los capítulos =========================== */

type FigKey = "bars" | "ctx" | "cos" | "flat" | "spring" | "ramp" | "ana" | "sense";

const FIGS: Record<FigKey, (p: { t: FigCopy; ref?: number }) => JSX.Element> = {
  bars: FigBars, ctx: FigContext, cos: FigCos, flat: FigFlat,
  spring: FigSpring, ramp: FigRamp, ana: FigAnalogy, sense: FigSense,
};

interface Chapter {
  /** Rótulo corto del índice. Dos palabras: la columna mide 9 rem. */
  tab: string;
  head: string;
  lede: string;
  body: string[];
  /** Bloques con título propio: los límites y el glosario. */
  list?: [string, string][];
  /** La lista lleva icono delante, en el orden de `TOOL_ICOS`. */
  icons?: boolean;
  note: string;
  fig?: FigKey;
}

const ES: Chapter[] = [
  {
    tab: "los números",
    head: "Una palabra es una lista de números",
    lede: "Un embedding no es una idea abstracta: es una fila de 300 números, y hay una por palabra.",
    body: [
      "Un modelo leyó millones de frases y le dejó a cada palabra una fila de números. No los eligió nadie a mano: salieron de un entrenamiento que sólo miraba en qué compañía aparece cada palabra.",
      "Ninguno de esos 300 números significa nada por separado. No hay una casilla de «animal» ni otra de «triste» — si buscas la número 42 no encontrarás un concepto, encontrarás un número. Lo que dice algo es la fila entera: dos palabras con filas parecidas se usan en sitios parecidos.",
      "Debajo, tres palabras con una lista de juguete de 24 números. Cambia con quién se compara la primera y mira la silueta de las barras.",
    ],
    note: "50.000 palabras por idioma, de los vectores fastText, 300 números cada una. Las barras del dibujo son de juguete: 300 no se distinguirían a este tamaño.",
    fig: "bars",
  },
  {
    tab: "de dónde salen",
    head: "Los números salen de la compañía",
    lede: "Dime con quién apareces y te diré qué eres. Ése es todo el truco, y es de 1954.",
    body: [
      "El entrenamiento juega a un juego tonto durante millones de frases: tapa una palabra y trata de adivinarla mirando sólo las que la rodean. Cada vez que falla, mueve un poquito los números de las palabras implicadas.",
      "Después de unos cuantos millones de intentos, dos palabras que caben en los mismos huecos han acabado con números parecidos — aunque no hayan aparecido nunca juntas en la misma frase. Nadie le dijo al modelo que «gato» es un animal. Se lo dijeron los huecos.",
      "Elige una palabra y mira en qué frases entra.",
    ],
    note: "Se llama hipótesis distribucional. El modelo no sabe qué es un gato: sabe dónde se dice «gato».",
    fig: "ctx",
  },
  {
    tab: "el parecido",
    head: "Parecerse es un ángulo",
    lede: "Dos palabras se parecen si sus flechas apuntan al mismo sitio. Lo largas que sean da igual.",
    body: [
      "Una fila de 300 números es una flecha que sale del origen. Para comparar dos no se mide lo lejos que están las puntas: se mide el ángulo que forman. El coseno de ese ángulo es el número que verás por todo el atlas.",
      "Vale 1 si apuntan exactamente igual, 0 si son perpendiculares —no tienen nada que ver— y −1 si son opuestas. Entre palabras de un mismo idioma casi nunca baja de cero: todas comparten algo por el hecho de ser palabras.",
      "Arrastra la flecha blanca. La regla de la derecha dice dónde cae ese ángulo.",
    ],
    note: "Todos los números del atlas son este coseno, medido sobre los 300 números originales. Nunca es la distancia que ves en pantalla.",
    fig: "cos",
  },
  {
    tab: "300 dimensiones",
    head: "300 dimensiones no se pueden mirar",
    lede: "Y aplanarlas cuesta caro: siempre se junta algo que estaba lejos.",
    body: [
      "Una pantalla tiene dos dimensiones y tus ojos aguantan tres. Los vectores tienen 300, y no es un capricho: hace falta ese espacio para que cincuenta mil palabras quepan sin pisarse unas a otras.",
      "Lo normal es aplanar —PCA, t-SNE, UMAP— y dibujar el resultado. Toda proyección pierde lo mismo que pierde una sombra: dos puntos separados en profundidad caen en el mismo sitio del suelo, y en el dibujo parecen hermanos.",
      "Este atlas no aplana. Coloca, que es otra cosa, y de eso va el capítulo siguiente.",
    ],
    note: "El comparador enseña ese daño con un número: el «% de distancia perdida al aplanar» que aparece bajo su constelación.",
    fig: "flat",
  },
  {
    tab: "los muelles",
    head: "Cómo se colocó esta galaxia",
    lede: "Con muelles. Cada palabra tira de las que más se le parecen y empuja a todas las demás.",
    body: [
      "Primero se calcula, en 300 dimensiones, quiénes son los vecinos más cercanos de cada palabra. Eso da un grafo: cincuenta mil nodos y unos cuantos cientos de miles de aristas, cada una con su parecido.",
      "Después el grafo se suelta en 3D desde posiciones al azar. Cada arista es un muelle que tira; entre todos los nodos hay un empujón que separa. Y ya está: lo que ves girando ahí detrás es ese amasijo buscando su sitio, en vivo.",
      "Los barrios no se dibujaron: aparecen. Nadie le dice a la simulación cuántos grupos hay ni dónde ponerlos. Debajo, el mismo experimento con 28 nodos en dos grupos atados por dentro y un solo puente entre ellos.",
    ],
    note: "La galaxia de detrás hace exactamente esto en la GPU, con 50.000 nodos, sin que las posiciones vuelvan a pasar por la CPU en ningún momento.",
    fig: "spring",
  },
  {
    tab: "el color",
    head: "El color es el barrio",
    lede: "Los puntos son blancos. Todo el color lo ponen las hebras, y no es decoración.",
    body: [
      "Al grafo se le buscan comunidades: grupos de palabras mucho más conectadas entre sí que con el resto. Cada comunidad es una región, y el panel de regiones las lista con sus tres palabras más frecuentes — nadie las ha etiquetado a mano.",
      "El tono de una región sale de dónde está: se mira el ángulo de su centro dentro de la nube y se busca ese ángulo en una rampa de colores que cierra sobre sí misma. Dos regiones que se tocan reciben tonos contiguos.",
      "Por eso el color se lee como vecindad y no como etiqueta: si dos zonas tienen tonos parecidos es porque están cerca, no porque alguien haya decidido agruparlas.",
    ],
    note: "La rampa tiene que cerrar sobre sí misma. Si no, la galaxia se partiría por una costura, justo donde el último tono no empalma con el primero.",
    fig: "ramp",
  },
  {
    tab: "la aritmética",
    head: "Restar y sumar significados",
    lede: "rey − hombre + mujer. La resta de dos vectores es una dirección, y una dirección se puede aplicar a un tercero.",
    body: [
      "Si a «rey» le quitas «hombre», lo que queda es una dirección: lo que hace a un rey algo más que un hombre. Súmasela a «mujer» y caes en un punto del espacio donde no vive ninguna palabra… pero la más cercana suele ser «reina».",
      "No siempre sale, y cuando falla suele ser lo más interesante de mirar. Hay un detalle que no es opcional: las tres palabras de la pregunta se excluyen de la respuesta. Sin eso, lo más parecido a «rey − hombre + mujer» es «rey».",
      "El panel de analogías lo hace de verdad, contra las 50.000 palabras.",
    ],
    note: "Es la única pregunta del atlas que no se contesta con el grafo: hay que bajarse los 300 números de todas las palabras, 15 MB, y por eso sólo se descargan al pulsar.",
    fig: "ana",
  },
  {
    tab: "lo que no dice",
    head: "Lo que este mapa no dice",
    lede: "Cuatro cosas que conviene tener delante antes de sacar conclusiones de un dibujo bonito.",
    body: [
      "Un embedding es un retrato del uso, no un diccionario ni una verdad. Estas cuatro limitaciones no son defectos de esta implementación: las tiene el modelo.",
    ],
    list: [
      ["Una palabra, un vector", "«Banco» tiene un solo punto, y los dos sentidos —el del dinero y el de sentarse— se promedian en él. El punto acaba en un sitio donde no está del todo ninguno de los dos."],
      ["El modelo repite su corpus", "Aprendió de textos escritos por gente, con sus asociaciones dentro. Que dos palabras estén cerca dice cómo se usan, no cómo deberían usarse."],
      ["La distancia en pantalla no es la de verdad", "Colocar 300 dimensiones en 3 deja errores. Dos palabras pueden verse juntas sin parecerse: si quieres el número, míralo en la ficha o en el comparador."],
      ["Sólo hay 50.000 palabras, y podadas", "Faltan las raras, y el grafo recortado deja islas: dos palabras pueden no tener ningún camino entre ellas."],
    ],
    note: "Ningún número del atlas está redondeado a tu favor: todos salen de los mismos 300 números, y el pie de cada panel dice de dónde.",
    fig: "sense",
  },
  {
    tab: "qué hacer",
    head: "Qué puedes hacer aquí",
    lede: "Nueve gestos. Todo lo que se coge se suelta con «Esc», con un clic en el vacío o con el botón de la píldora de arriba.",
    body: [],
    icons: true,
    list: [
      ["Orbitar", "arrastra con el ratón, o usa las flechas. La rueda acerca y aleja."],
      ["Abrir una palabra", "clic en cualquier punto: sale su ficha con sus vecinos más cercanos y su parecido."],
      ["Buscar", "escribe en la caja del cajón izquierdo y la cámara vuela hasta la palabra."],
      ["Trazar un camino", "desde la ficha, «camino hasta…»: los saltos por el grafo entre dos palabras."],
      ["Comparar", "hasta cinco palabras a la vez, con su matriz de parecidos y su constelación."],
      ["Familias", "«*mente» enciende de golpe todas las que acaban igual. Salpican todos los barrios, y eso es la prueba de que aquí agrupa el significado."],
      ["Analogías", "rey − hombre + mujer, resuelto contra las 50.000."],
      ["Regiones", "la leyenda del color: pasa el ratón para encender una zona sin mover la cámara."],
      ["Compartir", "el botón de la barra copia un enlace con la vista exacta que estás viendo."],
    ],
    note: "Si te pierdes: el botón de vista completa, la tecla «Inicio», o la píldora que aparece en el lienzo en cuanto te alejas.",
  },
  {
    tab: "glosario",
    head: "Glosario",
    lede: "Las ocho palabras que hacen falta para leer el resto del atlas.",
    body: [],
    list: [
      ["Embedding", "la representación de una palabra como una lista de números, aprendida a partir de textos. Este atlas dibuja 50.000 de ellos."],
      ["Vector", "esa lista de números, vista como una flecha en un espacio de tantas dimensiones como números tenga. Aquí, 300."],
      ["Dimensión", "cada una de las 300 casillas. Por separado no significan nada; el significado está repartido entre todas."],
      ["Coseno", "el número que mide el parecido: el coseno del ángulo entre dos vectores. De −1 a 1, y aquí casi siempre entre 0 y 1."],
      ["kNN", "los k vecinos más cercanos. Para cada palabra, las que tienen el coseno más alto con ella. Es lo que forma el grafo."],
      ["Grafo", "nodos y aristas. Aquí: una palabra por nodo y una arista por cada par de vecinos cercanos, con su parecido de peso."],
      ["Comunidad o región", "un grupo de nodos mucho más conectados entre sí que con el resto. Es lo que el color dibuja."],
      ["Palabra vacía", "«de», «la», «que»: palabras muy frecuentes y de poco contenido. Aquí no se borran, se marcan — son parte legítima del modelo."],
    ],
    note: "fastText, los vectores de partida, es de Facebook AI Research y se publica bajo CC BY-SA 3.0. El atlas los usa tal cual, sin reentrenar nada.",
  },
];

const EN: Chapter[] = [
  {
    tab: "the numbers",
    head: "A word is a list of numbers",
    lede: "An embedding is not an abstract idea: it is a row of 300 numbers, one per word.",
    body: [
      "A model read millions of sentences and left each word with a row of numbers. Nobody picked them by hand: they came out of a training run that only ever looked at what company each word keeps.",
      "None of those 300 numbers means anything on its own. There is no “animal” slot and no “sad” slot — look up number 42 and you will find a number, not a concept. What carries meaning is the whole row: two words with similar rows get used in similar places.",
      "Below, three words with a toy list of 24 numbers. Change what the first one is compared against and watch the silhouette.",
    ],
    note: "50,000 words per language, from the fastText vectors, 300 numbers each. The bars in the figure are a toy: 300 of them would be indistinguishable at this size.",
    fig: "bars",
  },
  {
    tab: "where from",
    head: "The numbers come from the company",
    lede: "You shall know a word by the company it keeps. That is the whole trick, and it dates from 1954.",
    body: [
      "Training plays a silly game across millions of sentences: cover one word and try to guess it from the ones around it. Every time it misses, it nudges the numbers of the words involved.",
      "After a few million tries, two words that fit the same holes have ended up with similar numbers — even if they never once appeared in the same sentence. Nobody told the model that a cat is an animal. The holes did.",
      "Pick a word and see which sentences it fits.",
    ],
    note: "It is called the distributional hypothesis. The model does not know what a cat is: it knows where “cat” gets said.",
    fig: "ctx",
  },
  {
    tab: "likeness",
    head: "Being alike is an angle",
    lede: "Two words are alike if their arrows point the same way. How long they are does not matter.",
    body: [
      "A row of 300 numbers is an arrow leaving the origin. To compare two of them you do not measure how far apart the tips are: you measure the angle between them. The cosine of that angle is the number you will see all over the atlas.",
      "It is 1 if they point exactly the same way, 0 if they are perpendicular — nothing to do with each other — and −1 if they are opposite. Between words of one language it almost never drops below zero: they all share something by virtue of being words.",
      "Drag the white arrow. The ruler on the right says where that angle lands.",
    ],
    note: "Every number in the atlas is this cosine, measured on the original 300 numbers. It is never the distance you see on screen.",
    fig: "cos",
  },
  {
    tab: "300 dimensions",
    head: "300 dimensions cannot be looked at",
    lede: "And flattening them is expensive: something that was far apart always ends up together.",
    body: [
      "A screen has two dimensions and your eyes stretch to three. The vectors have 300, and that is not showing off: that much room is what lets fifty thousand words sit without treading on each other.",
      "The usual move is to flatten — PCA, t-SNE, UMAP — and draw the result. Every projection loses what a shadow loses: two points separated in depth land on the same spot on the floor, and in the drawing they look like siblings.",
      "This atlas does not flatten. It arranges, which is a different thing, and that is the next chapter.",
    ],
    note: "The comparator shows that damage as a number: the “% of distance lost when flattening” printed under its constellation.",
    fig: "flat",
  },
  {
    tab: "the springs",
    head: "How this galaxy was arranged",
    lede: "With springs. Each word pulls on the ones it most resembles and pushes everything else away.",
    body: [
      "First, in 300 dimensions, each word's nearest neighbours are computed. That gives a graph: fifty thousand nodes and a few hundred thousand edges, each carrying its similarity.",
      "Then the graph is let go in 3D from random positions. Every edge is a spring that pulls; between all nodes there is a shove that separates. That is all: what you see turning back there is that tangle finding its place, live.",
      "The neighbourhoods were not drawn: they emerge. Nobody tells the simulation how many groups there are or where to put them. Below, the same experiment with 28 nodes in two groups, tied inside and with a single bridge between them.",
    ],
    note: "The galaxy behind this does exactly the same on the GPU, with 50,000 nodes, without the positions ever coming back to the CPU.",
    fig: "spring",
  },
  {
    tab: "the colour",
    head: "The colour is the neighbourhood",
    lede: "The dots are white. All the colour comes from the threads, and it is not decoration.",
    body: [
      "The graph is searched for communities: groups of words far more connected to each other than to the rest. Each community is a region, and the regions panel lists them by their three most frequent words — nobody labelled them by hand.",
      "A region's hue comes from where it sits: the angle of its centre inside the cloud is looked up in a colour ramp that closes on itself. Two regions that touch get neighbouring hues.",
      "That is why colour reads as nearness rather than as a label: if two zones have similar hues it is because they are close, not because somebody decided to group them.",
    ],
    note: "The ramp has to close on itself. Otherwise the galaxy would split along a seam, right where the last hue fails to meet the first.",
    fig: "ramp",
  },
  {
    tab: "the arithmetic",
    head: "Subtracting and adding meanings",
    lede: "king − man + woman. The difference of two vectors is a direction, and a direction can be applied to a third.",
    body: [
      "Take “man” away from “king” and what is left is a direction: whatever makes a king more than a man. Add it to “woman” and you land on a point where no word lives… but the nearest one is usually “queen”.",
      "It does not always work, and the failures are often the most interesting part. One detail is not optional: the three words asked about are excluded from the answer. Without that, the closest thing to “king − man + woman” is “king”.",
      "The analogies panel does it for real, against all 50,000 words.",
    ],
    note: "It is the one question in the atlas the graph cannot answer: it needs the 300 numbers of every word, 15 MB, which is why they are only downloaded when you press the button.",
    fig: "ana",
  },
  {
    tab: "what it omits",
    head: "What this map does not say",
    lede: "Four things worth keeping in view before drawing conclusions from a pretty picture.",
    body: [
      "An embedding is a portrait of usage, not a dictionary and not a truth. These four limits are not flaws of this implementation: the model has them.",
    ],
    list: [
      ["One word, one vector", "“Bank” has a single point, and both senses — the money one and the river one — are averaged into it. The point ends up somewhere neither sense fully lives."],
      ["The model repeats its corpus", "It learned from text written by people, associations included. Two words being close says how they are used, not how they ought to be."],
      ["On-screen distance is not the real one", "Placing 300 dimensions into 3 leaves error. Two words can look adjacent without being alike: if you want the number, read it on the card or in the comparator."],
      ["Only 50,000 words, and pruned", "The rare ones are missing, and the trimmed graph leaves islands: two words may have no path between them at all."],
    ],
    note: "No number in the atlas is rounded in your favour: they all come from the same 300 numbers, and every panel's footer says where from.",
    fig: "sense",
  },
  {
    tab: "what to do",
    head: "What you can do here",
    lede: "Nine gestures. Everything you pick up is let go with “Esc”, with a click on empty space, or with the button on the pill at the top.",
    body: [],
    icons: true,
    list: [
      ["Orbit", "drag with the mouse, or use the arrow keys. The wheel moves in and out."],
      ["Open a word", "click any dot: its card appears with its nearest neighbours and their similarity."],
      ["Search", "type in the box on the left drawer and the camera flies to the word."],
      ["Trace a path", "from the card, “path to…”: the hops through the graph between two words."],
      ["Compare", "up to five words at once, with their similarity matrix and their constellation."],
      ["Families", "“*ly” lights up every word with that ending at once. They scatter across every neighbourhood, which is the proof that meaning is what groups here."],
      ["Analogies", "king − man + woman, solved against all 50,000."],
      ["Regions", "the colour legend: hover to light a zone up without moving the camera."],
      ["Share", "the toolbar button copies a link holding the exact view you are looking at."],
    ],
    note: "If you get lost: the whole-galaxy button, the “Home” key, or the pill that appears on the canvas as soon as you drift away.",
  },
  {
    tab: "glossary",
    head: "Glossary",
    lede: "The eight words you need to read the rest of the atlas.",
    body: [],
    list: [
      ["Embedding", "a word represented as a list of numbers, learned from text. This atlas draws 50,000 of them."],
      ["Vector", "that list of numbers, seen as an arrow in a space with as many dimensions as it has numbers. Here, 300."],
      ["Dimension", "each of the 300 slots. On their own they mean nothing; meaning is spread across all of them."],
      ["Cosine", "the number that measures likeness: the cosine of the angle between two vectors. From −1 to 1, and here almost always between 0 and 1."],
      ["kNN", "the k nearest neighbours. For each word, the ones with the highest cosine against it. This is what forms the graph."],
      ["Graph", "nodes and edges. Here: one word per node, one edge per close-neighbour pair, weighted by their similarity."],
      ["Community or region", "a set of nodes far more connected to each other than to the rest. It is what the colour draws."],
      ["Stop word", "“the”, “of”, “that”: very frequent, low-content words. They are not deleted here, only flagged — they are a legitimate part of the model."],
    ],
    note: "fastText, the source vectors, is from Facebook AI Research and published under CC BY-SA 3.0. The atlas uses them as they are, retraining nothing.",
  },
];

const FIG_COPY: Record<string, FigCopy> = {
  es: {
    words: ["gato", "perro", "lunes"],
    pairNear: "gato · perro",
    pairFar: "gato · lunes",
    cos: "coseno",
    frames: [
      { text: "el ___ dormía encima del sofá", fits: [0, 1] },
      { text: "le puse comida al ___", fits: [0, 1] },
      { text: "el ___ que viene tengo cita", fits: [2] },
      { text: "todos los ___ por la mañana", fits: [2] },
    ],
    ctxPick: "elige una palabra",
    ctxFits: n => `entra en ${n} de las 4 frases`,
    angle: "ángulo entre las dos flechas",
    same: "la misma palabra",
    none: "sin relación",
    opposite: "lo contrario",
    neigh: "vecinos de esta galaxia",
    drag: "arrastra la flecha blanca",
    far3d: "lejos en la caja",
    near2d: "juntas en la sombra",
    shadow: "el suelo: dos dimensiones",
    loose: "buscando su sitio…",
    settled: "dos barrios que nadie pidió",
    again: "soltar otra vez",
    ring: "la rampa cierra",
    zones: "el ángulo da el tono",
    ana: ["rey", "hombre", "mujer", "¿reina?"],
    sense: {
      word: "banco",
      left: ["dinero", "crédito", "cuenta"],
      right: ["parque", "sentarse", "madera"],
    },
  },
  en: {
    words: ["cat", "dog", "monday"],
    pairNear: "cat · dog",
    pairFar: "cat · monday",
    cos: "cosine",
    frames: [
      { text: "the ___ slept on the sofa", fits: [0, 1] },
      { text: "I put food out for the ___", fits: [0, 1] },
      { text: "I have an appointment next ___", fits: [2] },
      { text: "every ___ morning", fits: [2] },
    ],
    ctxPick: "pick a word",
    ctxFits: n => `fits ${n} of the 4 sentences`,
    angle: "angle between the two arrows",
    same: "the same word",
    none: "unrelated",
    opposite: "the opposite",
    neigh: "neighbours in this galaxy",
    drag: "drag the white arrow",
    far3d: "far apart in the box",
    near2d: "together in the shadow",
    shadow: "the floor: two dimensions",
    loose: "finding its place…",
    settled: "two neighbourhoods nobody asked for",
    again: "let go again",
    ring: "the ramp closes",
    zones: "the angle gives the hue",
    ana: ["king", "man", "woman", "queen?"],
    sense: {
      word: "bank",
      left: ["money", "credit", "account"],
      right: ["river", "shore", "sit"],
    },
  },
};

const UI = {
  es: {
    eyebrow: "guía del atlas",
    close: "cerrar",
    intro: "ver la presentación",
    prev: "anterior",
    next: "siguiente",
    done: "volver a la galaxia",
    index: "índice de capítulos",
    of: (i: number, n: number) => `capítulo ${i} de ${n}`,
  },
  en: {
    eyebrow: "atlas guide",
    close: "close",
    intro: "watch the intro",
    prev: "previous",
    next: "next",
    done: "back to the galaxy",
    index: "chapter index",
    of: (i: number, n: number) => `chapter ${i} of ${n}`,
  },
};

/* Los iconos de la lista de gestos, en el orden en que van sus filas. Dibujados
   a mano y con el mismo trazo que los de la barra: son nueve y una dependencia
   de iconos pesa más que estas líneas. */
const TOOL_ICOS: (() => JSX.Element)[] = [
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <path d="M4 15a9 9 0 0116 0" strokeDasharray="2.4 2.2" />
      <path d="M9.5 6.5l9 3.2-3.6 1.5-1 3.7z" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <circle cx="12" cy="14" r="2.6" />
      <path d="M12 7.4V5M7.4 9.4L5.7 7.7M16.6 9.4l1.7-1.7" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M14.6 14.6L19 19" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
      <path d="M7 16.5l3.5-2M12.5 13.5l3.5-2" strokeDasharray="0.1 3" strokeWidth="2.2" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <circle cx="7" cy="8" r="3" />
      <circle cx="17" cy="16" r="3" />
      <path d="M9.2 10.2l5.6 3.6" strokeDasharray="2 1.6" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <path d="M4 7h16M4 12h10M4 17h6" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <path d="M5 12h6M8 9v6M15 12h4" />
      <circle cx="19" cy="12" r="0.6" fill="currentColor" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <path d="M12 4l7 4v8l-7 4-7-4V8z" />
      <path d="M12 12l7-4M12 12v8M12 12L5 8" />
    </svg>
  ),
  () => (
    <svg viewBox="0 0 24 24" {...ico} aria-hidden="true">
      <circle cx="17" cy="6" r="2.4" />
      <circle cx="7" cy="12" r="2.4" />
      <circle cx="17" cy="18" r="2.4" />
      <path d="M9.2 10.8l5.6-3.2M9.2 13.2l5.6 3.2" />
    </svg>
  ),
];

/* =========================== el cuadro =========================== */

export default function Guide({
  lang, ref, onClose, onIntro,
}: {
  lang: string;
  /** Parecido típico entre vecinos de la galaxia cargada, para la regla del
   *  coseno. Es opcional a propósito: la guía se abre igual antes de que los
   *  binarios hayan terminado de bajar. */
  ref?: number;
  onClose: () => void;
  onIntro: () => void;
}) {
  const chapters = lang === "en" ? EN : ES;
  const t = UI[lang as keyof typeof UI] ?? UI.es;
  const fc = FIG_COPY[lang] ?? FIG_COPY.es;

  const [i, setI] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const ch = chapters[i];
  const Fig = ch.fig ? FIGS[ch.fig] : null;
  const last = i === chapters.length - 1;

  useEffect(() => {
    from.current = document.activeElement;
    boxRef.current?.focus();
    return () => {
      const el = from.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  /** Al cambiar de capítulo, el cuerpo vuelve arriba. Sin esto, saltar del
   *  glosario —que es largo— al capítulo dos deja el texto empezado por la
   *  mitad y parece que falta el principio. */
  useEffect(() => { pageRef.current?.scrollTo({ top: 0 }); }, [i]);

  const go = useCallback(
    (k: number) => setI(v => Math.min(chapters.length - 1, Math.max(0, v + k))),
    [chapters.length],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      // Las flechas pasan de capítulo, salvo dentro de una lámina que las use
      // para lo suyo: la del coseno es un mando y sus flechas son el mando.
      const own = e.target instanceof Element && e.target.closest("[data-own-keys]");
      if (!own && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        go(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (e.key !== "Tab") return;
      const box = boxRef.current;
      if (!box) return;
      const f = [...box.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [tabindex='0']",
      )];
      if (!f.length) return;
      const first = f[0], lastEl = f[f.length - 1];
      const now = document.activeElement;
      if (e.shiftKey && (now === first || now === box)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && now === lastEl) { e.preventDefault(); first.focus(); }
    };
    // En captura, por lo mismo que en la presentación: el `Escape` de la galaxia
    // escucha en `window` y soltaría la selección de debajo en vez de cerrar.
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [onClose, go]);

  return (
    <div className="gd-veil" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className="gd"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gd-head"
        tabIndex={-1}
      >
        <header className="gd-top">
          <p className="eyebrow">{t.eyebrow}</p>
          <span className="gd-top-acts">
            <button className="gd-ghost" onClick={onIntro}>{t.intro}</button>
            <button className="gd-ghost" onClick={onClose}>{t.close} <kbd>esc</kbd></button>
          </span>
        </header>

        <div className="gd-main">
          {/* El índice. Es una columna de capítulos numerados y no unos puntos
              como en la presentación: con diez, un punto no dice a dónde lleva,
              y esto es un documento que se consulta, no una secuencia que se
              pasa. En móvil se convierte en una tira que se desliza. */}
          <nav className="gd-toc" aria-label={t.index}>
            {chapters.map((c, k) => (
              <button
                key={c.tab}
                className={"gd-toc-i" + (k === i ? " on" : "")}
                onClick={() => setI(k)}
                aria-current={k === i}
              >
                <b>{String(k + 1).padStart(2, "0")}</b>
                <span>{c.tab}</span>
              </button>
            ))}
          </nav>

          <div className="gd-page" ref={pageRef}>
            <h2 className="gd-head" id="gd-head">{ch.head}</h2>
            <p className="gd-lede">{ch.lede}</p>

            {Fig && <div className="gd-stage" key={ch.tab}><Fig t={fc} ref={ref} /></div>}

            {ch.body.map((p, k) => <p className="gd-body" key={k}>{p}</p>)}

            {ch.list && (
              <ul className={"gd-list" + (ch.icons ? " gd-list-i" : "")}>
                {ch.list.map(([term, text], k) => {
                  const Ico = ch.icons ? TOOL_ICOS[k] : null;
                  return (
                    <li key={term}>
                      {Ico && <span className="gd-list-ico"><Ico /></span>}
                      <span>
                        <b>{term}</b>
                        <span className="gd-list-t"> — {text}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="gd-note">{ch.note}</p>
          </div>
        </div>

        <footer className="gd-foot">
          <span className="gd-count">{t.of(i + 1, chapters.length)}</span>
          <span className="gd-foot-acts">
            {i > 0 && <button className="gd-back" onClick={() => go(-1)}>{t.prev}</button>}
            <button className="gd-go" onClick={() => (last ? onClose() : go(1))}>
              {last ? t.done : t.next}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
