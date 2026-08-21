import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { loadGalaxy, neighbours, type Galaxy } from "../galaxy/loader";
import { zoneColours } from "../galaxy/palette.mjs";
import { GalaxyScene } from "../galaxy/scene";
import { GpuEngine, gpuAvailable, DEFAULTS, type Params } from "../galaxy/gpu/engine";
import Controls from "./Controls";
import KeyHelp from "./KeyHelp";

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
        keys: "teclas para volar",
        navOrbit: "órbita", navFly: "vuelo",
        foot: "similitud coseno en 300D — no la distancia que ves",
        missing: (q: string, n: number) => `«${q}» no está en las ${n} palabras de esta galaxia` },
  en: { search: "search a word…", words: "words", edges: "edges",
        regions: "regions", loading: "loading binaries…", region: "region",
        freq: "frequency", stop: "stop word",
        live: "webgpu · live simulation", static: "webgl · fixed positions",
        hint: "hover a dot · click to open it",
        keys: "keys to fly",
        navOrbit: "orbit", navFly: "fly",
        foot: "cosine similarity in 300D — not the distance you see",
        missing: (q: string, n: number) => `“${q}” is not among this galaxy's ${n} words` },
};

/** Lo que la vista necesita, sea cual sea el motor debajo. */
interface Viewer {
  select(id: number | null): void;
  pick(x: number, y: number): Promise<number | null>;
  dispose(): void;
  /** Resalte de paso. Sólo el motor WebGPU puede permitírselo: allí cuesta
   *  cuatro bytes, y en WebGL habría que resubir el atributo entero. */
  hover?(id: number | null): void;
  setCameraMode?(mode: 'orbit' | 'fly'): void;
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
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Params>({ ...DEFAULTS });
  const [fps, setFps] = useState(0);
  const [visible, setVisible] = useState({ nodes: 0, edges: 0, res: 1, lod: 1 });
  // null = aún sondeando. El motor se decide una vez y no cambia en caliente:
  // un canvas no puede tener contexto webgl y webgpu a la vez.
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fly'>('orbit');
  const t = COPY[lang as keyof typeof COPY] ?? COPY.es;
  // El color de las aristas dice a qué zona pertenece cada palabra; la ficha
  // repite ese mismo color para que la relación sea legible sin adivinarla.
  const zones = useMemo(() => (g ? zoneColours(g) : null), [g]);

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
    setG(null); setSel(null); setHover(null); setError(null);
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

  const choose = useCallback((id: number | null, fly = true) => {
    setSel(id);
    viewerRef.current?.select(id);
    // Seleccionar sin mover la cámara deja el resalte fuera de plano o
    // diminuto; el enfoque es parte del gesto, no un extra.
    if (id !== null && fly) void engineRef.current?.focus(id);
  }, []);

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

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!g) return;
    // Soltar el foco del buscador: si se queda dentro, «wasd» se escribe en la
    // caja en vez de volar, que es justo lo que uno intenta tras encontrar algo.
    (e.currentTarget as HTMLFormElement).querySelector("input")?.blur();
    const q = query.trim().toLowerCase();
    const i = g.labels.indexOf(q);
    if (i >= 0) { choose(i); setError(null); }
    else setError(t.missing(q, g.meta.nodes));
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

  const fmt = (n: number) => n.toLocaleString(lang === "en" ? "en" : "es");

  return (
    <div className="galaxy-root">
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

      <div className="hud hud-tl">
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
        <div className="langs" role="group">
          <button
            className={cameraMode === 'orbit' ? "on" : ""}
            onClick={() => setCameraMode('orbit')}
            aria-pressed={cameraMode === 'orbit'}
          >
            {t.navOrbit}
          </button>
          <button
            className={cameraMode === 'fly' ? "on" : ""}
            onClick={() => setCameraMode('fly')}
            aria-pressed={cameraMode === 'fly'}
          >
            {t.navFly}
          </button>
        </div>
        <form onSubmit={onSearch}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setError(null); }}
            placeholder={t.search}
            spellCheck={false}
          />
        </form>
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

      {g && <KeyHelp lang={lang} label={t.keys} />}

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

      {sel !== null && g && (
        <aside className="hud hud-br">
          <header>
            <h2>{g.labels[sel]}</h2>
            <button onClick={() => choose(null)} aria-label="cerrar">×</button>
          </header>
          <p className="stat">
            <i className="swatch" style={{ background: zones?.css(g.community[sel]) }} />
            {t.region} {g.community[sel]} · {t.freq} #{g.rank[sel] + 1}
            {g.flags[sel] ? ` · ${t.stop}` : ""}
          </p>
          <ol className="nbrs">
            {neighbours(g, sel).map(n => (
              <li key={n.id}>
                <button onClick={() => choose(n.id)}>
                  {/* El punto delata al vecino que vive en otra zona: es el que
                      tiende un puente fuera del barrio. */}
                  <i className="swatch" style={{ background: zones?.css(g.community[n.id]) }} />
                  {g.labels[n.id]}
                </button>
                <span>{n.w.toFixed(2)}</span>
              </li>
            ))}
          </ol>
          <p className="foot">{t.foot}</p>
        </aside>
      )}

      {/* CC BY-SA 3.0 exige atribución: es el único requisito legal del proyecto */}
      <p className="attrib">
        vectores{" "}
        <a href="https://fasttext.cc/docs/en/crawl-vectors.html">fastText</a>{" "}
        · Facebook Research · CC BY-SA 3.0
      </p>
    </div>
  );
}
