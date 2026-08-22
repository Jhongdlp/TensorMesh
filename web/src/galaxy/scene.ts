import * as THREE from "three";
import type { Galaxy } from "./loader";
import { zoneColours } from "./palette.mjs";
import { HL, tiers, pathTiers, spotTiers } from "./highlight.mjs";
import { KeyFly, type FlyMode, ZOOM_OUT } from "./keys.mjs";
import { createJoystick } from "./joystick";
import type { CamState } from "./gpu/camera";

/** Deriva del atractor. El mismo número que `gpu/camera.ts`, y por lo mismo:
 *  el reposo tiene que verse igual en los dos motores. */
const ATTRACT_YAW = 0.0011;

/** Cuánto crece un nodo resaltado, igual que `selScale` en el motor WebGPU. */
const SEL_SCALE = 0.0;
/** Cuánto brilla una arista resaltada. Igual que `selEdge` en el motor WebGPU,
 *  se deduce del brillo de la malla: lleva la arista a color pleno y ni un paso
 *  más, porque pasarse recorta los tres canales y el camino sale blanco. */
const selEdgeFor = (bright: number) => Math.min(24, (1 / Math.max(bright, 1e-3) - 1) / (HL.self - 1));

/** Bruma y exposición: espejo de `gpu/render.wgsl`. Los valores se duplican a
 *  mano porque un `.wgsl` no se importa desde GLSL; si se tocan allí, aquí
 *  también, o los dos motores dejan de verse igual. El razonamiento completo
 *  está en render.wgsl — aquí sólo los números. */
const FOG_FLOOR = 0.18;
const FOG_HAZE = "vec3(0.09, 0.13, 0.26)";
const EXP_SOFT = 0.65, EXP_FLOOR = 0.1, EXP_REF = 0.16;   // EXP_REF, en radios

/** Perspectiva aérea, compartida por los dos shaders. El tramo lo fija la órbita
 *  y no el radio de la nube: así el centro de la vista queda siempre a media
 *  bruma y el relieve se lee igual de cerca que de lejos. */
const FOG_GLSL = /* glsl */ `
  uniform float uFogNear;
  uniform float uFogSpan;
  float fogT(float d) {
    float t = clamp((d - uFogNear) / uFogSpan, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }`;

