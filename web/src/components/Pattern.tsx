import { useEffect, useMemo, useRef, useState } from "react";
import type { Galaxy } from "../galaxy/loader";
import type { Index } from "../galaxy/search.mjs";
import { match, LIST, MAX } from "../galaxy/pattern.mjs";

/** Familias: encender de golpe todas las palabras que comparten una forma.
 *
 *  Es la pregunta que el atlas sabía contestar y no dejaba hacer. El buscador
 *  lleva a *una* palabra; esto enciende las mil cuatrocientas que acaban en
 *  `-mente` y deja ver **cómo se reparten**. Y lo que se ve contesta la duda
 *  que todo el mundo trae de fábrica sobre estos vectores: no se apilan en un
 *  rincón —no hay barrio de los adverbios— sino que salpican la galaxia entera,
 *  porque lo que agrupa aquí es el significado y no la terminación. Con `des-`
 *  o `-ción` el reparto es otro, y también se ve.
 *
 *  El teclado dispara con retardo (`WAIT`): cada consulta barre las 50.000
 *  claves plegadas y cada resultado reescribe el canal de resalte entero.
 *  Buscar por letra tecleada haría las dos cosas cinco veces por palabra.
 */

/** Retardo del teclado. 220 ms es el hueco entre dos teclas de alguien que
 *  escribe seguido: dispara al parar, no al escribir. */
const WAIT = 220;

export interface PatternCopy {
  tab: string;
  ph: string;
  note: string;
  hits: (n: number) => string;
  none: string;
  capped: (shown: number, total: number) => string;
  clear: string;
  foot: string;
  /** Patrones de ejemplo. Son la sintaxis: nadie lee «usa `*` como comodín». */
  ex: string[];
}

export default function Pattern({
  g, index, zoneCss, t, open, onOpen, onMatch, onClear,
}: {
  g: Galaxy;
  index: Index;
  zoneCss: (c: number) => string;
  t: PatternCopy;
  open: boolean;
  onOpen: (v: boolean) => void;
  /** Resaltar el grupo en la galaxia. */
  onMatch: (ids: number[]) => void;
  /** Soltarlo: la caja se ha quedado vacía. */
  onClear: () => void;
  }) {
  const [q, setQ] = useState("");
  const [live, setLive] = useState("");   // lo que de verdad se ha buscado
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLive(q.trim()), WAIT);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const found = useMemo(
    () => (live ? match(index, g, live, MAX) : { ids: [], total: 0, capped: false }),
    [index, g, live],
  );

  // El resalte es un efecto del resultado, no del tecleo: así una consulta que
  // no casa con nada deja la galaxia como estaba en vez de apagarla entera.
  useEffect(() => {
    if (found.ids.length) onMatch(found.ids);
    else if (live) onClear();
    // `onMatch` cambia de identidad en cada pintado del padre; depender de él
    // volvería a volar la cámara sin que nadie haya tecleado nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, live]);

  return (
    <>
      <button
        className={"cmp-tab" + (open ? " on" : "")}
        onClick={() => onOpen(!open)}
        aria-expanded={open}
      >
        <IcoPattern />
        <span className="cmp-tab-w">{t.tab}</span>
        {found.total > 0 && <span className="cmp-n">{found.total}</span>}
        <span className="cmp-caret"><Caret open={!open} /></span>
      </button>

      {open && (
        <div className="pat">
          <p className="stat hint">{t.note}</p>
          <input
            value={q}
            placeholder={t.ph}
            spellCheck={false}
            autoComplete="off"
            onChange={e => setQ(e.target.value)}
          />
          <ul className="chips">
            {t.ex.map(x => (
              <li key={x}>
                <button className="chip" onClick={() => setQ(x)}>
                  <span className="w">{x}</span>
                </button>
              </li>
            ))}
          </ul>

          {live && (
            <p className="stat">
              {found.total ? t.hits(found.total) : t.none}
              {found.capped && ` · ${t.capped(found.ids.length, found.total)}`}
            </p>
          )}

          {found.ids.length > 0 && (
            <>
              <ul className="pat-list">
                {found.ids.slice(0, LIST).map(id => (
                  <li key={id}>
                    <i className="swatch" style={{ background: zoneCss(g.community[id]) }} />
                    <span className="w">{g.labels[id]}</span>
                  </li>
                ))}
              </ul>
              <p className="foot">{t.foot}</p>
            </>
          )}

          {live && (
            <button className="ghost" onClick={() => { setQ(""); setLive(""); onClear(); }}>
              {t.clear}
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** Patrón: una forma repetida, dos veces igual y una distinta. */
const IcoPattern = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
       strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
    <path d="M4 8h7M4 16h7" />
    <circle cx="17" cy="8" r="2.2" />
    <circle cx="17" cy="16" r="2.2" />
  </svg>
);

const Caret = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
       strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={open ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} />
  </svg>
);
