import { useCallback, useEffect, useState, type JSX } from "react";
import type { Lang } from "../../i18n";

export type KmeansChapterId =
  | "what" | "em" | "voronoi" | "kmeanspp"
  | "kchoice" | "clustering" | "controls";

interface KmeansChapter {
  id: KmeansChapterId;
  tag: string;
  head: string;
  lede: string;
  body: string[];
  list?: [string, string][];
  note: string;
  fig?: ({ lang }: { lang: Lang }) => JSX.Element;
}

const ART = { viewBox: "0 0 320 150", preserveAspectRatio: "xMidYMid meet" };

/* ==========================================================================
   Láminas Interactivas de K-Means Clustering
   ========================================================================== */

/** 1. Lámina interactiva del Descubrimiento de Clústeres */
function FigKmeansOverview({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [clustered, setClustered] = useState<boolean>(true);

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-label="Descubrimiento de Clústeres">
        {/* Nube 1 (Izquierda) */}
        {[
          [50, 45], [70, 35], [60, 60], [80, 50], [65, 75], [90, 65],
        ].map(([x, y], i) => (
          <circle key={`c1-${i}`} cx={x} cy={y} r="3.5" fill={clustered ? "#ffd700" : "#aaa"} />
        ))}
        {clustered && <circle cx="69" cy="55" r="7" fill="#ffd700" stroke="#fff" strokeWidth="2" />}

        {/* Nube 2 (Superior Derecha) */}
        {[
          [220, 35], [245, 25], [235, 50], [260, 40], [240, 65], [265, 55],
        ].map(([x, y], i) => (
          <circle key={`c2-${i}`} cx={x} cy={y} r="3.5" fill={clustered ? "#00d2ff" : "#aaa"} />
        ))}
        {clustered && <circle cx="244" cy="45" r="7" fill="#00d2ff" stroke="#fff" strokeWidth="2" />}

        {/* Nube 3 (Inferior Centro) */}
        {[
          [140, 95], [160, 85], [150, 110], [175, 100], [155, 125], [180, 115],
        ].map(([x, y], i) => (
          <circle key={`c3-${i}`} cx={x} cy={y} r="3.5" fill={clustered ? "#ff4070" : "#aaa"} />
        ))}
        {clustered && <circle cx="160" cy="105" r="7" fill="#ff4070" stroke="#fff" strokeWidth="2" />}

        <text x="160" y="142" className="gd-art-n" textAnchor="middle">
          {clustered ? (isEs ? "K = 3 Clústeres con Centroides μ₁, μ₂, μ₃" : "K = 3 Clusters with Centroids μ₁, μ₂, μ₃") : (isEs ? "Nube de datos crudos sin etiquetar" : "Raw unlabelled point cloud")}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (!clustered ? " on" : "")} onClick={() => setClustered(false)}>
          {isEs ? "Datos Crudos Sin Agrupar" : "Unlabelled Raw Points"}
        </button>
        <button className={"gd-pill" + (clustered ? " on" : "")} onClick={() => setClustered(true)}>
          {isEs ? "Agrupamiento Óptimo K-Means" : "K-Means Optimal Partition"}
        </button>
      </div>
    </div>
  );
}

