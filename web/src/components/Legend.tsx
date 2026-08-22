import { useEffect, useMemo, useRef, useState } from "react";
import type { Galaxy } from "../galaxy/loader";
import { regions, core } from "../galaxy/regions.mjs";

/** El tipo sale de la función y no de un `import type`: `regions.mjs` es JS con
 *  JSDoc, y así no hay una segunda descripción de la misma forma. */
type Region = ReturnType<typeof regions>[number];

/** La leyenda del mapa. Lo que le faltaba al color.
 *
 *  La galaxia lleva dos docenas de tintas y hasta ahora ninguna se explicaba:
 *  el único sitio donde un color decía su región era el punto de 8 px de la
 *  ficha, que no existe hasta que se clica una palabra. Un mapa temático sin
 *  leyenda es un mapa que hay que adivinar.
 *
 *  Tres cosas que la hacen leyenda y no lista:
 *
 *  - **el nombre sale del dato** (`regions.mjs`): las tres palabras más
 *    frecuentes de la región, sin vacías. Nadie ha etiquetado nada;
 *  - **pasar el ratón enciende la región en la galaxia**, sin mover la cámara.
 *    Es lo que convierte la lista en un mapa: se lee «guerra · ejército» y se
 *    ve *dónde* está eso, en el sitio donde ya se está mirando;
 *  - **clicar vuela hasta ella**, y entonces sí encuadra — pero sobre el
 *    núcleo, no sobre los miembros sueltos que el grafo dejó lejos.
 *
 *  El resalte de paso va con retardo (`PREVIEW_MS`): cada uno reescribe el
 *  canal entero —200 KB en WebGPU, dos atributos en WebGL— y recorrer la lista
 *  con el ratón dispararía veinte seguidos.
 */

const PREVIEW_MS = 110;

export interface LegendCopy {
  tab: string;
  note: string;
  words: (n: number) => string;
  foot: string;
}

export default function Legend({
  g, zoneCss, t, open, onOpen, onPick, onPreview,
}: {
  g: Galaxy;
  zoneCss: (c: number) => string;
  t: LegendCopy;
  open: boolean;
  onOpen: (v: boolean) => void;
  /** Resaltar la región y volar hasta su núcleo. */
  onPick: (members: number[], frame: number[]) => void;
  /** Resalte de paso, sin cámara. `null` restaura lo que hubiera. */
  onPreview: (members: number[] | null) => void;
}) {
  const zs = useMemo(() => regions(g), [g]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al plegar el panel no puede quedarse una región encendida por un ratón que
  // ya no está encima: el `mouseleave` no llega si el nodo se desmonta antes.
  const [hot, setHot] = useState<number | null>(null);
  useEffect(() => {
    if (!open && hot !== null) { setHot(null); onPreview(null); }
  }, [open, hot, onPreview]);

  const preview = (r: Region | null) => {
    if (timer.current) clearTimeout(timer.current);
    setHot(r ? r.id : null);
    timer.current = setTimeout(() => onPreview(r ? r.members : null), PREVIEW_MS);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <>
      <button
        className={"cmp-tab" + (open ? " on" : "")}
        onClick={() => onOpen(!open)}
        aria-expanded={open}
      >
        <IcoZones />
        <span className="cmp-tab-w">{t.tab}</span>
        <span className="cmp-n">{zs.length}</span>
        <span className="cmp-caret"><Caret open={!open} /></span>
      </button>

      {open && (
        <div className="zones">
          <p className="stat hint">{t.note}</p>
          <ul className="zone-list" onMouseLeave={() => preview(null)}>
            {zs.map(r => (
              <li key={r.id}>
                <button
                  className={hot === r.id ? "on" : ""}
                  onMouseEnter={() => preview(r)}
                  onFocus={() => preview(r)}
                  onClick={() => onPick(r.members, core(g, r))}
                >
                  <i className="swatch" style={{ background: zoneCss(r.id) }} />
                  <span className="w">{r.name.map(i => g.labels[i]).join(" · ")}</span>
                  <span className="s">{t.words(r.members.length)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="foot">{t.foot}</p>
        </div>
      )}
    </>
  );
}

/** Regiones: tres manchas que se tocan, que es lo que el color dice. */
const IcoZones = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
       strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="9" r="4.4" />
    <circle cx="15.4" cy="11" r="3.4" />
    <circle cx="11" cy="16.4" r="3" />
  </svg>
);

const Caret = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
       strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={open ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} />
  </svg>
);
