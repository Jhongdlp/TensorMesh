import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { loadGalaxy, neighbours, type Galaxy } from "../galaxy/loader";
import { zoneColours } from "../galaxy/palette.mjs";
import { GalaxyScene } from "../galaxy/scene";
import { GpuEngine, gpuAvailable, DEFAULTS, type Params } from "../galaxy/gpu/engine";
import Controls from "./Controls";
import KeyHelp from "./KeyHelp";
import WordSearch from "./WordSearch";
import { buildIndex, resolve } from "../galaxy/search.mjs";
import { shortestPath, hops } from "../galaxy/path.mjs";

const LANGS = [
  { id: "es", name: "español" },
  { id: "en", name: "english" },
];

const COPY = {
  es: { search: "buscar una palabra…", words: "palabras", edges: "aristas",
        regions: "regiones", loading: "cargando binarios…", region: "región",
        freq: "frecuencia", stop: "palabra vacía",
        live: "webgpu · simulación viva", static: "webgl · posiciones fijas",
        hint: "pasa el ratón sobre un punto · clic para abrirlo",
        keys: "teclas",
        nbrs: "vecinos más cercanos",
        pathTo: "camino hasta…", pathHead: "camino", pathBack: "volver a la palabra",
        steps: (k: number) => `${k} ${k === 1 ? "salto" : "saltos"}`,
        pathNone: (a: string, b: string) =>
          `no hay camino de «${a}» a «${b}»: el grafo podado deja islas`,
        tools: "herramientas",
        open: "desplegar", close: "plegar", whole: "vista completa",
        navOrbit: "órbita", navFly: "vuelo",
        foot: "similitud coseno en 300D — no la distancia que ves",
        missing: (q: string, n: number) => `«${q}» no está en las ${n} palabras de esta galaxia` },
  en: { search: "search a word…", words: "words", edges: "edges",
        regions: "regions", loading: "loading binaries…", region: "region",
        freq: "frequency", stop: "stop word",
        live: "webgpu · live simulation", static: "webgl · fixed positions",
        hint: "hover a dot · click to open it",
        keys: "keys",
        nbrs: "nearest neighbours",
        pathTo: "path to…", pathHead: "path", pathBack: "back to the word",
        steps: (k: number) => `${k} ${k === 1 ? "hop" : "hops"}`,
        pathNone: (a: string, b: string) =>
          `no path from “${a}” to “${b}”: the pruned graph leaves islands`,
        tools: "tools",
        open: "expand", close: "collapse", whole: "whole galaxy",
        navOrbit: "orbit", navFly: "fly",
        foot: "cosine similarity in 300D — not the distance you see",
        missing: (q: string, n: number) => `“${q}” is not among this galaxy's ${n} words` },
};

/** Iconos de la barra. Trazo en `currentColor` y `24×24`, dibujados a mano y
 *  no traídos de una librería: son cuatro, y una dependencia de iconos pesa
 *  más que estas líneas. El `stroke-width` es 1.5 para que a 15 px no se
 *  empasten — a 2 el círculo de la órbita se cierra en una mancha. */
const ico = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const IcoChevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...ico} aria-hidden="true">
    <path d={open ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} />
  </svg>
);

/** Órbita: el cuerpo quieto y la vista dando la vuelta alrededor. */
const IcoOrbit = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...ico} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-24 12 12)" />
  </svg>
);

/** Vuelo: la cámara suelta, avanzando. */
const IcoFly = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...ico} aria-hidden="true">
    <path d="M4 12l16-7-5.5 7 5.5 7z" />
  </svg>
);

/** Vista completa: el encuadre que abarca la galaxia entera. */
const IcoFit = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" {...ico} aria-hidden="true">
    <path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

/** Lo que la vista necesita, sea cual sea el motor debajo. */
interface Viewer {
  select(id: number | null): void;
  /** Resalta un camino entero. Mismo canal `dim` que `select`: no es un objeto
   *  nuevo en la escena, es otro reparto de los mismos cuatro escalones. */
  selectPath(path: number[] | null): void;
  pick(x: number, y: number): Promise<number | null>;
  dispose(): void;
  /** Resalte de paso. Sólo el motor WebGPU puede permitírselo: allí cuesta
   *  cuatro bytes, y en WebGL habría que resubir el atributo entero. */
  hover?(id: number | null): void;
  setCameraMode?(mode: 'orbit' | 'fly'): void;
  /** Vuelve al encuadre completo. La tenían los dos motores atada a `Inicio`;
   *  ahora también es un botón, porque una tecla sin botón no la encuentra
   *  quien no despliega la leyenda. */
  goHome?(): void;
  /** Vuela hasta una palabra y encuadra su vecindario. */
  focus?(id: number): void | Promise<void>;
  /** Vuela hasta encuadrar un camino entero. */
  focusPath?(path: number[]): void | Promise<void>;
}