/** 2. Lámina interactiva del Ciclo E-M (Expectation vs Maximization) */
function FigExpectationMaximization({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [step, setStep] = useState<"E" | "M">("E");

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-label="Paso E y Paso M en K-Means">
        <circle cx="80" cy="50" r="3" fill="#ffd700" />
        <circle cx="95" cy="40" r="3" fill="#ffd700" />
        <circle cx="70" cy="65" r="3" fill="#ffd700" />
        <circle cx="105" cy="70" r="3" fill="#ffd700" />
        <circle cx="85" cy="80" r="3" fill="#ffd700" />

        <circle
          cx={step === "E" ? "65" : "87"}
          cy={step === "E" ? "45" : "61"}
          r="8"
          fill="#ffd700"
          stroke="#fff"
          strokeWidth="2"
        />
        <text
          x={step === "E" ? "65" : "87"}
          y={step === "E" ? "32" : "48"}
          fill="#ffd700"
          fontSize="7"
          fontWeight="bold"
          textAnchor="middle"
        >
          μ₁
        </text>

        <circle cx="210" cy="55" r="3" fill="#00d2ff" />
        <circle cx="235" cy="45" r="3" fill="#00d2ff" />
        <circle cx="220" cy="75" r="3" fill="#00d2ff" />
        <circle cx="250" cy="65" r="3" fill="#00d2ff" />
        <circle cx="230" cy="85" r="3" fill="#00d2ff" />

        <circle
          cx={step === "E" ? "255" : "229"}
          cy={step === "E" ? "50" : "65"}
          r="8"
          fill="#00d2ff"
          stroke="#fff"
          strokeWidth="2"
        />
        <text
          x={step === "E" ? "255" : "229"}
          y={step === "E" ? "37" : "52"}
          fill="#00d2ff"
          fontSize="7"
          fontWeight="bold"
          textAnchor="middle"
        >
          μ₂
        </text>

        <line
          x1={step === "E" ? "160" : "158"}
          y1="15"
          x2={step === "E" ? "160" : "158"}
          y2="135"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        <text x="160" y="142" fill="var(--ink-2)" fontSize="7" textAnchor="middle">
          {step === "E"
            ? (isEs ? "Paso E (Expectation): Puntos asignados al centroide más cercano" : "E-Step (Expectation): Points assigned to closest centroid")
            : (isEs ? "Paso M (Maximization): Centroides reubicados en el centro de gravedad" : "M-Step (Maximization): Centroids shifted to cluster geometric mean")}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <button className={"gd-pill" + (step === "E" ? " on" : "")} onClick={() => setStep("E")}>
          {isEs ? "Paso E (Asignación Voronoi)" : "E-Step (Assignment)"}
        </button>
        <button className={"gd-pill" + (step === "M" ? " on" : "")} onClick={() => setStep("M")}>
          {isEs ? "Paso M (Recalcular Centro de Masa)" : "M-Step (Update Centroids)"}
        </button>
      </div>
    </div>
  );
}

/** 3. Lámina interactiva de Teselación de Voronoi */
function FigVoronoiTessellation({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [posX, setPosX] = useState<number>(160);

  return (
    <div className="gd-fig">
      <svg
        className="gd-art gd-grab"
        {...ART}
        role="application"
        tabIndex={0}
        onPointerDown={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPosX(Math.max(80, Math.min(240, ((e.clientX - rect.left) / rect.width) * 320)));
        }}
      >
        {/* Celda Voronoi Izquierda */}
        <rect x="20" y="20" width={posX - 20} height="110" fill="rgba(255, 215, 0, 0.1)" stroke="none" />
        {/* Celda Voronoi Derecha */}
        <rect x={posX} y="20" width={300 - posX} height="110" fill="rgba(0, 210, 255, 0.1)" stroke="none" />

        {/* Frontera de Voronoi (Mediatriz) */}
        <line x1={posX} y1="15" x2={posX} y2="135" stroke="#fff" strokeWidth="2" strokeDasharray="3 2" />

        {/* Centroide 1 */}
        <circle cx={posX / 2 + 10} cy="75" r="7" fill="#ffd700" stroke="#fff" strokeWidth="1.5" />
        <text x={posX / 2 + 10} y="95" className="gd-art-n" textAnchor="middle">Centroide μ₁</text>

        {/* Centroide 2 */}
        <circle cx={posX + (300 - posX) / 2} cy="75" r="7" fill="#00d2ff" stroke="#fff" strokeWidth="1.5" />
        <text x={posX + (300 - posX) / 2} y="95" className="gd-art-n" textAnchor="middle">Centroide μ₂</text>

        <text x="160" y="142" className="gd-art-n" textAnchor="middle">
          {isEs ? "Arrastra para desplazar la frontera de Voronoi en tiempo real" : "Drag to move the Voronoi partition boundary in real-time"}
        </text>
      </svg>
    </div>
  );
}

