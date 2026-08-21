import * as THREE from "three";
import type { Galaxy } from "./loader";
import { zoneColours } from "./palette.mjs";
import { HL, tiers } from "./highlight.mjs";
import { KeyFly } from "./keys";

/** Cuánto crece un nodo resaltado, igual que `selScale` en el motor WebGPU. */
const SEL_SCALE = 2.5;
/** Cuánto brilla una arista resaltada. Igual que `selEdge` en el motor WebGPU,
 *  se deduce del brillo de la malla: lleva la arista a color pleno y ni un paso
 *  más, porque pasarse recorta los tres canales y el camino sale blanco. */
const selEdgeFor = (bright: number) => Math.min(24, (1 / Math.max(bright, 1e-3) - 1) / (HL.self - 1));

const NODE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aDim;
  uniform float uScale;
  uniform float uMinPx;
  uniform float uFar;
  uniform float uSelScale;
  varying float vFade;
  varying float vBoost;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = max(-mv.z, 1.0);

    // Descarte por frustum (frustum culling) en Vertex Shader
    float margin = 0.1 * gl_Position.w;
    if (gl_Position.w <= 0.0 ||
        gl_Position.z < -gl_Position.w || gl_Position.z > gl_Position.w ||
        gl_Position.x < -gl_Position.w - margin || gl_Position.x > gl_Position.w + margin ||
        gl_Position.y < -gl_Position.w - margin || gl_Position.y > gl_Position.w + margin) {
      gl_PointSize = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Descarte por distancia (draw distance culling), eximiendo los nodos seleccionados/resaltados
    if (aDim <= 1.0 && d > uFar) {
      gl_PointSize = 0.0;
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }

    // Un nodo resaltado crece, y el atenuado encoge: como escriben profundidad,
    // un punto de fondo por delante de un vecino le recorta un agujero.
    vBoost = max(aDim - 1.0, 0.0);
    float att = min(aDim, 1.0);
    float grow = (1.0 + vBoost * uSelScale) * mix(0.4, 1.0, att);
    gl_PointSize = max(aSize * uScale / d, uMinPx) * grow;
    // Suelo del 12%: el fondo a cero deja la selección flotando en el vacío.
    vFade = clamp(1.0 - d / uFar, 0.04, 1.0) * mix(0.12, 1.0, att);
  }`;

const NODE_FRAG = /* glsl */ `
  uniform float uBright;
  varying float vFade;
  varying float vBoost;
  void main() {
    // Blanco, siempre: el color de zona vive en las aristas.
    // Disco plano: el halo gaussiano dejaba los nodos como manchas invisibles.
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float aa = max(fwidth(r), 0.0001);
    float a;
    if (vBoost > 1.0) {
      // Marcador de la palabra elegida: núcleo sólido más un aro suelto.
      float core = 1.0 - smoothstep(0.42 - aa * 2.0, 0.42, r);
      float ring = smoothstep(0.72 - aa * 2.0, 0.72, r) *
                   (1.0 - smoothstep(0.90, 0.90 + aa * 2.0, r));
      a = max(core, ring * 0.9);
    } else {
      a = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
    }
    // Descartar si el alfa final es demasiado bajo para no escribir profundidad
    if (a * vFade <= 0.015) discard;
    gl_FragColor = vec4(vec3(uBright), a * vFade);
  }`;

const EDGE_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aDim;
  uniform float uFar;
  uniform float uSelEdge;
  varying vec3 vColor;
  varying float vFade;
  varying float vGain;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // El empujón del resalte va en el color, no en el alfa: el factor de mezcla
    // se recorta a 1 y multiplicarlo no subiría nada.
    vGain = 1.0 + max(aDim - 1.0, 0.0) * uSelEdge;
    
    // Descarte por distancia para aristas lejanas
    float d = max(-mv.z, 1.0);
    if (aDim <= 1.0 && d > uFar) {
      vFade = 0.0;
    } else {
      vFade = clamp(1.0 - d / uFar, 0.0, 1.0) * min(aDim, 1.0);
    }
  }`;

const EDGE_FRAG = /* glsl */ `
  uniform float uBright;
  varying vec3 vColor;
  varying float vFade;
  varying float vGain;
  void main() {
    if (vFade <= 0.005) discard;
    gl_FragColor = vec4(vColor * uBright * vGain, vFade);
  }`;

