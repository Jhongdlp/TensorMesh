// Los caminantes, en dos dibujos.
//
// Igual que en el atlas: ningún vertex buffer. El vértice lee el mismo storage
// buffer que acaba de escribir el compute y la altura la calcula él con
// `worldOf`. Las posiciones no vuelven a la CPU.
//
// **Por qué dos dibujos y no uno.** La sala tenía un único paso: cuarenta mil
// discos planos de dos píxeles, en aditivo, dentro de la textura de estelas.
// Eso dibuja muy bien *el flujo* —es una exposición larga— y muy mal *un
// caminante*: lo que se veía era niebla de colores, y la pregunta que la sala
// contesta es cómo baja **uno**. Así que ahora hay dos:
//
//   · `vsWalker`/`fsWalker` → dentro de la textura de estelas, aditivo, pequeño
//     y tenue. Es el rastro: cada frame suma su luz sobre la que quedaba.
//   · `vsHead`/`fsHead`     → sobre el lienzo ya compuesto, con mezcla alfa y
//     sombreado de esfera. Es la bolita: tiene volumen, tiene brillo especular
//     y se ocluye contra el relieve.
//
// Las dos comparten uniforme, estado y tinte; lo único que cambia es el tamaño
// (`headScale`), la mezcla y el sombreado. La prueba de profundidad de ambas va
// contra el búfer que dejó la malla del relieve, en sólo lectura, para que un
// caminante al otro lado de una loma quede tapado por ella.

struct Uni {
  viewProj  : mat4x4f,   // 64
  projXX    : f32,       // proyección[0][0]: tamaño de mundo → NDC en x
  projYY    : f32,
  vpX       : f32,       // ancho del objetivo en px
  vpY       : f32,
  fogNear   : f32,
  fogSpan   : f32,
  minPx     : f32,       // radio mínimo en píxeles
  size      : f32,       // radio del caminante en unidades de mundo
  bright    : f32,       // exposición; compensa el número de caminantes vivos
  lift      : f32,       // cuánto se levanta sobre el relieve
  hLo       : f32,       // rango de altura de mundo, para el modo «altura»
  hHi       : f32,
  mode      : f32,       // 0 = color por origen · 1 = color por altura
  headScale : f32,       // cuánto más grande es la cabeza que el rastro
  pathLen   : f32,       // ranuras del anillo de los caminantes seguidos
  pathHead  : f32,       // la última escrita
  traced    : f32,
  pad0      : f32,
  pad1      : f32,
  pad2      : f32,
};
// 64 + 16·5 = 144 bytes. Cualquier campo nuevo obliga a tocar
// `engine.ts:writeWalker` y `test/descent.mjs` a la vez.

@group(0) @binding(0) var<uniform>       U    : Uni;
@group(0) @binding(1) var<storage, read> st   : array<vec2f>;
// rgb por caminante, fijado por su **origen**: dos que salieron del mismo sitio
// comparten tono, así que al converger se ve de dónde vino cada hilo del valle.
// Con Himmelblau —cuatro mínimos— eso es directamente el mapa de cuencas.
@group(0) @binding(2) var<storage, read> tint : array<vec4f>;

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
);

struct VOut {
  @builtin(position) clip : vec4f,
  @location(0)       rgb  : vec3f,
  @location(1)       fade : f32,
  @location(2)       uv   : vec2f,
};

// Perspectiva aérea, con el mismo argumento que en el atlas: sin ella una nube
// de puntos se lee como un cartel y no como un cuerpo.
fn fogT(w: f32) -> f32 {
  return clamp((w - U.fogNear) / max(U.fogSpan, 1e-4), 0.0, 1.0);
}

/** Rampa del modo «altura»: caliente arriba, frío abajo.
 *
 *  Es la lectura que le faltaba a la sala. Con el color por origen —un tono
 *  cíclico según el ángulo desde el que se soltó— la nube es confeti: dice de
 *  dónde vino cada uno, que sólo significa algo en Himmelblau. Tiñendo por la
 *  altura **actual**, el enjambre entero se enfría según baja y «asentado» deja
 *  de ser una palabra del HUD para ser algo que se ve.
 *
 *  Los extremos están elegidos contra el relieve, no en abstracto: rojo sobre
 *  la cima ámbar y cian pálido sobre el fondo azul marino. Al revés, el
 *  caminante desaparecería justo donde hay que seguirlo. */
