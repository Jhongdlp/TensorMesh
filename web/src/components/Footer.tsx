import { type Lang } from "../i18n";
import { LANDING_COPY } from "../i18n/landing";

/* El pie es un **colofón**, no un cartel.
 *
 * Aquí había un lienzo de metabolas —siete centros gravitacionales muestreados
 * celda a celda en cada frame, más veintiocho motas, con cinco escalones de
 * alfa y `mix-blend-mode: screen`— y encima un «TENSORMESH» de 15 rem en
 * Archivo Black con una sombra difuminada. Tres cosas iban mal, y las tres son
 * la misma:
 *
 * - **hablaba otro idioma**. Esta página son dos masas planas, cero radio,
 *   cero degradado y cero sombra. Un campo escalar con rampa de alfa es
 *   exactamente la categoría de efecto que se acaba de quitar del índice;
 * - **el cuerpo grande no era el problema; lo que lo rodeaba, sí**. Un
 *   `text-shadow` de 35 px de desenfoque sobre unas metabolas es lo que hacía
 *   que la palabra pareciese pegada encima. La palabra grande se queda;
 * - **costaba un `requestAnimationFrame` eterno** en una Vega 6 integrada,
 *   para siempre, aunque el pie estuviera fuera de pantalla.
 *
 * Quedan dos piezas y nada más: la **firma a tamaño de cartel** y una fila de
 * colofón en Space Mono. La regla de `--mono` en esta casa ya estaba escrita:
 * el bloque técnico se pone en la hermana monoespaciada porque «se lee como
 * una salida de consola, porque *es* una medición, no un eslogan». Un colofón
 * es exactamente eso.
 *
 * Se probó antes dibujar la palabra con una tipografía de mapa de bits sobre
 * la rejilla, para que fuese del mismo material que la silueta de la portada.
 * Renderizada, no se lee: a 5x7 celdas con un canal de separación las astas
 * de letras contiguas se tocan y «tensormesh» sale como un código de barras.
 * La silueta de la portada funciona porque es una **masa abstracta**, no
 * porque sea tipografía dibujada a mano.
 *
 * Y el `hover` invierte —fondo claro, tinta oscura—, que es el único gesto de
 * interacción que tiene el sitio: el mismo de las placas de las salas. */

interface FooterProps {
  lang: Lang;
  onGoToTop?: () => void;
}

/* Flecha de trazo, no el carácter «↗». El glifo no existe en Space Mono y
 * caía a una tipografía cualquiera —tofu en el peor caso—; además las placas
 * del índice ya usan una flecha dibujada a trazo de 2, así que ésta es la
 * misma familia y no una tercera. */
function ArrowOut() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none"
         stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="none"
         stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M12 19V6M6 12l6-6 6 6" />
    </svg>
  );
}

export default function Footer({ lang, onGoToTop }: FooterProps) {
  const t = LANDING_COPY[lang];

  return (
    <footer className="tf">
      {/* La firma, a tamaño de cartel. Va **en minúscula y en Space Grotesk
          700**, que es exactamente la voz del titular de la portada: el mismo
          cuerpo enorme, el mismo interletraje cerrado, la misma tinta plana.
          La página abre con «la forma de la mente artificial.» y cierra con
          «tensormesh» — dos bloques de la misma tipografía en los dos
          extremos. Ese es todo el efecto que lleva, y no necesita más.

          Archivo Black se queda donde estaba: es el logotipo de la cabecera,
          a cuerpo pequeño. Repetirlo aquí a 20 rem convertiría la firma en
          una marca de agua. */}
      <p className="tf-word" aria-label="TensorMesh">tensormesh</p>

      <div className="tf-row">
        {/* Quién firma */}
        <div className="tf-id">
          <span className="tf-dim">© 2026</span>
        </div>

        {/* La medición. Se esconde antes que nada al estrecharse: es lo único
            de la fila que no es ni identidad ni salida. */}
        <p className="tf-meas">{t.footerAttrib}</p>

        {/* Las salidas */}
        <nav className="tf-acts">
          <a
            className="tf-link"
            href="https://github.com/Jhongdlp/TensorMesh"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.footerSource}
            <ArrowOut />
          </a>
          <a
            className="tf-link"
            href="https://jhongdlp.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Jhongdlp
            <ArrowOut />
          </a>
          {/* `onGoToTop` llevaba desde siempre en las props y sin usar: el pie
              era el único sitio de la página desde el que no se podía volver. */}
          {onGoToTop && (
            <button className="tf-link" type="button" onClick={onGoToTop}>
              {t.footerTop}
              <ArrowUp />
            </button>
          )}
        </nav>
      </div>
    </footer>
  );
}
