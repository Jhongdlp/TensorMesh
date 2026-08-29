// Sala 07 — Red Neuronal. Cuatro dibujos y un solo grupo de enlace.
//
// El reparto es el de siempre en el atlas: aristas aditivas (la malla suma
// luz), discos con antialiasing por `fwidth` y el tamaño en píxeles con suelo
// mínimo, para que un nodo nunca se vuelva imposible de apuntar al alejarse.
//
// Lo propio de esta sala es el suelo: una textura que la CPU rellena con la
// salida de la red sobre el cuadrado de entrada. No es un adorno bajo la red,
// es *la función que la red calcula*; la malla de arriba son sus coeficientes.

struct Uni {
  viewProj   : mat4x4f,  //   0
  camPos     : vec4f,    //  64
  projXX     : f32,      //  80
  projYY     : f32,      //  84
  vpX        : f32,      //  88
  vpY        : f32,      //  92
  time       : f32,      //  96
  wave       : f32,      // 100  frente de la señal, en unidades de capa
  flowDir    : f32,      // 104  +1 hacia delante, -1 retropropagando
  edgeGain   : f32,      // 108
  fieldAlpha : f32,      // 112
  floorHalf  : f32,      // 116
  floorY     : f32,      // 120
  gridAlpha  : f32,      // 124
  pulseCol   : vec4f,    // 128
  pulseSize  : f32,      // 144
  nodeGain   : f32,      // 148
  pad0       : f32,      // 152
  pad1       : f32,      // 156
};

@group(0) @binding(0) var<uniform> U   : Uni;
@group(0) @binding(1) var fieldTex     : texture_2d<f32>;
@group(0) @binding(2) var fieldSmp     : sampler;

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
  vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
);

// Perspectiva aérea: lo lejano se apaga hacia la bruma. Sin esto una red de
// cuatro capas se ve plana, porque todas sus aristas miden lo mismo.
const HAZE = vec3f(0.07, 0.09, 0.16);

