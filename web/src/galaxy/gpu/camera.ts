/** Matrices y cámara orbital mínimas. Sin Three.js: el camino WebGPU no lo usa,
 *  y arrastrar 150 KB de librería para una cámara y un mat4 no sale a cuenta.
 *
 *  Ojo con la convención: el NDC de WebGPU tiene z en [0,1] (como D3D), no en
 *  [-1,1] como OpenGL. La matriz de proyección es distinta a la de WebGL. */

import { KeyFly } from "../keys";

export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

/** Proyección en perspectiva con z de recorte en [0,1]. Column-major. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
}

export function lookAt(eye: Vec3, at: Vec3, up: Vec3): Mat4 {
  let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
                     a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

const EPS = 1e-4;

export class OrbitCamera {
  target: Vec3 = [0, 0, 0];
  distance = 10;
  theta = 0.6;          // azimut
  phi = 1.15;           // polar, 0 = polo norte
  fov = (55 * Math.PI) / 180;
  near = 0.01;
  far = 1e6;

  /** Destino de un vuelo en curso. Saltar de golpe desorienta: el usuario
   *  pierde el contexto de dónde estaba y no relaciona el antes con el después. */
  private flyTarget: Vec3 | null = null;
  private flyDistance = 0;

  private vTheta = 0;
  private vPhi = 0;
  private vDist = 0;
  /** Vuelo con teclado. La amortiguación vive dentro, así que aquí sólo se
   *  traduce a mundo lo que devuelve. */
  private fly = new KeyFly();
  /** Encuadre inicial, para volver a él con Inicio. */
  private home: Vec3 = [0, 0, 0];
  private homeDistance = 10;
  mode: 'orbit' | 'fly' = 'orbit';
  private dragging = 0; // 0 nada, 1 rotar, 2 desplazar
  private joyActive = false;
  private joyStartX = 0;
  private joyStartY = 0;
  private joyCurX = 0;
  private joyCurY = 0;
  private detach: (() => void) | null = null;

  eye(): Vec3 {
    const sp = Math.sin(this.phi);
    return [
      this.target[0] + this.distance * sp * Math.sin(this.theta),
      this.target[1] + this.distance * Math.cos(this.phi),
      this.target[2] + this.distance * sp * Math.cos(this.theta),
    ];
  }

  view(): Mat4 { return lookAt(this.eye(), this.target, [0, 1, 0]); }

  projection(aspect: number): Mat4 {
    return perspective(this.fov, aspect, this.near, this.far);
  }

  viewProj(aspect: number): Mat4 {
    return multiply(this.projection(aspect), this.view());
  }

  /** ¿Hay movimiento pendiente? Si no, el frame se puede saltar entero. */
  /** Lleva la cámara a un punto y a una distancia, con transición. */
  flyTo(target: Vec3, distance: number) {
    this.flyTarget = [target[0], target[1], target[2]];
    this.flyDistance = distance;
  }

  /** Vuelve al encuadre completo que fijó `frame()`. Corta la inercia: si no,
   *  el vuelo pendiente pelea contra la interpolación y no aterriza. */
  goHome() {
    this.fly.stop();
    this.vTheta = this.vPhi = this.vDist = 0;
    this.flyTo(this.home, this.homeDistance);
  }

  /** Base ortonormal de la cámara en coordenadas de mundo: adelante, derecha y
   *  arriba. La derecha sale del plano horizontal (`f × Y`, no del `up` de la
   *  vista), así que desplazar y avanzar siguen valiendo mirando desde el polo,
   *  donde el `up` de la cámara degenera. */
  private basis(): { f: Vec3; r: Vec3; u: Vec3 } {
    const e0 = this.eye();
    let fx = this.target[0] - e0[0], fy = this.target[1] - e0[1], fz = this.target[2] - e0[2];
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, ry = 0, rz = fx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    return {
      f: [fx, fy, fz],
      r: [rx, ry, rz],
      u: [ry * fz - rz * fy, rz * fx - rx * fz, rx * fy - ry * fx],
    };
  }

  /** Traduce el vuelo del teclado a este sistema de coordenadas. Se llama una
   *  vez por frame: `read()` integra y amortigua por dentro. */
  private applyKeys() {
    const k = this.fly.read();
    // Un vuelo en curso manda: tocar una tecla mientras la cámara viaja pelea
    // contra la interpolación y el destino no llega nunca.
    if (this.flyTarget) return;
    this.theta += k.yaw;
    this.phi = Math.min(Math.PI - EPS, Math.max(EPS, this.phi + k.pitch));
    this.distance *= 1 + k.zoom;
    if (!k.fwd && !k.side && !k.vert) return;
    const { f, r } = this.basis();
    const d = this.distance;
    for (let i = 0; i < 3; i++) {
      this.target[i] += (f[i] * k.fwd + r[i] * k.side) * d;
    }
    this.target[1] += k.vert * d;
  }

  moving(): boolean {
    return this.flyTarget !== null ||
      this.dragging !== 0 ||
      this.joyActive ||
      this.fly.active() ||
      Math.abs(this.vTheta) > 2e-5 ||
      Math.abs(this.vPhi) > 2e-5 ||
      Math.abs(this.vDist) > 2e-5;
  }

  /** Amortiguación: el movimiento sigue un frame después de soltar el ratón. */
  update() {
    if (this.flyTarget) {
      const k = 0.14;
      for (let i = 0; i < 3; i++) {
        this.target[i] += (this.flyTarget[i] - this.target[i]) * k;
      }
      this.distance += (this.flyDistance - this.distance) * k;
      const near = Math.hypot(
        this.flyTarget[0] - this.target[0],
        this.flyTarget[1] - this.target[1],
        this.flyTarget[2] - this.target[2],
      ) < this.flyDistance * 0.004 &&
        Math.abs(this.distance - this.flyDistance) < this.flyDistance * 0.01;
      if (near) {
        this.target = this.flyTarget;
        this.distance = this.flyDistance;
        this.flyTarget = null;
      }
    }
    this.applyKeys();

    if (this.joyActive && this.mode === 'fly') {
      const dx = this.joyCurX - this.joyStartX;
      const dy = this.joyCurY - this.joyStartY;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        if (this.dragging === 1) {
          // Rotación: mira alrededor de la cámara (primera persona)
          const speedX = -dx * 0.0001;
          const speedY = -dy * 0.0001;

          const eyeBefore = this.eye();
          this.theta += speedX;
          this.phi = Math.min(Math.PI - EPS, Math.max(EPS, this.phi + speedY));

          const sp = Math.sin(this.phi);
          this.target[0] = eyeBefore[0] - this.distance * sp * Math.sin(this.theta);
          this.target[1] = eyeBefore[1] - this.distance * Math.cos(this.phi);
          this.target[2] = eyeBefore[2] - this.distance * sp * Math.cos(this.theta);
        } else if (this.dragging === 2) {
          // Traslación: vuela hacia adelante/atrás e izquierda/derecha
          const { f, r } = this.basis();
          const speedFwd = -dy * 0.00015;
          const speedSide = dx * 0.00015;
          const d = this.distance;
          for (let i = 0; i < 3; i++) {
            this.target[i] += (f[i] * speedFwd + r[i] * speedSide) * d;
          }
        }
      }
    }

    this.theta += this.vTheta;
    this.phi = Math.min(Math.PI - EPS, Math.max(EPS, this.phi + this.vPhi));
    this.distance *= 1 + this.vDist;
    this.vTheta *= 0.86;
    this.vPhi *= 0.86;
    this.vDist *= 0.82;
  }

  frame(radius: number) {
    this.distance = radius / Math.tan(this.fov / 2) * 0.92;
    this.near = radius * 0.002;
    this.far = radius * 60;
    this.home = [this.target[0], this.target[1], this.target[2]];
    this.homeDistance = this.distance;
  }

  attach(el: HTMLElement) {
    let joyEl: HTMLDivElement | null = null;
    let knobEl: HTMLDivElement | null = null;

    const showJoystick = (x: number, y: number) => {
      joyEl = document.createElement("div");
      joyEl.style.position = "absolute";
      const rect = el.getBoundingClientRect();
      const parentRect = el.parentElement?.getBoundingClientRect() || rect;
      const lx = x - parentRect.left;
      const ly = y - parentRect.top;
      joyEl.style.left = `${lx - 40}px`;
      joyEl.style.top = `${ly - 40}px`;
      joyEl.style.width = "80px";
      joyEl.style.height = "80px";
      joyEl.style.borderRadius = "50%";
      joyEl.style.border = "2px solid rgba(255, 255, 255, 0.3)";
      joyEl.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
      joyEl.style.pointerEvents = "none";
      joyEl.style.zIndex = "999";
      
      knobEl = document.createElement("div");
      knobEl.style.position = "absolute";
      knobEl.style.left = "25px";
      knobEl.style.top = "25px";
      knobEl.style.width = "30px";
      knobEl.style.height = "30px";
      knobEl.style.borderRadius = "50%";
      knobEl.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
      knobEl.style.transition = "transform 0.05s linear";
      
      joyEl.appendChild(knobEl);
      el.parentElement?.appendChild(joyEl);
    };

    const updateJoystick = (dx: number, dy: number) => {
      if (!knobEl) return;
      const dist = Math.hypot(dx, dy);
      const maxDist = 40;
      let rx = dx;
      let ry = dy;
      if (dist > maxDist) {
        rx = (dx / dist) * maxDist;
        ry = (dy / dist) * maxDist;
      }
      knobEl.style.transform = `translate(${rx}px, ${ry}px)`;
    };

    const hideJoystick = () => {
      if (joyEl) {
        joyEl.remove();
        joyEl = null;
        knobEl = null;
      }
    };

    const down = (e: PointerEvent) => {
      this.dragging = e.button === 2 || e.shiftKey ? 2 : 1;
      this.joyStartX = e.clientX;
      this.joyStartY = e.clientY;
      this.joyCurX = e.clientX;
      this.joyCurY = e.clientY;
      this.joyActive = true;
      if (this.mode === 'fly') {
        showJoystick(e.clientX, e.clientY);
      }
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!this.joyActive) return;
      const dx = e.clientX - this.joyCurX;
      const dy = e.clientY - this.joyCurY;
      this.joyCurX = e.clientX;
      this.joyCurY = e.clientY;
      if (this.mode === 'fly') {
        updateJoystick(this.joyCurX - this.joyStartX, this.joyCurY - this.joyStartY);
      } else {
        if (this.dragging === 1) {
          this.vTheta -= dx * 0.005;
          this.vPhi -= dy * 0.005;
        } else {
          const { r, u } = this.basis();
          const k = this.distance * 0.0016;
          for (let i = 0; i < 3; i++) {
            this.target[i] += (r[i] * dx - u[i] * dy) * k;
          }
        }
      }
    };
    const up = (e: PointerEvent) => {
      this.joyActive = false;
      this.dragging = 0;
      hideJoystick();
      el.releasePointerCapture?.(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.vDist += Math.sign(e.deltaY) * 0.055;
    };
    const menu = (e: Event) => e.preventDefault();

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", menu);
    this.fly.onHome = () => this.goHome();
    this.fly.attach();
    this.detach = () => {
      hideJoystick();
      this.fly.dispose();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
    };
  }

  dispose() { this.detach?.(); this.detach = null; }
}