/** 4. Lámina interactiva del Método del Codo (Elbow Method) */
function FigElbowMethod({ lang }: { lang: Lang }) {
  const isEs = lang === "es";
  const [selectedK, setSelectedK] = useState<number>(3);

  const points = [
    { k: 1, wcss: 125, isElbow: false },
    { k: 2, wcss: 65, isElbow: false },
    { k: 3, wcss: 32, isElbow: true },
    { k: 4, wcss: 24, isElbow: false },
    { k: 5, wcss: 19, isElbow: false },
    { k: 6, wcss: 16, isElbow: false },
  ];

  const toX = (k: number) => 40 + (k - 1) * 48;
  const toY = (wcss: number) => 130 - (wcss / 130) * 105;

  const dPath = points.reduce((acc, p, i) => (i === 0 ? `M ${toX(p.k)} ${toY(p.wcss)}` : `${acc} L ${toX(p.k)} ${toY(p.wcss)}`), "");

  return (
    <div className="gd-fig">
      <svg className="gd-art" {...ART} role="img" aria-label="Método del Codo (Elbow Method)">
        {/* Ejes */}
        <line x1="40" y1="130" x2="290" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <line x1="40" y1="20" x2="40" y2="130" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <text x="290" y="142" className="gd-art-n" textAnchor="end">K (Nº Clústeres)</text>
        <text x="35" y="25" className="gd-art-n" textAnchor="end">Inercia</text>

        {/* Curva WCSS */}
        <path d={dPath} stroke="#00f0ff" strokeWidth="2.5" fill="none" />

        {/* Nodos K */}
        {points.map(p => {
          const isSel = selectedK === p.k;
          return (
            <g key={p.k} onClick={() => setSelectedK(p.k)} style={{ cursor: "pointer" }}>
              <circle
                cx={toX(p.k)}
                cy={toY(p.wcss)}
                r={isSel ? 6 : p.isElbow ? 5 : 3.5}
                fill={p.isElbow ? "#ffd700" : isSel ? "#00f0ff" : "#fff"}
              />
              <text x={toX(p.k)} y="142" className="gd-art-n" textAnchor="middle">
                K={p.k}
              </text>
            </g>
          );
        })}

        {/* Codo marcado */}
        <circle cx={toX(3)} cy={toY(32)} r="12" fill="none" stroke="#ffd700" strokeWidth="1.5" strokeDasharray="3 2" />
        <text x={toX(3) + 16} y={toY(32) - 8} fill="#ffd700" className="gd-art-n">
          {isEs ? "Codo Óptimo (K = 3)" : "Optimal Elbow (K = 3)"}
        </text>
      </svg>

      <div className="gd-fig-acts" role="group">
        <span className="gd-cap">{isEs ? "Probar K:" : "Test K:"}</span>
        {[1, 2, 3, 4, 5, 6].map(k => (
          <button key={k} className={"gd-pill" + (selectedK === k ? " on" : "")} onClick={() => setSelectedK(k)}>
            K = {k}
          </button>
        ))}
      </div>

      <p className="gd-cap">
        {selectedK === 3
          ? (isEs ? "K = 3 es el punto de máxima eficiencia: añadir más clústeres apenas reduce la inercia interna." : "K = 3 achieves peak efficiency: adding more clusters yields diminishing inertia reduction.")
          : (isEs ? `Inercia residual en K = ${selectedK}: ${points[selectedK - 1].wcss}` : `Residual inertia at K = ${selectedK}: ${points[selectedK - 1].wcss}`)}
      </p>
    </div>
  );
}