fn fogT(clipW : f32) -> f32 {
  let t = clamp((clipW - 2.0) / 6.0, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// --------------------------------------------------------------- 1. el suelo

struct VOutFloor {
  @builtin(position) clip : vec4f,
  @location(0)       uv   : vec2f,
};

@vertex
fn vsFloor(@builtin(vertex_index) vid : u32) -> VOutFloor {
  let c = CORNERS[vid];
  let h = U.floorHalf;
  var out : VOutFloor;
  out.clip = U.viewProj * vec4f(c.x * h, U.floorY, c.y * h, 1.0);
  out.uv = vec2f(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5);
  return out;
}

/** Curvas de nivel de ancho constante en pantalla, como en la sala 02.
 *
 *  El color solo dice de qué lado cae cada punto; las curvas dicen **cuánto**
 *  cambia la respuesta al moverse. Se apiñan donde la red pasa de una clase a
 *  otra en nada y se abren donde está tranquila, así que la anchura de la
 *  banda apretada es, literalmente, lo afilada que es la frontera. */
fn band(v : f32, n : f32) -> f32 {
  let t = v * n;
  let d = abs(fract(t + 0.5) - 0.5) / max(fwidth(t), 1e-5);
  return 1.0 - smoothstep(0.0, 1.1, d);
}

@fragment
fn fsFloor(in : VOutFloor) -> @location(0) vec4f {
  let tex = textureSample(fieldTex, fieldSmp, in.uv);
  // El valor crudo viaja en el alfa de la misma textura. Con una segunda
  // textura habría que mantener dos escrituras sincronizadas para pintar una
  // línea; el canal que sobra ya estaba pagado.
  var rgb = tex.rgb + vec3f(band(tex.a, 10.0) * 0.075);
  // El borde se apaga en vez de cortarse: un canto recto se lee como un error
  // de recorte, y este plano no tiene borde en el problema, sólo en la pantalla.
  let d = max(abs(in.uv.x - 0.5), abs(in.uv.y - 0.5)) * 2.0;
  let edge = 1.0 - smoothstep(0.86, 1.0, d);
  return vec4f(rgb, U.fieldAlpha * edge);
}

// ------------------------------------------------------- 2. líneas y aristas

struct LineIn {
  @location(0) pos : vec4f,  // xyz mundo, w = ganancia (1 malla, 0 rejilla)
  @location(1) col : vec4f,
};

struct VOutLine {
  @builtin(position) clip : vec4f,
  @location(0)       rgb  : vec3f,
  @location(1)       a    : f32,
};

@vertex
fn vsLine(in : LineIn) -> VOutLine {
  var out : VOutLine;
  out.clip = U.viewProj * vec4f(in.pos.xyz, 1.0);
  let t = fogT(out.clip.w);
  let gain = mix(1.0, U.edgeGain, in.pos.w);
  out.rgb = mix(in.col.rgb * gain, HAZE, t * 0.5);
  out.a = in.col.a * mix(1.0, 0.35, t);
  return out;
}

@fragment
fn fsLine(in : VOutLine) -> @location(0) vec4f {
  return vec4f(in.rgb, in.a);
}

// ------------------------------------------------------- 3. nodos y neuronas

struct NodeIn {
  @location(0) posSize : vec4f,  // xyz, radio en mundo
  @location(1) color   : vec4f,  // rgb, alfa
  @location(2) flags   : vec4f,  // x: 0 punto · 1 neurona · 2 aro, y: brillo,
                                 // z: suelo en px, w: pulso de latido
};

struct VOutNode {
  @builtin(position) clip : vec4f,
  @location(0)       uv   : vec2f,
  @location(1)       rgb  : vec3f,
  @location(2)       a    : f32,
  @location(3)       kind : f32,
  @location(4)       glow : f32,
};

@vertex
fn vsNode(@builtin(vertex_index) vid : u32, node : NodeIn) -> VOutNode {
  var out : VOutNode;
  var clip = U.viewProj * vec4f(node.posSize.xyz, 1.0);
  let corner = CORNERS[vid % 6u];

  let beat = 1.0 + node.flags.w * 0.16 * sin(U.time * 5.0 + node.posSize.x * 3.0);
  let r = node.posSize.w * beat;
  // **Sin** `* clip.w`: el radio va en clip y la división por w lo encoge con
  // la distancia, que es lo que hace que una neurona se lea como un objeto
  // dentro de la escena. Multiplicando por w el tamaño sale constante en
  // pantalla —lo correcto para un punto de dato, no para una esfera— y la red
  // entera se convierte en un montón de bolas apiladas del mismo tamaño.
  var ox = r * U.projXX;
  var oy = r * U.projYY;

  // Suelo en píxeles: un punto de medio píxel no se puede ni ver ni apuntar.
  let floorClip = node.flags.z * 2.0 * clip.w;
  ox = max(ox, floorClip / max(1.0, U.vpX));
  oy = max(oy, floorClip / max(1.0, U.vpY));

  clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, clip.z, clip.w);

  let t = fogT(clip.w);
  out.clip = clip;
  out.uv = corner;
  out.rgb = mix(node.color.rgb, HAZE, t * 0.35);
  out.a = node.color.a * mix(1.0, 0.55, t);
  out.kind = node.flags.x;
  out.glow = node.flags.y;
  return out;
}

@fragment
fn fsNode(in : VOutNode) -> @location(0) vec4f {
  let r = length(in.uv);
  let aa = max(fwidth(r), 0.0001);

  // Aro de selección: sólo el filo, para que no tape a la neurona que marca.
  if (in.kind > 1.5) {
    let ring = smoothstep(0.74 - aa * 2.0, 0.78, r) * (1.0 - smoothstep(0.94, 0.94 + aa * 2.0, r));
    if (ring * in.a <= 0.01) { discard; }
    return vec4f(in.rgb, ring * in.a);
  }

  let disc = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
  if (disc * in.a <= 0.01) { discard; }

  // Los puntos del conjunto son discos planos con núcleo claro: son dato, no
  // objeto, y una esfera sombreada por cada uno convertiría la nube en grava.
  if (in.kind < 0.5) {
    // Núcleo claro y un filo casi negro. Sin el filo, un punto rosa sobre la
    // zona rosa del campo desaparece justo donde más falta hace verlo: en el
    // lado donde la red *acierta*.
    let core = 1.0 - smoothstep(0.22, 0.58, r);
    let halo = smoothstep(0.58, 0.82, r);
    let col = mix(mix(in.rgb, vec3f(1.0), core * 0.55), vec3f(0.02, 0.03, 0.05), halo * 0.85);
    return vec4f(col, disc * in.a);
  }

  // La neurona sí es un objeto: normal reconstruida del propio cuadrado,
  // difuso, filo y un especular duro. Es lo que la separa del dato de un
  // vistazo, sin leyenda y sin etiqueta.
  let z = sqrt(max(0.0, 1.0 - min(r * r, 1.0)));
  let n = normalize(vec3f(in.uv, z));
  let l = normalize(vec3f(-0.42, 0.66, 0.62));
  let dif = max(dot(n, l), 0.0);
  let rim = pow(1.0 - z, 2.6);
  let spec = pow(max(dot(reflect(-l, n), vec3f(0.0, 0.0, 1.0)), 0.0), 22.0);
  var col = in.rgb * (0.30 + 0.80 * dif + in.glow * 0.9);
  col += in.rgb * rim * 0.75 + vec3f(spec * 0.55);
  return vec4f(col, disc * in.a);
}

// ------------------------------------------------------------- 4. los pulsos

struct PulseIn {
  @location(0) a     : vec4f,  // origen xyz, w = índice de capa
  @location(1) b     : vec4f,  // destino xyz, w = desfase por arista
  @location(2) mag   : vec4f,  // x: magnitud hacia delante, y: hacia atrás
};

struct VOutPulse {
  @builtin(position) clip : vec4f,
  @location(0)       uv   : vec2f,
  @location(1)       a    : f32,
};

@vertex
fn vsPulse(@builtin(vertex_index) vid : u32, p : PulseIn) -> VOutPulse {
  var out : VOutPulse;
  // El frente avanza capa a capa: `wave` va de 0 a L y vuelve. Que la
  // dirección salga del *sentido* de `wave` y no de una bandera es lo que
  // hace que ida y vuelta usen exactamente el mismo dibujo.
  let t = U.wave - p.a.w - p.b.w * 0.14;
  let corner = CORNERS[vid % 6u];

  if (t <= 0.0 || t >= 1.0) {
    // Fuera del frente: cuadrado degenerado detrás de la cámara. Descartar en
    // el fragmento costaría rasterizar igual.
    out.clip = vec4f(0.0, 0.0, -2.0, 1.0);
    out.uv = corner;
    out.a = 0.0;
    return out;
  }

  let world = mix(p.a.xyz, p.b.xyz, t);
  var clip = U.viewProj * vec4f(world, 1.0);
  var ox = U.pulseSize * U.projXX;
  var oy = U.pulseSize * U.projYY;
  let floorClip = 1.6 * 2.0 * clip.w;
  ox = max(ox, floorClip / max(1.0, U.vpX));
  oy = max(oy, floorClip / max(1.0, U.vpY));
  clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, clip.z, clip.w);

  let fade = smoothstep(0.0, 0.16, t) * smoothstep(0.0, 0.16, 1.0 - t);
  let m = select(p.mag.y, p.mag.x, U.flowDir > 0.0);

  out.clip = clip;
  out.uv = corner;
  out.a = fade * m;
  return out;
}

@fragment
fn fsPulse(in : VOutPulse) -> @location(0) vec4f {
  let r = length(in.uv);
  if (in.a <= 0.004) { discard; }
  let core = 1.0 - smoothstep(0.0, 1.0, r);
  let a = core * core * in.a;
  if (a <= 0.004) { discard; }
  return vec4f(U.pulseCol.rgb, a);
}
