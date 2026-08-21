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
 *  va en radianes y el zoom es una fracción multiplicativa.
 *
 *  Es `.mjs` con JSDoc y no `.ts` por la misma razón que `palette.mjs` y
 *  `highlight.mjs`: el paquete es `type: commonjs` y Node no carga un `.ts`
 *  como módulo, mientras que `tsc` sí tipa un `.mjs`. Aquí el tacto entero —los
 *  impulsos, la amortiguación, qué hace cada tecla en cada modo— es lógica pura
 *  sin GPU ni DOM, así que es justo lo que un test puede fijar. */

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
/**
 * @param {EventTarget | null} el
 * @returns {boolean}
 */
function typing(el) {
  const n = /** @type {HTMLElement | null} */ (el);
  if (!n || !n.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || n.isContentEditable;
}

/** Cómo se interpretan las teclas.
 *
 *  `orbit` es el modo de casa: la galaxia **no se mueve de sitio**. Todo lo que
 *  hace el teclado es girar alrededor del centro y acercarse, así que el eje de
 *  giro es siempre el mismo y la rotación se lee. Con traslación mezclada el
 *  pivote se iba de la nube sin que se notara y el siguiente giro parecía
 *  torcido — que es justo lo que se estaba arreglando.
 *
 *  `fly` es el modo libre: ahí sí se atraviesa la nube. */
/** @typedef {"orbit" | "fly"} FlyMode */

/**
 * @typedef {object} Fly
 * @property {number} fwd    fracción de la distancia de órbita, por frame. Siempre 0 en `orbit`.
 * @property {number} side
 * @property {number} vert
 * @property {number} yaw    radianes de azimut
 * @property {number} pitch  radianes de polar
 * @property {number} zoom   fracción multiplicativa de la distancia
 */

export class KeyFly {
  /** @type {Set<string>} */
  keys = new Set();
  /** En `orbit` no se emite traslación: ver `FlyMode`. */
  /** @type {FlyMode} */
  mode = "orbit";
  /** Multiplicador de los modificadores: Mayús acelera, Alt afina. */
  boost = 1;
  /** @type {Fly} */
  v = { fwd: 0, side: 0, vert: 0, yaw: 0, pitch: 0, zoom: 0 };
  /** @type {(() => void) | null} */
  detach = null;

  /** Cambiar de modo corta la inercia: la velocidad pendiente se integró con
   *  el significado anterior de las teclas y al cambiarlo sale un tirón. */
  /** @param {FlyMode} m */
  setMode(m) {
    if (m === this.mode) return;
    this.mode = m;
    this.stop();
  }

  /** Qué hacer con Inicio. Lo pone quien tenga un encuadre al que volver. */
  /** @type {(() => void) | null} */
  onHome = null;

  /** Los listeners van en `window`, no en el canvas: un canvas sin `tabindex`
   *  nunca recibe el foco, y pedir un clic previo para poder volar sería un
   *  misterio. Ctrl/Meta se dejan pasar: son atajos del navegador. */
  attach() {
    /** @param {KeyboardEvent} e */
    const mods = (e) => {
      this.boost = (e.shiftKey ? 3 : 1) * (e.altKey ? 0.3 : 1);
    };
    /** @param {KeyboardEvent} e */
    const down = (e) => {
      if (e.ctrlKey || e.metaKey || typing(e.target)) return;
      mods(e);
      if (e.code === "Home") { this.onHome?.(); e.preventDefault(); return; }
      if (!CAM_KEYS.has(e.code)) return;
      this.keys.add(e.code);
      if (SWALLOW.has(e.code)) e.preventDefault();
    };
    /** @param {KeyboardEvent} e */
    const up = (e) => { mods(e); this.keys.delete(e.code); };
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
  /** @returns {boolean} */
  active() {
    if (this.keys.size) return true;
    const v = this.v;
    return Math.abs(v.fwd) > STILL || Math.abs(v.side) > STILL ||
      Math.abs(v.vert) > STILL || Math.abs(v.yaw) > STILL ||
      Math.abs(v.pitch) > STILL || Math.abs(v.zoom) > STILL;
  }

  /** Velocidad de este frame. Integra los impulsos de las teclas mantenidas y
   *  amortigua: soltar una tecla frena igual que soltar el botón del ratón.
   *  Se llama **una vez por frame**; el objeto devuelto se reutiliza. */
  /** @returns {Fly} */
  read() {
    const v = this.v;
    const k = this.keys;
    if (k.size) {
      /** @param {...string} codes */
      const on = (...codes) => (codes.some(c => k.has(c)) ? 1 : 0);
      const s = this.boost;
      // Girar: las flechas hacen lo mismo que arrastrar con el ratón.
      v.yaw += (on("ArrowLeft") - on("ArrowRight")) * ROT * s;
      v.pitch += (on("ArrowUp") - on("ArrowDown")) * ROT * s;
      v.zoom += (on("Minus", "NumpadSubtract") - on("Equal", "NumpadAdd")) * ZOOM * s;
      if (this.mode === "orbit") {
        // La galaxia se queda quieta: WASD giran igual que las flechas y
        // Q/E alejan y acercan. Ninguna tecla toca el centro de la órbita.
        v.yaw += (on("KeyA") - on("KeyD")) * ROT * s;
        v.pitch += (on("KeyW") - on("KeyS")) * ROT * s;
        v.zoom += (on("KeyQ", "PageDown") - on("KeyE", "PageUp")) * ZOOM * s;
      } else {
        // Volar: adelante es el eje de vista; subir y bajar, el eje del mundo,
        // que es lo que una vista casi horizontal hace esperar.
        v.fwd += (on("KeyW") - on("KeyS")) * MOVE * s;
        v.side += (on("KeyD") - on("KeyA")) * MOVE * s;
        v.vert += (on("KeyE", "PageUp") - on("KeyQ", "PageDown")) * MOVE * s;
      }
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
