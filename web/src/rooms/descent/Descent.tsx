import { useEffect, useRef, useState, useCallback } from "react";
import { DescentEngine, gpuAvailable, DEFAULTS, type Options } from "./engine";
import { SURFACES, OPTS, OPT_NAMES, N_MAX } from "./field.mjs";

/** Isla de la sala 02.
 *
 *  No hay respaldo WebGL, y es una decisión: `scene.ts` existe en el atlas
 *  porque allí hay posiciones precalculadas por el pipeline que dibujar sin
 *  física, y aquí no hay nada que enseñar sin el paso de cómputo. Antes que un
 *  respaldo que mienta, un cartel que lo diga.
 *
 *  Los mandos no reconstruyen el motor: `opts` se aplica por referencia y el
 *  bucle lo lee cada frame. Lo único que resiembra es cambiar de superficie, de
 *  optimizador o pulsar «soltar». */
export default function Descent() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<DescentEngine | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [o, setO] = useState<Options>({ ...DEFAULTS });
  const [hud, setHud] = useState({ fps: 0, steps: 0, live: 0, res: 1, done: false });
  const [seed, setSeed] = useState(1);

  useEffect(() => {
    let dead = false;
    gpuAvailable().then(device => {
      if (dead || !device || !canvasRef.current) { if (!dead) setGpu(false); return; }
      setGpu(true);
      const e = new DescentEngine(device, canvasRef.current);
      engineRef.current = e;
      setO({ ...e.opts });
    });
    return () => {
      dead = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // El HUD se sondea cada 250 ms: leer `stats` cada frame obligaría a un render
  // de React por frame para enseñar cuatro números.
  useEffect(() => {
    const id = setInterval(() => {
      const e = engineRef.current;
      if (e) setHud({ ...e.stats });
    }, 250);
    return () => clearInterval(id);
  }, []);

  const patch = useCallback((p: Partial<Options>) => {
    engineRef.current?.set(p);
    setO(prev => ({ ...prev, ...p }));
  }, []);

  const pickSurface = (i: number) => {
    engineRef.current?.loadSurface(i);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  };
  const pickOpt = (i: number) => {
    engineRef.current?.setOpt(i);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  };
  const reseed = () => {
    const s = seed + 1;
    setSeed(s);
    engineRef.current?.reseed(s);
  };

  const surf = SURFACES[o.surface];
  const base = surf.opt[OPTS[o.opt]].lr;
  // El deslizador va en logaritmo entre 0,1× y 10× el paso medido para esta
  // pareja: en lineal, el 90% del recorrido queda en la zona que diverge.
  const lrPos = Math.log10(o.lr / base);

  return (
    <div className="room">
      <canvas ref={canvasRef} className="room-canvas" />

      {gpu === false && (
        <div className="room-nogpu">
          <p className="room-nogpu-title">Esta sala necesita WebGPU</p>
          <p>
            El descenso se calcula en la GPU: sin él no hay nada que dibujar, así
            que no hay respaldo. En Chrome sobre Linux hace falta activar
            <code> chrome://flags/#enable-unsafe-webgpu</code>.
          </p>
        </div>
      )}

      <header className="room-head">
        <a className="room-back" href="/">← Atlas</a>
        <div>
          <h1>Descenso</h1>
          <p className="room-sub">
            {hud.live.toLocaleString("es")} caminantes soltados a la vez sobre{" "}
            {surf.name}. Ninguno sabe de los demás.
          </p>
        </div>
      </header>

      {gpu && (
        <div className="room-hud">
          <span>{hud.fps.toFixed(0)} fps</span>
          <span>{hud.steps.toLocaleString("es")} pasos</span>
          {hud.res < 0.999 && <span>{(hud.res * 100).toFixed(0)}% res</span>}
          <span className={hud.done ? "done" : ""}>{hud.done ? "asentado" : "descendiendo"}</span>
        </div>
      )}

      {gpu && (
        <aside className="room-rail">
          <section>
            <p className="lbl">Superficie</p>
            <div className="chips">
              {SURFACES.map((s, i) => (
                <button key={s.key} className={i === o.surface ? "chip on" : "chip"}
                        onClick={() => pickSurface(i)}>{s.name}</button>
              ))}
            </div>
          </section>

          <section>
            <p className="lbl">Optimizador</p>
            <div className="chips">
              {OPTS.map((k, i) => (
                <button key={k} className={i === o.opt ? "chip on" : "chip"}
                        onClick={() => pickOpt(i)}>{OPT_NAMES[k]}</button>
              ))}
            </div>
          </section>

          <section>
            <label className="lbl" htmlFor="lr">
              Paso <span className="val">{o.lr.toPrecision(2)}</span>
            </label>
            <input id="lr" type="range" min={-1} max={1} step={0.02} value={lrPos}
                   onChange={e => patch({ lr: base * 10 ** Number(e.target.value) })} />
          </section>

          <section>
            <label className="lbl" htmlFor="n">
              Caminantes <span className="val">{o.n.toLocaleString("es")}</span>
            </label>
            <input id="n" type="range" min={2000} max={N_MAX} step={2000} value={o.n}
                   onChange={e => patch({ n: Number(e.target.value) })} />
          </section>

          <section>
            <label className="lbl" htmlFor="keep">
              Estela{" "}
              <span className="val">
                {o.keep >= 0.9995 ? "permanente" : `${(1 / (1 - o.keep)) | 0} frames`}
              </span>
            </label>
            {/* Hasta 1: en «permanente» la estela deja de ser un campo de flujo
                y se vuelve una exposición larga de la corrida entera, que es la
                única forma de que comparar dos optimizadores diga algo — a mil
                pasos los tres están ya quietos en el mismo sitio. */}
            <input id="keep" type="range" min={0.86} max={1} step={0.005} value={o.keep}
                   onChange={e => patch({ keep: Number(e.target.value) })} />
          </section>

          <div className="row">
            <button className="btn" onClick={() => patch({ plan: !o.plan })}>
              {o.plan ? "Relieve" : "Planta"}
            </button>
            <button className="btn" onClick={() => patch({ running: !o.running })}>
              {o.running ? "Pausa" : "Seguir"}
            </button>
            <button className="btn" onClick={reseed}>Soltar</button>
          </div>
        </aside>
      )}

      <footer className="room-foot">
        <p className="room-note"><strong>{surf.name}.</strong> {surf.note}</p>
        <p className="room-formula">f(x, y) = {surf.formula}</p>
        <p>
          <strong>La vertical va en logaritmo.</strong> Beale pasa de 160.000 en
          una esquina; en lineal la escena sería una pared y un suelo, sin valle
          entre medias. <code>log1p</code> es monótona, así que «hacia abajo»
          sigue siendo hacia abajo — lo que se pierde es la escala.
        </p>
        <p>
          El color del <strong>relieve</strong> es la altura; el del{" "}
          <strong>caminante</strong>, su punto de partida. Dos codificaciones
          distintas porque dicen cosas distintas.
          {OPTS[o.opt] !== "adam" && " El paso lleva recorte de la norma del gradiente, así que, siendo estrictos, no es descenso puro."}
        </p>
        <p className="room-phase">
          Fase 01 · cinco superficies · descenso, momento y Adam · estelas por
          acumulación en pantalla
        </p>
      </footer>
    </div>
  );
}
