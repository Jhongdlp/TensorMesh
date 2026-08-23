import { useEffect, useRef, useState, useCallback } from "react";
import { HnswEngine, gpuAvailable, DEFAULTS, type HnswOptions, type EngineStats } from "./engine";
import { DATASET_PRESETS } from "./math";
import { typing } from "../../galaxy/keys.mjs";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep
} from "../../components/icons";
import HnswWelcome, { hnswIntroPending } from "./HnswWelcome";
import HnswGuide, { type HnswChapterId } from "./HnswGuide";
import GpuRoomLoader from "../../components/GpuRoomLoader";
import { useAtlasLang } from "../../i18n";
import { HNSW_COPY, HNSW_DATASETS_I18N, HNSW_LAYERS_I18N } from "../../i18n/hnsw";

export default function Hnsw() {
  const [lang, setLang] = useAtlasLang();
  const t = HNSW_COPY[lang];
  const datasetList = HNSW_DATASETS_I18N[lang];
  const layersList = HNSW_LAYERS_I18N[lang];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<HnswEngine | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<HnswOptions>({ ...DEFAULTS });
  const [stats, setStats] = useState<EngineStats>({
    fps: 0,
    currentStepIndex: 0,
    totalSteps: 0,
    currentLayer: 2,
    currentNodeId: 0,
    currentNodeLabel: "",
    totalComparisons: 0,
    bruteForceComparisons: 0,
    recall: 1.0,
    activeMessage: lang === "es" ? "Iniciando búsqueda..." : "Starting search...",
    topK: [],
    isPlaying: true,
    l2Count: 6,
    l1Count: 28,
    l0Count: 160,
    hoveredNode: null,
  });

  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [intro, setIntro] = useState(() => hnswIntroPending());
  const [guide, setGuide] = useState<HnswChapterId | null>(null);

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) {
        if (!dead) setGpu(false);
        return;
      }
      setGpu(true);
      const e = new HnswEngine(device, canvasRef.current);
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

  const patch = useCallback((p: Partial<HnswOptions>) => {
    engineRef.current?.set(p);
    setO(prev => ({ ...prev, ...p }));
  }, []);

  const pickDataset = useCallback((id: string) => {
    engineRef.current?.loadDataset(id);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);

  const triggerQuery = useCallback((pos?: { x: number; z: number }) => {
    if (pos) engineRef.current?.setQuery(pos);
    else {
      const rx = (Math.random() - 0.5) * 1.6;
      const rz = (Math.random() - 0.5) * 1.6;
      engineRef.current?.setQuery({ x: rx, z: rz });
    }
    if (engineRef.current) setStats({ ...engineRef.current.stats });
  }, []);

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
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || intro || guide) return;
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
        case "KeyQ":
          e.preventDefault();
          triggerQuery();
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
  }, [handlePlayPause, handleStepForward, handleStepBackward, handleReset, triggerQuery, toggleZen, goHome, intro, guide]);

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

      {/* Floating Query Trigger Button */}
      <button
        onClick={() => triggerQuery()}
        style={{
          position: "fixed",
          top: "1.4rem",
          left: side ? "calc(var(--side-w, 18rem) + 1.5rem)" : "4.8rem",
          transition: "left 0.25s ease",
          zIndex: 10,
          background: "linear-gradient(135deg, #ffd700, #ff8c00)",
          color: "#0a0a0c",
          fontWeight: 700,
          border: "none",
          borderRadius: "8px",
          padding: "0.55rem 1.1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.85rem",
          boxShadow: "0 4px 16px rgba(255, 215, 0, 0.35)",
          cursor: "pointer",
        }}
        title={`${t.triggerQuery} (Q)`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>{t.triggerQuery}</span>
      </button>

      {/* Hover Node Floating Tooltip */}
      {stats.hoveredNode && (
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
          <span style={{ color: "#ffd700", fontWeight: 700 }}>#{stats.hoveredNode.id}</span>
          <strong style={{ color: "var(--ink)" }}>&ldquo;{stats.hoveredNode.label}&rdquo;</strong>
          <span style={{ color: "var(--ink-3)" }}>|</span>
          <span style={{ color: "var(--ink-2)" }}>{lang === "es" ? "Distancia a Query:" : "Distance to Query:"} <code>{stats.hoveredNode.dist.toFixed(3)}</code></span>
          <span style={{ color: "var(--ink-3)" }}>|</span>
          <span style={{ color: "#00d2ff" }}>{lang === "es" ? `Llega hasta Capa L${stats.hoveredNode.layer}` : `Up to Layer L${stats.hoveredNode.layer}`}</span>
        </div>
      )}

      {/* Cajón lateral izquierdo */}
      <aside className="side" aria-label="Controles de HNSW">
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
                onClick={() => pickDataset(p.id)}
              >
                {datasetList[idx]?.name ?? p.name}
              </button>
            ))}
          </div>

          <p className="eyebrow">{t.layerSpacing}</p>
          <label className="ctl-wide" htmlFor="layerSpacing">
            <span className="ctl-head">
              <span>{t.layerSpacing}</span>
              <span className="ctl-val">{o.layerSpacing.toFixed(2)}</span>
            </span>
            <input
              id="layerSpacing"
              type="range"
              min="0.8"
              max="2.4"
              step="0.05"
              value={o.layerSpacing}
              onChange={(e) => patch({ layerSpacing: Number(e.target.value) })}
            />
          </label>

          <p className="eyebrow">{t.isolateLayer}</p>
          <div className="ctl-row" role="group" aria-label={t.isolateLayer}>
            {[-1, 2, 1, 0].map((lvl) => (
              <button
                key={lvl}
                className={lvl === o.activeLayer ? "on" : ""}
                aria-pressed={lvl === o.activeLayer}
                onClick={() => patch({ activeLayer: lvl })}
              >
                {lvl === -1 ? (lang === "es" ? "Todas" : "All") : `L${lvl}`}
              </button>
            ))}
          </div>

          <hr className="side-sep" />

          <p className="eyebrow">{t.hnswHyperparams}</p>
          <label className="ctl-wide" htmlFor="paramM">
            <span className="ctl-head">
              <span>{t.paramM}</span>
              <span className="ctl-val">{o.M}</span>
            </span>
            <input
              id="paramM"
              type="range"
              min="4"
              max="16"
              step="2"
              value={o.M}
              onChange={(e) => patch({ M: Number(e.target.value) })}
            />
          </label>

          <label className="ctl-wide" htmlFor="paramEf">
            <span className="ctl-head">
              <span>{t.paramEf}</span>
              <span className="ctl-val">{o.efSearch}</span>
            </span>
            <input
              id="paramEf"
              type="range"
              min="4"
              max="32"
              step="4"
              value={o.efSearch}
              onChange={(e) => patch({ efSearch: Number(e.target.value) })}
            />
          </label>

          <label className="ctl-wide" htmlFor="paramK">
            <span className="ctl-head">
              <span>{t.paramK}</span>
              <span className="ctl-val">{o.K}</span>
            </span>
            <input
              id="paramK"
              type="range"
              min="1"
              max="10"
              step="1"
              value={o.K}
              onChange={(e) => patch({ K: Number(e.target.value) })}
            />
          </label>
        </div>
      </aside>

      {/* Raíl derecho */}
      <div className="rail rail-r" role="region" aria-label="Traza de la búsqueda">
        <section className="card">
          <p className="card-head">
            <span>{t.multiLayerStructure}</span>
            <span className="card-val" style={{ color: "#ffd700" }}>HNSW</span>
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.3rem", marginTop: "0.4rem", textAlign: "center" }}>
            <div style={{ padding: "0.35rem", background: "rgba(255, 215, 0, 0.08)", border: "1px solid rgba(255, 215, 0, 0.2)", borderRadius: "4px" }}>
              <span style={{ fontSize: "0.68rem", color: "#ffd700", display: "block" }}>{layersList[2]?.name ?? "L2"}</span>
              <strong style={{ fontSize: "0.95rem", color: "var(--ink)" }}>{stats.l2Count}</strong>
            </div>
            <div style={{ padding: "0.35rem", background: "rgba(0, 210, 255, 0.08)", border: "1px solid rgba(0, 210, 255, 0.2)", borderRadius: "4px" }}>
              <span style={{ fontSize: "0.68rem", color: "#00d2ff", display: "block" }}>{layersList[1]?.name ?? "L1"}</span>
              <strong style={{ fontSize: "0.95rem", color: "var(--ink)" }}>{stats.l1Count}</strong>
            </div>
            <div style={{ padding: "0.35rem", background: "rgba(82, 224, 120, 0.08)", border: "1px solid rgba(82, 224, 120, 0.2)", borderRadius: "4px" }}>
              <span style={{ fontSize: "0.68rem", color: "#52e078", display: "block" }}>{layersList[0]?.name ?? "L0"}</span>
              <strong style={{ fontSize: "0.95rem", color: "var(--ink)" }}>{stats.l0Count}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="card-head">
            <span>{t.searchEfficiency}</span>
            <span className="card-val">
              {((stats.totalComparisons / Math.max(1, stats.bruteForceComparisons)) * 100).toFixed(0)}%
            </span>
          </p>
          <p className="card-desc" style={{ fontSize: "0.78rem", color: "var(--ink-2)", margin: "0.2rem 0" }}>
            {lang === "es"
              ? `${stats.totalComparisons} comparaciones vs ${stats.bruteForceComparisons} exhaustivas.`
              : `${stats.totalComparisons} evaluations vs ${stats.bruteForceComparisons} brute-force.`}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.4rem", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--ink-3)" }}>{t.recallLabel}:</span>
            <strong style={{ color: stats.recall >= 0.9 ? "#52e078" : "#ffd700" }}>
              {(stats.recall * 100).toFixed(0)}%
            </strong>
          </div>
        </section>

        <section className="card">
          <p className="card-head">
            <span>{t.topKNearest}</span>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.4rem" }}>
            {stats.topK.slice(0, o.K).map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.25rem 0.4rem",
                  background: idx === 0 ? "rgba(255, 215, 0, 0.12)" : "rgba(255, 255, 255, 0.03)",
                  border: idx === 0 ? "1px solid rgba(255, 215, 0, 0.3)" : "1px solid var(--rule)",
                  borderRadius: "4px",
                  fontSize: "0.78rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ color: idx === 0 ? "#ffd700" : "var(--ink-3)", fontWeight: 600 }}>
                    #{idx + 1}
                  </span>
                  <span style={{ color: "var(--ink)" }}>{item.label}</span>
                </div>
                <code style={{ fontSize: "0.74rem", color: "var(--ink-2)" }}>
                  d={item.dist.toFixed(3)}
                </code>
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
                background: stats.currentLayer === 2 ? "rgba(255, 215, 0, 0.25)" : stats.currentLayer === 1 ? "rgba(0, 210, 255, 0.25)" : "rgba(82, 224, 120, 0.25)",
                color: stats.currentLayer === 2 ? "#ffd700" : stats.currentLayer === 1 ? "#00d2ff" : "#52e078",
                border: "1px solid currentColor",
                flexShrink: 0,
              }}
            >
              {stats.currentLayer === 2 ? layersList[2]?.name ?? "L2" : stats.currentLayer === 1 ? layersList[1]?.name ?? "L1" : layersList[0]?.name ?? "L0"}
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
            style={{ width: "2rem", height: "2rem", borderRadius: "6px" }}
            title={`${o.autoPlay ? t.pause : t.resume} (Space)`}
          >
            {o.autoPlay ? <IcoPause /> : <IcoPlay />}
          </button>

          <button
            className="tool"
            onClick={handleStepBackward}
            disabled={stats.currentStepIndex <= 0}
            style={{ width: "1.8rem", height: "1.8rem", borderRadius: "6px", fontSize: "0.75rem" }}
            title={`${t.stepBackward} (←)`}
          >
            ◀
          </button>

          <button
            className="tool"
            onClick={handleStepForward}
            disabled={stats.currentStepIndex >= stats.totalSteps - 1}
            style={{ width: "1.8rem", height: "1.8rem", borderRadius: "6px", fontSize: "0.75rem" }}
            title={`${t.stepForward} (→)`}
          >
            ▶
          </button>

          <button
            className="tool"
            onClick={handleReset}
            style={{ width: "1.8rem", height: "1.8rem", borderRadius: "6px", fontSize: "0.75rem" }}
            title={`${t.resetSearch} (R)`}
          >
            ↺
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
              padding: "0 0.5rem",
              height: "1.8rem",
              borderRadius: "6px",
              fontFamily: "monospace",
            }}
            title={t.speed}
          >
            {o.playbackSpeed.toFixed(1)}x
          </button>
        </div>
      </div>

      <GpuRoomLoader 
        roomName={lang === "es" ? "HNSW GRAFOS NAVEGABLES" : "HNSW VECTOR SEARCH"} 
      />

      {intro && (
        <HnswWelcome
          lang={lang}
          onClose={() => setIntro(false)}
          onOpenGuide={(c) => setGuide((c as HnswChapterId) || "what")}
        />
      )}
      {guide && (
        <HnswGuide
          lang={lang}
          initialChapter={guide}
          onClose={() => setGuide(null)}
        />
      )}
    </div>
  );
}
