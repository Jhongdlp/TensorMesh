import { useMemo } from "react";
import type { Galaxy } from "../galaxy/loader";
import { resolve, type Index } from "../galaxy/search.mjs";
import { shortestPath } from "../galaxy/path.mjs";

/** Por dónde empezar. El panel que ocupa el sitio de la ficha mientras no hay
 *  ficha.
 *
 *  Antes, al abrir el atlas, el raíl derecho estaba vacío —los mandos de física
 *  sólo existen en WebGPU, y la ficha no existe hasta que se clica algo— así
 *  que la primera pantalla no ofrecía nada que hacer: una nebulosa preciosa y
 *  ningún gesto sugerido. Quien no sabe qué palabra buscar no busca ninguna.
 *
 *  Lo que ofrece son las tres formas de entrar, en el orden en que enganchan:
 *  una palabra concreta (los ejemplos), una cualquiera (el dado) y una relación
 *  entre dos (el camino). El dado no saca de las 50.000 sino de las más
 *  frecuentes y sin palabras vacías: caer en `zzzz` o en `de` la primera vez es
 *  aprender que el atlas está lleno de basura, que no es lo que hay dentro.
 *
 *  Desaparece en cuanto hay algo seleccionado y vuelve al soltarlo, así que
 *  también es la salida: después de `Esc` la pantalla no se queda muda.
 */

/** De dónde sale el azar: las palabras dentro de este rango de frecuencia.
 *  Cuatro mil son suficientes para que salga variedad y todas se reconocen. */
const POOL = 4000;

/** Intentos del camino sorpresa. El grafo podado deja islas, así que un par al
 *  azar puede no tener camino; a la sexta, se rinde y abre la palabra sola. */
const TRIES = 6;

export interface StartCopy {
  head: string;
  note: string;
  rnd: string;
  road: string;
  guide: string;
  foot: string;
  /** Palabras de ejemplo de esta galaxia. Las que no estén se caen solas. */
  ex: string[];
}

/**
 * Las candidatas del azar: frecuentes y sin palabras vacías.
 *
 * Vive aquí y se exporta porque el modo atractor saca de la misma bolsa: son
 * las mismas «palabras que merece la pena enseñar», y dos criterios distintos
 * para lo mismo se desfasan en cuanto se toca uno.
 */
export function common(g: Galaxy, max = POOL): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.meta.nodes; i++) {
    if (g.rank[i] < max && !g.flags[i]) out.push(i);
  }
  return out.length ? out : [0];
}

export default function Start({
  g, index, pool, zoneCss, t, onWord, onPath, onGuide,
}: {
  g: Galaxy;
  index: Index;
  /** La bolsa del azar, de `common`. La calcula el visor una vez por galaxia. */
  pool: number[];
  zoneCss: (c: number) => string;
  t: StartCopy;
  onWord: (id: number) => void;
  onPath: (a: number, b: number) => void;
  onGuide: () => void;
}) {
  const ex = useMemo(
    () => t.ex.map(w => resolve(index, g, w)).filter(i => i >= 0),
    [t.ex, index, g],
  );

  const some = () => pool[(Math.random() * pool.length) | 0];

  const road = () => {
    for (let k = 0; k < TRIES; k++) {
      const a = some(), b = some();
      if (a === b) continue;
      // Se comprueba aquí y no en quien lo recibe: ofrecer un «camino
      // sorpresa» que la mitad de las veces contesta «no hay camino» es
      // ofrecer un botón roto.
      if (shortestPath(g, a, b)) return onPath(a, b);
    }
    onWord(some());
  };

  return (
    <aside className="card start">
      <p className="kicker">{t.head}</p>
      <p className="stat hint">{t.note}</p>

      <ul className="chips">
        {ex.map(id => (
          <li key={id}>
            <button className="chip" onClick={() => onWord(id)}>
              <i className="swatch" style={{ background: zoneCss(g.community[id]) }} />
              <span className="w">{g.labels[id]}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="start-acts">
        <button className="ghost" onClick={() => onWord(some())}>
          <IcoDie /> {t.rnd}
        </button>
        <button className="ghost" onClick={road}>
          <IcoRoad /> {t.road}
        </button>
      </div>

      <p className="foot">
        {t.foot}{" "}
        <button className="link" onClick={onGuide}>{t.guide}</button>
      </p>
    </aside>
  );
}

const ico = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

/** El dado: azar. */
const IcoDie = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <path d="M9 9v.01M15 15v.01M12 12v.01" strokeWidth="2.4" />
  </svg>
);

/** El camino: dos extremos y los saltos entre ellos. */
const IcoRoad = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" {...ico} aria-hidden="true">
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="6" r="2" />
    <path d="M7 16.5l3.5-2M12.5 13.5l3.5-2" strokeDasharray="0.1 3" strokeWidth="2.2" />
  </svg>
);
