import { useEffect, useMemo, useRef, useState } from "react";
import type { Galaxy } from "../galaxy/loader";
import type { Vectors } from "../galaxy/vectors";
import type { Index } from "../galaxy/search.mjs";
import { MAX_WORDS, matrix, ranked, shared, typical, mds } from "../galaxy/compare.mjs";
import { shortestPath } from "../galaxy/path.mjs";
import WordSearch from "./WordSearch";
import Foot, { type WhyLink } from "./Foot";

/** El comparador: varias palabras a la vez, medidas en 300D.
 *
 *  La ficha de una palabra contesta «quién se le parece». Esto contesta «cuánto
 *  se parecen éstas entre sí», que es otra pregunta y no se puede sacar del
 *  grafo: dos palabras cualesquiera casi nunca son vecinas, así que no hay
 *  arista entre ellas ni peso que leer. El número sale de `vecs.bin`, y por eso
 *  el panel puede quedarse esperando: sus vectores llegan por separado.
 *
 *  Cuatro vistas del mismo dato, porque cada una dice algo que las otras no:
 *
 *  - **las barras** dan el número y, sobre todo, la vara de medir. Un 0,35
 *    suelto no significa nada; junto a la línea de «así de parecidas son dos
 *    palabras que el kNN llamó vecinas» (0,63 en español) se lee de golpe;
 *  - **la matriz** aparece a partir de tres palabras, cuando los pares dejan de
 *    caber en la cabeza y hace falta ver el bloque;
 *  - **la constelación** enseña la *forma* del grupo: si son una cadena, dos
 *    parejas o un racimo con un satélite. Eso no está en ninguna lista;
 *  - **los saltos y los vecinos compartidos** devuelven al grafo dibujado: son
 *    la parte que se puede ir a mirar con los ojos.
 */

/** Cuánto se atenúa la celda menos parecida de la matriz. No baja a 0: una
 *  celda invisible se lee como «falta el dato», no como «se parecen poco». */
const CELL_MIN = 0.06;
const CELL_MAX = 0.62;

/** Radio del punto en la constelación, en unidades del `viewBox`. A 2,4 sobre
 *  un ancho de 100 el punto mide ~9 px en el panel: se ve y no se come la
 *  etiqueta, que es lo que pasaba a 4,2 (29 px, casi un botón). */
const DOT = 2.4;

/** A partir de qué relleno la tinta de la celda pasa a negra. La celda va de
 *  casi negra (poco parecido) a blanca sucia (mucho), así que ninguna tinta
 *  fija vale para las dos puntas: en negro sobre negro los 0,07 desaparecían,
 *  y en blanco sobre blanco se irían los 0,48. */
const INK_FLIP = 0.34;

export interface CompareCopy {
  add: string;
  hint: string;
  hintFew: string;
  full: (n: number) => string;
  bars: string;
  grid: string;
  map: string;
  mapNote: string;
  stress: (v: number) => string;
  ref: string;
  hops: string;
  hopsNone: string;
  step: (k: number) => string;
  shared: string;
  sharedNone: string;
  sharedWith: (k: number) => string;
  clear: string;
  loading: string;
  off: string;
  foot: string;
}

