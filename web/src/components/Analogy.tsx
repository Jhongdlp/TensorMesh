import { useCallback, useState } from "react";
import type { Galaxy } from "../galaxy/loader";
import type { Vectors } from "../galaxy/vectors";
import { resolve, type Index } from "../galaxy/search.mjs";
import { query } from "../galaxy/analogy.mjs";
import WordSearch from "./WordSearch";

/** Analogías: `rey − hombre + mujer`.
 *
 *  Es la única pregunta del atlas que no se puede contestar con el grafo ni con
 *  cinco filas de `vecs.bin`: la respuesta es «la más parecida de las cincuenta
 *  mil» a un punto que **no ocupa ninguna palabra**. Hay que mirarlas todas, y
 *  por eso este panel —y sólo este— se descarga el archivo entero (15 MB), y lo
 *  hace al pulsar, no al abrir el atlas.
 *
 *  Decisiones que se notan al usarlo:
 *
 *  - **la descarga se ve** (`frac`). Quince megas son varios segundos en una
 *    conexión normal, y un botón que no hace nada durante cinco segundos se lee
 *    como roto, no como ocupado;
 *  - **las tres palabras de la pregunta no pueden ser la respuesta**. Ver
 *    `analogy.mjs`: sin excluirlas, `rey − hombre + mujer` contesta `rey`;
 *  - **se responden cinco y con su coseno**, no una. La analogía no es un
 *    oráculo: en unas sale `reina` con 0,72 y en otras el primero es un plural
 *    del original con 0,55. Enseñar la lista y el número es enseñar lo que el
 *    modelo de verdad sabe, que es el trato del resto del atlas;
 *  - **cada resultado es un botón** que abre esa palabra en la galaxia. La
 *    respuesta no es un texto: es un sitio al que ir.
 */

/** Cuántas respuestas. Cinco caben en el cajón y bastan para ver si el modelo
 *  ha entendido la pregunta o ha contestado un vecino cualquiera. */
const TOP = 5;

export interface AnalogyCopy {
  tab: string;
  note: string;
  /** Etiquetas de las tres ranuras. */
  slots: [string, string, string];
  pick: string;
  run: string;
  need: string;
  loading: (pct: number) => string;
  weigh: string;
  none: string;
  off: string;
  foot: string;
  /** Preguntas de ejemplo, en palabras de esta galaxia. */
  ex: [string, string, string][];
}

export default function Analogy({
  g, index, vec, zoneCss, t, open, onOpen, onWord,
}: {
  g: Galaxy;
  index: Index;
  vec: Vectors;
  zoneCss: (c: number) => string;
  t: AnalogyCopy;
  open: boolean;
  onOpen: (v: boolean) => void;
  onWord: (id: number) => void;
}) {
  const [ids, setIds] = useState<(number | null)[]>([null, null, null]);
  /** `null` en reposo, `0..1` descargando, `1` mientras se mide. */
  const [frac, setFrac] = useState<number | null>(null);
  const [res, setRes] = useState<{ id: number; cos: number }[] | null>(null);
  const [off, setOff] = useState(false);

  const put = (k: number, id: number | null) => {
    setIds(prev => prev.map((v, i) => (i === k ? id : v)));
    setRes(null);
  };

  const ready = ids.every(v => v !== null);

  const run = useCallback(async () => {
    if (!ready) return;
    const [a, b, c] = ids as number[];
    setRes(null);
    setFrac(0);
    const okAll = await vec.loadAll(setFrac);
    if (!okAll) { setOff(true); setFrac(null); return; }
    // Con el archivo entero en memoria esto no pide nada: decodifica tres filas.
    await vec.load([a, b, c]);
    const va = vec.get(a), vb = vec.get(b), vc = vec.get(c);
    if (!va || !vb || !vc) { setOff(true); setFrac(null); return; }
    setRes(vec.nearest(query(va, vb, vc), TOP, [a, b, c]));
    setFrac(null);
  }, [ids, ready, vec]);

  const preset = ([a, b, c]: [string, string, string]) => {
    const r = [a, b, c].map(w => resolve(index, g, w));
    if (r.some(i => i < 0)) return;   // esa palabra no está en esta galaxia
    setIds(r);
    setRes(null);
  };

  return (
    <>
      <button
        className={"cmp-tab" + (open ? " on" : "")}
        onClick={() => onOpen(!open)}
        aria-expanded={open}
      >
        <IcoAnalogy />
        <span className="cmp-tab-w">{t.tab}</span>
        <span className="cmp-caret"><Caret open={!open} /></span>
      </button>

      {open && (
        <div className="ana">
          <p className="stat hint">{t.note}</p>

          {ids.map((id, k) => (
            <div className="ana-slot" key={k}>
              <span className="ana-op">{t.slots[k]}</span>
              {id === null ? (
                <WordSearch
                  g={g}
                  index={index}
                  small
                  placeholder={t.pick}
                  zoneCss={zoneCss}
                  onPick={i => put(k, i)}
                  onMiss={() => {}}
                />
              ) : (
                <button className="chip" onClick={() => put(k, null)} title={t.pick}>
                  <i className="swatch" style={{ background: zoneCss(g.community[id]) }} />
                  <span className="w">{g.labels[id]}</span>
                  <span className="chip-off">×</span>
                </button>
              )}
            </div>
          ))}

          <ul className="chips">
            {t.ex.map(x => (
              <li key={x.join("-")}>
                <button className="chip" onClick={() => preset(x)}>
                  <span className="w">{x[0]} − {x[1]} + {x[2]}</span>
                </button>
              </li>
            ))}
          </ul>

          <button className="ghost" onClick={run} disabled={!ready || frac !== null}>
            {frac === null
              ? (ready ? t.run : t.need)
              : (frac < 1 ? t.loading(Math.round(frac * 100)) : t.weigh)}
          </button>
          {/* La barra es la descarga, no un adorno: son 15 MB y hay que poder
              ver que avanzan. */}
          {frac !== null && frac < 1 && (
            <div className="ana-bar"><i style={{ width: `${frac * 100}%` }} /></div>
          )}

          {off && <p className="stat">{t.off}</p>}

          {res && (res.length ? (
            <>
              <ol className="nbrs">
                {res.map(r => (
                  <li key={r.id}>
                    <button onClick={() => onWord(r.id)}>
                      <i className="swatch" style={{ background: zoneCss(g.community[r.id]) }} />
                      <span className="w">{g.labels[r.id]}</span>
                      <span className="s">{r.cos.toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="foot">{t.foot}</p>
            </>
          ) : <p className="stat">{t.none}</p>)}
        </div>
      )}
    </>
  );
}

/** Analogía: dos parejas y la misma flecha entre ellas. */
const IcoAnalogy = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
       strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="5" cy="7" r="1.8" />
    <circle cx="5" cy="17" r="1.8" />
    <path d="M8 7h9M8 17h9M14.5 4.6L17.4 7l-2.9 2.4M14.5 14.6L17.4 17l-2.9 2.4" />
  </svg>
);

const Caret = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
       strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={open ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} />
  </svg>
);
