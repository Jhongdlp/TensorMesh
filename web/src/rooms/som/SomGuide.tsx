import {
  useCallback, useEffect, useMemo, useRef, useState, type JSX,
} from "react";
import type { Lang } from "../../i18n";

export type SomChapterId =
  | "what" | "bmu" | "sigma" | "cooling"
  | "topo" | "color" | "shapes" | "do" | "glossary";

interface SomChapter {
  id: SomChapterId;
  tab: string;
  head: string;
  lede: string;
  body: string[];
  list?: [string, string][];
  icons?: boolean;
  note: string;
  fig?: ({ lang }: { lang: Lang }) => JSX.Element;
}

const ART = { preserveAspectRatio: "xMidYMid meet" };

/* ==========================================================================
   Láminas Interactivas de SOM
   ========================================================================== */

/** 1. Lámina interactiva de Deformación de Malla Elástica */
function FigSomSheet({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [deformed, setDeformed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => (t + 1) % 60);
    }, 45);
    return () => clearInterval(timer);
  }, []);

  const COLS = 7;
  const ROWS = 5;
  const W = 320, H = 140;

  const points: { r: number; c: number; x: number; y: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const u = c / (COLS - 1);
      const v = r / (ROWS - 1);
      
      let x = 40 + u * 240;
      let y = 30 + v * 80;

      if (deformed) {
        // Doblez en S elástico no lineal
        const wave = Math.sin(u * Math.PI * 1.5 + tick * 0.1) * 22;
        y += wave * (1 - v * 0.4);
        x += Math.cos(v * Math.PI) * 12;
      }
      points.push({ r, c, x, y });
    }
  }

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Líneas horizontales */}
        {Array.from({ length: ROWS }, (_, r) => {
          const rowPts = points.filter(p => p.r === r);
          const d = rowPts.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), "");
          return <path key={`r-${r}`} d={d} stroke="rgba(0, 240, 255, 0.4)" strokeWidth="1.5" fill="none" />;
        })}

        {/* Líneas verticales */}
        {Array.from({ length: COLS }, (_, c) => {
          const colPts = points.filter(p => p.c === c);
          const d = colPts.reduce((acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`), "");
          return <path key={`c-${c}`} d={d} stroke="rgba(0, 240, 255, 0.25)" strokeWidth="1" fill="none" />;
        })}

        {/* Nodos de la cuadrícula */}
        {points.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={deformed ? 2.5 : 2}
            fill={deformed ? "#f0ff00" : "#fff"}
          />
        ))}
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (!deformed ? " on" : "")} onClick={() => setDeformed(false)}>
          {isEs ? "1. Cuadrícula Plana Inicial" : "1. Initial Flat Lattice"}
        </button>
        <button className={"gd-pill" + (deformed ? " on" : "")} onClick={() => setDeformed(true)}>
          {isEs ? "2. Deformación Elástica hacia Datos" : "2. Elastic Manifold Deformation"}
        </button>
      </div>

      <p className="gd-cap">
        <b>{isEs ? "Plasticidad Topológica:" : "Topological Plasticity:"}</b>{" "}
        {isEs
          ? "Las conexiones elásticas obligan a las neuronas vecinas a mantenerse juntas mientras envuelven la forma de los datos 3D."
          : "Elastic connections compel neighboring neurons to stay topologically coherent as they wrap 3D point manifolds."}
      </p>
    </div>
  );
}

/** 2. Lámina interactiva del BMU (Best Matching Unit) y Vecindad */
function FigSomBmu({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [target, setTarget] = useState<[number, number]>([170, 70]);
  const [sigma, setSigma] = useState(1.4);
  const box = useRef<SVGSVGElement>(null);

  const GRID_SIZE = 7;
  const W = 320, H = 160;
  const SPACING = 20;
  const OX = 40, OY = 20;

  const nodes = useMemo(() => {
    const list: { r: number; c: number; x: number; y: number; id: number }[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        list.push({
          r, c,
          x: OX + c * SPACING,
          y: OY + r * SPACING,
          id: r * GRID_SIZE + c,
        });
      }
    }
    return list;
  }, []);

  const bmu = useMemo(() => {
    let best = nodes[0];
    let minD2 = Infinity;
    for (const n of nodes) {
      const dx = n.x - target[0];
      const dy = n.y - target[1];
      const d2 = dx * dx + dy * dy;
      if (d2 < minD2) {
        minD2 = d2;
        best = n;
      }
    }
    return best;
  }, [nodes, target]);

  const aim = (e: { clientX: number; clientY: number }) => {
    const el = box.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    setTarget([Math.min(W - 20, Math.max(20, x)), Math.min(H - 20, Math.max(20, y))]);
  };

  return (
    <div className="gd-fig">
      <svg
        ref={box}
        viewBox="0 0 320 160"
        className="gd-art gd-grab"
        {...ART}
        role="application"
        aria-label="Arrastra la muestra objetivo para ver la neurona ganadora BMU"
        tabIndex={0}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); aim(e); }}
        onPointerMove={e => { if (e.buttons) aim(e); }}
      >
        {Array.from({ length: GRID_SIZE }, (_, r) => (
          <line
            key={`r-${r}`}
            x1={OX} y1={OY + r * SPACING}
            x2={OX + (GRID_SIZE - 1) * SPACING} y2={OY + r * SPACING}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: GRID_SIZE }, (_, c) => (
          <line
            key={`c-${c}`}
            x1={OX + c * SPACING} y1={OY}
            x2={OX + c * SPACING} y2={OY + (GRID_SIZE - 1) * SPACING}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
          />
        ))}

        {nodes.map(n => {
          const dr = n.r - bmu.r;
          const dc = n.c - bmu.c;
          const distGrid2 = dr * dr + dc * dc;
          const h = Math.exp(-distGrid2 / (2 * sigma * sigma));
          const isBmu = n.id === bmu.id;

          return (
            <g key={n.id}>
              {h > 0.05 && (
                <circle
                  cx={n.x} cy={n.y}
                  r={isBmu ? 7 : 4 + h * 3}
                  fill={isBmu ? "#f0ff00" : `rgba(0, 240, 255, ${h * 0.85})`}
                />
              )}
              <circle
                cx={n.x} cy={n.y}
                r={isBmu ? 4 : 2}
                fill={isBmu ? "#000" : "#fff"}
              />
            </g>
          );
        })}

        <line
          x1={bmu.x} y1={bmu.y}
          x2={target[0]} y2={target[1]}
          stroke="#ff4070"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />

        <circle cx={target[0]} cy={target[1]} r="12" fill="rgba(255, 64, 112, 0.15)" />
        <circle cx={target[0]} cy={target[1]} r="4.5" fill="#ff4070" stroke="#fff" strokeWidth="1" />
        <text x={target[0] + 8} y={target[1] + 4} className="gd-art-w gd-art-sm">{isEs ? "Muestra X" : "Sample X"}</text>

        <g transform="translate(195, 25)">
          <text x="0" y="10" className="gd-art-n">{isEs ? `Neurona BMU: (${bmu.c}, ${bmu.r})` : `BMU Neuron: (${bmu.c}, ${bmu.r})`}</text>
          <text x="0" y="26" className="gd-art-n">{isEs ? `Distancia: ${Math.hypot(bmu.x - target[0], bmu.y - target[1]).toFixed(1)} px` : `Distance: ${Math.hypot(bmu.x - target[0], bmu.y - target[1]).toFixed(1)} px`}</text>
          <text x="0" y="44" className="gd-art-n">{isEs ? "Vecindario activo (h > 0,1):" : "Active neighborhood (h > 0.1):"}</text>
          <text x="0" y="60" className="gd-art-w gd-art-sm">
            {nodes.filter(n => Math.exp(-((n.r - bmu.r) ** 2 + (n.c - bmu.c) ** 2) / (2 * sigma * sigma)) > 0.1).length} / 49 {isEs ? "neuronas" : "neurons"}
          </text>
          <text x="0" y="86" className="gd-art-n">{isEs ? "Toca o arrastra la muestra" : "Drag the sample dot"}</text>
        </g>
      </svg>
      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">{isEs ? "Radio vecindad σ:" : "Neighborhood radius σ:"}</span>
        <button className={"gd-pill" + (sigma === 0.8 ? " on" : "")} onClick={() => setSigma(0.8)}>{isEs ? "Estrecho (0.8)" : "Tight (0.8)"}</button>
        <button className={"gd-pill" + (sigma === 1.4 ? " on" : "")} onClick={() => setSigma(1.4)}>{isEs ? "Medio (1.4)" : "Medium (1.4)"}</button>
        <button className={"gd-pill" + (sigma === 2.5 ? " on" : "")} onClick={() => setSigma(2.5)}>{isEs ? "Amplio (2.5)" : "Broad (2.5)"}</button>
      </div>
    </div>
  );
}

/** 3. Lámina interactiva de Campana Gaussiana de Vecindad */
function FigSomSigma({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [sigma, setSigma] = useState(1.5);

  const points: { sx: number; sy: number; d: number; h: number }[] = [];
  for (let d = -4; d <= 4; d += 0.2) {
    const h = Math.exp(-(d * d) / (2 * sigma * sigma));
    const sx = 160 + d * 30;
    const sy = 115 - h * 85;
    points.push({ sx, sy, d, h });
  }

  const dPath = points.reduce((acc, p, idx) => (idx === 0 ? `M ${p.sx} ${p.sy}` : `${acc} L ${p.sx} ${p.sy}`), "");

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Eje base */}
        <line x1="30" y1="115" x2="290" y2="115" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1="160" y1="20" x2="160" y2="115" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
        <circle cx="160" cy="30" r="4" fill="#00f0ff" />
        <text x="160" y="130" className="gd-art-n" textAnchor="middle">{isEs ? "BMU (d = 0, h = 1.0)" : "BMU (d = 0, h = 1.0)"}</text>

        {/* Campana Gaussiana */}
        <path d={dPath} stroke="#00f0ff" strokeWidth="2.5" fill="none" />

        {/* Marcadores de radio σ */}
        <line x1={160 - sigma * 30} y1="30" x2={160 - sigma * 30} y2="115" stroke="#ffd700" strokeDasharray="2 2" />
        <line x1={160 + sigma * 30} y1="30" x2={160 + sigma * 30} y2="115" stroke="#ffd700" strokeDasharray="2 2" />
        <text x={160 + sigma * 30} y="70" className="gd-art-n" fill="#ffd700"> +σ</text>
        <text x={160 - sigma * 30} y="70" className="gd-art-n" fill="#ffd700" textAnchor="end">-σ </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">{isEs ? "Ajuste de Radio σ:" : "Tune Radius σ:"}</span>
        <button className={"gd-pill" + (sigma === 0.8 ? " on" : "")} onClick={() => setSigma(0.8)}>σ = 0.8 (Local)</button>
        <button className={"gd-pill" + (sigma === 1.5 ? " on" : "")} onClick={() => setSigma(1.5)}>σ = 1.5 (Medio)</button>
        <button className={"gd-pill" + (sigma === 2.8 ? " on" : "")} onClick={() => setSigma(2.8)}>σ = 2.8 (Global)</button>
      </div>

      <p className="gd-cap">
        <b>h(d) = exp(−d² / 2σ²):</b>{" "}
        {isEs
          ? "Un radio grande mueve la tela completa como un bloque rígido; un radio pequeño sólo afina pliegues locales."
          : "A large radius shifts the lattice as a rigid block; a small radius refines intricate local creases."}
      </p>
    </div>
  );
}

/** 4. Lámina interactiva de Enfriamiento (Cooling Schedule) */
function FigSomCooling({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [epoch, setEpoch] = useState(25);

  const maxEpochs = 100;
  const eta = 0.5 * Math.exp(-epoch / 35);
  const sigma = 32.0 * Math.exp(-epoch / 35);

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        {/* Curva de decaimiento de eta */}
        <path
          d="M 40 35 Q 120 85 280 110"
          stroke="#00f0ff"
          strokeWidth="2"
          fill="none"
        />
        {/* Curva de decaimiento de sigma */}
        <path
          d="M 40 45 Q 110 95 280 115"
          stroke="#ff4070"
          strokeWidth="2"
          strokeDasharray="4 2"
          fill="none"
        />

        {/* Marcador de época actual */}
        <line
          x1={40 + (epoch / maxEpochs) * 240}
          y1="25"
          x2={40 + (epoch / maxEpochs) * 240}
          y2="120"
          stroke="#ffd700"
          strokeWidth="1.5"
        />
        <circle cx={40 + (epoch / maxEpochs) * 240} cy={35 + (1 - eta / 0.5) * 75} r="4" fill="#ffd700" />

        <text x="40" y="22" className="gd-art-n" fill="#00f0ff">η(t) Tasa</text>
        <text x="120" y="22" className="gd-art-n" fill="#ff4070">σ(t) Radio</text>
        <text x="280" y="132" className="gd-art-n" textAnchor="end">{isEs ? "Época 100" : "Epoch 100"}</text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">{isEs ? `Época actual: ${epoch}` : `Current Epoch: ${epoch}`}</span>
        <button className={"gd-pill" + (epoch === 5 ? " on" : "")} onClick={() => setEpoch(5)}>
          {isEs ? "Fase 1: Inicio (Época 5)" : "Phase 1: Early (Epoch 5)"}
        </button>
        <button className={"gd-pill" + (epoch === 35 ? " on" : "")} onClick={() => setEpoch(35)}>
          {isEs ? "Fase 2: Media (Época 35)" : "Phase 2: Mid (Epoch 35)"}
        </button>
        <button className={"gd-pill" + (epoch === 85 ? " on" : "")} onClick={() => setEpoch(85)}>
          {isEs ? "Fase 3: Cristalización (Época 85)" : "Phase 3: Late (Epoch 85)"}
        </button>
      </div>

      <p className="gd-cap">
        <b>η = {eta.toFixed(3)} · σ = {sigma.toFixed(1)} px:</b>{" "}
        {epoch < 20
          ? (isEs ? "Orientación global: la tela se despliega rápidamente sin arrugarse." : "Global orientation: the sheet unfolds rapidly without knotting.")
          : (isEs ? "Afinamiento: las neuronas congelan los detalles y rugosidades finas." : "Fine-tuning: neurons freeze fine details and local geometry.")}
      </p>
    </div>
  );
}

/** 5. Lámina interactiva de Topología: Plana vs Toroidal */
function FigSomTopology({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [torus, setTorus] = useState(false);
  const [selectedCol, setSelectedCol] = useState(0);

  const COLS = 8;

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        {Array.from({ length: COLS }, (_, c) => {
          const x = 35 + c * 35;
          const y = 60;
          const isSel = c === selectedCol;
          
          let dist = Math.abs(c - selectedCol);
          if (torus) {
            dist = Math.min(dist, COLS - dist);
          }
          const h = Math.exp(-(dist * dist) / (2 * 1.5 * 1.5));

          return (
            <g key={c} onClick={() => setSelectedCol(c)} style={{ cursor: "pointer" }}>
              <circle cx={x} cy={y} r={isSel ? 8 : 4 + h * 4} fill={isSel ? "#f0ff00" : `rgba(0, 240, 255, ${h})`} />
              <circle cx={x} cy={y} r={isSel ? 4 : 2} fill={isSel ? "#000" : "#fff"} />
              <text x={x} y={85} className="gd-art-n" textAnchor="middle">{c}</text>
              <text x={x} y={100} className="gd-art-sm" fill={isSel ? "#f0ff00" : `rgba(0,240,255,${h})`} textAnchor="middle">
                {h.toFixed(2)}
              </text>
            </g>
          );
        })}

        {torus && (
          <path
            d="M 35 45 C 35 15, 280 15, 280 45"
            fill="none"
            stroke="#ff4070"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}
      </svg>
      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (!torus ? " on" : "")} onClick={() => setTorus(false)}>
          {isEs ? "Topología Plana (Bordes Libres)" : "Planar Topology (Open Borders)"}
        </button>
        <button className={"gd-pill" + (torus ? " on" : "")} onClick={() => setTorus(true)}>
          {isEs ? "Topología Toroidal (Bordes Conectados)" : "Toroidal Topology (Connected Borders)"}
        </button>
      </div>
      <p className="gd-cap">
        {torus
          ? (isEs ? "En toroide, el nodo 0 está al lado del nodo 7 (distancia = 1)." : "In toroid, node 0 connects directly to node 7 (distance = 1).")
          : (isEs ? "En plano, el nodo 0 está a distancia 7 del nodo 7." : "In planar, node 0 is 7 hops away from node 7.")}
      </p>
    </div>
  );
}

/** 6. Lámina interactiva de Modos de Color */
function FigSomColor({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [mode, setMode] = useState<"uv" | "height">("uv");

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        <rect
          x="50"
          y="35"
          width="220"
          height="65"
          rx="4"
          fill={mode === "uv" ? "url(#som-grad-uv)" : "url(#som-grad-height)"}
        />

        <defs>
          <linearGradient id="som-grad-uv" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff4070" />
            <stop offset="50%" stopColor="#ffd700" />
            <stop offset="100%" stopColor="#00f0ff" />
          </linearGradient>
          <linearGradient id="som-grad-height" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="50%" stopColor="#ffd700" />
            <stop offset="100%" stopColor="#ff4070" />
          </linearGradient>
        </defs>

        <text x="160" y="120" className="gd-art-n" textAnchor="middle">
          {mode === "uv"
            ? (isEs ? "Coordenadas Canónicas UV (Diagnóstico de Arrugas y Pliegues)" : "Canonical UV Coordinates (Knotting & Tearing Diagnostics)")
            : (isEs ? "Gradiente Vertical Z (Profundidad y Cimas)" : "Vertical Z Height (Valleys & Peaks Elevation)")}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (mode === "uv" ? " on" : "")} onClick={() => setMode("uv")}>
          {isEs ? "Topología UV (Rojo/Verde/Cian)" : "Topology UV (Red/Green/Cyan)"}
        </button>
        <button className={"gd-pill" + (mode === "height" ? " on" : "")} onClick={() => setMode("height")}>
          {isEs ? "Altura Z (Térmico)" : "Height Z (Thermal)"}
        </button>
      </div>
    </div>
  );
}

/** 7. Lámina interactiva de Formas 3D */
function FigSomShapes({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [shape, setShape] = useState<"sphere" | "torus" | "lorenz">("sphere");

  return (
    <div className="gd-fig">
      <svg viewBox="0 0 320 140" className="gd-art" {...ART} role="img" aria-hidden="true">
        {shape === "sphere" && (
          <g>
            <circle cx="160" cy="70" r="35" stroke="#00f0ff" strokeWidth="2" fill="none" />
            <ellipse cx="160" cy="70" rx="35" ry="12" stroke="rgba(0,240,255,0.4)" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
            <ellipse cx="160" cy="70" rx="12" ry="35" stroke="rgba(0,240,255,0.3)" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
          </g>
        )}
        {shape === "torus" && (
          <g>
            <ellipse cx="160" cy="70" rx="55" ry="24" stroke="#ffd700" strokeWidth="2" fill="none" />
            <ellipse cx="160" cy="70" rx="22" ry="10" stroke="#ffd700" strokeWidth="1.5" fill="none" />
          </g>
        )}
        {shape === "lorenz" && (
          <g>
            <path d="M 160 70 Q 110 25 100 65 Q 90 105 160 70 Q 210 25 220 65 Q 230 105 160 70" stroke="#ff4070" strokeWidth="2" fill="none" />
            <circle cx="100" cy="65" r="3" fill="#ff4070" />
            <circle cx="220" cy="65" r="3" fill="#ff4070" />
          </g>
        )}
        <text x="160" y="125" className="gd-art-n" textAnchor="middle">
          {shape === "sphere" ? (isEs ? "Esfera 3D: Cierre esférico sin costuras" : "3D Sphere: Seamless enclosure") : shape === "torus" ? (isEs ? "Toroide 3D: Curvatura mixta continua" : "3D Torus: Continuous mixed curvature") : (isEs ? "Atractor de Lorenz: Manifold fractal caótico" : "Lorenz Attractor: Chaotic fractal manifold")}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (shape === "sphere" ? " on" : "")} onClick={() => setShape("sphere")}>
          {isEs ? "Esfera" : "Sphere"}
        </button>
        <button className={"gd-pill" + (shape === "torus" ? " on" : "")} onClick={() => setShape("torus")}>
          {isEs ? "Toro" : "Torus"}
        </button>
        <button className={"gd-pill" + (shape === "lorenz" ? " on" : "")} onClick={() => setShape("lorenz")}>
          {isEs ? "Lorenz (Fractal)" : "Lorenz (Fractal)"}
        </button>
      </div>
    </div>
  );
}

const CHAPTERS_DATA: Record<Lang, SomChapter[]> = {
  es: [
    {
      id: "what",
      tab: "1. ¿Qué es?",
      head: "De una tela elástica a la forma de los datos",
      lede: "Un Mapa Autoorganizado (SOM) es una red neuronal no supervisada que aprende a doblar, estirar y moldear una cuadrícula 2D en el espacio 3D.",
      body: [
        "A diferencia del Descenso de Gradiente (donde partículas independientes caen por un relieve), aquí las 4.096 neuronas forman una tela elástica continua. Cuando una neurona es atraída hacia un dato, arrastra físicamente a sus vecinas en la cuadrícula.",
        "El resultado es una proyección topológica no lineal que preserva las relaciones de vecindad de nubes de puntos tridimensionales complejas.",
      ],
      fig: FigSomSheet,
      note: "WebGPU calcula la distancia euclidiana de cada neurona en paralelo mediante Compute Shaders.",
    },
    {
      id: "bmu",
      tab: "2. Ganador BMU",
      head: "Best Matching Unit (Neurona Ganadora)",
      lede: "En cada paso, la neurona más cercana al punto de muestra gana el derecho a guiar la adaptación.",
      body: [
        "Cuando llega un punto x del espacio 3D, el mapa busca la neurona cuyo vector de peso w_i minimiza la distancia euclidiana ||x - w_i||.",
        "Esa neurona ganadora se denomina BMU (Best Matching Unit). El BMU da el paso más largo hacia el punto objetivo, guiando la deformación de su sector de la cuadrícula.",
      ],
      fig: FigSomBmu,
      note: "En la lámina interactiva superior, arrastra la muestra roja para ver cómo cambia la BMU y su halo de atracción.",
    },
    {
      id: "sigma",
      tab: "3. Vecindad Gaussiana",
      head: "Cooperación y Plasticidad Espacial",
      lede: "El secreto del SOM es que las neuronas nunca aprenden solas: cooperan elásticamente.",
      body: [
        "El arrastre que sufre una neurona i respecto a la ganadora BMU se calcula mediante una campana de Gauss en la cuadrícula: h(i, BMU) = exp(-||r_i - r_BMU||² / (2 σ²)).",
        "Si el radio σ es grande, la tela completa se mueve como un bloque rígido (fase de orientación global). Cuando σ se vuelve pequeño, sólo las neuronas inmediatas se ajustan a los detalles finos.",
      ],
      fig: FigSomSigma,
      note: "La distancia en el exponente es topológica en la rejilla 2D (r_i, r_c), no la distancia euclidiana 3D.",
    },
    {
      id: "cooling",
      tab: "4. Enfriamiento",
      head: "Decaimiento exponencial de tasa y radio",
      lede: "De la maleabilidad fluida a la cristalización geométrica.",
      body: [
        "Para que la red converja de forma estable, tanto la tasa de aprendizaje η(t) como el radio de vecindad σ(t) decaen exponencialmente con el número de épocas.",
        "Fase 1 (Épocas iniciales): η y σ altos ordenan la orientación global de la red sin arrugarse.",
        "Fase 2 (Épocas tardías): η y σ bajos afinan los pliegues locales y congelan la aproximación geométrica.",
      ],
      fig: FigSomCooling,
      note: "El control deslizante de decaimiento permite ajustar la velocidad de este proceso en caliente.",
    },
    {
      id: "topo",
      tab: "5. Topologías",
      head: "Plana (Hoja) vs Toroidal (Dona continua)",
      lede: "La geometría de los bordes define qué formas puede envolver la red sin desgarrarse.",
      body: [
        "Hoja Plana: Cuadrícula con 4 bordes abiertos. Ideal para geometrías abiertas como planos, atractores de Lorenz o hélices.",
        "Toroide Continuo: Los bordes izquierdo y derecho están cosidos entre sí, al igual que el superior y el inferior. Permite envolver esferas y toros 3D sin bordes muertos ni esquinas tensas.",
      ],
      fig: FigSomTopology,
      note: "Prueba a cambiar entre Plano y Toroide en el panel lateral mientras la red aprende una esfera.",
    },
    {
      id: "color",
      tab: "6. Modos de Color",
      head: "Diagnóstico Visual de Pliegues y Altura",
      lede: "Dos formas de mirar el tejido neuronal para evaluar su calidad.",
      body: [
        "Topología (UV): Pinta la cuadrícula con coordenadas canónicas (rojo/verde). Permite ver al instante si la tela se ha cruzado, anudado o desgarrado en el espacio.",
        "Altura Z: Gradiente térmico vertical. Revela la profundidad de los valles y crestas de la figura aprendida.",
      ],
      fig: FigSomColor,
      note: "Un gradiente UV suave y sin cortes bruscos indica que la red preservó fielmente la topología original.",
    },
    {
      id: "shapes",
      tab: "7. Figuras Objetivo",
      head: "El catálogo de geometrías 3D complejas",
      lede: "6 desafíos topológicos con simetrías, curvaturas y fractales.",
      body: [
        "Esfera: Requiere que la hoja se cierre en una cúpula sin auto-intersecciones.",
        "Toro: Curvatura gaussiana mixta (positiva en el exterior, negativa en el interior).",
        "Doble Hélice: Alta tensión longitudinal y separación de dos ramas paralelas.",
        "Atractor de Lorenz: Estructura fractal no orientable con alas de mariposa caóticas.",
        "Cubo y Plano: Prueba de rigidez en aristas agudas y superficies planas euclidianas.",
      ],
      fig: FigSomShapes,
      note: "Selecciona cualquier figura en el menú lateral para reiniciar el entrenamiento instantáneamente.",
    },
    {
      id: "do",
      tab: "8. Controles y Atajos",
      head: "Navegación interactiva completa",
      lede: "Manejo ágil de la cámara y de la física en tiempo real.",
      body: [
        "Arrastrar ratón: Órbita tridimensional fluida alrededor del objeto.",
        "Rueda ratón: Zoom continuo hacia los nodos individuales.",
        "Espacio: Pausar o reanudar el cómputo de la GPU.",
        "Tecla N: Avanzar un solo paso de entrenamiento.",
        "Tecla R: Reiniciar la red a su cuadrícula inicial.",
        "Tecla F: Modo inmersivo en pantalla completa.",
      ],
      note: "Todo se ejecuta localmente en tu GPU mediante Compute Shaders a 60 fps.",
    },
    {
      id: "glossary",
      tab: "9. Glosario",
      head: "Términos clave de Redes Autoorganizadas",
      lede: "Conceptos fundamentales para comprender la literatura científica de SOM.",
      body: [
        "BMU (Best Matching Unit): Neurona con menor distancia euclidiana al vector de entrada.",
        "Error de Cuantización (QE): Promedio de las distancias entre cada punto de datos y su BMU correspondiente.",
        "Preservación Topológica: Propiedad por la cual puntos vecinos en el espacio original permanecen vecinos en la red.",
      ],
      note: "Algoritmo original introducido por Teuvo Kohonen en 1982.",
    },
  ],
  en: [
    {
      id: "what",
      tab: "1. What is SOM?",
      head: "From elastic sheet to data manifold",
      lede: "A Self-Organizing Map (SOM) is an unsupervised neural network that folds, stretches, and fits a 2D grid into 3D space.",
      body: [
        "Unlike Gradient Descent (where isolated particles roll down a surface), all 4,096 neurons form a continuous elastic manifold. When one neuron is pulled toward a sample, it physically drags its lattice neighbors along.",
        "The outcome is a non-linear topological projection faithfully preserving neighborhood relationships of complex 3D point clouds.",
      ],
      fig: FigSomSheet,
      note: "WebGPU computes Euclidean distance for each neuron concurrently using Compute Shaders.",
    },
    {
      id: "bmu",
      tab: "2. Winning BMU",
      head: "Best Matching Unit (Winning Neuron)",
      lede: "At each step, the neuron nearest to the sample vector wins the privilege to guide adaptation.",
      body: [
        "When an input data point x is drawn, the lattice finds the neuron whose weight vector w_i minimizes Euclidean distance ||x - w_i||.",
        "That winning neuron is the BMU (Best Matching Unit). It takes the largest step toward the sample, pulling its local cluster.",
      ],
      fig: FigSomBmu,
      note: "In the interactive widget above, drag the red sample dot to see how the BMU and its Gaussian halo adapt.",
    },
    {
      id: "sigma",
      tab: "3. Gaussian Radius",
      head: "Cooperation & Spatial Elasticity",
      lede: "The hallmark of SOM is that neurons never learn alone: they cooperate elastically.",
      body: [
        "The displacement pulling neuron i toward the BMU follows a Gaussian bell curve on the 2D lattice: h(i, BMU) = exp(-||r_i - r_BMU||² / (2 σ²)).",
        "When radius σ is broad, the entire sheet moves rigidly (global alignment phase). When σ shrinks, only immediate neighbors adjust to fine details.",
      ],
      fig: FigSomSigma,
      note: "The exponent distance is measured topologically on the 2D lattice (r_i, r_c), not in 3D Euclidean space.",
    },
    {
      id: "cooling",
      tab: "4. Cooling Schedule",
      head: "Exponential decay of rate and neighborhood",
      lede: "From fluid plasticity to geometric crystallization.",
      body: [
        "To guarantee stable convergence, learning rate η(t) and neighborhood radius σ(t) decay monotonically over training epochs.",
        "Phase 1 (Early epochs): High η and σ align the global sheet without pinching.",
        "Phase 2 (Late epochs): Low η and σ fine-tune local folds and freeze the manifold approximation.",
      ],
      fig: FigSomCooling,
      note: "The decay rate slider tunes the cooling speed in real-time.",
    },
    {
      id: "topo",
      tab: "5. Topologies",
      head: "Planar Sheet vs Seamless Toroid",
      lede: "Lattice boundary geometry governs which target shapes can be wrapped without tearing.",
      body: [
        "Planar Sheet: 4 open edges. Ideal for open manifolds like flat planes, Lorenz attractors, or helices.",
        "Toroidal Donut: Opposing left/right and top/bottom edges are seamlessly stitched. Allows wrapping 3D spheres and toruses without dead corners.",
      ],
      fig: FigSomTopology,
      note: "Toggle between Planar and Toroidal in the sidebar while the network fits a 3D sphere.",
    },
    {
      id: "color",
      tab: "6. Color Modes",
      head: "Visual Diagnostics for Folds & Elevation",
      lede: "Two complementary perspectives to evaluate manifold quality.",
      body: [
        "Topology (UV): Colors the grid with canonical 2D coordinates (red/green). Instantly reveals folding, twisting, or knotting.",
        "Z-Height: Vertical thermal ramp. Highlights depth of valleys and ridges in the learned shape.",
      ],
      fig: FigSomColor,
      note: "A smooth UV gradient without tears confirms true topological neighborhood preservation.",
    },
    {
      id: "shapes",
      tab: "7. Target Shapes",
      head: "Benchmark 3D Manifolds Catalog",
      lede: "6 topological challenges with diverse symmetries, curvatures, and fractals.",
      body: [
        "Sphere: Demands sheet self-enclosure without self-intersection.",
        "Torus: Mixed Gaussian curvature (positive on exterior, negative on inner ring).",
        "Double Helix: High tensile longitudinal strain separating two parallel helices.",
        "Lorenz Attractor: Non-orientable chaotic fractal manifold with butterfly wings.",
        "Cube & Plane: Rigid benchmark on sharp perpendicular edges and flat Euclidean sheets.",
      ],
      fig: FigSomShapes,
      note: "Select any shape in the sidebar to reset training instantly.",
    },
    {
      id: "do",
      tab: "8. Controls & Keys",
      head: "Full interactive control",
      lede: "Fluid navigation and live physics manipulation.",
      body: [
        "Mouse drag: Smooth 3D orbit around the manifold.",
        "Mouse wheel: Continuous zoom toward individual nodes.",
        "Spacebar: Pause or resume GPU compute step.",
        "N key: Step forward a single training iteration.",
        "R key: Reset neural lattice to planar origin.",
        "F key: Immersive fullscreen zen mode.",
      ],
      note: "Everything runs locally on your GPU via Compute Shaders at 60 fps.",
    },
    {
      id: "glossary",
      tab: "9. Glossary",
      head: "Key Self-Organizing Maps Terminology",
      lede: "Core concepts for understanding SOM and unsupervised manifold learning.",
      body: [
        "BMU (Best Matching Unit): Neuron with minimum Euclidean distance to current input vector.",
        "Quantization Error (QE): Average distance between input samples and their respective BMU.",
        "Topological Preservation: Property ensuring nearby input vectors map to adjacent neurons.",
      ],
      note: "Original algorithm introduced by Teuvo Kohonen in 1982.",
    },
  ],
};

export default function SomGuide({
  onClose,
  initialChapter = "what",
  onIntro,
  lang = "es",
}: {
  onClose: () => void;
  initialChapter?: SomChapterId;
  onIntro?: () => void;
  lang?: Lang;
}) {
  const chapters = CHAPTERS_DATA[lang] ?? CHAPTERS_DATA.es;
  const [currentId, setCurrentId] = useState<SomChapterId>(initialChapter);
  const boxRef = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);

  const idx = chapters.findIndex(c => c.id === currentId);
  const currentChapter = chapters[idx >= 0 ? idx : 0];
  const Fig = currentChapter.fig;

  const nextChapter = useCallback(() => {
    if (idx < chapters.length - 1) {
      setCurrentId(chapters[idx + 1].id);
    }
  }, [idx, chapters]);

  const prevChapter = useCallback(() => {
    if (idx > 0) {
      setCurrentId(chapters[idx - 1].id);
    }
  }, [idx, chapters]);

  useEffect(() => {
    from.current = document.activeElement;
    boxRef.current?.focus();
    return () => {
      const el = from.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextChapter();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevChapter();
        return;
      }
      if (e.key !== "Tab") return;
      const box = boxRef.current;
      if (!box) return;
      const f = [...box.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!f.length) return;
      const first = f[0], lastEl = f[f.length - 1];
      const now = document.activeElement;
      if (e.shiftKey && (now === first || now === box)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && now === lastEl) {
        e.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [nextChapter, onClose, prevChapter]);

  return (
    <div className="gd-veil" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={boxRef}
        className="gd"
        role="dialog"
        aria-modal="true"
        aria-labelledby="som-gd-title"
        tabIndex={-1}
      >
        <header className="gd-top">
          <p className="eyebrow">{lang === "es" ? "guía de mapas autoorganizados · kohonen som" : "self-organizing maps guide · kohonen som"}</p>
          <div className="gd-top-acts">
            {onIntro && (
              <button className="gd-ghost" onClick={onIntro}>
                <span>{lang === "es" ? "ver presentación rápida" : "quick intro"}</span>
              </button>
            )}
            <button className="gd-ghost" onClick={onClose}>
              <span>{lang === "es" ? "cerrar" : "close"}</span> <kbd>esc</kbd>
            </button>
          </div>
        </header>

        <div className="gd-main">
          <nav className="gd-toc" aria-label="Capítulos de la guía SOM">
            {chapters.map((c, i) => (
              <button
                key={c.id}
                className={"gd-toc-i" + (c.id === currentId ? " on" : "")}
                onClick={() => setCurrentId(c.id)}
                aria-current={c.id === currentId}
              >
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{c.tab}</span>
              </button>
            ))}
          </nav>

          <article className="gd-page">
            <h2 className="gd-head" id="som-gd-title">{currentChapter.head}</h2>
            <p className="gd-lede">{currentChapter.lede}</p>

            {currentChapter.body.map((p, k) => (
              <p key={k} className="gd-body">{p}</p>
            ))}

            {Fig && (
              <div className="gd-stage">
                <Fig lang={lang} />
              </div>
            )}

            {currentChapter.list && (
              <ul className="gd-list">
                {currentChapter.list.map(([title, desc], k) => (
                  <li key={k}>
                    <div>
                      <b>{title}</b>
                      <span className="gd-list-t"> — {desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="gd-note">{currentChapter.note}</p>
          </article>
        </div>

        <footer className="gd-foot">
          <span className="gd-count">
            {lang === "es" ? `capítulo ${idx + 1} de ${chapters.length} · ${currentChapter.tab}` : `chapter ${idx + 1} of ${chapters.length} · ${currentChapter.tab}`}
          </span>
          <div className="gd-foot-acts">
            {idx > 0 && (
              <button className="gd-back" onClick={prevChapter}>
                {lang === "es" ? "anterior" : "previous"}
              </button>
            )}
            <button
              className="gd-go"
              onClick={() => (idx === chapters.length - 1 ? onClose() : nextChapter())}
            >
              {idx === chapters.length - 1 ? (lang === "es" ? "cerrar guía" : "close guide") : (lang === "es" ? "siguiente capítulo" : "next chapter")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
