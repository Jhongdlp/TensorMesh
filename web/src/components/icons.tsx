/** Los iconos de la tira de herramientas, para todas las salas.
 *
 *  Trazo en `currentColor` y `24×24`, dibujados a mano y no traídos de una
 *  librería: son una docena, y una dependencia de iconos pesa más que estas
 *  líneas. El tamaño real lo pone `.tool svg` en `styles/shell.css` — el
 *  atributo de aquí es sólo el respaldo para cuando salen fuera de un botón.
 *
 *  Vivían dentro de `Galaxy.tsx`. Salieron cuando la sala del descenso adoptó
 *  el mismo mueble: dos copias del mismo galón es la clase de duplicación que
 *  se desincroniza sin que nadie se entere.
 */
const ico = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.8,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

export const IcoChevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d={open ? "M14 6l-6 6 6 6" : "M10 6l6 6-6 6"} />
  </svg>
);

export const IcoControls = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="8" cy="6" r="2.2" fill="currentColor" />
    <circle cx="15" cy="12" r="2.2" fill="currentColor" />
    <circle cx="10" cy="18" r="2.2" fill="currentColor" />
  </svg>
);

/** Qué es esto: la presentación. Interrogante dibujado con el mismo trazo que
 *  el resto, no el glifo «?» de la tipografía — a 15 px dentro de un botón de
 *  1,7 rem el glifo se descuelga de la caja y no centra con los otros cuatro. */
export const IcoHelp = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.7 9.4a2.4 2.4 0 014.6.9c0 1.6-2.3 2-2.3 3.4" />
    <path d="M12 17.1v.01" strokeWidth="2" />
  </svg>
);

/** Órbita: el cuerpo quieto y la vista dando la vuelta alrededor. */
export const IcoOrbit = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-24 12 12)" />
  </svg>
);

/** Vuelo: la cámara suelta, avanzando. */
export const IcoFly = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M4 12l16-7-5.5 7 5.5 7z" />
  </svg>
);

/** Vista completa: el encuadre que abarca la galaxia entera. */
export const IcoFit = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M4 9V5.5A1.5 1.5 0 015.5 4H9M15 4h3.5A1.5 1.5 0 0120 5.5V9M20 15v3.5a1.5 1.5 0 01-1.5 1.5H15M9 20H5.5A1.5 1.5 0 014 18.5V15" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

/** Comparar: dos cuerpos y la cuerda que los mide. */
export const IcoCompare = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <circle cx="7" cy="8" r="3" />
    <circle cx="17" cy="16" r="3" />
    <path d="M9.2 10.2l5.6 3.6" strokeDasharray="2 1.6" />
  </svg>
);

/** Pantalla completa: las cuatro esquinas abriéndose. Es el icono que todo el
 *  mundo ya sabe leer — reproductores de vídeo, mapas—, así que no hay nada que
 *  inventar aquí. */
export const IcoExpand = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M9 4H4.8A.8.8 0 004 4.8V9M15 4h4.2a.8.8 0 01.8.8V9M20 15v4.2a.8.8 0 01-.8.8H15M9 20H4.8a.8.8 0 01-.8-.8V15" />
  </svg>
);

/** Y las mismas cerrándose. */
export const IcoShrink = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M4 9h4.2a.8.8 0 00.8-.8V4M20 9h-4.2a.8.8 0 01-.8-.8V4M15 20v-4.2a.8.8 0 01.8-.8H20M9 20v-4.2a.8.8 0 00-.8-.8H4" />
  </svg>
);

/** Compartir: un punto y los dos hilos que salen de él. */
export const IcoShare = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <circle cx="6" cy="12" r="2.4" />
    <circle cx="17" cy="6" r="2.4" />
    <circle cx="17" cy="18" r="2.4" />
    <path d="M8.1 10.9l6.8-3.7M8.1 13.1l6.8 3.7" />
  </svg>
);

export const IcoKeys = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h2M11 10h2M15 10h2M7 14h10" />
  </svg>
);

/** Correr y parar. Los dos glifos que nadie tiene que aprender. */
export const IcoPlay = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" stroke="none" />
  </svg>
);

export const IcoPause = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <rect x="7" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.4" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

/** Volver a soltar: la flecha que da la vuelta, con los puntos de la siembra
 *  dentro. Un icono de recarga a secas se lee como «recargar la página». */
export const IcoDrop = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M19.5 12a7.5 7.5 0 11-2.4-5.5" />
    <path d="M18.6 3.6v3.4h-3.4" />
    <circle cx="9" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="13" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="15" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

/** Planta contra relieve: el mismo terreno visto a plomo y visto de lado. */
export const IcoPlan = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M12 4l8 4.5-8 4.5-8-4.5z" />
    <path d="M4 13.5l8 4.5 8-4.5" />
  </svg>
);

/** Un paso: la flecha que avanza contra el tope. */
export const IcoStep = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" {...ico} aria-hidden="true">
    <path d="M6 5.5l8 6.5-8 6.5z" fill="currentColor" stroke="none" />
    <path d="M18 5v14" />
  </svg>
);
