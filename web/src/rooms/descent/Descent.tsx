import { useEffect, useRef, useState, useCallback } from "react";
import { DescentEngine, gpuAvailable, DEFAULTS, TOTAL_STEPS, type Options } from "./engine";
import { SURFACES, OPTS, OPT_NAMES, N_MAX } from "./field.mjs";
import { typing } from "../../galaxy/keys.mjs";
import { rampCss } from "../../galaxy/palette.mjs";
import {
  IcoChevron, IcoFit, IcoExpand, IcoShrink, IcoHelp,
  IcoPlay, IcoPause, IcoStep, IcoDrop, IcoPlan,
} from "../../components/icons";

/** Isla de la sala del descenso.
 *
 *  **El mueble es el de la galaxia**, y eso es la mitad del rediseño. Antes
 *  esta sala se había inventado uno propio: un raíl a la derecha con chips de
 *  diez píxeles, un pie sin una sola regla de estilo —se dibujaba encima del
 *  título, en el flujo del documento, porque nadie le había dado posición— y
 *  ningún parentesco visible con el resto del atlas. Ahora comparte
 *  `styles/shell.css` y `components/icons.tsx` con la galaxia: cajón a la
 *  izquierda con la tira de herramientas siempre a la vista, raíl a la derecha
 *  con la lectura, y sobre el lienzo sólo lo que aparece cuando hace falta.
 *
 *  El reparto es el mismo de siempre y no es decorativo:
 *
 *    · **izquierda** lo que se elige y se ajusta (superficie, optimizador,
 *      paso, cuántos, estela, qué dice el color);
 *    · **derecha** lo que la sala tiene que decir *ahora* (progreso, estado) y
 *      la ficha de la superficie que se está mirando;
 *    · **el lienzo** se queda para el descenso, con la salida —vista completa—
 *      apareciendo sólo cuando alguien se ha ido de sitio.
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
  const [side, setSide] = useState(true);
  const [zen, setZen] = useState(false);
  const [roamed, setRoamed] = useState(false);
  const [legend, setLegend] = useState(false);
  const [notes, setNotes] = useState(false);
  const [cardOpen, setCardOpen] = useState(true);

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
  // de React por frame para enseñar cuatro números. `roamed` viaja con ellos
  // porque es la misma pregunta —¿ha cambiado algo que la pantalla deba decir?—
  // y montar un segundo intervalo para un booleano no compra nada.
  useEffect(() => {
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      setHud({ ...e.stats });
      setRoamed(e.roamed);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const patch = useCallback((p: Partial<Options>) => {
    engineRef.current?.set(p);
    setO(prev => ({ ...prev, ...p }));
  }, []);

  const pickSurface = useCallback((i: number) => {
    engineRef.current?.loadSurface(i);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);
  const pickOpt = useCallback((i: number) => {
    engineRef.current?.setOpt(i);
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);
  const reseed = useCallback(() => {
    setSeed(s => { engineRef.current?.reseed(s + 1); return s + 1; });
  }, []);
  const goHome = useCallback(() => engineRef.current?.goHome(), []);
  const stepOnce = useCallback(() => {
    engineRef.current?.stepOnce();
    if (engineRef.current) setO({ ...engineRef.current.opts });
  }, []);

  /** Modo inmersivo. El estado es propio y `requestFullscreen` es un extra que
   *  puede fallar (iframe sin permiso, navegador que lo niega): atar el modo a
   *  la API dejaría el botón sin hacer nada en esos sitios. Mismo trato que en
   *  la galaxia. */
  const toggleZen = useCallback(() => {
    setZen(z => {
      const next = !z;
      try {
        if (next) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      } catch { /* el modo vale igual sin pantalla completa del navegador */ }
      return next;
    });
  }, []);

  useEffect(() => {
    const off = () => { if (!document.fullscreenElement) setZen(false); };
    document.addEventListener("fullscreenchange", off);
    return () => document.removeEventListener("fullscreenchange", off);
  }, []);

  // Teclado de la sala. Sólo las teclas que `KeyFly` no reclama —WASD, QE y las
  // flechas son de la cámara— y siempre con el filtro de foco: `typing()` vive
  // en `keys.mjs` justamente para que las dos salas lo compartan.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const eng = engineRef.current;
      switch (e.code) {
        case "Space":
          if (!eng) return;
          e.preventDefault();
          patch({ running: !eng.opts.running });
          break;
        // `Escape` sale del modo inmersivo **antes** que de nada más: quien lo
        // pulsa con la interfaz escondida quiere la interfaz.
        case "Escape": if (zen) { e.preventDefault(); toggleZen(); } break;
        case "KeyF": e.preventDefault(); toggleZen(); break;
        case "KeyR": e.preventDefault(); reseed(); break;
        case "KeyN": e.preventDefault(); stepOnce(); break;
        case "KeyP":
          if (!eng) return;
          e.preventDefault();
          patch({ plan: !eng.opts.plan });
          break;
      }
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, [patch, reseed, stepOnce, toggleZen, zen]);

  const surf = SURFACES[o.surface];
  const base = surf.opt[OPTS[o.opt]].lr;
  // El deslizador va en logaritmo entre 0,1× y 10× el paso medido para esta
  // pareja: en lineal, el 90% del recorrido queda en la zona que diverge.
  const lrPos = base > 0 ? Math.log10(o.lr / base) : 0;
  const done = Math.min(1, hud.steps / TOTAL_STEPS);

  // La muestra del color por origen sale de `rampCss`, no de una copia en el
  // CSS: es la misma rampa que tiñe a los caminantes, y una segunda escrita a
  // mano se queda desfasada en cuanto se toque la primera — momento en el que
  // la leyenda deja de describir lo que hay en pantalla. Mismo argumento que la
  // tercera lámina de la presentación del atlas.
  const originRamp = `linear-gradient(90deg, ${
    Array.from({ length: 13 }, (_, i) => rampCss(i / 12)).join(", ")})`;

  return (
    <div className={"shell room-descent" + (side ? " side-open" : "") + (zen ? " zen" : "")}>
      <canvas ref={canvasRef} className="shell-canvas" />
      <div className="veil" aria-hidden="true" />

      {gpu === false && (
        <div className="room-nogpu">
          <p className="room-nogpu-title">Esta sala necesita WebGPU</p>
          <p>
            El descenso se calcula en la GPU: sin él no hay nada que dibujar, así
            que no hay respaldo. En Chrome sobre Linux hace falta activar
            <code> chrome://flags/#enable-unsafe-webgpu</code>.
          </p>
          <p><a className="side-back" href="/" style={{ width: "auto", padding: "0.48rem 1rem" }}>Volver a Inicio</a></p>
        </div>
      )}

      {/* ------------------------------------------------------ cajón izquierdo */}
      {gpu && (
        <aside className="side">
          <div className="tools" role="toolbar" aria-label="herramientas">
            <button
              className="tool tool-side"
              onClick={() => setSide(s => !s)}
              aria-expanded={side}
              aria-label={side ? "plegar" : "desplegar"}
              title={side ? "plegar" : "desplegar"}
            >
              <IcoChevron open={side} />
            </button>
            <button className="tool tool-home" onClick={goHome}
                    aria-label="vista completa" title="vista completa · Inicio">
              <IcoFit />
            </button>
            {/* Correr, un paso y soltar. Son los tres mandos que hay que poder
                alcanzar con el cajón plegado: sin ellos, plegar la columna deja
                la sala corriendo sola y sin forma de pararla. */}
            <button className={"tool" + (o.running ? " on" : "")}
                    onClick={() => patch({ running: !o.running })}
                    aria-pressed={o.running}
                    aria-label={o.running ? "pausa" : "seguir"}
                    title={`${o.running ? "pausa" : "seguir"} · espacio`}>
              {o.running ? <IcoPause /> : <IcoPlay />}
            </button>
            <button className="tool" onClick={stepOnce} disabled={o.running}
                    aria-label="un paso" title="un paso · N">
              <IcoStep />
            </button>
            <button className="tool" onClick={reseed}
                    aria-label="soltar de nuevo" title="soltar de nuevo · R">
              <IcoDrop />
            </button>
            <button className={"tool" + (o.plan ? " on" : "")}
                    onClick={() => patch({ plan: !o.plan })}
                    aria-pressed={o.plan}
                    aria-label="planta" title={`${o.plan ? "relieve" : "planta"} · P`}>
              <IcoPlan />
            </button>
            <button className={"tool" + (zen ? " on" : "")} onClick={toggleZen}
                    aria-pressed={zen} aria-label="pantalla completa"
                    title="pantalla completa · F">
              {zen ? <IcoShrink /> : <IcoExpand />}
            </button>
            <button className={"tool" + (notes ? " on" : "")}
                    onClick={() => { setNotes(n => !n); setCardOpen(true); }}
                    aria-pressed={notes} aria-label="cómo leer esto"
                    title="cómo leer esto">
              <IcoHelp />
            </button>
          </div>

          <div className="side-body">
            <a href="/" className="side-back">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
                   stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Volver a Inicio</span>
            </a>

            <p className="eyebrow">Superficie</p>
            <div className="ctl-row ctl-col" role="group" aria-label="superficie">
              {SURFACES.map((s, i) => (
                <button key={s.key} className={i === o.surface ? "on" : ""}
                        aria-pressed={i === o.surface}
                        onClick={() => pickSurface(i)}>{s.name}</button>
              ))}
            </div>

            <p className="eyebrow">Optimizador</p>
            <div className="ctl-row" role="group" aria-label="optimizador">
              {OPTS.map((k, i) => (
                <button key={k} className={i === o.opt ? "on" : ""}
                        aria-pressed={i === o.opt}
                        onClick={() => pickOpt(i)}>{OPT_NAMES[k]}</button>
              ))}
            </div>

            <hr className="side-sep" />

            {/* Qué dice el color de la bolita. Es el mando que faltaba: con el
                color por origen —el ángulo desde el que se soltó— la nube era
                confeti salvo en Himmelblau, donde es el mapa de cuencas. Por
                altura, en cambio, el enjambre se enfría al bajar y se ve
                descender sin leer una línea. Por eso arranca en altura. */}
            <p className="eyebrow">Color del caminante</p>
            <div className="ctl-row" role="group" aria-label="color del caminante">
              <button className={o.heat ? "on" : ""} aria-pressed={o.heat}
                      onClick={() => patch({ heat: true })}>Altura</button>
              <button className={!o.heat ? "on" : ""} aria-pressed={!o.heat}
                      onClick={() => patch({ heat: false })}>Origen</button>
            </div>

            <hr className="side-sep" />

            <label className="ctl-wide" htmlFor="lr">
              <span className="lbl">Paso <b>{o.lr.toPrecision(2)}</b></span>
              <input id="lr" type="range" min={-1} max={1} step={0.02} value={lrPos}
                     onChange={e => patch({ lr: base * 10 ** Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="n">
              <span className="lbl">Caminantes <b>{o.n.toLocaleString("es")}</b></span>
              <input id="n" type="range" min={1000} max={N_MAX} step={1000} value={o.n}
                     onChange={e => patch({ n: Number(e.target.value) })} />
            </label>

            <label className="ctl-wide" htmlFor="keep">
              <span className="lbl">
                Estela
                <b>{o.keep >= 0.9995 ? "permanente" : `${(1 / (1 - o.keep)) | 0} frames`}</b>
              </span>
              {/* Hasta 1: en «permanente» la estela deja de ser un campo de flujo
                  y se vuelve una exposición larga de la corrida entera, que es la
                  única forma de que comparar dos optimizadores diga algo — a mil
                  pasos los tres están ya quietos en el mismo sitio. */}
              <input id="keep" type="range" min={0.86} max={1} step={0.005} value={o.keep}
                     onChange={e => patch({ keep: Number(e.target.value) })} />
            </label>

            <hr className="side-sep" />

            {/* La leyenda. Va plegada porque no hace falta para el primer
                minuto, y a la vista de un clic porque sin ella el color del
                relieve y el de la bolita son dos codificaciones mudas. */}
            <button className={"cmp-tab" + (legend ? " on" : "")}
                    onClick={() => setLegend(l => !l)} aria-expanded={legend}>
              <span className="cmp-tab-w">Qué dice el color</span>
              <span className="cmp-caret"><IcoChevron open={!legend} /></span>
            </button>
            {legend && (
              <div className="ctl-panel legend">
                <p className="key-line">
                  <i className="ramp ramp-loss" aria-hidden="true" />
                  <span><b>El relieve</b>, por altura: la pérdida en logaritmo.
                  Azul el fondo, ámbar la cima.</span>
                </p>
                <p className="key-line">
                  <i className="ramp ramp-hist" aria-hidden="true" />
                  <span><b>Las curvas de nivel</b> son escalones iguales de esa
                  misma pérdida: se apiñan donde cae rápido y se separan donde el
                  valle es plano.</span>
                </p>
                <p className="key-line">
                  <i className={"ramp " + (o.heat ? "ramp-heat" : "ramp-origin")}
                     style={o.heat ? undefined : { background: originRamp }} aria-hidden="true" />
                  <span><b>La bolita</b>, {o.heat
                    ? "por su altura ahora mismo: roja arriba, cian abajo. El enjambre se enfría al bajar."
                    : "por el punto del que salió. En Himmelblau eso es el mapa de las cuatro cuencas."}</span>
                </p>
                <p className="key-line">
                  <i className="ramp ramp-target" aria-hidden="true" />
                  <span><b>La diana</b> marca un mínimo conocido. La silla no
                  tiene ninguna, y ésa es su respuesta.</span>
                </p>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* --------------------------------------------------------- raíl derecho */}
      {gpu && (
        <div className="rail rail-r">
          <div className="hud">
            <div className="ctl-head">
              <span className="eyebrow">{o.running ? "Descendiendo" : "En pausa"}</span>
              <span className="fps">{hud.fps.toFixed(0)} fps{hud.res < 0.999 ? ` · ${(hud.res * 100).toFixed(0)}% res` : ""}</span>
            </div>
            {/* El progreso como barra y no como un contador suelto. «1.472
                pasos» no dice nada sin saber que la corrida son 6.000; la barra
                lo dice sin escribirlo, y además enseña los dos tiempos de estas
                funciones: se llena despacio al principio —un paso por frame— y
                de golpe después. */}
            <div className="bar" role="progressbar" aria-valuenow={Math.round(done * 100)}
                 aria-valuemin={0} aria-valuemax={100} aria-label="progreso de la corrida">
              <i style={{ width: `${done * 100}%` }} />
            </div>
            <p className="stat">
              {hud.steps.toLocaleString("es")} de {TOTAL_STEPS.toLocaleString("es")} pasos
              {hud.done ? " · asentado" : ""}
            </p>
            <p className="stat hint">
              {hud.live.toLocaleString("es")} caminantes a la vez. Ninguno sabe de los demás.
            </p>
          </div>

          <aside className={"card" + (cardOpen ? " card-open" : "")}>
            <button className="card-toggle" onClick={() => setCardOpen(c => !c)}
                    aria-expanded={cardOpen}
                    aria-label={cardOpen ? "plegar la ficha" : "desplegar la ficha"}>
              <IcoChevron open={!cardOpen} />
            </button>
            <header className="card-head">
              <p className="kicker">{OPT_NAMES[OPTS[o.opt]]} · llega el {surf.reach}</p>
            </header>
            <h2 className="card-title">{surf.name}</h2>
            <p className="formula">f(x, y) = {surf.formula}</p>
            <div className="card-body">
              <p className="note">{surf.note}</p>
              {notes && (
                <>
                  <p className="kicker rule">Cómo leer esto</p>
                  <p className="note">
                    <b>La vertical va en logaritmo.</b> Beale pasa de 160.000 en
                    una esquina; en lineal la escena sería una pared y un suelo,
                    sin valle entre medias. <code>log1p</code> es monótona, así
                    que «hacia abajo» sigue siendo hacia abajo — lo que se pierde
                    es la escala.
                  </p>
                  <p className="note">
                    <b>La estela es una exposición.</b> Se acumula en pantalla, no
                    por caminante, así que cuesta lo mismo con ocho mil que con
                    ciento veinte mil — y se disuelve al mover la cámara, porque
                    describía un encuadre que ya no existe.
                  </p>
                  {OPTS[o.opt] !== "adam" && (
                    <p className="note">
                      <b>El paso lleva recorte de la norma del gradiente</b>, así
                      que, siendo estrictos, no es descenso puro. Sin él, en las
                      paredes de Beale el gradiente pasa de 70.000 y el primer
                      salto se sale del dominio para no volver.
                    </p>
                  )}
                </>
              )}
              <p className="foot phase">
                Fase 01 · cinco superficies · descenso, momento y Adam
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* ---------------------------------------------------- sobre el lienzo */}
      {/* El guía de primeros gestos: un renglón, sin marco y sin ratón. No es
          un mando, es un rótulo — y se calla en cuanto alguien ha tocado la
          cámara o ha llegado el enjambre al fondo, porque a partir de ahí lo
          que dice ya lo sabe. Sube un escalón cuando la píldora de vista
          completa ocupa su sitio: las dos viven abajo en el centro. */}
      {gpu && !zen && !roamed && hud.steps < 200 && (
        <p className={"coach" + (roamed ? " coach-up" : "")} aria-live="polite">
          arrastra para girar · rueda para acercar · <kbd>espacio</kbd> para parar
        </p>
      )}

      {gpu && roamed && !zen && (
        <button className="go-home" onClick={goHome}>
          <IcoFit />
          <span>Vista completa</span>
          <kbd>inicio</kbd>
        </button>
      )}

      {zen && (
        <button className="zen-exit" onClick={toggleZen} title="salir de pantalla completa">
          <IcoShrink />
          <span>salir</span>
          <kbd>esc</kbd>
        </button>
      )}
    </div>
  );
}
