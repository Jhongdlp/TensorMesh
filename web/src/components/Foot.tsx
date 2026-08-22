/** El pie de un panel, con su «por qué» al lado.
 *
 *  Todos los paneles del atlas terminan en una línea que dice de dónde sale lo
 *  que acaban de enseñar: «similitud coseno en 300D», «el nombre de una región
 *  son sus palabras más frecuentes», «% de distancia perdida al aplanar». Esas
 *  líneas son honestas y son insuficientes: nombran el concepto exacto que
 *  quien acaba de llegar **no** tiene, y el sitio donde se explica —la guía—
 *  está a dos clics y a diez capítulos de distancia.
 *
 *  Esto convierte cada pie en la puerta de su capítulo. Es la única forma de
 *  pedagogía que no cobra peaje: no interrumpe, no ocupa sitio, no sale hasta
 *  que alguien ya se está preguntando justo eso.
 *
 *  Tres decisiones:
 *
 *  - **el enlace va detrás del texto, no delante.** Delante se lee como el
 *    encabezado del pie y se pulsa sin querer; detrás es lo que es, una salida
 *    opcional al final de una frase;
 *  - **es opcional.** Sin `why` el pie es exactamente el `<p class="foot">` que
 *    ya había, así que ningún panel se rompe por no pasarlo;
 *  - **no dice «saber más».** Dice «por qué», que es la pregunta que la línea
 *    de arriba acaba de provocar. Un «saber más» genérico no promete nada y
 *    por eso no se pulsa.
 */
export interface WhyLink {
  /** El rótulo, del idioma del sitio. */
  t: string;
  /** Abrir la guía por el capítulo que toca. */
  go: () => void;
}

export default function Foot({ children, why }: { children: React.ReactNode; why?: WhyLink }) {
  return (
    <p className="foot">
      {children}
      {why && (
        <>
          {" "}
          <button className="why" onClick={why.go}>
            {why.t}
            {/* El interrogante va dibujado y no escrito: a 0,62 rem el glifo de
                la tipografía se queda en un palito y no se lee como un botón. */}
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"
                 fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.2 9a3 3 0 115 2.2c-1.2.9-2.2 1.5-2.2 2.8" />
              <path d="M12 17.6v.01" />
            </svg>
          </button>
        </>
      )}
    </p>
  );
}