fn heatRamp(t: f32) -> vec3f {
  let u = clamp(t, 0.0, 1.0);
  let c0 = vec3f(0.62, 1.00, 0.98);   // fondo: cian pálido, casi blanco
  let c1 = vec3f(0.45, 0.86, 1.00);
  let c2 = vec3f(1.00, 0.78, 0.36);
  let c3 = vec3f(1.00, 0.30, 0.16);   // cima: rojo
  if (u < 0.33) { return mix(c0, c1, u / 0.33); }
  if (u < 0.66) { return mix(c1, c2, (u - 0.33) / 0.33); }
  return mix(c2, c3, (u - 0.66) / 0.34);
}

fn colourOf(inst: u32, h: f32) -> vec3f {
  if (U.mode < 0.5) { return tint[inst].rgb; }
  return heatRamp((h - U.hLo) / max(U.hHi - U.hLo, 1e-4));
}

/** El quad de un caminante, con suelo en píxeles.
 *
 *  Por debajo de ~1,5 px un disco desaparece del todo y la nube parece tener
 *  agujeros que no tiene. El caminante va además *sobre* el relieve, no dentro:
 *  sin el levantamiento, punto y malla ocupan exactamente la misma profundidad
 *  y la prueba `less` los borra a medias — aparecen y desaparecen según el
 *  ángulo. */
fn quadOf(inst: u32, vi: u32, scale: f32, floorPx: f32) -> VOut {
  let corner = CORNERS[vi];
  var w = worldOf(st[inst]);
  w.y = w.y + U.lift;
  var clip = U.viewProj * vec4f(w, 1.0);

  let rw = tint[inst].w * scale;
  var ox = rw * U.projXX;
  var oy = rw * U.projYY;
  let floorClip = floorPx * 2.0 * clip.w;
  ox = max(ox, floorClip / U.vpX);
  oy = max(oy, floorClip / U.vpY);

  var o: VOut;
  o.clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, clip.z, clip.w);
  o.rgb  = colourOf(inst, w.y);
  o.fade = fogT(clip.w);
  o.uv   = corner;
  return o;
}

// ------------------------------------------------------------------- el rastro

@vertex
fn vsWalker(@builtin(vertex_index) vi: u32,
            @builtin(instance_index) inst: u32) -> VOut {
  var o = quadOf(inst, vi, 1.0, U.minPx);
  o.fade = mix(1.0, 0.25, o.fade) * U.bright;
  return o;
}

@fragment
fn fsWalker(v: VOut) -> @location(0) vec4f {
  let r  = length(v.uv);
  let aa = max(fwidth(r), 0.0001);
  let edge = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
  // Núcleo caliente y falda tenue en vez de un disco plano: la traza que deja
  // un disco es una cinta de borde duro, y la de esto es un hilo con centro,
  // que es lo que se parece a un rastro.
  let core = exp(-r * r * 2.6);
  let a = edge * (0.28 + 0.72 * core);
  if (a * v.fade <= 0.002) { discard; }
  // La mezcla es aditiva (`src-alpha`, `one`), así que el alfa es la exposición
  // de este caminante en este frame y el color es su tono. La acumulación en la
  // textura es lo que convierte cuatro mil frames en una estela.
  return vec4f(v.rgb, a * v.fade);
}

// ------------------------------------------------------------------ la bolita

@vertex
fn vsHead(@builtin(vertex_index) vi: u32,
          @builtin(instance_index) inst: u32) -> VOut {
  // El suelo en píxeles sube con el tamaño: una cabeza que se queda en 1,35 px
  // en la lejanía vuelve a ser el confeti del que veníamos.
  return quadOf(inst, vi, U.headScale, U.minPx * 1.9);
}

