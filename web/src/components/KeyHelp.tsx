/** Leyenda del vuelo con teclado.
 *
 *  Panel propio en el raíl derecho, bajo los mandos de simulación, no una
 *  línea dentro de ellos: las teclas funcionan con los dos motores y ese panel
 *  sólo se monta con WebGPU. Abierto de entrada — una tecla que nadie ve no
 *  existe — pero plegable, porque una vez aprendida estorba. */

/** Cada fila: teclas dibujadas y qué hacen, en los dos idiomas del sitio.
 *
 *  Hay dos juegos porque las mismas teclas significan cosas distintas: en
 *  órbita la galaxia está clavada y todo gira alrededor de ella, en vuelo la
 *  cámara se suelta. Una leyenda única mentiría en uno de los dos modos. */
const ORBIT: { keys: string[]; es: string; en: string }[] = [
  { keys: ["A", "D"], es: "girar", en: "turn" },
  { keys: ["W", "S"], es: "inclinar", en: "tilt" },
  { keys: ["Q", "E"], es: "alejar · acercar", en: "zoom out · in" },
  { keys: ["←", "→"], es: "girar", en: "turn" },
  { keys: ["↑", "↓"], es: "inclinar", en: "tilt" },
  { keys: ["+", "−"], es: "acercar · alejar", en: "zoom in · out" },
  { keys: ["Mayús", "Alt"], es: "rápido · fino", en: "fast · fine" },
  { keys: ["Inicio"], es: "vista completa", en: "whole galaxy" },
];

const FLY: { keys: string[]; es: string; en: string }[] = [
  { keys: ["W", "S"], es: "adelante · atrás", en: "forward · back" },
  { keys: ["A", "D"], es: "lateral", en: "strafe" },
  { keys: ["Q", "E"], es: "bajar · subir", en: "down · up" },
  { keys: ["←", "→"], es: "girar", en: "turn" },
  { keys: ["↑", "↓"], es: "inclinar", en: "tilt" },
  { keys: ["+", "−"], es: "acercar · alejar", en: "zoom in · out" },
  { keys: ["Mayús", "Alt"], es: "rápido · fino", en: "fast · fine" },
  { keys: ["Inicio"], es: "vista completa", en: "whole galaxy" },
];

export default function KeyHelp(
  { lang, label, mode = "orbit" }: { lang: string; label: string; mode?: "orbit" | "fly" },
) {
  const en = lang === "en";
  const rows = mode === "fly" ? FLY : ORBIT;
  return (
    <details className="hud keys" open>
      <summary>{label}</summary>
      <dl>
        {rows.map(r => (
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
