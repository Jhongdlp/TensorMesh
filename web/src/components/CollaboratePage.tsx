import { useState, useEffect, useRef } from "react";
import { useAtlasLang, type Lang } from "../i18n";
import { COLLABORATE_COPY } from "../i18n/collaborate";
import Header from "./Header";
import AuthorWidget from "./AuthorWidget";
import Footer from "./Footer";
import "../styles/collab.css";

const WGSL_SAMPLE = `// compute.wgsl — Pipeline de Cómputo WebGPU en paralelo
struct Params {
  learning_rate: f32,
  momentum: f32,
  step_count: u32,
  decay: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= arrayLength(&positions)) { return; }

  var pos = positions[idx].xyz;
  var vel = velocities[idx].xyz;

  // Cálculo del gradiente o fuerza matemática en GPU
  let grad = vec3<f32>(
    -400.0 * pos.x * (pos.y - pos.x * pos.x) - 2.0 * (1.0 - pos.x),
    200.0 * (pos.y - pos.x * pos.x),
    0.0
  );

  vel = params.momentum * vel - params.learning_rate * grad;
  pos = pos + vel;

  positions[idx] = vec4<f32>(pos, 1.0);
  velocities[idx] = vec4<f32>(vel, 0.0);
}`;

const TSX_SAMPLE = `// Room.tsx — Componente React & WebGPU Pipeline Harness
import { useEffect, useRef, useState } from "react";
import { initWebGpuPipeline } from "./engine";

export default function CommunityRoom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [learningRate, setLearningRate] = useState(0.001);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;
    const cleanup = initWebGpuPipeline(canvasRef.current, {
      learningRate,
      isRunning,
    });
    return () => cleanup();
  }, [learningRate, isRunning]);

  return (
    <div className="shell">
      <canvas ref={canvasRef} className="shell-canvas" />
      {/* Raíl de controles y parámetros en vivo */}
      <aside className="rail rail-r">
        <label>Learning Rate: {learningRate}</label>
        <input 
          type="range" 
          min="0.0001" 
          max="0.01" 
          step="0.0001"
          value={learningRate} 
          onChange={(e) => setLearningRate(Number(e.target.value))} 
        />
      </aside>
    </div>
  );
}`;

const GUIDE_SAMPLE = `// guide.ts — Guía Pedagógica Interactiva Paso a Paso
export const ROOM_GUIDE = {
  es: [
    {
      step: 1,
      title: "El Paisaje Matemático",
      desc: "La función representa un valle hiperbólico donde los mínimos globales están ocultos tras un desfiladero curvo.",
      focusTarget: [0, 1.2, 0],
    },
    {
      step: 2,
      title: "Descenso de Gradiente y Momento",
      desc: "Observa cómo la inercia (momentum) evita que los caminantes queden atrapados en oscilaciones perpendiculares.",
      focusTarget: [1, 1, 0],
    }
  ]
};`;