const CHAPTERS_DATA: Record<Lang, KmeansChapter[]> = {
  es: [
    {
      id: "what",
      tag: "1. ¿Qué es K-Means?",
      head: "Partición Voronoi y Agrupamiento No Supervisado",
      lede: "K-Means es el algoritmo clásico de agrupamiento que descubre estructuras ocultas y centroides en nubes de datos sin etiquetar.",
      body: [
        "El objetivo es particionar N observaciones en K grupos (clústeres), de modo que cada punto pertenezca al clúster con el centroide más cercano.",
        "K-Means minimiza la inercia total (suma de distancias cuadráticas intra-clúster o WCSS) mediante un proceso iterativo de dos fases que garantiza convergencia local.",
      ],
      fig: FigKmeansOverview,
      note: "Formulado por Stuart Lloyd en 1957 y publicado por James MacQueen en 1967.",
    },
    {
      id: "em",
      tag: "2. Algoritmo Lloyd (E-M)",
      head: "El Ciclo Expectation-Maximization",
      lede: "Dos pasos alternados que reducen monótonamente la varianza interna.",
      body: [
        "1. Paso E (Asignación): Cada punto de datos x_i se asigna al centroide μ_k más cercano según la distancia euclidiana mínima ||x_i - μ_k||².",
        "2. Paso M (Actualización): Cada centroide se recalcula como el promedio aritmético (centro de masa) de todos los puntos asignados a su clúster.",
      ],
      fig: FigExpectationMaximization,
      note: "En la sala 3D, el motor WebGPU actualiza las asignaciones de miles de partículas en paralelo a 60 fps.",
    },
    {
      id: "voronoi",
      tag: "3. Celdas de Voronoi",
      head: "La Geometría Oculta del Espacio",
      lede: "Los centroides definen un mosaico de celdas convexas en el espacio 3D.",
      body: [
        "Las fronteras entre dos clústeres son hiperplanos mediatrices perpendiculares al segmento que une sus centroides.",
        "Cualquier punto dentro de una celda de Voronoi está garantizado de estar más cerca de su centroide generador que de cualquier otro en el espacio.",
      ],
      fig: FigVoronoiTessellation,
      note: "En la lámina superior, arrastra la línea divisoria para ver cómo cambian las regiones de influencia.",
    },
    {
      id: "kmeanspp",
      tag: "4. K-Means++",
      head: "Inicialización Inteligente con D(x)²",
      lede: "Evitar convergencias subóptimas distribuyendo los centroides iniciales con probabilidad proporcional a la distancia.",
      body: [
        "La inicialización aleatoria ingenua (Forgy) puede colocar centroides juntos en un mismo grupo, arruinando el resultado final.",
        "K-Means++ elige el primer centroide al azar, y cada siguiente centroide con probabilidad P(x) = D(x)² / ∑ D(x)², garantizando una dispersión espacial óptima con cota teórica O(log K).",
      ],
      note: "K-Means++ fue diseñado por David Arthur y Sergei Vassilvitskii en 2007.",
    },
    {
      id: "kchoice",
      tag: "5. Elección de K",
      head: "El Método del Codo y Coeficiente de Silueta",
      lede: "Cómo determinar el número natural de grupos sin conocimiento previo.",
      body: [
        "Método del Codo (Elbow Method): Grafica la inercia WCSS en función de K. El valor óptimo se sitúa en el punto de inflexión o 'codo' de la curva.",
        "Análisis de Silueta: Mide cuán similar es un punto a su propio clúster en comparación con otros grupos vecinos (de -1 a +1).",
      ],
      fig: FigElbowMethod,
      note: "En la lámina superior, selecciona diferentes valores de K para observar la curva de inercia.",
    },
    {
      id: "clustering",
      tag: "6. Datasets de Prueba",
      head: "Catálogo de Geometrías 3D Complejas",
      lede: "Prueba el comportamiento de K-Means ante distribuciones gaussianas, anillos y espirales.",
      body: [
        "Gaussian Blobs: Caso ideal donde K-Means brilla con agrupaciones esféricas isotrópicas.",
        "Anillos Concéntricos: Demuestra la limitación de K-Means ante fronteras no lineales convexas.",
        "Espiral 3D y Nubes Anisotrópicas: Retos de elongación y densidad variable.",
      ],
      note: "Selecciona diferentes presets en el panel lateral para comparar resultados.",
    },
    {
      id: "controls",
      tag: "7. Controles 3D",
      head: "Navegación en la Escena",
      lede: "Herramientas de inspección visual de clústeres.",
      body: [
        "Arrastrar / Zoom: Orbita en el espacio 3D para examinar la separación espacial de los centroides.",
        "Botón 'Paso a Paso' (N): Alterna entre el paso E y el paso M para observar la migración de los centroides.",
        "Buscador de Puntos: Resalta y localiza vectores específicos dentro de cada clúster.",
      ],
      note: "Puedes pausar o reanudar el entrenamiento en cualquier momento con la barra espaciadora.",
    },
  ],
  en: [
    {
      id: "what",
      tag: "1. What is K-Means?",
      head: "Voronoi Partitioning & Unsupervised Clustering",
      lede: "K-Means is the foundational unsupervised algorithm discovering latent clusters and centroids in unlabelled data manifolds.",
      body: [
        "The objective is to partition N observations into K clusters such that each point belongs to the cluster with the nearest centroid.",
        "K-Means minimizes within-cluster sum of squares (WCSS or inertia) through an alternating two-phase optimization loop with guaranteed local convergence.",
      ],
      fig: FigKmeansOverview,
      note: "Pioneered by Stuart Lloyd in 1957 and published by James MacQueen in 1967.",
    },
    {
      id: "em",
      tag: "2. Lloyd's Algorithm (E-M)",
      head: "The Expectation-Maximization Loop",
      lede: "Two alternating steps that monotonically decrease internal variance.",
      body: [
        "1. E-Step (Assignment): Every data vector x_i is assigned to the nearest centroid μ_k minimizing squared Euclidean distance ||x_i - μ_k||².",
        "2. M-Step (Update): Every centroid is recomputed as the arithmetic mean of all data vectors assigned to its cluster.",
      ],
      fig: FigExpectationMaximization,
      note: "In the 3D room, WebGPU compute shaders update thousands of particle assignments in parallel at 60 fps.",
    },
    {
      id: "voronoi",
      tag: "3. Voronoi Cells",
      head: "The Latent Convex Geometry of Euclidean Space",
      lede: "Centroids define a convex Voronoi tessellation of the entire 3D space.",
      body: [
        "Cluster boundaries are planar perpendicular bisectors separating adjacent centroid pairs.",
        "Any vector inside a given Voronoi cell is guaranteed to be closer to its cell centroid than to any other centroid in space.",
      ],
      fig: FigVoronoiTessellation,
      note: "In the interactive widget above, drag the boundary line to watch the partition shift.",
    },
    {
      id: "kmeanspp",
      tag: "4. K-Means++",
      head: "Smart D(x)² Seed Initialization",
      lede: "Preventing suboptimal convergence by spreading initial seeds proportionally to distance.",
      body: [
        "Naive uniform random seeding can position multiple centroids in the same cluster, corrupting final convergence.",
        "K-Means++ samples the initial seed uniformly and subsequent seeds with probability P(x) = D(x)² / ∑ D(x)², guaranteeing optimal dispersion with an O(log K) theoretical error bound.",
      ],
      note: "K-Means++ was developed by David Arthur and Sergei Vassilvitskii in 2007.",
    },
    {
      id: "kchoice",
      tag: "5. Choosing K",
      head: "The Elbow Method & Silhouette Analysis",
      lede: "Determining the intrinsic number of clusters without ground truth labels.",
      body: [
        "Elbow Method: Plots within-cluster inertia as a function of K. The optimal K corresponds to the distinct inflection 'elbow'.",
        "Silhouette Score: Quantifies cohesion within a cluster versus separation from neighboring clusters (scaled -1 to +1).",
      ],
      fig: FigElbowMethod,
      note: "In the interactive widget above, select different K values to inspect the inertia curve.",
    },
    {
      id: "clustering",
      tag: "6. Benchmark Datasets",
      head: "Complex 3D Manifolds Catalog",
      lede: "Benchmarking K-Means performance across Gaussian blobs, concentric rings, and spirals.",
      body: [
        "Gaussian Blobs: Canonical isotropic setting where K-Means delivers optimal convex partitioning.",
        "Concentric Rings: Illustrates fundamental limitation on non-convex manifolds.",
        "3D Spirals & Anisotropic Clouds: Tests performance under variable density and elongation.",
      ],
      note: "Switch presets in the sidebar to benchmark performance live.",
    },
    {
      id: "controls",
      tag: "7. 3D Controls",
      head: "Scene Navigation Guide",
      lede: "Visual inspection tools in the 3D viewport.",
      body: [
        "Drag / Zoom: 3D orbit around clusters to inspect centroid separation.",
        "Step by Step (N): Alternates E and M steps to observe centroid migration paths.",
        "Word Search: Highlights and pinpoints individual vectors inside clusters.",
      ],
      note: "Pause or resume clustering anytime with Spacebar.",
    },
  ],
};

