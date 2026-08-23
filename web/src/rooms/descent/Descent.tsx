import { useEffect, useRef, useState, useCallback } from "react";
import { DescentEngine, gpuAvailable, DEFAULTS, TOTAL_STEPS, type Options } from "./engine";
import { SURFACES, OPTS, N_MAX } from "./field.mjs";
import { typing } from "../../galaxy/keys.mjs";
import { rampCss } from "../../galaxy/palette.mjs";
import DescentWelcome, { descentIntroPending } from "./DescentWelcome";
import DescentGuide from "./DescentGuide";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep, IcoDrop, IcoPlan,
} from "../../components/icons";
import GpuRoomLoader from "../../components/GpuRoomLoader";
import { useAtlasLang } from "../../i18n";
import { DESCENT_COPY, DESCENT_SURFACES_I18N, DESCENT_OPTS_I18N } from "../../i18n/descent";

export default function Descent() {
  const [lang, setLang] = useAtlasLang();
  const t = DESCENT_COPY[lang];
  const surfaceList = DESCENT_SURFACES_I18N[lang];
  const optNames = DESCENT_OPTS_I18N[lang];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<DescentEngine | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<Options>({ ...DEFAULTS });
  const [hud, setHud] = useState({ fps: 0, steps: 0, live: 0, res: 1, done: false });
  const [seed, setSeed] = useState(1);
  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [legend, setLegend] = useState(false);
  const [notes, setNotes] = useState(false);
  const [cardOpen, setCardOpen] = useState(true);
  const [intro, setIntro] = useState(() => descentIntroPending());
  const [guide, setGuide] = useState(false);
  const [guideChapter, setGuideChapter] = useState(0);

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) { if (!dead) setGpu(false); return; }
      setGpu(true);
      const e = new DescentEngine(device, canvasRef.current);
      engineRef.current = e;
      setO({ ...e.opts });
    });
    return () => {
      dead = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setHud({ ...e.stats });
      setRoamed(e.roamed);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const patch = useCallback((p: Partial<Options>) => {
    engineRef.current?.set(p);
    setO(prev => ({ ...prev, ...p }));
  }, []);

  const pickSurface = useCallback((i: number) => {
    engineRef.current?.loadSurface(i);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);
  const pickOpt = useCallback((i: number) => {
    engineRef.current?.setOpt(i);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);
  const reseed = useCallback(() => {
    setSeed(s => { engineRef.current?.reseed(s + 1); return s + 1; });
  }, []);
  const goHome = useCallback(() => engineRef.current?.goHome(), []);
  const stepOnce = useCallback(() => {
    engineRef.current?.stepOnce();
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);

  const toggleZen = useCallback(() => {
    setZen(z => {
      const next = !z;
      try {
        if (next) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const off = () => { if (!document.fullscreenElement) setZen(false); };
    document.addEventListener("fullscreenchange", off);
    return () => document.removeEventListener("fullscreenchange", off);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (intro || guide) return;
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const eng = engineRef.current;
      switch (e.code) {
        case "Space":
          if (!eng) return;
          e.preventDefault();
          patch({ running: !eng.opts.running });
          break;
        case "Escape": if (zen) { e.preventDefault(); toggleZen(); } break;
        case "KeyF": e.preventDefault(); toggleZen(); break;
        case "KeyN": if (eng && !eng.opts.running) { e.preventDefault(); stepOnce(); } break;
        case "KeyR": e.preventDefault(); reseed(); break;
        case "KeyP": if (eng) { e.preventDefault(); patch({ plan: !eng.opts.plan }); } break;
        case "Home": e.preventDefault(); goHome(); break;
        case "Digit1": case "Digit2": case "Digit3": case "Digit4": case "Digit5": {
          const i = Number(e.code.replace("Digit", "")) - 1;
          if (i < SURFACES.length) { e.preventDefault(); pickSurface(i); }
          break;
        }
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [goHome, intro, guide, patch, pickSurface, reseed, stepOnce, toggleZen, zen]);

  const rawSurf = SURFACES[o.surface] ?? SURFACES[0];
  const localizedSurf = surfaceList[o.surface] ?? surfaceList[0];
  const surf = {
    ...rawSurf,
    name: localizedSurf.name,
    note: localizedSurf.desc,
  };
  const base = rawSurf.opt[OPTS[o.opt]].lr;
  const lrPos = Math.log10(o.lr / base);

  const done = hud.steps / TOTAL_STEPS;
  const originRamp = "linear-gradient(to right, #ff4242, #ff7a29, #ffc42e, #a6e22e, #2ee59d, #2ebbe5, #4978ff, #8b49ff, #e03ee5, #ff428a, #ff4242)";

  return (
    <div className={"shell room-descent" + (side ? " side-open" : "") + (zen ? " zen" : "")}>
      <canvas ref={canvasRef} className="shell-canvas" />
      <div className="veil" aria-hidden="true" />

      {gpu === false && (
        <div className="room-nogpu" role="alert">
          <p className="room-nogpu-title">{t.noGpu}</p>
          <p>{t.noGpuSub}</p>
          <p><a className="side-back" href="/" style={{ width: "auto", padding: "0.48rem 1rem" }}>{t.noGpuBack}</a></p>
        </div>
      )}

      {/* ------------------------------------------------------ cajón izquierdo */}
      {gpu && (
        <aside className="side">
          <div className="tools" role="toolbar" aria-label="herramientas">
            <button
              className="tool tool-side"
              onClick={() => setSide(s => !s)}
              aria-expanded={side}
              aria-label={side ? t.collapse : t.expand}
              title={side ? t.collapse : t.expand}
            >
              <IcoChevron open={side} />
            </button>
            <button className="tool tool-home" onClick={goHome}
                    aria-label={t.fullView} title={`${t.fullView} · Home`}>
              <IcoFit />
            </button>
            <button className={"tool" + (o.running ? " on" : "")}
                    onClick={() => patch({ running: !o.running })}
                    aria-pressed={o.running}
                    aria-label={o.running ? t.pause : t.resume}
                    title={`${o.running ? t.pause : t.resume} · Space`}>
              {o.running ? <IcoPause /> : <IcoPlay />}
            </button>
            <button className="tool" onClick={stepOnce} disabled={o.running}
                    aria-label={t.step} title={`${t.step} · N`}>
              <IcoStep />
            </button>
            <button className="tool" onClick={reseed}
                    aria-label={t.dropAgain} title={`${t.dropAgain} · R`}>
              <IcoDrop />
            </button>
            <button className={"tool" + (o.plan ? " on" : "")}
                    onClick={() => patch({ plan: !o.plan })}
                    aria-pressed={o.plan}
                    aria-label={t.topDown} title={`${o.plan ? t.relief : t.topDown} · P`}>
              <IcoPlan />
            </button>
            <button className={"tool" + (zen ? " on" : "")} onClick={toggleZen}
                    aria-pressed={zen} aria-label={t.fullscreen}
                    title={`${t.fullscreen} · F`}>
              {zen ? <IcoShrink /> : <IcoExpand />}
            </button>
            <button className={"tool" + (guide ? " on" : "")}
                    onClick={() => setGuide(g => !g)}
                    aria-pressed={guide} aria-label={t.guideBtn}
                    title={`${t.guideBtn} · ?`}>
              <IcoHelp />
            </button>
          </div>

          <div className="side-body">
            <a href="/" className="side-back">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
                   stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>{t.backHome}</span>
            </a>

            {/* Selector de idioma ES / EN */}
            <div className="langs" role="group" aria-label="Idioma / Language">
              <button
                type="button"
                className={lang === "es" ? "on" : ""}
                aria-pressed={lang === "es"}
                onClick={() => setLang("es")}
              >
                español
              </button>
              <button
                type="button"
                className={lang === "en" ? "on" : ""}
                aria-pressed={lang === "en"}
                onClick={() => setLang("en")}
              >
                english
              </button>
            </div>

            <button className="guide-btn" onClick={() => { setGuideChapter(0); setGuide(true); }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
              </svg>
              <span>{t.guideBtn}</span>
            </button>

            <p className="eyebrow">{t.surface}</p>
            <div className="ctl-row ctl-col" role="group" aria-label={t.surface}>
              {SURFACES.map((s, i) => (
                <button key={s.key} className={i === o.surface ? "on" : ""}
                        aria-pressed={i === o.surface}
                        onClick={() => pickSurface(i)}>{surfaceList[i]?.name ?? s.name}</button>
              ))}
            </div>

            <p className="eyebrow">{t.optimizer}</p>
            <div className="ctl-row" role="group" aria-label={t.optimizer}>
              {OPTS.map((k, i) => (
                <button key={k} className={i === o.opt ? "on" : ""}
                        aria-pressed={i === o.opt}
                        onClick={() => pickOpt(i)}>{optNames[k as keyof typeof optNames]}</button>
              ))}
            </div>

            <hr className="side-sep" />

            <p className="eyebrow">{t.walkerColor}</p>
            <div className="ctl-row" role="group" aria-label={t.walkerColor}>
              <button className={o.heat ? "on" : ""} aria-pressed={o.heat}
                      onClick={() => patch({ heat: true })}>{t.height}</button>
              <button className={!o.heat ? "on" : ""} aria-pressed={!o.heat}
                      onClick={() => patch({ heat: false })}>{t.origin}</button>
            </div>

            <p className="eyebrow">{t.speed}</p>
            <div className="ctl-row" role="group" aria-label={t.speed}>
              {[1, 2, 4, 8].map(s => (
                <button
                  key={s}
                  className={(o.speed || 4) === s ? "on" : ""}
                  onClick={() => patch({ speed: s })}
                >
                  {s}×
                </button>
              ))}
            </div>

            <button
              className="guide-btn"
              style={{
                marginTop: "0.6rem",
                background: "rgba(0, 240, 255, 0.12)",
                border: "1px solid rgba(0, 240, 255, 0.4)",
                color: "#00f0ff",
              }}
              onClick={() => engineRef.current?.dropProbe()}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8M8 12h8" />
              </svg>
              <span>{t.probe}</span>
            </button>

            <hr className="side-sep" />

            <label className="ctl-wide" htmlFor="lr">
              <span className="lbl">{t.stepSize} <b>{o.lr.toPrecision(2)}</b></span>
              <input id="lr" type="range" min={-1} max={1} step={0.02} value={lrPos}
                     onChange={e => patch({ lr: base * 10 ** Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="n">
              <span className="lbl">{t.walkers} <b>{o.n.toLocaleString(lang === "en" ? "en" : "es")}</b></span>
              <input id="n" type="range" min={1000} max={N_MAX} step={1000} value={o.n}
                     onChange={e => patch({ n: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="keep">
              <span className="lbl">
                {t.trail}
                <b>{o.keep >= 0.9995 ? t.trailPermanent : `${(1 / (1 - o.keep)) | 0} ${t.frames}`}</b>
              </span>
              <input id="keep" type="range" min={0.86} max={1} step={0.005} value={o.keep}
                     onChange={e => patch({ keep: Number(e.target.value) })} />
            </label>

            <hr className="side-sep" />

            {/* La leyenda */}
            <button className={"cmp-tab" + (legend ? " on" : "")}
                    onClick={() => setLegend(l => !l)} aria-expanded={legend}>
              <span className="cmp-tab-w">{lang === "es" ? "Qué dice el color" : "Color coding"}</span>
              <span className="cmp-caret"><IcoChevron open={!legend} /></span>
            </button>
            {legend && (
              <div className="ctl-panel legend">
                <p className="key-line">
                  <i className="ramp ramp-loss" aria-hidden="true" />
                  <span><b>{lang === "es" ? "El relieve" : "The terrain"}</b>, {lang === "es" ? "por altura: la pérdida en logaritmo. Azul el fondo, ámbar la cima." : "by elevation: loss in log scale. Blue at bottom, amber at top."}</span>
                </p>
                <p className="key-line">
                  <i className="ramp ramp-hist" aria-hidden="true" />
                  <span><b>{lang === "es" ? "Las curvas de nivel" : "Contour lines"}</b> {lang === "es" ? "son escalones iguales de esa misma pérdida." : "represent equal log loss intervals."}</span>
                </p>
                <p className="key-line">
                  <i className={"ramp " + (o.heat ? "ramp-heat" : "ramp-origin")}
                     style={o.heat ? undefined : { background: originRamp }} aria-hidden="true" />
                  <span><b>{lang === "es" ? "La bolita" : "The particle"}</b>, {o.heat
                    ? (lang === "es" ? "por su altura térmica: roja arriba, cian abajo." : "by thermal elevation: red high, cyan low.")
                    : (lang === "es" ? "por el origen. Mapa de cuencas de atracción." : "by launch origin. Basin of attraction map.")}</span>
                </p>
                <p className="key-line">
                  <i className="ramp ramp-target" aria-hidden="true" />
                  <span><b>{lang === "es" ? "La diana" : "The target"}</b> {lang === "es" ? "marca un mínimo conocido." : "marks a known global minimum."}</span>
                </p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* --------------------------------------------------------- raíl derecho */}
      {gpu && (
        <div className="rail rail-r">
          <div className="hud">
            <div className="ctl-head">
              <span className="eyebrow">
                {hud.done
                  ? (lang === "es" ? "Asentado en el mínimo" : "Settled in minimum")
                  : o.running
                  ? hud.steps < 120
                    ? (lang === "es" ? "Descendiendo a gran velocidad" : "Descending rapidly")
                    : hud.steps < 3000
                    ? (lang === "es" ? "Explorando la cuenca" : "Exploring basin")
                    : (lang === "es" ? "Afinando convergencia" : "Refining convergence")
                  : (lang === "es" ? "En pausa" : "Paused")}
              </span>
              <span className="fps">{hud.fps.toFixed(0)} fps{hud.res < 0.999 ? ` · ${(hud.res * 100).toFixed(0)}% res` : ""}</span>
            </div>
            <div className="bar" role="progressbar" aria-valuenow={Math.round(done * 100)}
                 aria-valuemin={0} aria-valuemax={100} aria-label="progreso">
              <i style={{ width: `${done * 100}%` }} />
            </div>
            <p className="stat">
              {hud.steps.toLocaleString(lang === "en" ? "en" : "es")} / {TOTAL_STEPS.toLocaleString(lang === "en" ? "en" : "es")} {t.stepsLabel}
              {hud.done ? ` · ${lang === "es" ? "asentado" : "settled"}` : ""}
            </p>
            <p className="stat hint">
              {hud.live.toLocaleString(lang === "en" ? "en" : "es")} {t.liveLabel}
            </p>
          </div>

          <aside className={"card" + (cardOpen ? " card-open" : "")}>
            <button className="card-toggle" onClick={() => setCardOpen(c => !c)}
                    aria-expanded={cardOpen}
                    aria-label={cardOpen ? t.collapse : t.expand}>
              <IcoChevron open={!cardOpen} />
            </button>
            <header className="card-head">
              <p className="kicker">{optNames[OPTS[o.opt] as keyof typeof optNames]} · {lang === "es" ? `llega el ${surf.reach}` : `reach: ${surf.reach}`}</p>
            </header>
            <h2 className="card-title">{surf.name}</h2>
            <p className="formula">f(x, y) = {surf.formula}</p>
            <div className="card-body">
              <p className="note">{surf.note}</p>
              {surf.min.length > 0 ? (
                <p className="note" style={{ color: "#73dbff", borderColor: "rgba(115, 219, 255, 0.25)", display: "flex", gap: "0.45rem", alignItems: "flex-start" }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>
                    <b>{t.globalMinLabel}:</b> {surf.min.length === 1
                      ? `(${surf.min[0][0]}, ${surf.min[0][1]}) | f = 0`
                      : (lang === "es" ? `4 mínimos globales idénticos con f = 0` : `4 identical global minima with f = 0`)}
                  </span>
                </p>
              ) : (
                <p className="note" style={{ color: "#ffc75c", borderColor: "rgba(255, 199, 92, 0.25)", display: "flex", gap: "0.45rem", alignItems: "flex-start" }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: "2px" }} aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                  </svg>
                  <span>
                    <b>{lang === "es" ? "Sin mínimo" : "No minimum"}:</b> {lang === "es" ? "Punto de ensilladura en (0, 0)." : "Saddle inflection point at (0, 0)."}
                  </span>
                </p>
              )}
              <p className="foot phase" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{lang === "es" ? "Fase 01 · cinco superficies" : "Phase 01 · five benchmark surfaces"}</span>
                <button
                  className="card-guide-btn"
                  onClick={() => { setGuideChapter(3); setGuide(true); }}
                >
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
                  </svg>
                  <span>{t.guideBtn}</span>
                </button>
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* ---------------------------------------------------- sobre el lienzo */}
      {gpu && !zen && !roamed && hud.steps < 200 && (
        <p className={"coach" + (roamed ? " coach-up" : "")} aria-live="polite">
          {lang === "es" ? "arrastra para girar · rueda para acercar · espacio para parar" : "drag to orbit · wheel to zoom · spacebar to pause"}
        </p>
      )}

      {gpu && roamed && !zen && (
        <button className="go-home" onClick={goHome}>
          <IcoFit />
          <span>{t.roamedBack}</span>
          <kbd>Home</kbd>
        </button>
      )}

      {zen && (
        <button className="zen-exit" onClick={toggleZen} title={t.zenOut}>
          <IcoShrink />
          <span>{lang === "es" ? "salir" : "exit"}</span>
          <kbd>esc</kbd>
        </button>
      )}

      {/* ------------------------------------------------ Estado de carga WebGPU */}
      <GpuRoomLoader 
        roomName={lang === "es" ? "DESCENSO DE GRADIENTE" : "GRADIENT DESCENT"} 
      />

      {/* ------------------------------------------------ Modales pedagógicos */}
      {intro && (
        <DescentWelcome
          lang={lang}
          onClose={() => setIntro(false)}
          onOpenGuide={() => { setGuideChapter(0); setGuide(true); }}
        />
      )}

      {guide && (
        <DescentGuide
          lang={lang}
          initialChapter={guideChapter}
          onClose={() => setGuide(false)}
        />
      )}
    </div>
  );
}