/** Intervalo de sondeo al pasar el ratón. Cada consulta es un dispatch sobre
 *  50.000 nodos más el mapeo de un buffer, así que no puede ir por evento. */
const HOVER_MS = 90;

export default function GalaxyView({ lang: initial = "es" }: { lang?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const engineRef = useRef<GpuEngine | null>(null);
  const deviceRef = useRef<GPUDevice | null>(null);
  const hoverAt = useRef(0);
  const hoverBusy = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // El idioma vive en la URL: enlaces compartibles y navegación atrás/adelante.
  const [lang, setLang] = useState(() => {
    if (typeof location === "undefined") return initial;
    const q = new URLSearchParams(location.search).get("lang");
    return LANGS.some(l => l.id === q) ? q! : initial;
  });
  const [g, setG] = useState<Galaxy | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  /** El camino que se está mirando, extremos incluidos. `null` con destino
   *  pedido es una respuesta legítima —la poda por kNN mutuo deja islas— y se
   *  cuenta por `error`, no dejando la ficha a medias. */
  const [path, setPath] = useState<number[] | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Params>({ ...DEFAULTS });
  const [fps, setFps] = useState(0);
  const [visible, setVisible] = useState({ nodes: 0, edges: 0, res: 1, lod: 1 });
  // null = aún sondeando. El motor se decide una vez y no cambia en caliente:
  // un canvas no puede tener contexto webgl y webgpu a la vez.
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fly'>('orbit');
  // El cajón izquierdo. Abierto de entrada: dentro está el buscador, que es la
  // única forma de llegar a una palabra concreta entre cincuenta mil. En mano
  // arranca plegado porque ahí tapa casi toda la galaxia — y con él tapada
  // quedaría la atribución, que no puede depender de un panel abierto.
  const [side, setSide] = useState(
    () => typeof window === "undefined" || window.innerWidth > 720,
  );
  const t = COPY[lang as keyof typeof COPY] ?? COPY.es;
  // El color de las aristas dice a qué zona pertenece cada palabra; la ficha
  // repite ese mismo color para que la relación sea legible sin adivinarla.
  const zones = useMemo(() => (g ? zoneColours(g) : null), [g]);
  // Índice de prefijos sin tildes. Se construye una vez por galaxia, junto a la
  // carga: ordenar 50.000 claves ya plegadas cuesta menos que el propio fetch.
  const index = useMemo(() => (g ? buildIndex(g) : null), [g]);
  // Fuera del `map`: recalcularlo por fila recorre el CSR del nodo otra vez.
  const road = useMemo(() => (g && path ? hops(g, path) : null), [g, path]);

  const switchTo = useCallback((id: string) => {
    setLang(id);
    const u = new URL(location.href);
    u.searchParams.set("lang", id);
    history.replaceState(null, "", u);
  }, []);

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(d => {
      if (dead) return;
      deviceRef.current = d;
      setGpu(!!d);
    });
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    let dead = false;
    setG(null); setSel(null); setPath(null);
    setHover(null); setError(null);
    loadGalaxy(`/data/${lang}`)
      .then(gal => { if (!dead) setG(gal); })
      .catch(e => { if (!dead) setError(String(e)); });
    return () => { dead = true; };
  }, [lang]);

  useEffect(() => {
    if (!g || gpu === null || !canvasRef.current) return;
    const device = deviceRef.current;
    if (gpu && device) {
      const e = new GpuEngine(device, canvasRef.current, g);
      Object.assign(e.params, params);
      e.setCameraMode?.(cameraMode);
      engineRef.current = e;
      viewerRef.current = e;
    } else {
      const s = new GalaxyScene(canvasRef.current, g);
      s.setCameraMode?.(cameraMode);
      engineRef.current = null;
      viewerRef.current = s;
    }
    return () => {
      viewerRef.current?.dispose();
      viewerRef.current = null;
      engineRef.current = null;
    };
    // params se aplica por referencia; no debe reconstruir el motor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, gpu]);

  useEffect(() => {
    viewerRef.current?.setCameraMode?.(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    if (!gpu) return;
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setFps(e.fps);
      setVisible({ ...e.visible });
    }, 400);
    return () => clearInterval(id);
  }, [gpu, g]);

  /** Único sitio donde cambia lo que se está mirando: una palabra (`b` nulo) o
   *  el camino de `a` a `b`. Las tres cosas que van juntas —resalte, cámara y
   *  URL— van juntas aquí, porque separarlas es como se desincronizan.
   *
   *  `focus` ya no sale de `engineRef` sino del visor: el respaldo WebGL
   *  también sabe volar, y colgarlo del motor WebGPU dejaba el vuelo muerto
   *  justo en el camino que se ve al abrir el navegador en esta máquina. */
  const show = useCallback((
    a: number | null,
    b: number | null,
    { fly = true, push = true }: { fly?: boolean; push?: boolean } = {},
  ) => {
    const v = viewerRef.current;
    setSel(a);
    setError(null);

    let p: number[] | null = null;
    if (g && a !== null && b !== null) p = shortestPath(g, a, b);
    setPath(p);

    if (p) {
      v?.selectPath(p);
      if (fly) void v?.focusPath?.(p);
    } else {
      // Seleccionar sin mover la cámara deja el resalte fuera de plano o
      // diminuto; el enfoque es parte del gesto, no un extra.
      v?.select(a);
      if (a !== null && fly) void v?.focus?.(a);
      if (g && a !== null && b !== null) setError(t.pathNone(g.labels[a], g.labels[b]));
    }

    if (push && g) {
      const u = new URL(location.href);
      const w = a === null ? null : g.labels[a];
      const to = p && b !== null ? g.labels[b] : null;
      if (w) u.searchParams.set("w", w); else u.searchParams.delete("w");
      if (to) u.searchParams.set("to", to); else u.searchParams.delete("to");
      // Una entrada de historial por palabra: «atrás» deshace el último salto,
      // que es lo que el gesto de ir saltando de vecino en vecino sugiere.
      if (u.href !== location.href) history.pushState(null, "", u);
    }
  }, [g, t]);

  const choose = useCallback(
    (id: number | null, fly = true) => show(id, null, { fly }),
    [show],
  );

  /** Lee `?w=` y `?to=` y los aplica sin volver a escribirlos. Es lo que hace
   *  que un enlace abra el atlas ya puesto en una palabra —el enganche que la
   *  fase de las lecciones necesita para decir «pincha aquí y mira»— y lo que
   *  da sentido al botón «atrás».
   *
   *  Pasa por `resolve`, no por igualdad de cadena: así un enlace escrito a
   *  mano y sin tildes sigue llegando a su palabra. */
  const applyUrl = useCallback(() => {
    if (!g || !index) return;
    const q = new URLSearchParams(location.search);
    const w = q.get("w");
    const a = w ? resolve(index, g, w) : -1;
    if (a < 0) { show(null, null, { push: false }); return; }
    const to = q.get("to");
    const b = to ? resolve(index, g, to) : -1;
    show(a, b < 0 ? null : b, { push: false });
  }, [g, index, show]);

  // Al arrancar. Va *después* del efecto que construye el motor, así que
  // `viewerRef` ya apunta a algo cuando esto corre.
  useEffect(() => {
    if (!g || gpu === null) return;
    applyUrl();
    // Sólo al montar la galaxia: reaplicarlo en cada cambio de `show`
    // pisaría la selección que el usuario acaba de hacer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, gpu, index]);

  useEffect(() => {
    const back = () => {
      const l = new URLSearchParams(location.search).get("lang");
      if (l && l !== lang && LANGS.some(x => x.id === l)) { setLang(l); return; }
      applyUrl();
    };
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, [applyUrl, lang]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const v = viewerRef.current;
    if (!v) return;
    const now = performance.now();
    if (hoverBusy.current || now - hoverAt.current < HOVER_MS) return;
    hoverAt.current = now;
    hoverBusy.current = true;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    v.pick(x, y)
      .then(id => {
        v.hover?.(id);
        setHover(id === null ? null : { id, x, y });
      })
      .catch(() => setHover(null))
      .finally(() => { hoverBusy.current = false; });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerStartRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const dist = Math.hypot(dx, dy);
    pointerStartRef.current = null;

    // Si arrastramos la cámara para volar/orbitar (dist > 6 px),
    // cancelamos la selección de nodos para evitar clicks accidentales.
    if (dist > 6) return;
    if (e.button !== 0) return;

    const v = viewerRef.current;
    if (!v) return;
    const r = e.currentTarget.getBoundingClientRect();
    choose(await v.pick(e.clientX - r.left, e.clientY - r.top));
  };

  const applyParams = useCallback((patch: Partial<Params>) => {
    setParams(p => {
      const next = { ...p, ...patch };
      if (engineRef.current) {
        Object.assign(engineRef.current.params, next);
        // La galaxia puede estar en reposo: sin esto el cambio no se vería
        // hasta que algo más forzara un frame.
        engineRef.current.invalidate();
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    engineRef.current?.reset();
    applyParams({ ...DEFAULTS });
  }, [applyParams]);

  const goHome = useCallback(() => viewerRef.current?.goHome?.(), []);

  const fmt = (n: number) => n.toLocaleString(lang === "en" ? "en" : "es");

  return (
    <div className={"galaxy-root" + (side ? " side-open" : "")}>
      <canvas
        ref={canvasRef}
        className={"galaxy-canvas" + (hover ? " over" : "")}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onMouseMove={onMove}
        onMouseLeave={() => {
          viewerRef.current?.hover?.(null);
          setHover(null);
          pointerStartRef.current = null;
        }}
      />

      {/* El vacío. Va *encima* del canvas y no debajo: el contexto se configura
          con `alphaMode: "opaque"` y el borrado pinta todos los píxeles, así que
          nada puesto detrás llegaría a verse. Y va en CSS y no en un shader
          porque un degradado a pantalla completa es una pasada más sobre 0,92
          Mpx dentro del presupuesto de frame, mientras que aquí es una capa
          estática que el compositor ya iba a mezclar de todos modos. */}
      <div className="veil" aria-hidden="true" />

      {hover && g && (
        <span className="tip" style={{ left: hover.x, top: hover.y }}>
          {g.labels[hover.id]}
        </span>
      )}

      {/* Cajón izquierdo. La pestaña vive *fuera* del cuerpo, en la misma fila
          flex: al plegar se desplaza todo el bloque justo el ancho del cuerpo,
          así que la pestaña aterriza en el borde y no hay que animar dos cosas
          por separado ni recortar contenido a medio reflujo. */}
      <aside className="side">
        {/* Barra de accesos. Va fuera del cuerpo y con `flex-wrap`: al plegarse
            el cajón, la misma fila se reparte en columna y queda como tira
            vertical en el borde. Un estado menos que animar, y el botón de
            desplegar no necesita ser un trasto aparte. */}
        <div className="tools" role="toolbar" aria-label={t.tools}>
          <button
            className="tool"
            onClick={() => setSide(o => !o)}
            aria-expanded={side}
            aria-label={side ? t.close : t.open}
            title={side ? t.close : t.open}
          >
            <IcoChevron open={side} />
          </button>
          <button
            className={"tool" + (cameraMode === 'orbit' ? " on" : "")}
            onClick={() => setCameraMode('orbit')}
            aria-pressed={cameraMode === 'orbit'}
            aria-label={t.navOrbit}
            title={t.navOrbit}
          >
            <IcoOrbit />
          </button>
          <button
            className={"tool" + (cameraMode === 'fly' ? " on" : "")}
            onClick={() => setCameraMode('fly')}
            aria-pressed={cameraMode === 'fly'}
            aria-label={t.navFly}
            title={t.navFly}
          >
            <IcoFly />
          </button>
          <button className="tool" onClick={goHome} aria-label={t.whole} title={t.whole}>
            <IcoFit />
          </button>
        </div>

        <div className="side-body">
          <div className="langs" role="group">
            {LANGS.map(l => (
              <button
                key={l.id}
                className={l.id === lang ? "on" : ""}
                onClick={() => switchTo(l.id)}
                aria-pressed={l.id === lang}
              >
                {l.name}
              </button>
            ))}
          </div>
          {g && index && (
            <WordSearch
              g={g}
              index={index}
              placeholder={t.search}
              zoneCss={zones?.css}
              onPick={id => choose(id)}
              onMiss={q => setError(t.missing(q, g.meta.nodes))}
            />
          )}
          {g && (
            <p className="stat">
              {fmt(g.meta.nodes)} {t.words} · {fmt(g.meta.edges)} {t.edges} ·{" "}
              {g.meta.communities} {t.regions}
            </p>
          )}
          {gpu !== null && (
            <p className={"stat mode" + (gpu ? " mode-live" : "")}>
              {gpu ? t.live : t.static}
            </p>
          )}
          {g && <p className="stat hint">{t.hint}</p>}
          {error && <p className="err">{error}</p>}
          {!g && !error && <p className="stat">{t.loading}</p>}
        </div>
      </aside>
      {/* Raíl derecho: mandos de simulación (sólo WebGPU) y teclas. */}
      <div className="rail rail-r">
        {gpu && g && (
          <Controls
            params={params}
            onChange={applyParams}
            onReset={reset}
            fps={fps}
            visible={visible}
            total={{ nodes: g.meta.nodes, edges: g.meta.edges }}
          />
        )}
        {g && <KeyHelp lang={lang} label={t.keys} mode={cameraMode} />}
        {sel !== null && g && (
          <aside className="card">
            <header className="card-head">
              <p className="kicker">
                {/* El punto de zona es el único color que queda en la ficha, y no
                    es decoración: es la misma tinta que la palabra tiene en la
                    malla, la única leyenda del mapa. */}
                <i className="swatch" style={{ background: zones?.css(g.community[sel]) }} />
                {t.region} {g.community[sel]} · {t.freq} #{g.rank[sel] + 1}
                {g.flags[sel] ? ` · ${t.stop}` : ""}
              </p>
              <button className="card-x" onClick={() => choose(null)} aria-label="cerrar">×</button>
            </header>

            <h2 className="card-title">{g.labels[sel]}</h2>

            {/* Camino hasta otra palabra. Va aquí y no en el cajón porque
                siempre parte de la palabra abierta: es una pregunta sobre
                *ésta*, no una búsqueda más. */}
            <p className="kicker rule">{t.pathHead}</p>
            {index && (
              <WordSearch
                g={g}
                index={index}
                small
                placeholder={t.pathTo}
                zoneCss={zones?.css}
                onPick={id => show(sel, id)}
                onMiss={q => setError(t.missing(q, g.meta.nodes))}
              />
            )}
            {path && path.length > 1 && (
              <>
                <ol className="road">
                  {path.map((id, i) => (
                    <li key={`${id}-${i}`}>
                      <button onClick={() => choose(id)}>
                        <i className="swatch" style={{ background: zones?.css(g.community[id]) }} />
                        <span className="w">{g.labels[id]}</span>
                        {/* La similitud del salto que *llega* a esta palabra:
                            es coseno en 300D, el mismo número que la lista de
                            vecinos, no una distancia medida en la galaxia. */}
                        <span className="s">
                          {i === 0 ? "" : road?.[i - 1].toFixed(2)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <p className="stat hint">
                  {t.steps(path.length - 1)}
                  {" · "}
                  <button className="link" onClick={() => choose(sel)}>{t.pathBack}</button>
                </p>
              </>
            )}

            <p className="kicker rule">{t.nbrs}</p>
            <ol className="nbrs">
              {neighbours(g, sel).map(n => (
                <li key={n.id}>
                  <button onClick={() => choose(n.id)}>
                    {/* El punto delata al vecino que vive en otra zona: es el que
                        tiende un puente fuera del barrio. */}
                    <i className="swatch" style={{ background: zones?.css(g.community[n.id]) }} />
                    <span className="w">{g.labels[n.id]}</span>
                    <span className="s">{n.w.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="foot">{t.foot}</p>
          </aside>
        )}
      </div>

      {/* CC BY-SA 3.0 exige atribución: es el único requisito legal del proyecto */}
      <p className="attrib">
        vectores{" "}
        <a href="https://fasttext.cc/docs/en/crawl-vectors.html">fastText</a>{" "}
        · Facebook Research · CC BY-SA 3.0
      </p>
    </div>
  );
}