@fragment
fn fsHead(v: VOut) -> @location(0) vec4f {
  let r2 = dot(v.uv, v.uv);
  if (r2 > 1.0) { discard; }
  // Normal de esfera reconstruida del propio quad. No hay geometría: el disco
  // *finge* volumen, y con eso basta — es lo que separa «una bolita rodando»
  // de «un punto de color», que era todo el problema.
  let z = sqrt(max(1.0 - r2, 0.0));
  let n = vec3f(v.uv, z);
  let L = normalize(vec3f(-0.42, 0.52, 0.74));
  let lam = max(dot(n, L), 0.0);
  // Brillo especular pequeño y duro: es el único detalle que dice «esfera» a
  // cuatro píxeles de radio. Sin él, la iluminación difusa sola se lee como un
  // degradado y la bolita vuelve a ser una mancha.
  let spec = pow(max(dot(reflect(-L, n), vec3f(0.0, 0.0, 1.0)), 0.0), 24.0);
  // Y un filo en el contorno, que la despega del relieve cuando el fondo tiene
  // por casualidad el mismo tono.
  let rim = pow(1.0 - z, 3.0) * 0.45;

  var c = v.rgb * (0.26 + 0.88 * lam) + v.rgb * rim + vec3f(1.0) * spec * 0.6;
  c = mix(c, c * 0.42, v.fade);

  let r = sqrt(r2);
  let aa = max(fwidth(r), 0.0001);
  let a = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
  return vec4f(c, a * mix(1.0, 0.55, v.fade));
}

// ------------------------------------------------- el camino de los cinco
//
// Los mismos quads, pero leyendo del anillo en vez del estado: una cuenta por
// posición guardada. **Puntos sueltos y no una línea**, y no es por comodidad:
// el descenso es discreto —mira la pendiente, da un paso, repite— y una línea
// continua cuenta otra cosa. Además una línea en WebGPU mide un píxel y punto,
// mientras que un quad se puede engordar, apagar por edad y dejar en la
// distancia el mismo tamaño mínimo que todo lo demás.
//
// El orden importa: el vértice `j` lee la ranura `head + 1 + j`, o sea del más
// **viejo** al más nuevo. Así la edad es una rampa limpia y no hay costura por
// donde el anillo da la vuelta.

@group(0) @binding(3) var<storage, read> path : array<vec2f>;

@vertex
fn vsTrace(@builtin(vertex_index) vi: u32,
           @builtin(instance_index) inst: u32) -> VOut {
  let len = max(u32(U.pathLen), 1u);
  let w = inst / len;
  let j = inst % len;
  let slot = (u32(U.pathHead) + 1u + j) % len;

  var wp = worldOf(path[w * len + slot]);
  wp.y = wp.y + U.lift;
  var clip = U.viewProj * vec4f(wp, 1.0);

  // 0 el rastro más viejo, 1 el que acaba de dejar la canica. El tamaño y la
  // luz suben con la edad, así que el camino **apunta**: se ve de dónde viene y
  // hacia dónde va sin una sola flecha.
  let age = f32(j) / f32(max(len - 1u, 1u));
  let rw = tint[w].w * (0.13 + 0.26 * age);
  var ox = rw * U.projXX;
  var oy = rw * U.projYY;
  let floorClip = U.minPx * 1.1 * 2.0 * clip.w;
  ox = max(ox, floorClip / U.vpX);
  oy = max(oy, floorClip / U.vpY);

  let corner = CORNERS[vi];
  var o: VOut;
  o.clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, clip.z, clip.w);
  o.rgb  = colourOf(w, wp.y);
  o.fade = (0.10 + 0.80 * age * age) * mix(1.0, 0.4, fogT(clip.w));
  o.uv   = corner;
  return o;
}

@fragment
fn fsTrace(v: VOut) -> @location(0) vec4f {
  let r = length(v.uv);
  if (r > 1.0) { discard; }
  let aa = max(fwidth(r), 0.0001);
  let edge = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
  let core = exp(-r * r * 1.8);
  return vec4f(v.rgb, edge * (0.25 + 0.75 * core) * v.fade);
}
