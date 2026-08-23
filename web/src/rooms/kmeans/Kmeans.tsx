import { useEffect, useRef, useState, useCallback } from "react";
import { KmeansEngine, gpuAvailable, DEFAULTS, type KmeansOptions, type EngineStats } from "./engine";
import { DATASET_PRESETS, CLUSTER_PALETTE } from "./math";
import { typing } from "../../galaxy/keys.mjs";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep, IcoDrop
} from "../../components/icons";
import KmeansGuide, { type KmeansChapterId } from "./KmeansGuide";
import GpuRoomLoader from "../../components/GpuRoomLoader";
import { useAtlasLang } from "../../i18n";
import { KMEANS_COPY, KMEANS_PRESETS_I18N, KMEANS_PHASES_I18N } from "../../i18n/kmeans";

const KMEANS_INTRO_KEY = "kmeans.intro.v1";

function kmeansIntroPending(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(location.search);
  if (q.get("dataset") || q.get("guide")) return false;
  try {
    return localStorage.getItem(KMEANS_INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

function rememberKmeansIntro(): void {
  try {
    localStorage.setItem(KMEANS_INTRO_KEY, "1");
  } catch {}
}

export default function Kmeans() {
  const [lang, setLang] = useAtlasLang();
  const t = KMEANS_COPY[lang];
  const presetsList = KMEANS_PRESETS_I18N[lang];
  const phasesList = KMEANS_PHASES_I18N[lang];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<KmeansEngine | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<KmeansOptions>({ ...DEFAULTS });
  const [legend, setLegend] = useState(false);
  const [stats, setStats] = useState<EngineStats>({
    fps: 0,
    currentStepIndex: 0,
    totalSteps: 0,
    iteration: 0,
    phase: "init",
    activeMessage: lang === "es" ? "Iniciando simulación..." : "Starting simulation...",
    inertia: 0,
    maxDelta: 0,
    k: 5,
    pointCount: 3000,
    isPlaying: true,
    clusterCounts: [],
    centroidsInfo: [],
    selectedPoint: null,
    hoveredCentroid: null,
    elbowAnalysis: { curve: [], optimalK: 5 },
  });

  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [guide, setGuide] = useState<KmeansChapterId | null>(() => (kmeansIntroPending() ? "what" : null));

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) {
        if (!dead) setGpu(false);
        return;
      }
      setGpu(true);
      const e = new KmeansEngine(device, canvasRef.current);
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
      setStats({ ...e.stats });
      setRoamed(e.roamed);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const patch = useCallback((p: Partial<KmeansOptions>) => {
    engineRef.current?.set(p);
    setO(prev => ({ ...prev, ...p }));
  }, []);

  const pickPreset = useCallback((id: string) => {
    patch({ datasetId: id });
  }, [patch]);

  const handlePlayPause = useCallback(() => {
    const next = !o.autoPlay;
    patch({ autoPlay: next });
  }, [o.autoPlay, patch]);

  const handleStepForward = useCallback(() => {
    engineRef.current?.stepForward();
    if (engineRef.current) setStats({ ...engineRef.current.stats });
  }, []);

  const handleStepBackward = useCallback(() => {
    engineRef.current?.stepBackward();
    if (engineRef.current) setStats({ ...engineRef.current.stats });
  }, []);

  const handleReset = useCallback(() => {
    engineRef.current?.reset();
    if (engineRef.current) setStats({ ...engineRef.current.stats });
  }, []);

  const handleSeek = useCallback((stepIdx: number) => {
    engineRef.current?.seek(stepIdx);
    if (engineRef.current) setStats({ ...engineRef.current.stats });
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
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || guide) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleStepForward();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleStepBackward();
          break;
        case "KeyR":
          e.preventDefault();
          handleReset();
          break;
        case "KeyF":
          e.preventDefault();
          toggleZen();
          break;
        case "KeyH":
        case "Home":
          e.preventDefault();
          goHome();
          break;
        case "Tab":
          e.preventDefault();
          setSide(s => !s);
          break;
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [handlePlayPause, handleStepForward, handleStepBackward, handleReset, toggleZen, goHome, guide]);

  const rawPreset = DATASET_PRESETS.find(p => p.id === o.datasetId) || DATASET_PRESETS[0];
  const localizedPreset = presetsList.find(p => p.id === o.datasetId) || presetsList[0];
  const currentPreset = {
    ...rawPreset,
    name: localizedPreset.name,
    desc: localizedPreset.desc,
  };
  const progress = stats.totalSteps > 1 ? stats.currentStepIndex / (stats.totalSteps - 1) : 0;

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

      {/* Buscador de Conceptos Semánticos */}
      <div
        style={{
          position: "fixed",
          top: "1.4rem",
          left: side ? "calc(var(--side-w, 18rem) + 1.5rem)" : "4.8rem",
          transition: "left 0.25s ease",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "rgba(16, 18, 24, 0.88)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: "8px",
          padding: "0.3rem 0.6rem",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--ink-2)" }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          placeholder={t.searchPlaceholder}
          onChange={(e) => engineRef.current?.searchConcept(e.target.value)}
          style={{
            background: "none",
            border: "none",
            outline: "none",
            color: "var(--ink)",
            fontSize: "0.82rem",
            width: "10rem",
          }}
        />
      </div>

      {/* Hover Centroid Floating Tooltip */}
      {stats.hoveredCentroid && (
        <div
          style={{
            position: "fixed",
            top: "1.4rem",
            right: "1.5rem",
            zIndex: 10,
            background: "rgba(16, 18, 24, 0.88)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 215, 0, 0.3)",
            borderRadius: "8px",
            padding: "0.5rem 0.9rem",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            fontSize: "0.82rem",
          }}
        >
          <span style={{ color: "#ffd700", fontWeight: 700 }}>μ{stats.hoveredCentroid.id + 1}</span>
          <strong style={{ color: "var(--ink)" }}>&ldquo;{stats.hoveredCentroid.label}&rdquo;</strong>
          <span style={{ color: "var(--ink-3)" }}>|</span>
          <span style={{ color: "var(--ink-2)" }}>{lang === "es" ? "Puntos:" : "Points:"} <code>{stats.hoveredCentroid.count}</code></span>
        </div>
      )}

      {/* Cajón izquierdo */}
      <aside className="side" aria-label="Controles de K-Means">
        <div className="tools">
          <button
            className="tool tool-side"
            onClick={() => setSide(s => !s)}
            title={side ? t.collapse : t.expand}
            aria-label={t.collapse}
          >
            <IcoChevron open={side} />
          </button>
          <button
            className="tool tool-home"
            onClick={goHome}
            title={`${t.fullView} (H)`}
            aria-label={t.fullView}
          >
            <IcoFit />
          </button>
          <button
            className={"tool" + (o.autoPlay ? " on" : "")}
            onClick={handlePlayPause}
            title={o.autoPlay ? `${t.pause} · Space` : `${t.resume} · Space`}
            aria-label={o.autoPlay ? t.pause : t.resume}
          >
            {o.autoPlay ? <IcoPause /> : <IcoPlay />}
          </button>
          <button
            className="tool"
            onClick={handleStepForward}
            title={`${t.stepForward} (→)`}
            aria-label={t.stepForward}
          >
            <IcoStep />
          </button>
          <button
            className="tool"
            onClick={handleReset}
            title={`${t.reinitialize} (R)`}
            aria-label={t.reinitialize}
          >
            <IcoDrop />
          </button>
          <button
            className={"tool" + (zen ? " on" : "")}
            onClick={toggleZen}
            title={`${t.fullscreen} (F)`}
            aria-label={t.fullscreen}
          >
            {zen ? <IcoShrink /> : <IcoExpand />}
          </button>
          <button
            className="tool"
            onClick={() => setGuide("what")}
            title={`${t.guideBtn} (?)`}
            aria-label={t.guideBtn}
          >
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

          <p className="eyebrow">{t.dataset}</p>
          <div className="ctl-row ctl-col" role="group" aria-label={t.dataset}>
            {DATASET_PRESETS.map((p, idx) => (
              <button
                key={p.id}
                className={p.id === o.datasetId ? "on" : ""}
                aria-pressed={p.id === o.datasetId}
                onClick={() => pickPreset(p.id)}
              >
                {presetsList[idx]?.name ?? p.name}
              </button>
            ))}
          </div>

          <p className="eyebrow">{t.numClustersK}</p>
          <div className="ctl-row" role="group" aria-label={t.numClustersK}>
            {[2, 3, 4, 5, 6, 8].map((kv) => (
              <button
                key={kv}
                className={kv === o.k ? "on" : ""}
                aria-pressed={kv === o.k}
                onClick={() => patch({ k: kv })}
              >
                K={kv}
              </button>
            ))}
          </div>

          <p className="eyebrow">{t.initStrategy}</p>
          <div className="ctl-row" role="group" aria-label={t.initStrategy}>
            <button
              className={o.initMethod === "kmeans_plus_plus" ? "on" : ""}
              aria-pressed={o.initMethod === "kmeans_plus_plus"}
              onClick={() => patch({ initMethod: "kmeans_plus_plus" })}
            >
              {t.kmeansPlusPlus}
            </button>
            <button
              className={o.initMethod === "random" ? "on" : ""}
              aria-pressed={o.initMethod === "random"}
              onClick={() => patch({ initMethod: "random" })}
            >
              {t.randomForgy}
            </button>
          </div>

          <p className="eyebrow">{t.vizVoronoi}</p>
          <div className="ctl-row" role="group" aria-label="Filamentos">
            <button
              className={o.showConstellations ? "on" : ""}
              aria-pressed={o.showConstellations}
              onClick={() => patch({ showConstellations: !o.showConstellations })}
            >
              {t.knnConstellations}
            </button>
            <button
              className={o.showTrajectories ? "on" : ""}
              aria-pressed={o.showTrajectories}
              onClick={() => patch({ showTrajectories: !o.showTrajectories })}
            >
              {t.trajectories}
            </button>
          </div>

          <hr className="side-sep" />

          {/* Sección desplegable: Qué dice el color */}
          <button className={"cmp-tab" + (legend ? " on" : "")}
                  onClick={() => setLegend(l => !l)} aria-expanded={legend}>
            <span className="cmp-tab-w">{lang === "es" ? "Qué dice el color" : "Color coding"}</span>
            <span className="cmp-caret"><IcoChevron open={!legend} /></span>
          </button>
          {legend && (
            <div className="ctl-panel legend" style={{ marginTop: "0.4rem" }}>
              <p className="key-line">
                <i className="ramp" style={{ background: "#ffd700", width: "10px", height: "10px", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
                <span><b>{lang === "es" ? "Centroides Gravitacionales:" : "Gravitational Centroids:"}</b> {lang === "es" ? "Puntos centrales μ calculados como la media vectorial de sus conceptos asignados." : "Central prototypes μ computed as empirical cluster mean vectors."}</span>
              </p>
              <p className="key-line">
                <i className="ramp" style={{ background: "#00d2ff", width: "10px", height: "10px", borderRadius: "50%", display: "inline-block" }} aria-hidden="true" />
                <span><b>{lang === "es" ? "Conceptos Semánticos:" : "Semantic Concepts:"}</b> {lang === "es" ? "Nodos del espacio latente coloreados por su dominio o partición de Voronoi." : "Latent points colored by Voronoi cell domain."}</span>
              </p>
              <p className="key-line">
                <i className="ramp" style={{ background: "rgba(255,255,255,0.4)", width: "12px", height: "2px", display: "inline-block" }} aria-hidden="true" />
                <span><b>{lang === "es" ? "Constelaciones k-NN:" : "k-NN Constellations:"}</b> {lang === "es" ? "Filamentos de vecindad intra-cluster que revelan la topología local." : "Intra-cluster filaments exposing local topology."}</span>
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Raíl derecho */}
      <div className="rail rail-r" role="region" aria-label="Telemetría de Clustering">
        {/* HUD TELEMETRÍA */}
        <div className="hud">
          <div className="ctl-head">
            <span className="eyebrow">{o.autoPlay ? (lang === "es" ? "Iterando" : "Iterating") : (lang === "es" ? "En pausa" : "Paused")}</span>
            <span className="fps">{stats.fps.toFixed(0)} fps</span>
          </div>

          <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)}
               aria-valuemin={0} aria-valuemax={100} aria-label="Progreso del clustering">
            <div className="fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--ink-2)", marginTop: "0.2rem" }}>
            <span>{lang === "es" ? `Paso ${stats.currentStepIndex + 1} / ${stats.totalSteps}` : `Step ${stats.currentStepIndex + 1} / ${stats.totalSteps}`}</span>
            <span>{lang === "es" ? `Iteración ${stats.iteration}` : `Iteration ${stats.iteration}`}</span>
          </div>
        </div>

        {/* TARJETA DE CONCEPTO SEMÁNTICO */}
        <section className="card">
          <p className="card-head">
            <span>{t.semanticConcept}</span>
            {stats.selectedPoint ? (
              <span className="card-val" style={{ color: `rgb(${CLUSTER_PALETTE[stats.selectedPoint.cluster % CLUSTER_PALETTE.length].map(c=>Math.round(c*255)).join(",")})` }}>
                μ{stats.selectedPoint.cluster + 1}
              </span>
            ) : (
              <span className="card-val" style={{ color: "var(--ink-3)" }}>{t.clickIn3D}</span>
            )}
          </p>
          {stats.selectedPoint ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.35rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "1.05rem", color: "var(--ink)" }}>&ldquo;{stats.selectedPoint.label}&rdquo;</strong>
                <button
                  className="tool"
                  onClick={() => engineRef.current?.selectPoint(-1)}
                  style={{ width: "1.4rem", height: "1.4rem", borderRadius: "4px", fontSize: "0.72rem", padding: 0 }}
                  title="Deseleccionar"
                >
                  ✕
                </button>
              </div>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ink-2)" }}>
                {lang === "es" ? "Dominio:" : "Domain:"} <b style={{ color: `rgb(${CLUSTER_PALETTE[stats.selectedPoint.cluster % CLUSTER_PALETTE.length].map(c=>Math.round(c*255)).join(",")})` }}>{stats.selectedPoint.domain}</b>
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--ink-3)", marginTop: "0.1rem" }}>
                <span>{lang === "es" ? "Distancia:" : "Distance:"} <code>{stats.selectedPoint.distToCentroid.toFixed(3)}</code></span>
                <span>({stats.selectedPoint.coords[0].toFixed(2)}, {stats.selectedPoint.coords[1].toFixed(2)})</span>
              </div>
            </div>
          ) : (
            <p className="card-desc" style={{ fontSize: "0.78rem", color: "var(--ink-3)", margin: "0.2rem 0" }}>
              {lang === "es"
                ? "Haz clic en cualquier punto de la constelación 3D para inspeccionar sus coordenadas y distancias."
                : "Click any point in the 3D constellation to inspect coordinates and nearest centroid distances."}
            </p>
          )}
        </section>

        {/* MÉTODO DEL CODO */}
        <section className="card">
          <p className="card-head">
            <span>{t.elbowMethod}</span>
            <span className="card-val" style={{ color: "#ffd700" }}>
              K* = {stats.elbowAnalysis?.optimalK || 5}
            </span>
          </p>

          {stats.elbowAnalysis?.curve && stats.elbowAnalysis.curve.length > 0 && (() => {
            const curve = stats.elbowAnalysis.curve;
            const svgW = 230;
            const svgH = 88;
            const padL = 26;
            const padR = 12;
            const padT = 14;
            const padB = 18;
            const plotW = svgW - padL - padR;
            const plotH = svgH - padT - padB;

            const yMax = curve[0].inertia;
            const yMin = Math.max(0, curve[curve.length - 1].inertia * 0.85);
            const yRange = yMax - yMin || 1;

            const points = curve.map((pt, i) => {
              const x = padL + (i / (curve.length - 1)) * plotW;
              const y = padT + (1 - (pt.inertia - yMin) / yRange) * plotH;
              return { ...pt, x, y };
            });

            const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
            const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

            const currentPt = curve.find(p => p.k === o.k) || curve[0];
            const silScore = currentPt ? currentPt.silhouette : 0;
            const silQuality = silScore > 0.45 ? (lang === "es" ? "Excelente" : "Excellent") : silScore > 0.25 ? (lang === "es" ? "Aceptable" : "Acceptable") : (lang === "es" ? "Subóptimo" : "Suboptimal");
            const silColor = silScore > 0.45 ? "#52e078" : silScore > 0.25 ? "#ffd700" : "var(--ink-3)";

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.35rem" }}>
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  style={{ width: "100%", height: "88px", background: "rgba(0,0,0,0.22)", borderRadius: "6px", overflow: "visible" }}
                >
                  <defs>
                    <linearGradient id="elbowFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffd700" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#ffd700" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

                  <path d={areaD} fill="url(#elbowFill)" />
                  <path d={pathD} fill="none" stroke="#ffd700" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                  {points.map((p) => {
                    const isCur = p.k === o.k;
                    const isOpt = p.isOptimal;

                    return (
                      <g key={p.k} onClick={() => patch({ k: p.k })} style={{ cursor: "pointer" }}>
                        {isCur && (
                          <circle cx={p.x} cy={p.y} r="8" fill="none" stroke="#ffd700" strokeWidth="1.5" opacity="0.85" />
                        )}

                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isCur ? 4.5 : 3.0}
                          fill={isOpt ? "#ffd700" : isCur ? "#ffffff" : "#00d2ff"}
                          stroke="#101218"
                          strokeWidth="1.5"
                        />

                        {isOpt && (
                          <text
                            x={p.x}
                            y={p.y - 7}
                            textAnchor="middle"
                            fill="#ffd700"
                            fontSize="8"
                            fontWeight="bold"
                          >
                            {lang === "es" ? "Codo" : "Elbow"}
                          </text>
                        )}

                        <text
                          x={p.x}
                          y={svgH - 4}
                          textAnchor="middle"
                          fill={isCur ? "#ffd700" : "var(--ink-3)"}
                          fontSize="8.5"
                          fontWeight={isCur ? "bold" : "normal"}
                        >
                          {p.k}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem", fontSize: "0.72rem" }}>
                  <div style={{ padding: "0.3rem 0.45rem", background: "rgba(255,255,255,0.04)", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ color: "var(--ink-3)", display: "block", fontSize: "0.66rem" }}>{t.selectedK}</span>
                    <strong style={{ color: "#ffd700", fontSize: "0.86rem" }}>K = {o.k}</strong>
                  </div>

                  <div style={{ padding: "0.3rem 0.45rem", background: "rgba(255,255,255,0.04)", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ color: "var(--ink-3)", display: "block", fontSize: "0.66rem" }}>{t.silhouette} s ({silQuality})</span>
                    <strong style={{ color: silColor, fontSize: "0.86rem" }}>{silScore.toFixed(2)}</strong>
                  </div>
                </div>
                <p className="card-desc" style={{ fontSize: "0.70rem", color: "var(--ink-3)", margin: "0" }}>
                  {lang === "es" ? "Haz clic en cualquier punto de la curva para saltar a ese valor de K." : "Click any point along the curve to switch to that K value."}
                </p>
              </div>
            );
          })()}
        </section>

        {/* INERCIA WCSS */}
        <section className="card">
          <p className="card-head">
            <span>{t.wcssInertia}</span>
            <span className="card-val" style={{ color: "#ffd700" }}>WCSS</span>
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.4rem", textAlign: "center" }}>
            <div style={{ padding: "0.4rem", background: "rgba(255, 215, 0, 0.08)", border: "1px solid rgba(255, 215, 0, 0.2)", borderRadius: "4px" }}>
              <span style={{ fontSize: "0.7rem", color: "#ffd700", display: "block" }}>{t.wcssInertia}</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--ink)" }}>{stats.inertia > 0 ? stats.inertia.toFixed(0) : "—"}</strong>
            </div>
            <div style={{ padding: "0.4rem", background: "rgba(0, 210, 255, 0.08)", border: "1px solid rgba(0, 210, 255, 0.2)", borderRadius: "4px" }}>
              <span style={{ fontSize: "0.7rem", color: "#00d2ff", display: "block" }}>{t.deltaCentroids}</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--ink)" }}>{stats.maxDelta.toFixed(3)}</strong>
            </div>
          </div>
        </section>

        {/* DOMINIOS SEMÁNTICOS */}
        <section className="card">
          <p className="card-head">
            <span>{t.semanticDomains}</span>
            <span className="card-val">{o.k} {lang === "es" ? "grupos" : "clusters"}</span>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.4rem" }}>
            {stats.centroidsInfo.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "4px",
                  fontSize: "0.74rem",
                  background: `rgba(${c.color.map(v => Math.round(v * 255)).join(",")}, 0.12)`,
                  border: `1px solid rgba(${c.color.map(v => Math.round(v * 255)).join(",")}, 0.35)`,
                }}
              >
                <span style={{ color: `rgb(${c.color.map(v => Math.round(v * 255)).join(",")})`, fontWeight: 600 }}>
                  μ{c.id + 1} · {c.label}
                </span>
                <span style={{ color: "var(--ink-2)", fontSize: "0.7rem" }}>
                  {c.count} {lang === "es" ? "conceptos" : "concepts"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Dock de reproducción flotante */}
      <div
        style={{
          position: "fixed",
          bottom: "1.4rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
          background: "rgba(16, 18, 24, 0.90)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          borderRadius: "16px",
          padding: "0.6rem 1rem",
          boxShadow: "0 10px 36px rgba(0, 0, 0, 0.55)",
          width: "min(48rem, 92vw)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
            <span
              style={{
                padding: "0.14rem 0.45rem",
                borderRadius: "4px",
                fontSize: "0.70rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                background: stats.phase === "converged" ? "rgba(255, 215, 0, 0.25)" : stats.phase === "update_m" ? "rgba(0, 210, 255, 0.25)" : "rgba(82, 224, 120, 0.25)",
                color: stats.phase === "converged" ? "#ffd700" : stats.phase === "update_m" ? "#00d2ff" : "#52e078",
                border: "1px solid currentColor",
                flexShrink: 0,
              }}
            >
              {phasesList[stats.phase] ?? stats.phase}
            </span>
            <span style={{ color: "var(--ink)", fontSize: "0.82rem", fontWeight: 500, lineHeight: 1.3 }}>
              {stats.activeMessage}
            </span>
          </div>
          <span style={{ color: "var(--ink-3)", fontSize: "0.78rem", fontFamily: "monospace", flexShrink: 0 }}>
            {lang === "es" ? `Paso ${stats.currentStepIndex + 1} / ${stats.totalSteps}` : `Step ${stats.currentStepIndex + 1} / ${stats.totalSteps}`}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", width: "100%" }}>
          <button
            className={"tool" + (o.autoPlay ? " on" : "")}
            onClick={handlePlayPause}
            title={`${o.autoPlay ? t.pause : t.resume} (Space)`}
          >
            {o.autoPlay ? <IcoPause /> : <IcoPlay />}
          </button>

          <button
            className="tool"
            onClick={handleStepBackward}
            disabled={stats.currentStepIndex <= 0}
            style={{ transform: "rotate(180deg)" }}
            title={`${t.stepBackward} (←)`}
          >
            <IcoStep />
          </button>

          <button
            className="tool"
            onClick={handleStepForward}
            disabled={stats.currentStepIndex >= stats.totalSteps - 1}
            title={`${t.stepForward} (→)`}
          >
            <IcoStep />
          </button>

          <button
            className="tool"
            onClick={handleReset}
            title={`${t.reinitialize} (R)`}
          >
            <IcoDrop />
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(0, stats.totalSteps - 1)}
            value={stats.currentStepIndex}
            onChange={(e) => handleSeek(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: "#ffd700",
              cursor: "pointer",
              height: "5px",
            }}
            title={`${t.step} ${stats.currentStepIndex + 1} / ${stats.totalSteps}`}
          />

          <button
            className="tool"
            onClick={() => patch({ playbackSpeed: o.playbackSpeed >= 3.0 ? 1.0 : o.playbackSpeed + 0.5 })}
            style={{
              fontSize: "0.74rem",
              width: "auto",
              padding: "0 0.55rem",
              fontFamily: "monospace",
            }}
            title={t.speed}
          >
            {o.playbackSpeed.toFixed(1)}x
          </button>
        </div>
      </div>

      <GpuRoomLoader 
        roomName={lang === "es" ? "K-MEANS CLUSTERING 3D" : "K-MEANS CLUSTERING 3D"} 
      />

      {guide && (
        <KmeansGuide
          lang={lang}
          initialChapter={guide}
          onClose={() => {
            rememberKmeansIntro();
            setGuide(null);
          }}
        />
      )}
    </div>
  );
}
