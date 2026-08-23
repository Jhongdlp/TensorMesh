import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

export const HNSW_INTRO_KEY = "hnsw.intro.v1";

export function hnswIntroPending(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(location.search);
  if (q.get("preset") || q.get("guide")) return false;
  try {
    return localStorage.getItem(HNSW_INTRO_KEY) !== "1";
  } catch {
    return true;
  }
}

export function rememberHnswIntro(): void {
  try {
    localStorage.setItem(HNSW_INTRO_KEY, "1");
  } catch {}
}

const ico = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IcoLayers = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IcoSearch = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IcoStep = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </svg>
);

interface Props {
  onClose: () => void;
  onOpenGuide?: (chapterId?: string) => void;
  lang?: Lang;
}

export default function HnswWelcome({ onClose, onOpenGuide, lang = "es" }: Props) {
  const isEs = lang === "es";
  const [open, setOpen] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    rememberHnswIntro();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" || e.key === " ") {
        if (document.activeElement?.tagName !== "BUTTON") {
          e.preventDefault();
          close();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [close]);

  if (!open) return null;

  return (
    <div className="welcome-backdrop" onClick={close}>
      <div
        className="welcome-card"
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="welcome-title"
      >
        <div className="welcome-header">
          <div className="welcome-pill">{isEs ? "Sala 04 · Búsqueda Vectorial Multicapa" : "Room 04 · Multi-Layer Vector Search"}</div>
          <h2 id="welcome-title" className="welcome-title">
            {isEs ? "HNSW: La Autopista de los Embeddings" : "HNSW: The Embeddings Highway"}
          </h2>
          <p className="welcome-lede">
            {isEs
              ? "¿Cómo encuentran las bases de datos de IA (Qdrant, Milvus, pgvector) los vectores más cercanos entre millones en milisegundos sin medirlos todos uno a uno?"
              : "How do vector databases (Qdrant, Milvus, pgvector) retrieve nearest neighbors among millions in milliseconds without brute-force pairwise distance?"}
          </p>
        </div>

        <div className="welcome-features">
          <div className="welcome-feature">
            <div className="welcome-icon">
              <IcoLayers />
            </div>
            <div>
              <h3>{isEs ? "Estratificación Multicapa" : "Multi-Layer Stratification"}</h3>
              <p>
                {isEs
                  ? "Como una Skip List en grafos: las capas superiores tienen enlaces de larga distancia para viajar rápido; las inferiores afinan con máxima precisión."
                  : "Like a Skip List over geometric graphs: top sparse layers provide express highway jumps; dense lower layers fine-tune local precision."}
              </p>
            </div>
          </div>

          <div className="welcome-feature">
            <div className="welcome-icon">
              <IcoSearch />
            </div>
            <div>
              <h3>{isEs ? "Descenso Voraz (Greedy Search)" : "Greedy Routing & Beam Search"}</h3>
              <p>
                {isEs
                  ? "La query salta de vecino en vecino acercándose exponencialmente. Al agotar mejoras en una capa, desciende verticalmente a la siguiente."
                  : "The query hops along nearest candidate neighbors. When local improvements exhaust on a layer, it descends vertically to the next layer down."}
              </p>
            </div>
          </div>

          <div className="welcome-feature">
            <div className="welcome-icon">
              <IcoStep />
            </div>
            <div>
              <h3>{isEs ? "Control Paso a Paso y Recall" : "Step-by-Step & Accuracy Recall"}</h3>
              <p>
                {isEs
                  ? "Inspecciona cada comparación en vivo, examina los candidatos descartados en rojo y comprueba el porcentaje de acierto frente a la búsqueda exhaustiva."
                  : "Inspect live distance evaluations, view pruned search candidates in red, and verify exact accuracy vs exhaustive brute-force."}
              </p>
            </div>
          </div>
        </div>

        <div className="welcome-footer">
          <button className="welcome-btn welcome-btn-primary" onClick={close}>
            {isEs ? "Entrar a la Sala" : "Enter Room"}
          </button>
          {onOpenGuide && (
            <button
              className="welcome-btn welcome-btn-secondary"
              onClick={() => {
                close();
                onOpenGuide("what");
              }}
            >
              {isEs ? "Ver Guía Didáctica" : "View Interactive Guide"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
