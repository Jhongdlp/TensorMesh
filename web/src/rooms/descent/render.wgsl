// Los caminantes.
//
// Igual que en el atlas: ningún vertex buffer. El vértice lee el mismo storage
// buffer que acaba de escribir el compute y la altura la calcula él con
// `worldOf`. Las posiciones no vuelven a la CPU.
//
// Se dibujan **dentro de la textura de estelas**, no directamente al lienzo, y
// con mezcla aditiva: cada frame suma su luz sobre la que quedaba. La prueba de
// profundidad va contra el búfer que dejó la malla del relieve, en sólo lectura,
// para que un caminante al otro lado de una loma quede tapado por ella.

struct Uni {
  viewProj : mat4x4f,   // 64
  projXX   : f32,       // proyección[0][0]: tamaño de mundo → NDC en x
  projYY   : f32,
  vpX      : f32,       // ancho del objetivo en px
  vpY      : f32,
  fogNear  : f32,
  fogSpan  : f32,
  minPx    : f32,       // radio mínimo en píxeles
  size     : f32,       // radio del caminante en unidades de mundo
  bright   : f32,       // exposición; compensa el número de caminantes vivos
  lift     : f32,       // cuánto se levanta sobre el relieve
  pad0     : f32,
  pad1     : f32,
};
// 64 + 12·4 = 112 bytes. Cualquier campo nuevo obliga a tocar
// `engine.ts:writeWalkerUni` y `test/descent.mjs` a la vez.

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

@vertex
fn vsWalker(@builtin(vertex_index) vi: u32,
            @builtin(instance_index) inst: u32) -> VOut {
  let corner = CORNERS[vi];
  let c = tint[inst];
  // El caminante va *sobre* el relieve, no dentro. Sin este levantamiento la
  // malla y el punto ocupan exactamente la misma profundidad y la prueba `less`
  // los borra a medias: aparecen y desaparecen según el ángulo.
  var w = worldOf(st[inst]);
  w.y = w.y + U.lift;
  var clip = U.viewProj * vec4f(w, 1.0);
  let t = fogT(clip.w);

  // Suelo en píxeles: por debajo de ~1,5 px un disco desaparece del todo y la
  // nube parece tener agujeros que no tiene.
  var ox = c.w * U.projXX;
  var oy = c.w * U.projYY;
  let floorClip = U.minPx * 2.0 * clip.w;
  ox = max(ox, floorClip / U.vpX);
  oy = max(oy, floorClip / U.vpY);

  var o: VOut;
  o.clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, clip.z, clip.w);
  o.rgb  = c.rgb;
  o.fade = mix(1.0, 0.25, t) * U.bright;
  o.uv   = corner;
  return o;
}

@fragment
fn fsWalker(v: VOut) -> @location(0) vec4f {
  let r  = length(v.uv);
  let aa = max(fwidth(r), 0.0001);
  let a  = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
  if (a * v.fade <= 0.002) { discard; }
  // La mezcla es aditiva (`src-alpha`, `one`), así que el alfa es la exposición
  // de este caminante en este frame y el color es su tono. La acumulación en la
  // textura es lo que convierte cuatro mil frames en una estela.
  return vec4f(v.rgb, a * v.fade);
}
