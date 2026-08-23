import { useEffect, useRef, useState, useCallback } from "react";
import { SomEngine, gpuAvailable, DEFAULTS, TOTAL_STEPS, type Options } from "./engine";
import { SHAPES } from "./math.mjs";
import { typing } from "../../galaxy/keys.mjs";
import SomWelcome, { somIntroPending } from "./SomWelcome";
import SomGuide, { type SomChapterId } from "./SomGuide";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep, IcoDrop
} from "../../components/icons";
import GpuRoomLoader from "../../components/GpuRoomLoader";
import { useAtlasLang } from "../../i18n";
import { SOM_COPY, SOM_SHAPES_I18N } from "../../i18n/som";

export default function Som() {
  const [lang, setLang] = useAtlasLang();
  const t = SOM_COPY[lang];
  const shapesList = SOM_SHAPES_I18N[lang];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SomEngine | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<Options>({ ...DEFAULTS });
  const [hud, setHud] = useState({ fps: 0, steps: 0, eta: 0.3, sigma: 32.0, done: false });
  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [intro, setIntro] = useState(() => somIntroPending());
  const [guide, setGuide] = useState<SomChapterId | null>(null);

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) { if (!dead) setGpu(false); return; }
      setGpu(true);
      const e = new SomEngine(device, canvasRef.current);
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

  const pickShape = useCallback((i: number) => {
    engineRef.current?.loadShape(i);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);

  const resetSimulation = useCallback(() => {
    engineRef.current?.reset();
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);

  const stepOnce = useCallback(() => {
    engineRef.current?.stepOnce();
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);

  const goHome = useCallback(() => engineRef.current?.goHome(), []);

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
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || intro || guide) return;
      const eng = engineRef.current;
      switch (e.code) {
        case "Space":
          if (!eng) return;
          e.preventDefault();
          patch({ running: !eng.opts.running });
          break;
        case "Escape": if (zen) { e.preventDefault(); toggleZen(); } break;
        case "KeyF": e.preventDefault(); toggleZen(); break;
        case "KeyR": e.preventDefault(); resetSimulation(); break;
        case "KeyN": e.preventDefault(); stepOnce(); break;
        case "KeyP":
          if (!eng) return;
          e.preventDefault();
          patch({ showTarget: !eng.opts.showTarget });
          break;
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [zen, intro, guide, toggleZen, resetSimulation, stepOnce, patch]);

  const rawShape = SHAPES[o.shapeIdx] ?? SHAPES[0];
  const localizedShape = shapesList[o.shapeIdx] ?? shapesList[0];
  const shape = {
    ...rawShape,
    name: localizedShape.name,
    desc: localizedShape.desc,
  };
  const progress = hud.steps / TOTAL_STEPS;

  return (
    <div className={"shell room-descent" + (side ? " side-open" : "") + (zen ? " zen" : "")}>
      <canvas ref={canvasRef} className="shell-canvas" />
      <div className="veil" aria-hidden="true" />

      {gpu === false && (
        <div className="room-nogpu">
          <p className="room-nogpu-title">{t.noGpu}</p>
          <p>{t.noGpuSub}</p>
          <p><a className="side-back" href="/" style={{ width: "auto", padding: "0.48rem 1rem" }}>{t.noGpuBack}</a></p>
        </div>
      )}

      {/* Cajón lateral izquierdo */}
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
            <button className="tool" onClick={resetSimulation}
                    aria-label={t.restart} title={`${t.restart} · R`}>
              <IcoDrop />
            </button>
            <button className={"tool" + (zen ? " on" : "")} onClick={toggleZen}
                    aria-pressed={zen} aria-label={t.fullscreen}
                    title={`${t.fullscreen} · F`}>
              {zen ? <IcoShrink /> : <IcoExpand />}
            </button>
            <button className={"tool" + (intro || guide ? " on" : "")}
                    onClick={() => setIntro(true)}
                    aria-pressed={intro} aria-label={t.guideBtn}
                    title={t.guideBtn}>
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

            <button
              className="guide-btn"
              onClick={() => setGuide("what")}
              aria-label={t.guideBtn}
              title={t.guideBtn}
            >
              <IcoHelp />
              <span>{t.guideBtn}</span>
            </button>

            <p className="eyebrow">{t.targetShape}</p>
            <div className="ctl-row ctl-col" role="group" aria-label={t.targetShape}>
              {SHAPES.map((s, i) => (
                <button key={s.key} className={i === o.shapeIdx ? "on" : ""}
                        aria-pressed={i === o.shapeIdx}
                        onClick={() => pickShape(i)}>{shapesList[i]?.name ?? s.name}</button>
              ))}
            </div>

            <p className="eyebrow">{t.topology}</p>
            <div className="ctl-row" role="group" aria-label={t.topology}>
              <button className={!o.toroidal ? "on" : ""} aria-pressed={!o.toroidal}
                      onClick={() => patch({ toroidal: false })}>{t.planar}</button>
              <button className={o.toroidal ? "on" : ""} aria-pressed={o.toroidal}
                      onClick={() => patch({ toroidal: true })}>{t.toroidal}</button>
            </div>

            <p className="eyebrow">{t.gridColor}</p>
            <div className="ctl-row" role="group" aria-label={t.gridColor}>
              <button className={o.mode === 0 ? "on" : ""} aria-pressed={o.mode === 0}
                      onClick={() => patch({ mode: 0 })}>{t.colorTopology}</button>
              <button className={o.mode === 1 ? "on" : ""} aria-pressed={o.mode === 1}
                      onClick={() => patch({ mode: 1 })}>{t.colorHeight}</button>
            </div>

            <p className="eyebrow">{t.targetPoints}</p>
            <div className="ctl-row" role="group" aria-label={t.targetPoints}>
              <button className={o.showTarget ? "on" : ""} aria-pressed={o.showTarget}
                      onClick={() => patch({ showTarget: true })}>{t.showPoints}</button>
              <button className={!o.showTarget ? "on" : ""} aria-pressed={!o.showTarget}
                      onClick={() => patch({ showTarget: false })}>{t.hidePoints}</button>
            </div>

            <hr className="side-sep" />

            <label className="ctl-wide" htmlFor="steps">
              <span className="lbl">{t.speed} <b>{o.stepsPerFrame} pas/frame</b></span>
              <input id="steps" type="range" min={1} max={32} step={1} value={o.stepsPerFrame}
                     onChange={e => patch({ stepsPerFrame: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="eta">
              <span className="lbl">{t.initialEta} <b>{o.eta0.toFixed(2)}</b></span>
              <input id="eta" type="range" min={0.05} max={0.9} step={0.05} value={o.eta0}
                     onChange={e => { patch({ eta0: Number(e.target.value) }); resetSimulation(); }} />
            </label>

            <label className="ctl-wide" htmlFor="sigma">
              <span className="lbl">{t.initialSigma} <b>{o.sigma0.toFixed(1)} px</b></span>
              <input id="sigma" type="range" min={4.0} max={32.0} step={1.0} value={o.sigma0}
                     onChange={e => { patch({ sigma0: Number(e.target.value) }); resetSimulation(); }} />
            </label>

            <label className="ctl-wide" htmlFor="alpha">
              <span className="lbl">{t.alpha} <b>{Math.round(o.alpha * 100)}%</b></span>
              <input id="alpha" type="range" min={0.05} max={1.0} step={0.05} value={o.alpha}
                     onChange={e => patch({ alpha: Number(e.target.value) })} />
            </label>
          </div>
        </aside>
      )}

      {/* Raíl derecho */}
      {gpu && (
        <div className="rail rail-r">
          <div className="hud">
            <div className="ctl-head">
              <span className="eyebrow">{lang === "es" ? "Autoorganización 3D" : "3D Self-Organization"}</span>
              <span className="fps">{hud.fps.toFixed(0)} fps</span>
            </div>

            <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)}
                 aria-valuemin={0} aria-valuemax={100} aria-label="progreso">
              <i style={{ width: `${progress * 100}%` }} />
            </div>

            <p className="stat">
              <b>{hud.steps.toLocaleString(lang === "en" ? "en" : "es")}</b> / {TOTAL_STEPS.toLocaleString(lang === "en" ? "en" : "es")} {t.epochLabel}s
            </p>
            <p className="stat hint">
              {lang === "es" ? "Radio de vecindad (σ):" : "Neighborhood radius (σ):"} <b>{(hud.sigma || 0).toFixed(1)} px</b>
            </p>
          </div>

          <aside className="card card-open">
            <header className="card-head">
              <p className="kicker">{shape.name}</p>
            </header>
            <h2 className="card-title">{shape.name}</h2>
            <div className="card-body">
              <p className="note">{shape.desc}</p>
              <p className="note" style={{ color: "#00f0ff", borderColor: "rgba(0, 240, 255, 0.3)" }}>
                <b>{lang === "es" ? "Topología:" : "Topology:"}</b> {o.toroidal ? (lang === "es" ? "Toroide continuo (bordes cerrados)" : "Continuous Toroid (closed borders)") : (lang === "es" ? "Hoja plana (bordes libres)" : "Planar Sheet (free borders)")}
              </p>
              <p className="foot phase" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{lang === "es" ? "Red Neuronal Kohonen" : "Kohonen Neural Lattice"}</span>
                <button
                  className="card-guide-btn"
                  onClick={() => setGuide("topo")}
                >
                  <span>{t.guideBtn}</span>
                </button>
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Feedback sobre el lienzo */}
      {gpu && !zen && !roamed && hud.steps < 200 && (
        <p className="coach" aria-live="polite">
          {lang === "es" ? "arrastra para orbitar · rueda para zoom · espacio para pausar" : "drag to orbit · wheel to zoom · spacebar to pause"}
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

      <GpuRoomLoader 
        roomName={lang === "es" ? "MAPAS AUTOORGANIZADOS" : "SELF-ORGANIZING MAPS"} 
      />

      {intro && (
        <SomWelcome
          lang={lang}
          onClose={() => setIntro(false)}
          onGuide={() => { setIntro(false); setGuide("what"); }}
        />
      )}

      {guide && (
        <SomGuide
          lang={lang}
          initialChapter={guide}
          onClose={() => setGuide(null)}
          onIntro={() => { setGuide(null); setIntro(true); }}
        />
      )}
    </div>
  );
}