/** Vectores de trabajo: el bucle corre 60 veces por segundo y no debe asignar. */
const SCRATCH = {
  off: new THREE.Vector3(),
  f: new THREE.Vector3(),
  r: new THREE.Vector3(),
  sph: new THREE.Spherical(),
};

export class GalaxyScene {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private scene = new THREE.Scene();
  private points!: THREE.Points;
  private lines!: THREE.LineSegments;
  private nodeDim!: THREE.BufferAttribute;
  private edgeDim!: THREE.BufferAttribute;
  private raf = 0;
  private radius = 1;

  private target = new THREE.Vector3();
  private distance = 10;
  private theta = 0;
  private phi = Math.PI / 2;

  private cameraMode: 'orbit' | 'fly' = 'orbit';
  private joyActive = false;
  private joyStartX = 0;
  private joyStartY = 0;
  private joyCurX = 0;
  private joyCurY = 0;
  private dragging = 0;
  private vDist = 0;
  private vTheta = 0;
  private vPhi = 0;
  private detach: (() => void) | null = null;

  /** Mismo vuelo con teclado que el motor WebGPU: es el módulo compartido el
   *  que fija el tacto, aquí sólo se traduce a la cámara de Three.js. */
  private fly = new KeyFly();
  /** Encuadre inicial, para volver a él con Inicio. */
  private home!: { target: THREE.Vector3; distance: number; theta: number; phi: number };
  selected: number | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private g: Galaxy,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x05070d, 1);

    // Encuadre robusto: la esfera envolvente la estiran cuatro outliers y deja
    // el cuerpo de la galaxia diminuto en el centro. Usamos centroide + p95.
    const n = g.meta.nodes;
    const c = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      c.x += g.positions[i * 3]; c.y += g.positions[i * 3 + 1]; c.z += g.positions[i * 3 + 2];
    }
    c.divideScalar(n);
    const dists = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      dists[i] = Math.hypot(g.positions[i * 3] - c.x,
                            g.positions[i * 3 + 1] - c.y,
                            g.positions[i * 3 + 2] - c.z);
    }
    const sorted = Float32Array.from(dists).sort();
    this.radius = sorted[Math.floor(n * 0.95)] || 1;
    const sphere = { center: c, radius: this.radius };

    this.camera = new THREE.PerspectiveCamera(55, 1, this.radius * 0.004, this.radius * 40);
    this.target.copy(sphere.center);
    this.distance = this.radius * 2.15;
    this.theta = 0;
    this.phi = Math.PI / 2;
    this.camera.position.copy(this.eye());
    this.camera.lookAt(this.target);

    this.home = {
      target: this.target.clone(),
      distance: this.distance,
      theta: this.theta,
      phi: this.phi
    };
    this.fly.onHome = () => {
      this.fly.stop();   // sin esto la inercia sigue derivando tras aterrizar
      this.target.copy(this.home.target);
      this.distance = this.home.distance;
      this.theta = this.home.theta;
      this.phi = this.home.phi;
      this.vDist = 0;
    };
    this.fly.attach();
    this.attach(canvas);

    this.buildNodes();
    this.buildEdges();

    this.resize();
    addEventListener("resize", this.resize);
    this.loop();
  }

  setCameraMode(mode: 'orbit' | 'fly') {
    this.cameraMode = mode;
  }

  // ------------------------------------------------------------------ nodos
  private buildNodes() {
    const { positions, rank, meta } = this.g;
    const n = meta.nodes;
    const sizes = new Float32Array(n);
    const dim = new Float32Array(n).fill(1);

    // las palabras frecuentes pesan más visualmente
    for (let i = 0; i < n; i++) {
      sizes[i] = this.radius * (0.0012 + 0.0055 * Math.pow(1 - rank[i] / 65535, 8));
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.nodeDim = new THREE.BufferAttribute(dim, 1);
    geo.setAttribute("aDim", this.nodeDim);

    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
      uniforms: {
        uScale: { value: 800 }, uMinPx: { value: 4.0 },
        uFar: { value: this.radius * 5.0 }, uBright: { value: 1.0 },
        uSelScale: { value: SEL_SCALE },
      },
      // Mezcla alfa y profundidad: un punto es un punto sólido, y el cercano
      // tapa al lejano en vez de sumarse con él hasta saturar.
      transparent: true, depthWrite: true, depthTest: true,
      blending: THREE.NormalBlending,
    }));
    this.points.renderOrder = 1;
    this.scene.add(this.points);
  }

  // ----------------------------------------------------------------- aristas
  private buildEdges() {
    const { positions, uniqueEdges } = this.g;
    const zone = zoneColours(this.g).node;
    const m = uniqueEdges.length / 2;
    const pos = new Float32Array(m * 6);
    const col = new Float32Array(m * 6);
    const dim = new Float32Array(m * 2).fill(1);

    for (let e = 0; e < m; e++) {
      const a = uniqueEdges[e * 2], b = uniqueEdges[e * 2 + 1];
      for (let k = 0; k < 3; k++) {
        pos[e * 6 + k] = positions[a * 3 + k];
        pos[e * 6 + 3 + k] = positions[b * 3 + k];
      }
      for (let k = 0; k < 3; k++) {
        col[e * 6 + k] = zone[a * 3 + k];
        col[e * 6 + 3 + k] = zone[b * 3 + k];
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    this.edgeDim = new THREE.BufferAttribute(dim, 1);
    geo.setAttribute("aDim", this.edgeDim);

    this.lines = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG,
      uniforms: {
        uFar: { value: this.radius * 5.0 },
        uBright: { value: Math.min(0.34, 0.34 * 15949 / m) },
        uSelEdge: { value: selEdgeFor(Math.min(0.34, 0.34 * 15949 / m)) },
      },
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending,
    }));
    this.lines.renderOrder = 0;
    this.scene.add(this.lines);
  }

  // --------------------------------------------------------------- selección
  select(id: number | null) {
    this.selected = id;
    const { uniqueEdges } = this.g;
    const nd = this.nodeDim.array as Float32Array;
    const ed = this.edgeDim.array as Float32Array;

    // Sin storage buffers, cada extremo de arista lleva su copia del escalón:
    // el mismo degradado que el motor WebGPU saca gratis en el vertex shader.
    tiers(this.g, id, nd);
    for (let e = 0; e < uniqueEdges.length / 2; e++) {
      ed[e * 2] = nd[uniqueEdges[e * 2]];
      ed[e * 2 + 1] = nd[uniqueEdges[e * 2 + 1]];
    }
    this.nodeDim.needsUpdate = true;
    this.edgeDim.needsUpdate = true;
  }

  async pick(px: number, py: number): Promise<number | null> {
    const r = this.canvas.getBoundingClientRect();
    const { positions, meta } = this.g;
    const sizes = this.points.geometry.getAttribute("aSize").array as Float32Array;
    const mat = this.points.material as THREE.ShaderMaterial;
    const uScale = mat.uniforms.uScale.value;
    const uMinPx = mat.uniforms.uMinPx.value;
    const v = new THREE.Vector3();
    const nodePos = new THREE.Vector3();
    let best = -1;
    let bestScore = Infinity;

    for (let i = 0; i < meta.nodes; i++) {
      nodePos.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      v.copy(nodePos).project(this.camera);
      if (v.z > 1) continue;

      const sx = (v.x * 0.5 + 0.5) * r.width;
      const sy = (-v.y * 0.5 + 0.5) * r.height;
      const d_px = Math.hypot(sx - px, sy - py);

      // Calcular profundidad en espacio de cámara y radio visual en píxeles
      nodePos.applyMatrix4(this.camera.matrixWorldInverse);
      const depth = Math.max(-nodePos.z, 1.0);
      const r_i = Math.max((sizes[i] * uScale) / depth, uMinPx) * 0.5;

      const maxD = Math.max(22, r_i);
      if (d_px > maxD) continue;

      let score: number;
      if (d_px <= r_i) {
        // Acierto directo: priorizar profundidad, desempatar con distancia
        score = depth * 10.0 + d_px * 0.1;
      } else {
        // Fuera del nodo: priorizar distancia al borde, desempatar con profundidad
        score = 16384.0 + (d_px - r_i) * 500.0 + depth * 0.1;
      }

      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best < 0 ? null : best;
  }

  private resize = () => {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / Math.max(r.height, 1);
    this.camera.updateProjectionMatrix();
    const fov = (this.camera.fov * Math.PI) / 180;
    const mat = this.points.material as THREE.ShaderMaterial;
    mat.uniforms.uScale.value = r.height / (2 * Math.tan(fov / 2));
    mat.uniforms.uMinPx.value = 2.0 * Math.min(devicePixelRatio || 1, 2) * 2.0;
  };

  private eye(): THREE.Vector3 {
    const sp = Math.sin(this.phi);
    return new THREE.Vector3(
      this.target.x + this.distance * sp * Math.sin(this.theta),
      this.target.y + this.distance * Math.cos(this.phi),
      this.target.z + this.distance * sp * Math.cos(this.theta)
    );
  }

  private attach(el: HTMLCanvasElement) {
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
      if (this.cameraMode === 'fly') {
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
      if (this.cameraMode === 'fly') {
        updateJoystick(this.joyCurX - this.joyStartX, this.joyCurY - this.joyStartY);
      } else {
        if (this.dragging === 1) {
          this.vTheta -= dx * 0.005;
          this.vPhi -= dy * 0.005;
        } else {
          const e = this.eye();
          const f = new THREE.Vector3().subVectors(this.target, e).normalize();
          const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
          const u = new THREE.Vector3().crossVectors(r, f).normalize();
          const k = this.distance * 0.0016;
          this.target.addScaledVector(r, dx * k).addScaledVector(u, -dy * k);
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

    this.detach = () => {
      hideJoystick();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
    };
  }

  /** Vuelo con teclado. Se mueve el objetivo
   *  además del ojo, así que se atraviesa la nube en vez de rodearla. */
  private flyStep() {
    if (!this.fly.active()) { this.fly.read(); return; }
    const k = this.fly.read();

    this.theta += k.yaw;
    this.phi = Math.min(Math.PI - 1e-4, Math.max(1e-4, this.phi + k.pitch));
    this.distance *= 1 + k.zoom;

    if (k.fwd || k.side || k.vert) {
      const e = this.eye();
      const f = new THREE.Vector3().subVectors(this.target, e).normalize();
      const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
      const d = this.distance;
      this.target.addScaledVector(f, k.fwd * d).addScaledVector(r, k.side * d);
      this.target.y += k.vert * d;
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.flyStep();

    if (this.joyActive && this.cameraMode === 'fly') {
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
          this.phi = Math.min(Math.PI - 1e-4, Math.max(1e-4, this.phi + speedY));

          const sp = Math.sin(this.phi);
          this.target.set(
            eyeBefore.x - this.distance * sp * Math.sin(this.theta),
            eyeBefore.y - this.distance * Math.cos(this.phi),
            eyeBefore.z - this.distance * sp * Math.cos(this.theta)
          );
        } else if (this.dragging === 2) {
          // Traslación: vuela hacia adelante/atrás e izquierda/derecha
          const e = this.eye();
          const f = new THREE.Vector3().subVectors(this.target, e).normalize();
          const r = new THREE.Vector3(-f.z, 0, f.x).normalize();
          const speedFwd = -dy * 0.00015;
          const speedSide = dx * 0.00015;
          const d = this.distance;
          this.target.addScaledVector(f, speedFwd * d).addScaledVector(r, speedSide * d);
        }
      }
    }

    this.theta += this.vTheta;
    this.phi = Math.min(Math.PI - 1e-4, Math.max(1e-4, this.phi + this.vPhi));
    this.distance *= 1 + this.vDist;
    this.vTheta *= 0.86;
    this.vPhi *= 0.86;
    this.vDist *= 0.82;

    const eyePos = this.eye();
    this.camera.position.copy(eyePos);
    this.camera.lookAt(this.target);

    // Actualización dinámica de uFar (draw distance) según la distancia de la cámara al objetivo.
    const dist = this.camera.position.distanceTo(this.target);
    const uFarValue = Math.min(this.radius * 5.0, dist * 2.0);
    (this.points.material as THREE.ShaderMaterial).uniforms.uFar.value = uFarValue;
    (this.lines.material as THREE.ShaderMaterial).uniforms.uFar.value = uFarValue;

    this.renderer.render(this.scene, this.camera);
  };

  setEdgeBrightness(v: number) {
    const u = (this.lines.material as THREE.ShaderMaterial).uniforms;
    u.uBright.value = v;
    u.uSelEdge.value = selEdgeFor(v);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.resize);
    this.fly.dispose();
    this.detach?.();
    this.detach = null;
    this.renderer.dispose();
  }
}