export default function Compare({
  g, index, vec, zoneCss, t, why, ids, onIds, onWord, onPair, onGroup,
}: {
  g: Galaxy;
  index: Index;
  vec: Vectors;
  zoneCss: (c: number) => string;
  t: CompareCopy;
  ids: number[];
  onIds: (next: number[]) => void;
  /** Abrir la ficha de una palabra. */
  onWord: (id: number) => void;
  /** Enseñar el camino entre dos. */
  onPair: (a: number, b: number) => void;
  /** Resaltar el grupo entero en la galaxia. */
  onGroup: (nodes: number[]) => void;
  /** El «por qué» del pie: abre el capítulo de las 300 dimensiones, que es
   *  donde se explica qué se pierde al aplanar — que es lo que el estrés de la
   *  constelación está midiendo. */
  why?: WhyLink;
}) {
  // Los vectores llegan por HTTP y el render no puede esperarlos. Este contador
  // es el único estado que provoca el repintado cuando aterrizan: la caché vive
  // dentro de `Vectors`, no aquí, porque también la usan otros paneles.
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const near = useMemo(() => (ids.length ? shared(g, ids) : []), [g, ids]);
  const ref = useMemo(() => typical(g), [g]);

  // Se piden los vectores de las elegidas **y** los de los vecinos compartidos:
  // la lista de abajo enseña la similitud exacta de cada uno con cada elegida, y
  // sin su vector ese número no existe.
  useEffect(() => {
    const want = [...ids, ...near.map(s => s.id)];
    if (!want.length) return;
    setBusy(true);
    vec.load(want).finally(() => {
      if (!live.current) return;
      setBusy(false);
      setTick(v => v + 1);
    });
  }, [vec, ids, near]);

  const M = useMemo(() => (ids.length >= 2 ? matrix(vec, ids) : null), [vec, ids, tick]);
  const pares = useMemo(() => (ids.length >= 2 ? ranked(vec, ids) : null), [vec, ids, tick]);
  const shape = useMemo(() => (M ? mds(M) : null), [M]);

  // Un BFS por par sobre 50.000 nodos. Diez pares en el peor caso, y sólo
  // cuando cambia la lista: fuera del render, que lo repetiría al llegar cada
  // vector.
  const roads = useMemo(() => {
    if (ids.length < 2) return null;
    const out = new Map<string, number[] | null>();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        out.set(`${ids[i]}-${ids[j]}`, shortestPath(g, ids[i], ids[j]));
      }
    }
    return out;
  }, [g, ids]);

  const add = (id: number) => {
    if (ids.includes(id) || ids.length >= MAX_WORDS) return;
    onIds([...ids, id]);
  };
  const drop = (id: number) => onIds(ids.filter(x => x !== id));

  const w = (id: number) => g.labels[id];
  const dot = (id: number) => (
    <i className="swatch" style={{ background: zoneCss(g.community[id]) }} />
  );

  /** El grupo entero en la galaxia: las elegidas más las palabras por las que
   *  se pasa para ir de una a otra. Sin los caminos serían cinco puntos sueltos
   *  en el vacío; con ellos se ve por qué barrios cruza el parecido.
   *
   *  Se enciende **solo**, al añadir o quitar una palabra. Antes había que
   *  pulsar «ver en la galaxia» y era el paso que nadie daba: uno escribía
   *  cinco palabras, leía la tabla y se iba sin haber mirado nunca el atlas,
   *  que es la mitad de la respuesta. La lista y la galaxia son la misma cosa
   *  vista de dos maneras, así que no pueden ir por separado.
   *
   *  Depende de `roads` y no de `ids` porque los caminos son lo que tarda: con
   *  `ids` esto encendería el grupo sin ellos y volvería a encenderlo un
   *  instante después, dando dos vuelos de cámara por cada palabra añadida. */
  useEffect(() => {
    if (!ids.length) return;
    const set = new Set(ids);
    roads?.forEach(p => p?.forEach(id => set.add(id)));
    onGroup([...set]);
    // `onGroup` es estable en quien llama; meterlo en las dependencias sólo
    // ataría este efecto a la identidad de una función que no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, roads]);

  const full = ids.length >= MAX_WORDS;
  const off = vec.available === false;

  return (
    <section className="cmp">
      {ids.length > 0 && (
        <ul className="chips">
          {ids.map(id => (
            <li key={id}>
              <button className="chip" onClick={() => onWord(id)} title={w(id)}>
                {dot(id)}<span className="w">{w(id)}</span>
              </button>
              <button className="chip-x" onClick={() => drop(id)} aria-label={`quitar ${w(id)}`}>×</button>
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className="stat hint">{t.full(MAX_WORDS)}</p>
      ) : (
        <WordSearch
          g={g}
          index={index}
          small
          placeholder={t.add}
          zoneCss={zoneCss}
          onPick={add}
          onMiss={() => {}}
        />
      )}

      {off && <p className="err">{t.off}</p>}
      {!off && ids.length < 2 && (
        <p className="stat hint">{ids.length ? t.hintFew : t.hint}</p>
      )}
      {!off && ids.length >= 2 && !pares && <p className="stat hint">{t.loading}</p>}

      {pares && (
        <>
          {/* --- barras por par, con la vara de medir --- */}
          <p className="kicker rule">{t.bars}</p>
          <ul className="bars" style={{ ["--ref" as string]: `${ref * 100}%` }}>
            {pares.map(({ a, b, s }) => (
              <li key={`${a}-${b}`}>
                <button onClick={() => onPair(a, b)} title={`${w(a)} · ${w(b)}`}>
                  <span className="bar-w">
                    {dot(a)}<span className="w">{w(a)}</span>
                    <span className="x">·</span>
                    {dot(b)}<span className="w">{w(b)}</span>
                  </span>
                  <span className="bar">
                    {/* El ancho se recorta a 0: un coseno negativo existe (son
                        palabras que se repelen) y una barra hacia atrás
                        rompería la fila sin decir más que el número. */}
                    <i style={{ width: `${Math.max(0, s) * 100}%` }} />
                  </span>
                  <span className="s">{s.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="stat hint ref-note">{t.ref} {ref.toFixed(2)}</p>

          {/* --- matriz, sólo cuando los pares dejan de caber en la cabeza --- */}
          {M && ids.length >= 3 && (
            <>
              <p className="kicker rule">{t.grid}</p>
              <div className="grid-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th />
                      {ids.map(id => (
                        <th key={id} title={w(id)}>{dot(id)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ids.map((row, i) => (
                      <tr key={row}>
                        <th title={w(row)}>{dot(row)}<span className="w">{w(row)}</span></th>
                        {ids.map((col, j) => {
                          // Monocromo a propósito: aquí el color ya significa
                          // zona, en el punto de cada fila. Teñir además la
                          // celda por magnitud daría dos lecturas al mismo
                          // color en el mismo panel.
                          const a = CELL_MIN + Math.max(0, M[i][j]) * (CELL_MAX - CELL_MIN);
                          return (
                            <td
                              key={col}
                              className={i === j ? "self" : a > INK_FLIP ? "on-lit" : "on-dark"}
                              style={i === j ? undefined : {
                                background: `rgba(255,255,255,${a})`,
                              }}
                              title={`${w(row)} · ${w(col)}`}
                            >
                              {i === j ? "—" : M[i][j].toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* --- constelación --- */}
          {shape && ids.length >= 3 && (
            <>
              <p className="kicker rule">{t.map}</p>
              <Constellation
                ids={ids}
                xy={shape.xy}
                M={M!}
                label={w}
                colour={id => zoneCss(g.community[id])}
                onWord={onWord}
              />
              <p className="stat hint">
                {t.mapNote} · {t.stress(shape.stress)}
              </p>
            </>
          )}

          {/* --- de vuelta al grafo: cuántos saltos hay de una a otra --- */}
          <p className="kicker rule">{t.hops}</p>
          <ul className="hops">
            {pares.map(({ a, b }) => {
              const p = roads?.get(`${a}-${b}`) ?? roads?.get(`${b}-${a}`) ?? null;
              return (
                <li key={`h${a}-${b}`}>
                  <button onClick={() => onPair(a, b)} disabled={!p}>
                    <span className="w">{w(a)} → {w(b)}</span>
                    <span className="s">{p ? t.step(p.length - 1) : t.hopsNone}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* --- terreno común --- */}
          <p className="kicker rule">{t.shared}</p>
          {near.length === 0 ? (
            <p className="stat hint">{t.sharedNone}</p>
          ) : (
            <ul className="nbrs">
              {near.map(s => {
                // Media de la similitud con las elegidas a las que toca. Es la
                // que ordena visualmente la lista; el reparto exacto está en el
                // título, que es donde cabe sin apretar la fila.
                const each = s.with.map(id => vec.cos(s.id, id));
                const okAll = each.every(v => v !== null);
                const avg = okAll
                  ? (each as number[]).reduce((x, y) => x + y, 0) / each.length
                  : null;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => onWord(s.id)}
                      title={s.with.map((id, k) =>
                        `${w(id)} ${each[k] === null ? "…" : each[k]!.toFixed(2)}`).join(" · ")}
                    >
                      {dot(s.id)}
                      <span className="w">{w(s.id)}</span>
                      <span className="tag">{t.sharedWith(s.with.length)}</span>
                      <span className="s">{avg === null ? "…" : avg.toFixed(2)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="ctl-row">
            <button onClick={() => onIds([])}>{t.clear}</button>
          </div>
          <Foot why={why}>{t.foot}</Foot>
        </>
      )}
      {busy && ids.length >= 2 && pares && <p className="stat hint">{t.loading}</p>}
    </section>
  );
}

/** El grupo en un plano, conservando las distancias de 300D lo mejor que puede.
 *
 *  Los enlaces sólo se dibujan por encima de la similitud típica entre vecinos:
 *  con todos los pares unidos, cinco palabras dan diez rectas y el dibujo es un
 *  pentágono relleno, que es la misma imagen para cualquier grupo. Con el filtro
 *  la figura pasa a decir algo — una cadena, dos parejas, un racimo con satélite.
 *
 *  El `viewBox` es fijo y las posiciones se normalizan a él: el SVG escala solo
 *  con el ancho del panel y no hay que medir el contenedor.
 */
function Constellation({
  ids, xy, M, label, colour, onWord,
}: {
  ids: number[];
  xy: [number, number][];
  M: number[][];
  label: (id: number) => string;
  colour: (id: number) => string;
  onWord: (id: number) => void;
}) {
  // El alto deja sitio a la etiqueta; `PAD` es el margen que impide que una
  // palabra larga en un extremo se salga del `viewBox`.
  const W = 100, H = 66, PAD = 16;

  // **Una sola escala para los dos ejes.** Normalizar x e y por separado
  // llenaría el recuadro, pero a costa de estirar una dirección más que la
  // otra — y entonces las distancias del dibujo dejan de ser las de 300D, que
  // es lo único que este gráfico promete. Con tres palabras juntas y una lejos,
  // el estiramiento separaba visualmente a las tres que se parecen.
  const cx = (Math.min(...xy.map(p => p[0])) + Math.max(...xy.map(p => p[0]))) / 2;
  const cy = (Math.min(...xy.map(p => p[1])) + Math.max(...xy.map(p => p[1]))) / 2;
  const reach = Math.max(
    1e-9,
    ...xy.map(p => Math.max(Math.abs(p[0] - cx), Math.abs(p[1] - cy))),
  );
  const k = Math.min(W - 2 * PAD, H - 2 * PAD) / (2 * reach);
  const px = (i: number) => W / 2 + (xy[i][0] - cx) * k;
  const py = (i: number) => H / 2 + (xy[i][1] - cy) * k;

  // La etiqueta se va hacia **afuera** del grupo. Con las palabras apiñadas
  // —que es lo normal cuando de verdad se parecen— ponerlas todas debajo las
  // apilaba unas sobre otras; empujando cada una en la dirección que la aleja
  // del centro, el hueco que queda es justo el que sobra.
  const away = (i: number) => {
    const dx = px(i) - W / 2, dy = py(i) - H / 2;
    const m = Math.hypot(dx, dy);
    // Un punto en el centro exacto no tiene «afuera»: se manda abajo.
    if (m < 1e-6) return { ux: 0, uy: 1 };
    return { ux: dx / m, uy: dy / m };
  };

  // Los enlaces se miden contra **el propio grupo**, no contra un umbral fijo.
  // Con el corte en la similitud típica entre vecinos (0,63) casi ningún grupo
  // real tenía un solo enlace —«camello» y «desierto» se parecen 0,48— y la
  // figura se quedaba en cuatro puntos sueltos, que es la misma imagen para
  // cualquier grupo. Relativo al par más parecido, la forma siempre dice algo:
  // qué se agarra a qué y qué queda suelto.
  const top = Math.max(...M.map((r, i) => Math.max(...r.map((v, j) => (i === j ? 0 : v)))));
  const links: { i: number; j: number; rel: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const rel = top > 0 ? M[i][j] / top : 0;
      if (rel < 0.45) continue;
      links.push({ i, j, rel });
    }
  }

  return (
    <svg className="cons" viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={ids.map(label).join(", ")}>
      {links.map(l => (
        <line
          key={`${l.i}-${l.j}`}
          x1={px(l.i)} y1={py(l.i)} x2={px(l.j)} y2={py(l.j)}
          stroke="currentColor"
          strokeOpacity={0.1 + l.rel * 0.55}
          strokeWidth={0.55}
        />
      ))}
      {ids.map((id, i) => (
        <g key={id} className="cons-p" onClick={() => onWord(id)}>
          <circle cx={px(i)} cy={py(i)} r={DOT} fill={colour(id)} />
          <circle cx={px(i)} cy={py(i)} r={DOT} fill="none"
                  stroke="#000" strokeOpacity={0.5} strokeWidth={0.5} />
          {(() => {
            const { ux, uy } = away(i);
            const off = DOT + 2.2;
            // El desplazamiento vertical extra sube la línea base a la altura
            // del punto cuando la etiqueta sale de lado: sin él, «inglaterra» a
            // la derecha quedaba colgando bajo su punto.
            return (
              <text
                x={px(i) + ux * (off + 0.8)}
                y={py(i) + uy * (off + 2.2) + (Math.abs(uy) < 0.5 ? 1.4 : uy > 0 ? 2.4 : -0.6)}
                textAnchor={ux > 0.4 ? "start" : ux < -0.4 ? "end" : "middle"}
              >
                {label(id)}
              </text>
            );
          })()}
        </g>
      ))}
    </svg>
  );
}
