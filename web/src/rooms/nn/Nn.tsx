import { useEffect, useRef, useState, useCallback } from "react";
import {
  NnEngine, gpuAvailable, DEFAULTS, DATASETS,
  MAX_HIDDEN_LAYERS, MAX_UNITS, MIN_UNITS,
  AXIS_X, AXIS_Y,
  type Options, type Stats, type NeuronInfo,
} from "./engine";
import { CLASS_A, CLASS_B } from "./math.mjs";
import type { ActId } from "./math.mjs";
import { typing } from "../../galaxy/keys.mjs";
import NnWelcome, { nnIntroPending } from "./NnWelcome";
import NnGuide, { type NnChapterId } from "./NnGuide";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep, IcoDrop,
} from "../../components/icons";
import { GpuRoomLoader } from "../../components/GpuRoomLoader";
import { useAtlasLang } from "../../i18n";
import { NN_COPY, NN_DATASETS_I18N, NN_ACTS_I18N } from "../../i18n/nn";

const rgb = (c: [number, number, number]) =>
  `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

/**
 * La curva de pérdida, con las dos líneas.
 *
 * Es el único sitio de la sala donde el pasado sigue en pantalla: el suelo y
 * la malla sólo saben decir *ahora*, y sin memoria nadie distingue «está
 * aprendiendo despacio» de «se ha atascado». La de prueba va punteada y por
 * encima: cuando se separa de la de entrenamiento, eso es memorizar.
 */
function LossChart({ history, label }: { history: { tr: number; te: number }[]; label: string }) {
  if (history.length < 2) return <div className="nn-chart nn-chart-empty" aria-hidden="true" />;
  const W = 240, H = 54;
  const max = Math.max(0.12, ...history.map(h => Math.max(h.tr, h.te)));
  const path = (key: "tr" | "te") =>
    history
      .map((h, i) => {
        const x = (i / (history.length - 1)) * W;
        const y = H - (Math.min(h[key], max) / max) * (H - 4) - 2;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  return (
    <svg className="nn-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
         role="img" aria-label={label}>
      <path d={path("te")} fill="none" stroke="rgba(242,239,233,0.38)"
            strokeWidth="1.4" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <path d={path("tr")} fill="none" stroke={rgb(CLASS_B)}
            strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** La lista de pesos que entran a la neurona elegida. Barra a la izquierda si
 *  resta, a la derecha si suma: el signo se lee sin buscar el menos. */
function WeightBars({ wIn }: { wIn: NeuronInfo["wIn"] }) {
  const max = Math.max(1e-6, ...wIn.map(w => Math.abs(w.w)));
  return (
    <ul className="nn-w">
      {wIn.slice(0, 9).map((w, i) => (
        <li key={i}>
          <span className="nn-w-t">{w.from}</span>
          <span className="nn-w-bar">
            <i
              style={{
                width: `${(Math.abs(w.w) / max) * 50}%`,
                left: w.w >= 0 ? "50%" : undefined,
                right: w.w < 0 ? "50%" : undefined,
                background: w.w >= 0 ? rgb(CLASS_B) : rgb(CLASS_A),
              }}
            />
          </span>
          <span className="nn-w-n">{w.w >= 0 ? "+" : "−"}{Math.abs(w.w).toFixed(2)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Nn() {
  const [lang, setLang] = useAtlasLang();
  const t = NN_COPY[lang];
  const dsCopy = NN_DATASETS_I18N[lang];
  const actCopy = NN_ACTS_I18N[lang];
  const nf = lang === "en" ? "en" : "es";

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<NnEngine | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<Options>({ ...DEFAULTS });
  const [hud, setHud] = useState<Stats>({
    fps: 0, batches: 0, epochs: 0, lossTrain: 0, lossTest: 0, acc: 0, accTest: 0,
    phase: "fwd", history: [], arch: [2, 6, 6, 1], dead: 0, selected: null, hovered: null,
  });
  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [intro, setIntro] = useState(() => nnIntroPending());
  const [guide, setGuide] = useState<NnChapterId | null>(null);

  useEffect(() => {
    let dead = false;
    // `?data=espiral` abre la sala en ese problema. Es lo que hace que un
    // enlace compartido lleve a lo que quien lo mandó estaba mirando — y es
    // también la clave que apaga la presentación, así que si no eligiese nada
    // el enlace prometería algo que no cumple.
    const q = new URLSearchParams(location.search).get("data");
    const start = DATASETS.some(d => d.id === q) ? { datasetId: q as string } : undefined;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) { if (!dead) setGpu(false); return; }
      setGpu(true);
      const e = new NnEngine(device, canvasRef.current, start);
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
      setHud({ ...e.stats, history: e.stats.history.slice() });
      setRoamed(e.roamed);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const patch = useCallback((p: Partial<Options>) => {
    engineRef.current?.set(p);
    setO(prev => ({ ...prev, ...p }));
  }, []);

  const restart = useCallback(() => engineRef.current?.reset(), []);
  const stepOnce = useCallback(() => engineRef.current?.stepOnce(), []);
  const goHome = useCallback(() => engineRef.current?.goHome(), []);
  const release = useCallback(() => engineRef.current?.clear(), []);

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

  // Las teclas viven aquí y no en `KeyFly`: `KeyFly` se instancia dentro de la
  // cámara, y colgar de ella el `Escape` de la sala lo dejaría muerto en
  // cuanto otra sala montase otra cámara. Es el error que el atlas ya documenta.
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
        case "Escape":
          // Con la interfaz escondida, quien pulsa `Esc` quiere la interfaz:
          // el modo inmersivo sale antes que la selección.
          if (zen) { e.preventDefault(); toggleZen(); }
          else if (eng?.stats.selected) { e.preventDefault(); release(); }
          break;
        case "KeyF": e.preventDefault(); toggleZen(); break;
        case "KeyR": e.preventDefault(); restart(); break;
        case "KeyN": e.preventDefault(); stepOnce(); break;
        case "KeyP":
          if (!eng) return;
          e.preventDefault();
          patch({ showPoints: !eng.opts.showPoints });
          break;
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [zen, intro, guide, toggleZen, restart, stepOnce, patch, release]);

  const setUnits = (i: number, d: number) => {
    const next = o.hidden.slice();
    next[i] = Math.max(MIN_UNITS, Math.min(MAX_UNITS, next[i] + d));
    patch({ hidden: next });
  };
  const addLayer = () => {
    if (o.hidden.length >= MAX_HIDDEN_LAYERS) return;
    patch({ hidden: [...o.hidden, o.hidden[o.hidden.length - 1] ?? 4] });
  };
  const dropLayer = () => {
    if (o.hidden.length === 0) return;
    patch({ hidden: o.hidden.slice(0, -1) });
  };

  const ds = dsCopy[DATASETS.findIndex(d => d.id === o.datasetId)] ?? dsCopy[0];
  const sel = hud.selected;
  const phaseTxt = hud.phase === "fwd" ? t.phaseFwd : hud.phase === "bwd" ? t.phaseBwd : t.phaseUpd;

  return (
    <div className={"shell room-nn" + (side ? " side-open" : "") + (zen ? " zen" : "")}>
      <canvas ref={canvasRef} className="shell-canvas" />
      <div className="veil" aria-hidden="true" />

      {gpu === false && (
        <div className="room-nogpu">
          <p className="room-nogpu-title">{t.noGpu}</p>
          <p>{t.noGpuSub}</p>
          <p><a className="side-back" href="/" style={{ width: "auto", padding: "0.48rem 1rem" }}>{t.noGpuBack}</a></p>
        </div>
      )}

      {/* ------------------------------------------------- cajón izquierdo */}
      {gpu && (
        <aside className="side">
          <div className="tools" role="toolbar" aria-label="herramientas">
            <button className="tool tool-side" onClick={() => setSide(s => !s)}
                    aria-expanded={side} aria-label={side ? t.collapse : t.expand}
                    title={side ? t.collapse : t.expand}>
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
            <button className="tool" onClick={restart}
                    aria-label={t.restart} title={`${t.restart} · R`}>
              <IcoDrop />
            </button>
            <button className={"tool" + (zen ? " on" : "")} onClick={toggleZen}
                    aria-pressed={zen} aria-label={t.fullscreen} title={`${t.fullscreen} · F`}>
              {zen ? <IcoShrink /> : <IcoExpand />}
            </button>
            <button className={"tool" + (intro || guide ? " on" : "")}
                    onClick={() => setIntro(true)}
                    aria-pressed={!!(intro || guide)} aria-label={t.guideBtn} title={t.guideBtn}>
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

            <div className="langs" role="group" aria-label="Idioma / Language">
              <button type="button" className={lang === "es" ? "on" : ""}
                      aria-pressed={lang === "es"} onClick={() => setLang("es")}>español</button>
              <button type="button" className={lang === "en" ? "on" : ""}
                      aria-pressed={lang === "en"} onClick={() => setLang("en")}>english</button>
            </div>

            <button className="guide-btn" onClick={() => setGuide("what")}
                    aria-label={t.guideBtn} title={t.guideBtn}>
              <IcoHelp />
              <span>{t.guideBtn}</span>
            </button>

            <p className="eyebrow">{t.dataset}</p>
            <div className="ctl-row ctl-col" role="group" aria-label={t.dataset}>
              {DATASETS.map((d, i) => (
                <button key={d.id} className={d.id === o.datasetId ? "on" : ""}
                        aria-pressed={d.id === o.datasetId}
                        onClick={() => patch({ datasetId: d.id })}>
                  {dsCopy[i]?.name ?? d.id}
                </button>
              ))}
            </div>

            {/* La arquitectura se edita aquí y no en un desplegable: es el
                mando que cambia la respuesta del suelo, y esconderlo detrás de
                un menú lo convierte en un ajuste en vez de en la pregunta. */}
            <p className="eyebrow">{t.architecture}</p>
            <div className="nn-arch">
              <p className="nn-arch-fixed">
                <span className="swatch" style={{ background: rgb(AXIS_X) }} />
                <span className="swatch" style={{ background: rgb(AXIS_Y) }} />
                2 {t.inputs}
              </p>
              {o.hidden.map((n, i) => (
                <div className="nn-arch-row" key={i}>
                  <span>{t.hiddenLayer(i + 1)}</span>
                  <button onClick={() => setUnits(i, -1)} disabled={n <= MIN_UNITS}
                          aria-label={t.removeUnit} title={t.removeUnit}>−</button>
                  <b>{n}</b>
                  <button onClick={() => setUnits(i, +1)} disabled={n >= MAX_UNITS}
                          aria-label={t.addUnit} title={t.addUnit}>+</button>
                </div>
              ))}
              <div className="ctl-row">
                <button onClick={dropLayer} disabled={o.hidden.length === 0}
                        aria-label={t.removeLayerA} title={t.removeLayerA}>− {t.removeLayer}</button>
                <button onClick={addLayer} disabled={o.hidden.length >= MAX_HIDDEN_LAYERS}
                        aria-label={t.addLayerA} title={t.addLayerA}>+ {t.addLayer}</button>
              </div>
              <p className="nn-arch-fixed">1 {t.output} · ŷ</p>
            </div>

            <p className="eyebrow">{t.activation}</p>
            <div className="ctl-row" role="group" aria-label={t.activation}>
              {actCopy.map(a => (
                <button key={a.id} className={o.act === a.id ? "on" : ""}
                        aria-pressed={o.act === a.id} title={a.desc}
                        onClick={() => patch({ act: a.id as ActId })}>{a.name}</button>
              ))}
            </div>

            <hr className="side-sep" />

            <label className="ctl-wide" htmlFor="nn-lr">
              <span className="lbl">{t.learnRate} <b>{o.lr.toFixed(3)}</b></span>
              <input id="nn-lr" type="range" min={0.005} max={1.0} step={0.005} value={o.lr}
                     onChange={e => patch({ lr: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="nn-batch">
              <span className="lbl">{t.batch} <b>{o.batch}</b></span>
              <input id="nn-batch" type="range" min={1} max={64} step={1} value={o.batch}
                     onChange={e => patch({ batch: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="nn-speed">
              <span className="lbl">{t.speed} <b>{o.speed} {t.batches}/s</b></span>
              <input id="nn-speed" type="range" min={1} max={400} step={1} value={o.speed}
                     onChange={e => patch({ speed: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="nn-noise">
              <span className="lbl">{t.noise} <b>{Math.round(o.noise * 100)}%</b></span>
              <input id="nn-noise" type="range" min={0} max={0.5} step={0.02} value={o.noise}
                     onChange={e => patch({ noise: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="nn-field">
              <span className="lbl">{t.fieldAlpha} <b>{Math.round(o.fieldAlpha * 100)}%</b></span>
              <input id="nn-field" type="range" min={0.15} max={1} step={0.05} value={o.fieldAlpha}
                     onChange={e => patch({ fieldAlpha: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="nn-edge">
              <span className="lbl">{t.edgeAlpha} <b>{o.edgeAlpha.toFixed(2)}×</b></span>
              <input id="nn-edge" type="range" min={0.2} max={2.2} step={0.05} value={o.edgeAlpha}
                     onChange={e => patch({ edgeAlpha: Number(e.target.value) })} />
            </label>

            <p className="eyebrow">{t.showPoints}</p>
            <div className="ctl-row" role="group" aria-label={t.showPoints}>
              <button className={o.showPoints ? "on" : ""} aria-pressed={o.showPoints}
                      onClick={() => patch({ showPoints: true })}>{t.on}</button>
              <button className={!o.showPoints ? "on" : ""} aria-pressed={!o.showPoints}
                      onClick={() => patch({ showPoints: false })}>{t.off}</button>
            </div>

            <p className="eyebrow">{t.showPulses}</p>
            <div className="ctl-row" role="group" aria-label={t.showPulses}>
              <button className={o.showPulses ? "on" : ""} aria-pressed={o.showPulses}
                      onClick={() => patch({ showPulses: true })}>{t.on}</button>
              <button className={!o.showPulses ? "on" : ""} aria-pressed={!o.showPulses}
                      onClick={() => patch({ showPulses: false })}>{t.off}</button>
            </div>
          </div>
        </aside>
      )}

      {/* ----------------------------------------------------- raíl derecho */}
      {gpu && (
        <div className="rail rail-r">
          <div className="hud">
            <div className="ctl-head nn-head">
              <span className="eyebrow">{t.hudTitle}</span>
              <span className="fps">{hud.fps.toFixed(0)} fps</span>
            </div>

            <p className={"nn-phase nn-phase-" + hud.phase}>
              <i aria-hidden="true" />{phaseTxt}
            </p>

            <LossChart history={hud.history} label={t.lossCurve} />
            <p className="stat nn-legend">
              <span><i className="nn-key" style={{ background: rgb(CLASS_B) }} />{t.lossTrain} <b>{hud.lossTrain.toFixed(3)}</b></span>
              <span><i className="nn-key nn-key-dash" />{t.lossTest} <b>{hud.lossTest.toFixed(3)}</b></span>
            </p>

            <p className="stat nn-big">
              {t.accuracy} <b>{(hud.acc * 100).toFixed(1)}%</b>
              <span className="hint"> · {(hud.accTest * 100).toFixed(1)}% ({lang === "es" ? "prueba" : "test"})</span>
            </p>
            <p className="stat hint">
              {hud.batches.toLocaleString(nf)} {t.batches} · {hud.epochs.toLocaleString(nf)} {t.epochs} · {hud.arch.join("–")}
              {hud.dead > 0 && <> · <b style={{ color: rgb(CLASS_A) }}>{t.deadUnits(hud.dead)}</b></>}
            </p>
          </div>

          <aside className="card card-open">
            {sel ? (
              <>
                <header className="card-head">
                  <p className="kicker">
                    {sel.kind === "input" ? t.cardInput
                      : sel.kind === "output" ? t.cardOutput
                      : t.cardHidden(sel.layer)}
                  </p>
                </header>
                <h2 className="card-title">{sel.tag}</h2>
                <div className="card-body">
                  <p className="note">
                    {sel.kind === "input" ? t.cardInputNote
                      : sel.kind === "output" ? t.cardFloorOut
                      : t.cardFloorNote}
                  </p>
                  {sel.dead && <p className="err">{t.deadNote}</p>}
                  {sel.kind !== "input" && (
                    <>
                      <p className="stat">
                        {t.bias} <b>{sel.bias >= 0 ? "+" : "−"}{Math.abs(sel.bias).toFixed(2)}</b>
                        {" · "}{t.meanAct} <b>{sel.mean.toFixed(2)}</b>
                      </p>
                      <p className="kicker rule">{t.weightsIn}</p>
                      <WeightBars wIn={sel.wIn} />
                    </>
                  )}
                  <p className="foot phase nn-foot">
                    <button className="ghost" onClick={release}>{t.release} <kbd>esc</kbd></button>
                    <button className="card-guide-btn" onClick={() => setGuide("neuron")}
                            aria-label={t.guideBtn}>
                      <span>{t.guideShort}</span>
                    </button>
                  </p>
                </div>
              </>
            ) : (
              <>
                <header className="card-head">
                  <p className="kicker">{ds.name}</p>
                </header>
                <h2 className="card-title">{t.startTitle}</h2>
                <div className="card-body">
                  <p className="note">{ds.desc}</p>
                  <p className="note">{t.startLede}</p>
                  <ul className="nn-read">
                    <li>
                      <span className="nn-read-i nn-read-floor" aria-hidden="true" />
                      <span><b>{t.readFloor}</b> {t.readFloorTxt}</span>
                    </li>
                    <li>
                      <span className="nn-read-i nn-read-edge" aria-hidden="true" />
                      <span><b>{t.readEdges}</b> {t.readEdgesTxt}</span>
                    </li>
                    <li>
                      <span className="nn-read-i nn-read-node" aria-hidden="true" />
                      <span><b>{t.readNodes}</b> {t.readNodesTxt}</span>
                    </li>
                  </ul>
                  <p className="foot phase nn-foot">
                    <span>{t.startHint}</span>
                    <button className="card-guide-btn" onClick={() => setGuide("what")}
                            aria-label={t.guideBtn}>
                      <span>{t.guideShort}</span>
                    </button>
                  </p>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* ------------------------------------------------ sobre el lienzo */}
      {gpu && sel && !zen && (
        <div className="held">
          <span className="held-w">{t.held(sel.tag)}</span>
          <button onClick={release}>{t.release} <kbd>esc</kbd></button>
        </div>
      )}

      {gpu && !zen && !roamed && !sel && hud.batches < 40 && (
        <p className="coach" aria-live="polite">{t.coach}</p>
      )}
      {gpu && !zen && !sel && hud.batches >= 40 && hud.batches < 260 && (
        <p className="coach" aria-live="polite">{t.coachPick}</p>
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

      <GpuRoomLoader roomName={lang === "es" ? "RED NEURONAL" : "NEURAL NETWORK"} />

      {intro && (
        <NnWelcome
          lang={lang}
          onClose={() => setIntro(false)}
          onGuide={() => { setIntro(false); setGuide("what"); }}
        />
      )}

      {guide && (
        <NnGuide
          lang={lang}
          initialChapter={guide}
          onClose={() => setGuide(null)}
          onIntro={() => { setGuide(null); setIntro(true); }}
        />
      )}
    </div>
  );
}
