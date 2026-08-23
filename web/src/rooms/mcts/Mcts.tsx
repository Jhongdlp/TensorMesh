import { useEffect, useRef, useState, useCallback } from "react";
import { MctsEngine, gpuAvailable, DEFAULTS, type MctsOptions, type EngineStats } from "./engine";
import { REASONING_PRESETS } from "./math";
import { typing } from "../../galaxy/keys.mjs";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep
} from "../../components/icons";
import MctsGuide, { type MctsChapterId } from "./MctsGuide";
import GpuRoomLoader from "../../components/GpuRoomLoader";
import { useAtlasLang } from "../../i18n";
import { MCTS_COPY, MCTS_PRESETS_I18N, MCTS_PHASES_I18N } from "../../i18n/mcts";

const MCTS_INTRO_KEY = "mcts.intro.v1";

function mctsIntroPending(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(location.search);
  if (q.get("preset") || q.get("guide")) return false;
  try {
    return localStorage.getItem(MCTS_INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

function rememberMctsIntro(): void {
  try {
    localStorage.setItem(MCTS_INTRO_KEY, "1");
  } catch {}
}

export default function Mcts() {
  const [lang, setLang] = useAtlasLang();
  const t = MCTS_COPY[lang];
  const presetsList = MCTS_PRESETS_I18N[lang];
  const phasesList = MCTS_PHASES_I18N[lang];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MctsEngine | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<MctsOptions>({ ...DEFAULTS });
  const [stats, setStats] = useState<EngineStats>({
    fps: 0,
    currentStepIndex: 0,
    totalSteps: 0,
    totalNodes: 1,
    totalLinks: 0,
    currentPhase: "select",
    activeMessage: lang === "es" ? "Iniciando búsqueda..." : "Starting search...",
    rootValue: 0.5,
    goldenLength: 0,
    prunedCount: 0,
    isPlaying: true,
    hoveredNode: null,
  });

  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [guide, setGuide] = useState<MctsChapterId | null>(() => (mctsIntroPending() ? "what" : null));

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) {
        if (!dead) setGpu(false);
        return;
      }
      setGpu(true);
      const e = new MctsEngine(device, canvasRef.current);
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

  const patch = useCallback((p: Partial<MctsOptions>) => {
    engineRef.current?.set(p);
    setO(prev => ({ ...prev, ...p }));
  }, []);

  const pickPreset = useCallback((id: string) => {
    engineRef.current?.loadPreset(id);
    if (engineRef.current) setO({ ...engineRef.current.opts });
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

  const rawPreset = REASONING_PRESETS.find(p => p.id === o.presetId) || REASONING_PRESETS[0];
  const localizedPreset = presetsList.find(p => p.id === o.presetId) || presetsList[0];
  const currentPreset = {
    ...rawPreset,
    name: localizedPreset.name,
    problemStatement: localizedPreset.problemStatement,
  };

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
          <span style={{ color: "var(--ink-2)" }}>{lang === "es" ? "Valor Q:" : "Q Value:"} <code>{stats.hoveredNode.value.toFixed(2)}</code></span>
          <span style={{ color: "var(--ink-3)" }}>|</span>
          <span style={{ color: "#00d2ff" }}>{lang === "es" ? "Visitas N:" : "Visits N:"} <code>{stats.hoveredNode.visits}</code></span>
        </div>
      )}

      {/* Cajón izquierdo */}
      <aside className="side" aria-label="Controles de MCTS">
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

          <p className="eyebrow">{t.preset}</p>
          <div className="ctl-row ctl-col" role="group" aria-label={t.preset}>
            {REASONING_PRESETS.map((p, idx) => (
              <button
                key={p.id}
                className={p.id === o.presetId ? "on" : ""}
                aria-pressed={p.id === o.presetId}
                onClick={() => pickPreset(p.id)}
              >
                {presetsList[idx]?.name ?? p.name}
              </button>
            ))}
          </div>
          <p className="shell-hint" style={{ marginTop: "0.4rem", fontSize: "0.78rem", color: "var(--ink-3)", lineHeight: "1.4" }}>
            {currentPreset.problemStatement}
          </p>

          <p className="eyebrow">{t.explorationDials}</p>
          <label className="ctl-wide" htmlFor="paramCpuct">
            <span className="ctl-head">
              <span>{t.paramCpuct}</span>
              <span className="ctl-val">{o.cPuct.toFixed(2)}</span>
            </span>
            <input
              id="paramCpuct"
              type="range"
              min="0.2"
              max="3.0"
              step="0.1"
              value={o.cPuct}
              onChange={(e) => patch({ cPuct: Number(e.target.value) })}
            />
          </label>

          <hr className="side-sep" />

          <p className="eyebrow">{t.viz3D}</p>
          <div className="ctl-row" role="group" aria-label={t.levelRings}>
            <button
              className={o.showLevelRings ? "on" : ""}
              aria-pressed={o.showLevelRings}
              onClick={() => patch({ showLevelRings: !o.showLevelRings })}
            >
              {t.levelRings}
            </button>
          </div>
        </div>
      </aside>

      {/* Raíl derecho */}
      <div className="rail rail-r" role="region" aria-label="Telemetría de Razonamiento">
        <section className="card">
          <p className="card-head">
            <span>{t.reasoningTree}</span>
            <span className="card-val" style={{ color: "#ffd700" }}>Tree-of-Thoughts</span>
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginTop: "0.4rem", textAlign: "center" }}>
            <div style={{ padding: "0.4rem", background: "rgba(255, 215, 0, 0.08)", border: "1px solid rgba(255, 215, 0, 0.2)", borderRadius: "4px" }}>
              <span style={{ fontSize: "0.7rem", color: "#ffd700", display: "block" }}>{t.rootValue}</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--ink)" }}>{stats.rootValue.toFixed(2)}</strong>
            </div>
            <div style={{ padding: "0.4rem", background: "rgba(0, 210, 255, 0.08)", border: "1px solid rgba(0, 210, 255, 0.2)", borderRadius: "4px" }}>
              <span style={{ fontSize: "0.7rem", color: "#00d2ff", display: "block" }}>{t.totalNodes}</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--ink)" }}>{stats.totalNodes}</strong>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="card-head">
            <span>{t.pruningEfficiency}</span>
            <span className="card-val">
              {stats.totalNodes > 1 ? ((stats.prunedCount / stats.totalNodes) * 100).toFixed(0) : 0}%
            </span>
          </p>
          <p className="card-desc" style={{ fontSize: "0.78rem", color: "var(--ink-2)", margin: "0.2rem 0" }}>
            {lang === "es"
              ? `${stats.prunedCount} ramas muertas descartadas para concentrar tokens en la solución óptima.`
              : `${stats.prunedCount} dead reasoning branches pruned to focus token generation on the optimal path.`}
          </p>
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
                background: stats.currentPhase === "finalize" ? "rgba(255, 215, 0, 0.25)" : stats.currentPhase === "backprop" ? "rgba(0, 210, 255, 0.25)" : "rgba(82, 224, 120, 0.25)",
                color: stats.currentPhase === "finalize" ? "#ffd700" : stats.currentPhase === "backprop" ? "#00d2ff" : "#52e078",
                border: "1px solid currentColor",
                flexShrink: 0,
              }}
            >
              {phasesList[stats.currentPhase] ?? stats.currentPhase}
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
        roomName={lang === "es" ? "ÁRBOLES DE RAZONAMIENTO MCTS" : "MCTS REASONING TREES"} 
      />

      {guide && (
        <MctsGuide
          lang={lang}
          initialChapter={guide}
          onClose={() => {
            rememberMctsIntro();
            setGuide(null);
          }}
        />
      )}
    </div>
  );
}
