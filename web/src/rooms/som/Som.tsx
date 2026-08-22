import { useEffect, useRef, useState, useCallback } from "react";
import { SomEngine, gpuAvailable, DEFAULTS, TOTAL_STEPS, type Options } from "./engine";
import { SHAPES, GRID_RES, SAMPLE_COUNT } from "./math.mjs";
import { typing } from "../../galaxy/keys.mjs";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep, IcoDrop
} from "../../components/icons";
import SomWelcome, { somIntroPending } from "./SomWelcome";
import SomGuide, { type SomChapterId } from "./SomGuide";

export default function Som() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SomEngine | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<Options>({ ...DEFAULTS });
  const [hud, setHud] = useState({ fps: 0, steps: 0, eta: DEFAULTS.eta0, sigma: DEFAULTS.sigma0, done: false });
  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [legend, setLegend] = useState(false);
  const [notes, setNotes] = useState(false);
  const [cardOpen, setCardOpen] = useState(true);
  const [intro, setIntro] = useState(somIntroPending);
  const [guide, setGuide] = useState<SomChapterId | null>(null);

  // Inicialización de WebGPU
  useEffect(() => {
    let dead = false;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) {
        if (!dead) setGpu(false);
        return;
      }
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

  // Sondeo del HUD
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

  // Teclado interactivo
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
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [zen, intro, guide, toggleZen, resetSimulation, stepOnce, patch]);

  const shape = SHAPES[o.shapeIdx];
  const progress = hud.steps / TOTAL_STEPS;

  return (
    <div className={"shell room-descent" + (side ? " side-open" : "") + (zen ? " zen" : "")}>
      {/* Canvas */}
      <canvas ref={canvasRef} className="shell-canvas" />
      <div className="veil" aria-hidden="true" />

      {gpu === false && (
        <div className="room-nogpu">
          <p className="room-nogpu-title">Esta sala necesita WebGPU</p>
          <p>
            Los mapas de Kohonen se entrenan y dibujan en la GPU en tiempo real.
            Para probar la sala interactiva, utiliza un navegador compatible (Chrome, Edge u Opera)
            con aceleración por hardware activada.
          </p>
          <p><a className="side-back" href="/" style={{ width: "auto", padding: "0.48rem 1rem" }}>Volver a Inicio</a></p>
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
              aria-label={side ? "plegar" : "desplegar"}
              title={side ? "plegar" : "desplegar"}
            >
              <IcoChevron open={side} />
            </button>
            <button className="tool tool-home" onClick={goHome}
                    aria-label="vista completa" title="vista completa · Inicio">
              <IcoFit />
            </button>
            <button className={"tool" + (o.running ? " on" : "")}
                    onClick={() => patch({ running: !o.running })}
                    aria-pressed={o.running}
                    aria-label={o.running ? "pausa" : "seguir"}
                    title={`${o.running ? "pausa" : "seguir"} · espacio`}>
              {o.running ? <IcoPause /> : <IcoPlay />}
            </button>
            <button className="tool" onClick={stepOnce} disabled={o.running}
                    aria-label="un paso" title="un paso · N">
              <IcoStep />
            </button>
            <button className="tool" onClick={resetSimulation}
                    aria-label="reiniciar" title="reiniciar · R">
              <IcoDrop />
            </button>
            <button className={"tool" + (zen ? " on" : "")} onClick={toggleZen}
                    aria-pressed={zen} aria-label="pantalla completa"
                    title="pantalla completa · F">
              {zen ? <IcoShrink /> : <IcoExpand />}
            </button>
            <button className={"tool" + (intro || guide ? " on" : "")}
                    onClick={() => setIntro(true)}
                    aria-pressed={intro} aria-label="qué es esto"
                    title="qué es esto">
              <IcoHelp />
            </button>
          </div>

          <div className="side-body">
            <a href="/" className="side-back">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
                   stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Volver a Inicio</span>
            </a>

            <button
              className="guide-btn"
              onClick={() => setGuide("what")}
              aria-label="Guía de Mapas SOM"
              title="Guía de Mapas SOM"
            >
              <IcoHelp />
              <span>Guía de Mapas SOM</span>
            </button>

            <p className="eyebrow">Figura Objetivo</p>
            <div className="ctl-row ctl-col" role="group" aria-label="figura objetivo">
              {SHAPES.map((s, i) => (
                <button key={s.key} className={i === o.shapeIdx ? "on" : ""}
                        aria-pressed={i === o.shapeIdx}
                        onClick={() => pickShape(i)}>{s.name}</button>
              ))}
            </div>

            <p className="eyebrow">Topología de la Red</p>
            <div className="ctl-row" role="group" aria-label="topología de la red">
              <button className={!o.toroidal ? "on" : ""} aria-pressed={!o.toroidal}
                      onClick={() => patch({ toroidal: false })}>Plana (Hoja)</button>
              <button className={o.toroidal ? "on" : ""} aria-pressed={o.toroidal}
                      onClick={() => patch({ toroidal: true })}>Toroidal (Dona)</button>
            </div>

            <p className="eyebrow">Color de la Red</p>
            <div className="ctl-row" role="group" aria-label="color de la red">
              <button className={o.mode === 0 ? "on" : ""} aria-pressed={o.mode === 0}
                      onClick={() => patch({ mode: 0 })}>Topología</button>
              <button className={o.mode === 1 ? "on" : ""} aria-pressed={o.mode === 1}
                      onClick={() => patch({ mode: 1 })}>Altura Z</button>
            </div>

            <hr className="side-sep" />

            <label className="ctl-wide" htmlFor="steps">
              <span className="lbl">Velocidad <b>{o.stepsPerFrame} pas/frame</b></span>
              <input id="steps" type="range" min={1} max={32} step={1} value={o.stepsPerFrame}
                     onChange={e => patch({ stepsPerFrame: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="eta">
              <span className="lbl">Tasa inicial (η₀) <b>{o.eta0.toFixed(2)}</b></span>
              <input id="eta" type="range" min={0.05} max={0.9} step={0.05} value={o.eta0}
                     onChange={e => { patch({ eta0: Number(e.target.value) }); resetSimulation(); }} />
            </label>

            <label className="ctl-wide" htmlFor="sigma">
              <span className="lbl">Vecindad inicial (σ₀) <b>{o.sigma0.toFixed(1)} px</b></span>
              <input id="sigma" type="range" min={4.0} max={32.0} step={1.0} value={o.sigma0}
                     onChange={e => { patch({ sigma0: Number(e.target.value) }); resetSimulation(); }} />
            </label>

            <label className="ctl-wide" htmlFor="alpha">
              <span className="lbl">Opacidad malla <b>{Math.round(o.alpha * 100)}%</b></span>
              <input id="alpha" type="range" min={0.1} max={1.0} step={0.05} value={o.alpha}
                     onChange={e => patch({ alpha: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="bright">
              <span className="lbl">Puntos objetivo <b>{o.showTarget ? `${Math.round(o.bright * 100)}%` : "ocultos"}</b></span>
              <input id="bright" type="range" min={0.0} max={1.0} step={0.05} value={o.showTarget ? o.bright : 0.0}
                     onChange={e => {
                       const v = Number(e.target.value);
                       patch({ showTarget: v > 0.02, bright: v });
                     }} />
            </label>

            <hr className="side-sep" />

            <button className={"cmp-tab" + (legend ? " on" : "")}
                    onClick={() => setLegend(l => !l)} aria-expanded={legend}>
              <span className="cmp-tab-w">Qué dice el color</span>
              <span className="cmp-caret"><IcoChevron open={!legend} /></span>
            </button>
            {legend && (
              <div className="ctl-panel legend">
                <p className="key-line">
                  <i className="ramp ramp-heat" aria-hidden="true" />
                  <span><b>Topología UV:</b> Mapea las coordenadas (U, V) de la rejilla a un gradiente de color continuo para revelar cómo la red se pliega o gira.</span>
                </p>
                <p className="key-line">
                  <i className="ramp ramp-loss" aria-hidden="true" />
                  <span><b>Altura Z:</b> Tiñe por la posición vertical de cada neurona (azul abajo, ámbar y rojo arriba).</span>
                </p>
                <p className="key-line">
                  <i className="ramp ramp-target" aria-hidden="true" />
                  <span><b>Puntos de datos:</b> Muestras del cuerpo 3D objetivo que las neuronas intentan representar.</span>
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
              <span className="eyebrow">{o.running ? "Entrenando" : "En pausa"}</span>
              <span className="fps">{hud.fps.toFixed(0)} fps</span>
            </div>
            
            <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)}
                 aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del entrenamiento">
              <i style={{ width: `${progress * 100}%` }} />
            </div>

            <p className="stat">
              {hud.steps.toLocaleString("es")} de {TOTAL_STEPS.toLocaleString("es")} muestras
              {hud.done ? " · Convergido" : ""}
            </p>
            <p className="stat hint">
              η = {hud.eta.toFixed(4)} · σ = {hud.sigma.toFixed(2)} px
            </p>
          </div>

          <aside className={"card" + (cardOpen ? " card-open" : "")}>
            <button className="card-toggle" onClick={() => setCardOpen(c => !c)}
                    aria-expanded={cardOpen}
                    aria-label={cardOpen ? "plegar la ficha" : "desplegar la ficha"}>
              <IcoChevron open={!cardOpen} />
            </button>
            <header className="card-head">
              <p className="kicker">Redes Autoorganizadas</p>
            </header>
            <h2 className="card-title">{shape.name}</h2>
            <p className="formula">{shape.formula}</p>
            <div className="card-body">
              <p className="note">{shape.note}</p>
              {notes && (
                <>
                  <p className="kicker rule">Algoritmo de Kohonen</p>
                  <p className="note">
                    <b>1. Competencia:</b> Para cada muestra aleatoria X, se busca la neurona ganadora (BMU) en la GPU por distancia mínima:
                    <code> i* = argmin_i ||X - W_i||</code>
                  </p>
                  <p className="note">
                    <b>2. Cooperación:</b> La neurona ganadora activa a sus vecinas en la grilla mediante un factor gaussiano que decae con la distancia topológica d:
                    <code> h_i = exp(-d² / 2σ²)</code>
                  </p>
                  <p className="note">
                    <b>3. Adaptación:</b> Los pesos de los nodos se desplazan hacia el punto objetivo proporcionalmente a la tasa de aprendizaje η y al factor h:
                    <code> ΔW_i = η · h_i · (X - W_i)</code>
                  </p>
                </>
              )}
              <p className="foot phase">
                Fase 01 · 64x64 Neuronas (4.096 nodos) · Cómputo WebGPU
                <button className="why" onClick={() => setGuide("what")}>
                  ¿Por qué? Guía SOM
                </button>
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* ---------------------------------------------------- sobre el lienzo */}
      {gpu && !zen && !roamed && hud.steps < 300 && (
        <p className="coach" aria-live="polite">
          arrastra para orbitar · rueda para zoom · <kbd>espacio</kbd> pausa
        </p>
      )}

      {gpu && roamed && !zen && (
        <button className="go-home" onClick={goHome}>
          <IcoFit />
          <span>Vista completa</span>
          <kbd>inicio</kbd>
        </button>
      )}

      {zen && (
        <button className="zen-exit" onClick={toggleZen} title="Salir de pantalla completa">
          <IcoShrink />
          <span>salir</span>
          <kbd>esc</kbd>
        </button>
      )}

      {/* ------------------------------------------------- modales pedagógicos */}
      {intro && (
        <SomWelcome
          onClose={() => setIntro(false)}
          onGuide={() => {
            setIntro(false);
            setGuide("what");
          }}
        />
      )}

      {guide && (
        <SomGuide
          at={guide}
          onClose={() => setGuide(null)}
          onIntro={() => {
            setGuide(null);
            setIntro(true);
          }}
        />
      )}
    </div>
  );
}
