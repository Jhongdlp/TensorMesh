/** Vuelo con teclado, compartido por los dos motores.
 *
 *  Vive fuera de `gpu/camera.ts` porque el respaldo WebGL usa la cámara de
 *  Three.js y no esa clase: si el teclado viviera dentro de una de las dos
 *  cámaras, el otro motor se quedaría sin él — que es exactamente lo que
 *  pasaba. Aquí sólo hay estado de teclas y velocidades amortiguadas; quien
 *  llama decide qué significa "adelante" en su propio sistema.
 *
 *  Las velocidades salen normalizadas: las de traslación son fracción de la
 *  distancia de órbita (avanzar cuesta lo mismo de cerca que de lejos), el giro
 *  va en radianes y el zoom es una fracción multiplicativa. */

/** Impulsos por frame. Amortiguados a continuación, así que la velocidad
 *  sostenida es ~7× el impulso (0,86 de amortiguación → 1/(1−0,86)). */
const ROT = 0.0022;
const MOVE = 0.0012;
const ZOOM = 0.0018;
/** La misma amortiguación que el ratón, para que el gesto se sienta igual. */
const DAMP = 0.86;
const DAMP_ZOOM = 0.82;
const STILL = 2e-5;

/** Las teclas que pilota la cámara, y sólo ésas: cualquier otra dejaría el
 *  bucle de render despierto sin nada que dibujar (`active()` mira este set). */
const CAM_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "PageUp", "PageDown", "Minus", "Equal", "NumpadSubtract", "NumpadAdd",
]);

/** De ésas, las que el navegador usaría para desplazar la página. */
const SWALLOW = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown",
]);

/** ¿El foco está en un campo de texto? Entonces las teclas son del campo:
 *  después de buscar una palabra el cursor sigue en el input, y sin esto
 *  «wasd» se escribiría en el buscador en vez de mover la cámara. */
function typing(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable;
}

export interface Fly {
  /** Fracción de la distancia de órbita, por frame. */
  fwd: number;
  side: number;
  vert: number;
  /** Radianes de azimut y de polar. */
  yaw: number;
  pitch: number;
  /** Fracción multiplicativa de la distancia. */
  zoom: number;
}

export class KeyFly {
  private keys = new Set<string>();
  /** Multiplicador de los modificadores: Mayús acelera, Alt afina. */
  private boost = 1;
  private v: Fly = { fwd: 0, side: 0, vert: 0, yaw: 0, pitch: 0, zoom: 0 };
  private detach: (() => void) | null = null;

  /** Qué hacer con Inicio. Lo pone quien tenga un encuadre al que volver. */
  onHome: (() => void) | null = null;

  /** Los listeners van en `window`, no en el canvas: un canvas sin `tabindex`
   *  nunca recibe el foco, y pedir un clic previo para poder volar sería un
   *  misterio. Ctrl/Meta se dejan pasar: son atajos del navegador. */
  attach() {
    const mods = (e: KeyboardEvent) => {
      this.boost = (e.shiftKey ? 3 : 1) * (e.altKey ? 0.3 : 1);
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || typing(e.target)) return;
      mods(e);
      if (e.code === "Home") { this.onHome?.(); e.preventDefault(); return; }
      if (!CAM_KEYS.has(e.code)) return;
      this.keys.add(e.code);
      if (SWALLOW.has(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { mods(e); this.keys.delete(e.code); };
    // Sin esto, cambiar de pestaña con una tecla pulsada la deja trabada: el
    // keyup se lo queda la otra ventana y la cámara sigue volando sola.
    const blur = () => { this.keys.clear(); this.boost = 1; };

    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    this.detach = () => {
      this.boost = 1;
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
    };
  }

  /** ¿Hay algo que dibujar? Con teclas sueltas y sin inercia, el frame se salta. */
  active(): boolean {
    if (this.keys.size) return true;
    const v = this.v;
    return Math.abs(v.fwd) > STILL || Math.abs(v.side) > STILL ||
      Math.abs(v.vert) > STILL || Math.abs(v.yaw) > STILL ||
      Math.abs(v.pitch) > STILL || Math.abs(v.zoom) > STILL;
  }

  /** Velocidad de este frame. Integra los impulsos de las teclas mantenidas y
   *  amortigua: soltar una tecla frena igual que soltar el botón del ratón.
   *  Se llama **una vez por frame**; el objeto devuelto se reutiliza. */
  read(): Fly {
    const v = this.v;
    const k = this.keys;
    if (k.size) {
      const on = (...codes: string[]) => (codes.some(c => k.has(c)) ? 1 : 0);
      const s = this.boost;
      // Girar: las flechas hacen lo mismo que arrastrar con el ratón.
      v.yaw += (on("ArrowLeft") - on("ArrowRight")) * ROT * s;
      v.pitch += (on("ArrowUp") - on("ArrowDown")) * ROT * s;
      v.zoom += (on("Minus", "NumpadSubtract") - on("Equal", "NumpadAdd")) * ZOOM * s;
      // Volar: adelante es el eje de vista; subir y bajar, el eje del mundo,
      // que es lo que una vista casi horizontal hace esperar.
      v.fwd += (on("KeyW") - on("KeyS")) * MOVE * s;
      v.side += (on("KeyD") - on("KeyA")) * MOVE * s;
      v.vert += (on("KeyE", "PageUp") - on("KeyQ", "PageDown")) * MOVE * s;
    }
    const out = { ...v };
    v.fwd *= DAMP; v.side *= DAMP; v.vert *= DAMP;
    v.yaw *= DAMP; v.pitch *= DAMP; v.zoom *= DAMP_ZOOM;
    return out;
  }

  /** Corta el vuelo en seco. Volver al encuadre completo con inercia pendiente
   *  deja la cámara derivando justo después de aterrizar. */
  stop() {
    this.keys.clear();
    const v = this.v;
    v.fwd = v.side = v.vert = v.yaw = v.pitch = v.zoom = 0;
  }

  dispose() { this.stop(); this.detach?.(); this.detach = null; }
}