const NODE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aDim;
  uniform float uScale;
  uniform float uMinPx;
  uniform float uFar;
  uniform float uSelScale;
  varying float vFade;
  varying float vBoost;
  ${FOG_GLSL}
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
    // El suelo en píxeles cede con la bruma: al fondo un nodo debe ser una mota,
    // no un disco. Con el suelo plano los 50.000 salían del mismo tamaño y el
    // fondo era confeti blanco de densidad constante que tapa la malla y no dice
    // nada. Los resaltados van exentos: hay que poder apuntarlos de lejos.
    float t = fogT(d);
    float relax = vBoost > 0.0 ? 0.0 : t;
    gl_PointSize = max(aSize * uScale / d, uMinPx * mix(1.0, 0.35, relax)) * grow;
    // Suelo del 12%: el fondo a cero deja la selección flotando en el vacío.
    vFade = mix(1.0, ${FOG_FLOOR}, t) * mix(0.12, 1.0, att);
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
  // Factor de exposición, ya resuelto en CPU (ver buildEdges). Aquí sale más
  // barato que en WebGPU: allí hay que leer el otro extremo del storage buffer
  // por vértice, mientras que la longitud de una arista no cambia nunca — se
  // calcula una vez al construir la geometría y viaja como atributo.
  attribute float aExp;
  uniform float uFar;
  uniform float uSelEdge;
  varying vec3 vColor;
  varying float vFade;
  varying float vGain;
  varying float vBoost;
  ${FOG_GLSL}
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // El empujón del resalte va en el color, no en el alfa: el factor de mezcla
    // se recorta a 1 y multiplicarlo no subiría nada.
    vBoost = max(aDim - 1.0, 0.0);
    vGain = 1.0 + vBoost * uSelEdge;
    
    // Descarte por distancia para aristas lejanas
    float d = max(-mv.z, 1.0);
    float t = fogT(d);
    // La malla del fondo se va hacia el azul del aire; la de delante conserva su
    // zona. El azul es oscuro a propósito: el blending es aditivo y una bruma
    // clara *sumaría* luz a las aristas en vez de alejarlas.
    vColor = mix(aColor, ${FOG_HAZE}, t * 0.45);
    if (aDim <= 1.0 && d > uFar) {
      vFade = 0.0;
    } else {
      // aExp normaliza la tinta por longitud; el camino resaltado va exento.
      float ex = aDim > 1.0 ? 1.0 : aExp;
      vFade = mix(1.0, ${FOG_FLOOR}, t) * min(aDim, 1.0) * ex;
    }
  }`;

const EDGE_FRAG = /* glsl */ `
  uniform float uBright;
  varying vec3 vColor;
  varying float vFade;
  varying float vGain;
  varying float vBoost;
  void main() {
    if (vFade <= 0.005) discard;
    // El camino cambia tono de zona por visibilidad: un hilo de un píxel con el
    // color de su zona es invisible sobre negro. Igual que en render.wgsl.
    vec3 lit = vColor * uBright * vGain;
    gl_FragColor = vec4(mix(lit, vec3(1.0), clamp(vBoost * 0.6, 0.0, 0.85)), vFade);
  }`;

/** Margen del polo, igual que en `gpu/camera.ts`: con la vista casi paralela al
 *  `up` fijo, `lookAt` degenera y la imagen pega un giro salvaje al llegar
 *  arriba o abajo. Dos grados bastan para que el tope se sienta como un tope. */
const EPS = 0.035;

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
  /** Tope de alejamiento, en unidades de mundo. El mismo múltiplo del encuadre
   *  completo que usa el motor WebGPU: el freno no puede depender de si la
   *  máquina tiene la bandera de WebGPU puesta. */
  private maxDistance = Infinity;
  private theta = 0;
  private phi = Math.PI / 2;

  /** `orbit`: el centro de la órbita **no se mueve**, ni con teclas ni con el
   *  ratón — la galaxia se queda quieta y sólo se gira alrededor de ella.
   *  `fly`: cámara libre con joystick. */
  private cameraMode: FlyMode = 'orbit';
  /** Modo atractor: la galaxia gira sola cuando nadie la toca. */
  private attracting = false;
  private joyActive = false;
  private joyStartX = 0;
  private joyStartY = 0;
  private joyCurX = 0;
  private joyCurY = 0;
  private dragging = 0;
  private vDist = 0;
  private vTheta = 0;
  private vPhi = 0;
  /** Vuelo en curso hacia una palabra o un camino. Misma interpolación que el
   *  motor WebGPU (k = 0,14): enfocar es parte del gesto de seleccionar, y sin
   *  ella el respaldo teletransportaba la cámara. */
  private flyTarget: THREE.Vector3 | null = null;
  private flyDistance = 0;
  /** Longitud media de arista: la unidad con la que se encuadra un vecindario. */
  private meanEdge = 1;
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
    this.maxDistance = this.distance * ZOOM_OUT;
    this.theta = 0;
    this.phi = Math.PI / 2;
    this.camera.position.copy(this.eye());
    this.camera.lookAt(this.target);

    // Muestreo, no el barrido entero: con 147.000 aristas la media se estima
    // igual de bien con una de cada diez y el arranque no se nota.
    {
      const m = g.uniqueEdges.length / 2;
      const stride = Math.max(1, Math.floor(m / 20000));
      let sum = 0, count = 0;
      for (let e = 0; e < m; e += stride) {
        const a = g.uniqueEdges[e * 2], b = g.uniqueEdges[e * 2 + 1];
        sum += Math.hypot(g.positions[a * 3] - g.positions[b * 3],
                          g.positions[a * 3 + 1] - g.positions[b * 3 + 1],
                          g.positions[a * 3 + 2] - g.positions[b * 3 + 2]);
        count++;
      }
      this.meanEdge = count ? sum / count : this.radius * 0.1;
    }

    this.home = {
      target: this.target.clone(),
      distance: this.distance,
      theta: this.theta,
      phi: this.phi
    };
    this.fly.onHome = () => this.goHome();
    this.fly.attach();
    this.attach(canvas);

    this.buildNodes();
    this.buildEdges();

    this.resize();
    addEventListener("resize", this.resize);
    this.loop();
  }

  /** Vista completa. Método y no un cierre dentro de `onHome` porque ahora
   *  tiene dos disparadores: la tecla `Inicio` y el botón de la barra. El
   *  nombre lleva `go` porque `home` ya es el estado guardado del encuadre. */
  goHome() {
    this.fly.stop();   // sin esto la inercia sigue derivando tras aterrizar
    this.flyTarget = null;   // ni un vuelo pendiente tirando hacia otro sitio
    this.target.copy(this.home.target);
    this.distance = this.home.distance;
    this.theta = this.home.theta;
    this.phi = this.home.phi;
    this.vDist = 0;
  }

  /** Deriva en reposo. Aquí no hay salto de frame que levantar —este motor
   *  dibuja siempre— así que basta con encender la bandera. */
  setAttract(on: boolean) { this.attracting = on; }

  /** La órbita, para escribirla en un enlace. Los mismos seis números que el
   *  motor WebGPU: un encuadre compartido desde aquí abre igual allí. */
  state(): CamState {
    return {
      t: [this.target.x, this.target.y, this.target.z],
      d: this.distance,
      th: this.theta,
      ph: this.phi,
    };
  }

  setState(s: CamState) {
    this.fly.stop();
    this.flyTarget = null;
    this.vTheta = this.vPhi = this.vDist = 0;
    this.target.set(s.t[0], s.t[1], s.t[2]);
    this.distance = Math.min(s.d, this.maxDistance);
    this.theta = s.th;
    this.phi = Math.min(Math.PI - EPS, Math.max(EPS, s.ph));
  }

  setCameraMode(mode: FlyMode) {
    if (mode === this.cameraMode) return;
    this.cameraMode = mode;
    // El teclado tiene que enterarse: si no, WASD seguiría trasladando.
    this.fly.setMode(mode);
    this.dragging = 0;
    this.joyActive = false;
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
        uFogNear: { value: 0 }, uFogSpan: { value: this.radius },
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
    const exp = new Float32Array(m * 2);
    const ref = this.radius * EXP_REF;

    for (let e = 0; e < m; e++) {
      const a = uniqueEdges[e * 2], b = uniqueEdges[e * 2 + 1];
      for (let k = 0; k < 3; k++) {
        pos[e * 6 + k] = positions[a * 3 + k];
        pos[e * 6 + 3 + k] = positions[b * 3 + k];
      }
      // Exposición: el aditivo suma luz *por píxel rasterizado*, así que una
      // arista larga aporta muchísima más tinta que una corta contando la misma
      // relación kNN. En esta nube el 7% de las aristas más largas pone el 37%
      // de la tinta. Se normaliza a partir de `ref` para que cada relación pese
      // parecido; el suelo evita borrar los radios del todo.
      const dx = positions[a * 3] - positions[b * 3];
      const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
      const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
      const len = Math.hypot(dx, dy, dz);
      const ex = Math.max((ref / Math.max(ref, len)) ** EXP_SOFT, EXP_FLOOR);
      exp[e * 2] = ex;
      exp[e * 2 + 1] = ex;
      for (let k = 0; k < 3; k++) {
        col[e * 6 + k] = zone[a * 3 + k];
        col[e * 6 + 3 + k] = zone[b * 3 + k];
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aExp", new THREE.BufferAttribute(exp, 1));
    this.edgeDim = new THREE.BufferAttribute(dim, 1);
    geo.setAttribute("aDim", this.edgeDim);

    this.lines = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG,
      uniforms: {
        uFar: { value: this.radius * 5.0 },
        uBright: { value: Math.min(0.34, 0.34 * 15949 / m) },
        uSelEdge: { value: selEdgeFor(Math.min(0.34, 0.34 * 15949 / m)) },
        uFogNear: { value: 0 }, uFogSpan: { value: this.radius },
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
    tiers(this.g, id, this.nodeDim.array as Float32Array);
    this.spreadDim();
  }

  /** El destello del atractor. Ver `spotTiers`: la galaxia no se atenúa. */
  spotlight(id: number | null) {
    this.selected = id;
    spotTiers(this.g, id, this.nodeDim.array as Float32Array);
    this.spreadDim();
  }

  /** Resalte de un camino. Ver `pathTiers`: mismos escalones, otro reparto. */
  selectPath(path: number[] | null) {
    this.selected = path && path.length ? path[path.length - 1] : null;
    pathTiers(this.g, path, this.nodeDim.array as Float32Array);
    this.spreadDim();
  }

  /** Sin storage buffers, cada extremo de arista lleva su copia del escalón:
   *  el mismo degradado que el motor WebGPU saca gratis en el vertex shader. */
  private spreadDim() {
    const { uniqueEdges } = this.g;
    const nd = this.nodeDim.array as Float32Array;
    const ed = this.edgeDim.array as Float32Array;
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
    const joy = createJoystick(el);

    const down = (e: PointerEvent) => {
      this.flyTarget = null; // Interrumpir vuelo automático al hacer click o arrastrar
      // El arrastre secundario desplaza el centro, así que en órbita no existe:
      // todo arrastre gira. La galaxia se queda donde está.
      const pan = e.button === 2 || e.shiftKey;
      this.dragging = pan && this.cameraMode === 'fly' ? 2 : 1;
      this.joyStartX = e.clientX;
      this.joyStartY = e.clientY;
      this.joyCurX = e.clientX;
      this.joyCurY = e.clientY;
      this.joyActive = true;
      if (this.cameraMode === 'fly') {
        joy.show(e.clientX, e.clientY);
      }
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!this.joyActive) return;
      this.flyTarget = null; // Interrumpir vuelo automático al arrastrar
      const dx = e.clientX - this.joyCurX;
      const dy = e.clientY - this.joyCurY;
      this.joyCurX = e.clientX;
      this.joyCurY = e.clientY;
      if (this.cameraMode === 'fly') {
        joy.update(this.joyCurX - this.joyStartX, this.joyCurY - this.joyStartY);
      } else {
        this.vTheta -= dx * 0.005;
        this.vPhi -= dy * 0.005;
      }
    };
    const up = (e: PointerEvent) => {
      this.joyActive = false;
      this.dragging = 0;
      joy.hide();
      el.releasePointerCapture?.(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.flyTarget = null; // Interrumpir vuelo automático al hacer zoom
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
      joy.hide();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
    };
  }

  /** Vuelo con teclado. En modo vuelo se mueve el objetivo además del ojo, así
   *  que se atraviesa la nube en vez de rodearla; en órbita no se toca el
   *  objetivo y las teclas sólo giran y acercan. */
  /** Enfoca una palabra: vuela hasta ella y encuadra su vecindario.
   *
   *  En WebGPU esto cuesta leer 16 bytes de la GPU; aquí las posiciones ya
   *  están en CPU y es una lectura del array. Que existiera sólo en el motor
   *  WebGPU era justo el fallo contra el que avisa el `CLAUDE.md`: en esta
   *  máquina el camino que se ve al abrir el navegador es éste, así que el
   *  vuelo al seleccionar parecía roto. */
  focus(id: number) {
    const { positions } = this.g;
    this.flyToPoint(new THREE.Vector3(positions[id * 3], positions[id * 3 + 1],
                                      positions[id * 3 + 2]),
                    this.meanEdge * 5);
  }

  /** Encuadra un camino entero: centroide y radio que lo cubre. */
  focusPath(path: number[]) {
    if (!path.length) return;
    const { positions } = this.g;
    const c = new THREE.Vector3();
    for (const id of path) {
      c.x += positions[id * 3]; c.y += positions[id * 3 + 1]; c.z += positions[id * 3 + 2];
    }
    c.divideScalar(path.length);
    let far = 0;
    for (const id of path) {
      far = Math.max(far, Math.hypot(positions[id * 3] - c.x,
                                     positions[id * 3 + 1] - c.y,
                                     positions[id * 3 + 2] - c.z));
    }
    this.flyToPoint(c, Math.max(far * 1.35, this.meanEdge * 5));
  }

  private flyToPoint(p: THREE.Vector3, distance: number) {
    this.fly.stop();   // la inercia pendiente pelea contra la interpolación
    this.flyTarget = p;
    this.flyDistance = distance;
  }

  /** Un paso de la interpolación del vuelo. Aterriza en seco cuando ya está
   *  cerca: si no, la exponencial se acerca para siempre sin llegar. */
  private flyLerp() {
    const t = this.flyTarget;
    if (!t) return;
    const k = 0.08;
    this.target.lerp(t, k);
    this.distance += (this.flyDistance - this.distance) * k;
    if (this.target.distanceTo(t) < this.flyDistance * 0.004 &&
        Math.abs(this.distance - this.flyDistance) < this.flyDistance * 0.01) {
      this.target.copy(t);
      this.distance = this.flyDistance;
      this.flyTarget = null;
    }
  }

  private flyStep() {
    if (this.fly.active()) {
      this.flyTarget = null;
    }
    if (!this.fly.active()) { this.fly.read(); return; }
    const k = this.fly.read();

    this.theta += k.yaw;
    this.phi = Math.min(Math.PI - EPS, Math.max(EPS, this.phi + k.pitch));
    this.distance *= 1 + k.zoom;

    if (this.cameraMode === 'fly' && (k.fwd || k.side || k.vert)) {
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
    this.flyLerp();
    this.flyStep();

    // La deriva del atractor, tapada por cualquier gesto: mientras haya vuelo,
    // arrastre o tecla, la galaxia obedece en vez de irse sola.
    if (this.attracting && !this.flyTarget && !this.dragging && !this.fly.active()) {
      this.theta += ATTRACT_YAW;
    }

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
          this.phi = Math.min(Math.PI - EPS, Math.max(EPS, this.phi + speedY));

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
    this.phi = Math.min(Math.PI - EPS, Math.max(EPS, this.phi + this.vPhi));
    this.distance *= 1 + this.vDist;
    this.vTheta *= 0.86;
    this.vPhi *= 0.86;
    this.vDist *= 0.82;

    // El tope de alejamiento, igual que en `gpu/camera.ts`: se aplica al final
    // del paso, y cortando la inercia para que el tope se sienta como un tope
    // y no como un mando que ha dejado de responder.
    if (this.distance > this.maxDistance) {
      this.distance = this.maxDistance;
      if (this.vDist > 0) this.vDist = 0;
    }

    const eyePos = this.eye();
    this.camera.position.copy(eyePos);
    this.camera.lookAt(this.target);

    // Actualización dinámica de uFar (draw distance) según la distancia de la cámara al objetivo.
    const dist = this.camera.position.distanceTo(this.target);
    const uFarValue = Math.min(this.radius * 5.0, dist * 2.0);
    // Tramo de bruma, atado a la órbita y no al radio de la nube: lo que se mira
    // queda siempre a media bruma. El suelo evita que al entrar en el núcleo
    // (distancia ≈ 0) la bruma colapse a un plano. Igual que `engine.ts`.
    const fogSpan = Math.max(dist, this.radius * 0.35) * 2.3;
    const fogNear = dist - fogSpan * 0.45;
    for (const o of [this.points, this.lines]) {
      const u = (o.material as THREE.ShaderMaterial).uniforms;
      u.uFar.value = uFarValue;
      u.uFogNear.value = fogNear;
      u.uFogSpan.value = fogSpan;
    }

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
