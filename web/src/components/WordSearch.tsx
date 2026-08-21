import { useMemo, useRef, useState } from "react";
import type { Galaxy } from "../galaxy/loader";
import { fold, suggest, exact, type Index } from "../galaxy/search.mjs";

/** Buscador con sugerencias por prefijo. Se usa dos veces: para entrar al
 *  atlas por una palabra y, dentro de la ficha, para pedir el camino hasta
 *  otra. Es el mismo gesto, así que es el mismo componente.
 *
 *  Sin `datalist`: el nativo no deja pintar el punto de zona ni el rango de
 *  frecuencia, y son las dos cosas que distinguen dos palabras parecidas antes
 *  de gastar un clic. */
export default function WordSearch({
  g, index, placeholder, onPick, onMiss, zoneCss, autoFocus, small,
}: {
  g: Galaxy;
  index: Index;
  placeholder: string;
  onPick: (id: number) => void;
  onMiss: (q: string) => void;
  zoneCss?: (c: number) => string;
  autoFocus?: boolean;
  small?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = fold(query.trim());
  const hits = useMemo(() => (q ? suggest(index, g, q) : []), [index, g, q]);

  const commit = (id: number) => {
    setOpen(false);
    setQuery("");
    // Soltar el foco: si se queda dentro, «wasd» se escribe en la caja en vez
    // de volar, que es justo lo que uno intenta tras encontrar algo.
    inputRef.current?.blur();
    onPick(id);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q) return;
    // El acierto exacto manda aunque el cursor esté sobre otra sugerencia:
    // quien escribe la palabra entera y pulsa Enter la quiere a ella.
    const hit = exact(index, q);
    if (hit >= 0) return commit(hit);
    if (hits.length) return commit(hits[active] ?? hits[0]);
    onMiss(query.trim());
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => (a + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => (a - 1 + hits.length) % hits.length); }
  };

  return (
    <form className={"find" + (small ? " find-s" : "")} onSubmit={submit} role="search">
      <input
        ref={inputRef}
        value={query}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        // El desenfoque se retrasa: sin esperar, el `blur` desmonta la lista
        // antes de que el clic sobre una sugerencia llegue a dispararse.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
        onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        aria-expanded={open && hits.length > 0}
        aria-autocomplete="list"
      />
      {open && hits.length > 0 && (
        <ul className="sugg">
          {hits.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className={i === active ? "on" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}   // que el blur no gane la carrera
                onClick={() => commit(id)}
              >
                {zoneCss && (
                  <i className="swatch" style={{ background: zoneCss(g.community[id]) }} />
                )}
                <span className="w">{g.labels[id]}</span>
                <span className="s">#{g.rank[id] + 1}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