export default function KmeansGuide({
  onClose,
  initialChapter = "what",
  lang = "es",
}: {
  onClose: () => void;
  initialChapter?: KmeansChapterId;
  lang?: Lang;
}) {
  const chapters = CHAPTERS_DATA[lang] ?? CHAPTERS_DATA.es;
  const [currentId, setCurrentId] = useState<KmeansChapterId>(initialChapter);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        nextChapter();
      } else if (e.key === "ArrowLeft") {
        prevChapter();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextChapter, onClose, prevChapter]);

  return (
    <div className="gd-veil" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gd" role="dialog" aria-modal="true" aria-labelledby="kmeans-guide-title">
        <header className="gd-top">
          <p className="eyebrow">{lang === "es" ? "guía técnica de k-means clustering 3d" : "k-means 3d clustering guide"}</p>
          <div className="gd-top-acts">
            <button className="gd-ghost" onClick={onClose}>
              <span>{lang === "es" ? "cerrar" : "close"}</span> <kbd>esc</kbd>
            </button>
          </div>
        </header>

        <div className="gd-main">
          <nav className="gd-toc" aria-label="Capítulos de la guía K-Means">
            {chapters.map((c, i) => (
              <button
                key={c.id}
                className={"gd-toc-i" + (c.id === currentId ? " on" : "")}
                onClick={() => setCurrentId(c.id)}
                aria-current={c.id === currentId}
              >
                <b>{String(i + 1).padStart(2, "0")}</b>
                <span>{c.tag}</span>
              </button>
            ))}
          </nav>

          <article className="gd-page">
            <h2 className="gd-head" id="kmeans-guide-title">{currentChapter.head}</h2>
            <p className="gd-lede">{currentChapter.lede}</p>

            {currentChapter.body.map((p, k) => (
              <p key={k} className="gd-body">{p}</p>
            ))}

            {Fig && (
              <div className="gd-stage">
                <Fig lang={lang} />
              </div>
            )}

            <p className="gd-note">{currentChapter.note}</p>
          </article>
        </div>

        <footer className="gd-foot">
          <span className="gd-count">
            {lang === "es" ? `capítulo ${idx + 1} de ${chapters.length} · ${currentChapter.tag}` : `chapter ${idx + 1} of ${chapters.length} · ${currentChapter.tag}`}
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
