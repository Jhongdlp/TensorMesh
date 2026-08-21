/** Leyenda del vuelo con teclado.
 *
 *  Panel propio abajo a la izquierda, no una línea dentro del panel de
 *  simulación: las teclas funcionan con los dos motores y ese panel sólo se
 *  monta con WebGPU. Abierto de entrada — una tecla que nadie ve no existe —
 *  pero plegable, porque una vez aprendida estorba. */

/** Cada fila: teclas dibujadas y qué hacen, en los dos idiomas del sitio. */
const ROWS: { keys: string[]; es: string; en: string }[] = [
  { keys: ["W", "S"], es: "adelante · atrás", en: "forward · back" },
  { keys: ["A", "D"], es: "lateral", en: "strafe" },
  { keys: ["Q", "E"], es: "bajar · subir", en: "down · up" },
  { keys: ["←", "→"], es: "girar", en: "turn" },
  { keys: ["↑", "↓"], es: "inclinar", en: "tilt" },
  { keys: ["+", "−"], es: "acercar · alejar", en: "zoom in · out" },
  { keys: ["Mayús", "Alt"], es: "rápido · fino", en: "fast · fine" },
  { keys: ["Inicio"], es: "vista completa", en: "whole galaxy" },
];

export default function KeyHelp({ lang, label }: { lang: string; label: string }) {
  const en = lang === "en";
  return (
    <details className="hud hud-bl keys" open>
      <summary>{label}</summary>
      <dl>
        {ROWS.map(r => (
          <div key={r.keys.join()}>
            <dt>
              {r.keys.map(k => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{en ? r.en : r.es}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
