import type { Params } from "../galaxy/gpu/engine";

interface Slider {
  key: keyof Params;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
}

const SLIDERS: Slider[] = [
  // Lo primero son los dos mandos que arreglan la legibilidad: el tamaño del
  // punto y cuánta malla lo tapa. Bajar las aristas es además la única palanca
  // de rendimiento real — se llevan el 83% del tiempo de render.
  { key: "minPx", label: "punto px", min: 1, max: 6, step: 0.5,
    fmt: (v) => v.toFixed(1) },
  { key: "edgeBright", label: "aristas", min: 0, max: 1.6, step: 0.02 },
  { key: "minEdgePx", label: "arista mín", min: 0, max: 6, step: 0.2,
    fmt: (v) => v.toFixed(1) + "px" },
  { key: "range", label: "rango", min: 0.2, max: 1, step: 0.02,
    fmt: (v) => (v >= 0.999 ? "∞" : v.toFixed(2)) },
  { key: "kr", label: "repulsión", min: 0.02, max: 1.2, step: 0.01 },
  { key: "ks", label: "atracción", min: 0.1, max: 3.0, step: 0.05 },
  { key: "gravity", label: "gravedad", min: 0, max: 0.02, step: 0.0005,
    fmt: (v) => v.toFixed(4) },
  { key: "drag", label: "rozamiento", min: 0.6, max: 0.98, step: 0.01 },
  { key: "K", label: "muestras", min: 4, max: 64, step: 4, fmt: (v) => String(v) },
  { key: "stepsPerFrame", label: "pasos/frame", min: 1, max: 6, step: 1,
    fmt: (v) => String(v) },
];

export interface Visible { nodes: number; edges: number; res: number; lod: number }

export default function Controls({
  params, onChange, onReset, fps, visible, total,
}: {
  params: Params;
  onChange: (p: Partial<Params>) => void;
  onReset: () => void;
  fps: number;
  visible: Visible;
  total: { nodes: number; edges: number };
}) {
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  return (
    <div className="hud hud-tr">
      <div className="ctl-head">
        <span className="eyebrow">simulación viva</span>
        <span className="fps">{fps.toFixed(0)} fps</span>
      </div>

      {SLIDERS.map((s) => (
        <label key={s.key} className="ctl">
          <span>{s.label}</span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={params[s.key] as number}
            onChange={(e) => onChange({ [s.key]: Number(e.target.value) } as Partial<Params>)}
          />
          <b>{(s.fmt ?? ((v: number) => v.toFixed(2)))(params[s.key] as number)}</b>
        </label>
      ))}

      {/* Lo que sobrevive al descarte, para ver la técnica trabajar */}
      <p className="cull">
        {visible.nodes.toLocaleString("es")} nodos ({pct(visible.nodes, total.nodes)}%) ·{" "}
        {visible.edges.toLocaleString("es")} aristas ({pct(visible.edges, total.edges)}%) ·{" "}
        {Math.round(visible.res * 100)}% res ·{" "}
        {Math.round(visible.lod * 100)}% malla
      </p>

      <div className="ctl-row">
        <button
          className={params.running ? "on" : ""}
          onClick={() => onChange({ running: !params.running })}
        >
          {params.running ? "pausar" : "reanudar"}
        </button>
        <button
          className={params.alpha === 0 ? "on" : ""}
          onClick={() => onChange({ alpha: params.alpha === 0 ? 1 : 0 })}
          title="Congela el movimiento sin detener la simulación"
        >
          asentar
        </button>
        <button
          className={params.adaptiveRes ? "on" : ""}
          onClick={() => onChange({ adaptiveRes: !params.adaptiveRes })}
          title="Baja la resolución interna cuando el frame no entra en presupuesto"
        >
          res auto
        </button>
        <button onClick={onReset}>reiniciar</button>
      </div>
    </div>
  );
}
