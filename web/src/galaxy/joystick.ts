/** Mando virtual del modo vuelo, compartido por los dos motores.
 *
 *  Estaba escrito dos veces —una en `gpu/camera.ts` y otra en `scene.ts`—
 *  carácter por carácter, con veinte líneas de `element.style.*` en cada copia.
 *  Era el mismo problema que ya resolvieron `palette.mjs` y `highlight.mjs`: dos
 *  motores que necesitan lo mismo y ninguna casa común, así que la segunda copia
 *  se queda atrás en silencio en cuanto alguien toca la primera.
 *
 *  El aspecto vive ahora en CSS (`.joy` / `.joy-knob` en `index.astro`), donde
 *  vive el resto del tema. Aquí sólo queda la mecánica: aparecer donde se pulsó,
 *  seguir al dedo hasta el tope y desaparecer al soltar. */

/** Radio del mando, en píxeles. El pomo no sale de aquí por mucho que se
 *  arrastre: el tope es lo que convierte un arrastre infinito en una palanca
 *  con recorrido. Es un tope **visual** — la cámara lee el desplazamiento
 *  crudo, así que seguir empujando más allá del borde sigue acelerando.
 *  Tiene que coincidir con el tamaño de `.joy` en el CSS. */
export const JOY_MAX = 40;

export interface Joystick {
  /** Lo pone en coordenadas de ventana; el módulo las traduce al contenedor. */
  show(x: number, y: number): void;
  /** Desplazamiento acumulado desde donde se pulsó. */
  update(dx: number, dy: number): void;
  hide(): void;
}

/** `el` es el canvas: el mando se cuelga de su padre, que es quien tiene
 *  `position: relative` — el canvas está en `inset: 0` y no puede contener
 *  nada posicionado dentro. */
export function createJoystick(el: HTMLElement): Joystick {
  let root: HTMLDivElement | null = null;
  let knob: HTMLDivElement | null = null;

  return {
    show(x, y) {
      const host = el.parentElement;
      if (!host) return;
      const r = host.getBoundingClientRect();
      root = document.createElement("div");
      root.className = "joy";
      root.style.left = `${x - r.left - JOY_MAX}px`;
      root.style.top = `${y - r.top - JOY_MAX}px`;
      knob = document.createElement("div");
      knob.className = "joy-knob";
      root.appendChild(knob);
      host.appendChild(root);
    },

    update(dx, dy) {
      if (!knob) return;
      const d = Math.hypot(dx, dy);
      const s = d > JOY_MAX ? JOY_MAX / d : 1;
      knob.style.transform = `translate(${dx * s}px, ${dy * s}px)`;
    },

    hide() {
      root?.remove();
      root = null;
      knob = null;
    },
  };
}