export default function CollaboratePage() {
  const [lang, setLang] = useAtlasLang();
  const t = COLLABORATE_COPY[lang];
  const [activeCodeTab, setActiveCodeTab] = useState<"wgsl" | "tsx" | "guide">("wgsl");
  const [copied, setCopied] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const archRef = useRef<HTMLElement | null>(null);
  const wishlistRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 24);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToArch = () => {
    archRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const copyCode = () => {
    const code =
      activeCodeTab === "wgsl"
        ? WGSL_SAMPLE
        : activeCodeTab === "tsx"
        ? TSX_SAMPLE
        : GUIDE_SAMPLE;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="collab-container">
      {/* Sticky Navigation Header */}
      <Header
        lang={lang}
        onLangChange={setLang}
        isScrolled={isScrolled}
        currentPath="/colaborar"
      />

      {/* Author Widget */}
      <AuthorWidget lang={lang} />

      <main className="collab-main">
        {/* ========================================================
            HERO SECTION: THE MANIFESTO
            ======================================================== */}
        <section className="collab-hero">
          <div className="collab-hero-inner">
            <h1 className="collab-title">{t.heroTitle}</h1>

            <p className="collab-subtitle">{t.heroSubtitle}</p>

            <div className="collab-actions">
              <a
                href="https://github.com/Jhongdlp/TensorMesh"
                target="_blank"
                rel="noopener noreferrer"
                className="collab-btn collab-btn-primary"
              >
                <span>{t.ctaGithub}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M7 17 17 7M8 7h9v9" />
                </svg>
              </a>

              <a href="/#galeria" className="collab-btn collab-btn-secondary">
                <span>{t.ctaRooms}</span>
              </a>

              <button
                type="button"
                onClick={scrollToArch}
                className="collab-btn collab-btn-ghost"
              >
                <span>{t.ctaTemplate}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Metric Stats Banner */}
          <div className="collab-stats-grid">
            {t.stats.map((stat, i) => (
              <div key={i} className="collab-stat-card">
                <span className="collab-stat-label">{stat.label}</span>
                <span className="collab-stat-value">{stat.value}</span>
                <span className="collab-stat-detail">{stat.detail}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================
            MISSION & VISION SECTION
            ======================================================== */}
        <section className="collab-section collab-mission-section">
          <div className="collab-section-header">
            <h2 className="collab-section-title">{t.missionTitle}</h2>
            <p className="collab-section-lead">{t.missionLead}</p>
          </div>
        </section>

        {/* ========================================================
            3 FOUNDATIONAL PILLARS
            ======================================================== */}
        <section className="collab-section">
          <div className="collab-section-header">
            <h2 className="collab-section-title">{t.pillarsTitle}</h2>
            <p className="collab-section-lead">{t.pillarsLead}</p>
          </div>

          <div className="collab-pillars-grid">
            {t.pillars.map((pillar) => (
              <div key={pillar.id} className="collab-pillar-card">
                <div className="collab-pillar-head">
                  <span className="collab-pillar-num">{pillar.id}</span>
                  <span className="collab-pillar-tag">{pillar.tag}</span>
                </div>
                <h3 className="collab-pillar-title">{pillar.title}</h3>
                <p className="collab-pillar-desc">{pillar.desc}</p>
                <ul className="collab-pillar-features">
                  {pillar.features.map((feat, idx) => (
                    <li key={idx}>
                      <span className="collab-feature-dash">—</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================
            TECHNICAL ARCHITECTURE & TEMPLATE BLUEPRINT
            ======================================================== */}
        <section ref={archRef} className="collab-section collab-arch-section">
          <div className="collab-section-header">
            <h2 className="collab-section-title">{t.archTitle}</h2>
            <p className="collab-section-lead">{t.archLead}</p>
          </div>

          <div className="collab-arch-grid">
            {t.archSteps.map((step, idx) => (
              <div key={idx} className="collab-arch-card">
                <span className="collab-arch-step-num">0{idx + 1}.</span>
                <h3 className="collab-arch-card-title">{step.title}</h3>
                <p className="collab-arch-card-desc">{step.desc}</p>
                <div className="collab-arch-file">
                  <code>{step.file}</code>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Code Blueprint Harness */}
          <div className="collab-code-harness">
            <div className="collab-code-header">
              <div className="collab-code-tabs">
                <button
                  type="button"
                  className={`collab-tab-btn ${activeCodeTab === "wgsl" ? "active" : ""}`}
                  onClick={() => setActiveCodeTab("wgsl")}
                >
                  <span className="collab-tab-indicator" />
                  compute.wgsl
                </button>
                <button
                  type="button"
                  className={`collab-tab-btn ${activeCodeTab === "tsx" ? "active" : ""}`}
                  onClick={() => setActiveCodeTab("tsx")}
                >
                  <span className="collab-tab-indicator" />
                  Room.tsx
                </button>
                <button
                  type="button"
                  className={`collab-tab-btn ${activeCodeTab === "guide" ? "active" : ""}`}
                  onClick={() => setActiveCodeTab("guide")}
                >
                  <span className="collab-tab-indicator" />
                  guide.ts
                </button>
              </div>

              <button
                type="button"
                className="collab-copy-btn"
                onClick={copyCode}
                aria-label="Copiar código"
              >
                {copied ? (
                  <span>✓ {lang === "es" ? "Copiado" : "Copied"}</span>
                ) : (
                  <span>{lang === "es" ? "Copiar Plantilla" : "Copy Template"}</span>
                )}
              </button>
            </div>

            <pre className="collab-code-block">
              <code>
                {activeCodeTab === "wgsl"
                  ? WGSL_SAMPLE
                  : activeCodeTab === "tsx"
                  ? TSX_SAMPLE
                  : GUIDE_SAMPLE}
              </code>
            </pre>
          </div>
        </section>

        {/* ========================================================
            WISHLIST & OPEN COMMUNITY IDEAS
            ======================================================== */}
        <section ref={wishlistRef} className="collab-section">
          <div className="collab-section-header">
            <h2 className="collab-section-title">{t.wishlistTitle}</h2>
            <p className="collab-section-lead">{t.wishlistLead}</p>
          </div>

          <div className="collab-wishlist-grid">
            {t.wishlist.map((item, idx) => (
              <div key={idx} className="collab-wish-card">
                <div className="collab-wish-head">
                  <span className="collab-wish-tag">{item.tag}</span>
                  <span className="collab-wish-diff">{item.difficulty}</span>
                </div>
                <h3 className="collab-wish-title">{item.title}</h3>
                <p className="collab-wish-desc">{item.desc}</p>
                <div className="collab-wish-foot">
                  <a
                    href="https://github.com/Jhongdlp/TensorMesh/issues/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="collab-wish-link"
                  >
                    <span>{lang === "es" ? "Proponer esta sala" : "Propose this room"}</span>
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M7 17 17 7M8 7h9v9" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================
            STEP-BY-STEP CONTRIBUTION ROADMAP
            ======================================================== */}
        <section className="collab-section collab-guide-section">
          <div className="collab-section-header">
            <h2 className="collab-section-title">{t.guideTitle}</h2>
            <p className="collab-section-lead">{t.guideLead}</p>
          </div>

          <div className="collab-steps-list">
            {t.steps.map((step, idx) => (
              <div key={idx} className="collab-step-row">
                <div className="collab-step-num">{step.num}</div>
                <div className="collab-step-content">
                  <h3 className="collab-step-title">{step.title}</h3>
                  <p className="collab-step-desc">{step.desc}</p>
                  {step.cmd && (
                    <div className="collab-step-cmd">
                      <code>{step.cmd}</code>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================
            GRAND CALL TO ACTION BOX
            ======================================================== */}
        <section className="collab-cta-box">
          <div className="collab-cta-box-inner">
            <h2 className="collab-cta-title">{t.ctaBoxTitle}</h2>
            <p className="collab-cta-lead">{t.ctaBoxLead}</p>
            <div className="collab-cta-actions">
              <a
                href="https://github.com/Jhongdlp/TensorMesh"
                target="_blank"
                rel="noopener noreferrer"
                className="collab-btn collab-btn-primary"
              >
                <span>{t.ctaBoxBtn}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M7 17 17 7M8 7h9v9" />
                </svg>
              </a>

              <a
                href="https://github.com/Jhongdlp/TensorMesh/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="collab-btn collab-btn-secondary"
              >
                <span>{t.ctaBoxIssue}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 17 17 7M8 7h9v9" />
                </svg>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Colophon Footer */}
      <Footer lang={lang} onGoToTop={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
    </div>
  );
}
