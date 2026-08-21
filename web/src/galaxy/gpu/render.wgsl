// Render de la galaxia. Dos pipelines, ningún vertex buffer.
//
// Las posiciones viven en el mismo storage buffer que escribe la física, así que
// no hay copia CPU↔GPU ni re-subida por frame. Los vértices se derivan del
// índice: las aristas indexan `edgeIdx`, los nodos usan instancing sobre un quad.

struct Uni {
  viewProj    : mat4x4f,
  camPos      : vec4f,
  projXX      : f32,   // proyección[0][0]: convierte tamaño de mundo a NDC en x
  projYY      : f32,   // proyección[1][1]: idem en y
  fogNear     : f32,   // distancia de cámara a la que empieza la bruma
  nodeBright  : f32,
  edgeBright  : f32,
  minPx       : f32,   // radio mínimo en píxeles: por debajo, el nodo no es clicable
  vpX         : f32,
  vpY         : f32,
  selScale    : f32,   // cuánto crece un nodo resaltado
  selEdge     : f32,   // cuánto brilla una arista resaltada
  fogSpan     : f32,   // grosor de la bruma, en unidades de mundo
  edgeRef     : f32,   // longitud de arista de referencia para la exposición
};
// 80 + 12 f32 = 128 bytes **justos**. El uniform está lleno: cualquier campo
// nuevo obliga a subir a 144 y a tocar `engine.ts:writeRender` y `test/render.mjs`.

@group(0) @binding(0) var<uniform>       U       : Uni;
@group(0) @binding(1) var<storage, read> pos     : array<vec4f>;
// rgb es el color de zona y lo leen sólo las aristas; los nodos son blancos.
// w es el radio en unidades de mundo.
@group(0) @binding(2) var<storage, read> colour  : array<vec4f>;  // rgb + tamaño
// Canal de resalte. Un solo f32 codifica los dos estados que necesita la
// selección, y evita un segundo buffer:
//     < 1  → atenuado (lo que no participa)
//    == 1  → normal
//     > 1  → resaltado; el exceso sobre 1 es la intensidad
@group(0) @binding(3) var<storage, read> hl      : array<f32>;
// Listas compactadas que produce la pasada de descarte. El vertex shader ya no
// recorre todos los nodos ni todas las aristas: sólo los que sobrevivieron.
@group(0) @binding(4) var<storage, read> visEdges : array<u32>;
@group(0) @binding(5) var<storage, read> visNodes : array<u32>;

struct VOut {
  @builtin(position) clip  : vec4f,
  @location(0)       rgb   : vec3f,
  @location(1)       fade  : f32,
  @location(2)       uv    : vec2f,
  @location(3)       boost : f32,
};

// --------------------------------------------------------------------- bruma
// Perspectiva aérea: lo lejano se apaga *y* se enfría. Es lo único que convierte
// una maraña plana en un volumen — sin ella el frente y el fondo de la nube
// pintan igual y la galaxia se lee como un cartel, no como un cuerpo.
//
// El tramo de bruma lo fija la cámara (`fogNear`/`fogSpan`), no un múltiplo fijo
// del radio de la nube. Con un tramo fijo la profundidad sólo se leía en vista
// completa: al acercarse, todo caía en el primer 5% de la rampa y volvía a
// aplanarse. Atado a la distancia de órbita, el centro de la vista queda siempre
// a media bruma y el relieve se lee igual de cerca que de lejos.
//
// Cuesta cero: son dos operaciones en el *vertex* shader, sobre datos que ya
// estaban en el uniform. Ni una pasada más, ni un byte más por frame.
const FOG_FLOOR = 0.18;
// El azul del aire. **Oscuro a propósito**: el blending es aditivo, así que una
// bruma clara *suma* luz a las aristas oscuras y el fondo se lava a gris azulado
// en vez de alejarse. Por debajo del brillo típico de zona, la mezcla sólo puede
// quitar croma y luz — que es exactamente lo que hace la distancia.
const HAZE = vec3f(0.09, 0.13, 0.26);

fn fogT(clipW: f32) -> f32 {
  let t = clamp((clipW - U.fogNear) / U.fogSpan, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);   // suave en los dos extremos, como el aire
}

fn depthFade(t: f32) -> f32 { return mix(1.0, FOG_FLOOR, t); }

// ---------------------------------------------------------------- exposición
// El blending es aditivo: lo que una arista aporta a la imagen no es su brillo,
// es su brillo *por su longitud rasterizada*. Y esta nube tiene una cola larguí-
// sima. Medido sobre `positions.bin` de es (147.307 aristas, radio p95 = 5.098):
//
//     mediana          0,025 r
//     p95              0,574 r
//     L > 0,50 r        7,0% de las aristas → **36,7% de la tinta**
//     L > 1,00 r        0,6% de las aristas →   5,2% de la tinta
//
// Es decir: los radios que cruzan el encuadre hasta un nodo suelto depositan
// unas 87× más luz que una arista mediana, y cada uno cuenta *una* relación kNN,
// igual que ella. La imagen sin corregir está sesgada hacia lo largo: los pocos
// radios gritan y la malla del núcleo — donde está la información — susurra.
//
// Así que se normaliza la exposición: alfa ∝ 1/longitud a partir de `edgeRef`,
// suavizado con una raíz para no borrarlos del todo. No es esconder dato — el
// radio sigue ahí, con la tinta que le toca por las relaciones que representa.
//
// La longitud se mide en **mundo**, no en pantalla, y por eso es invariante al
// zoom: al meterse en un barrio todas las aristas se hacen enormes en píxeles
// pero siguen siendo cortas en mundo, y la malla no se apaga. Con un umbral en
// píxeles esto peleaba con el lazo de presupuesto, que ya modula el brillo.
const EXP_SOFT = 0.65;   // 1 = corrección exacta; 0 = ninguna
const EXP_FLOOR = 0.10;  // ni el radio más largo desaparece del todo

fn expose(pa: vec3f, pb: vec3f) -> f32 {
  let l = length(pa - pb);
  return max(pow(U.edgeRef / max(U.edgeRef, l), EXP_SOFT), EXP_FLOOR);
}

fn alphaOf(h: f32) -> f32 { return min(h, 1.0); }
fn boostOf(h: f32) -> f32 { return max(h - 1.0, 0.0); }
// Suelo de los nodos atenuados. A 0,035 el fondo se vuelve negro y con él se va
// el sentido del lugar: la selección sale flotando en el vacío. Un 12% deja el
// polvo de estrellas justo por encima del ruido.
fn nodeAlpha(h: f32) -> f32 { return mix(0.12, 1.0, alphaOf(h)); }

// ------------------------------------------------------------------ aristas
// El número de vértices lo fija el draw indirecto; cada uno lee su nodo de la
// lista de supervivientes.
@vertex
fn vsEdge(@builtin(vertex_index) vi: u32) -> VOut {
  let i = visEdges[vi];
  // El otro extremo. `cullEdges` escribe los dos índices en huecos consecutivos
  // y siempre en pareja par/impar, así que `vi ^ 1` es el compañero — sin buffer
  // extra. Los dos vértices calculan la *misma* longitud (es simétrica), que es
  // lo que hace falta: si difiriesen, el alfa se interpolaría a lo largo del
  // segmento y la arista saldría en degradado.
  let j = visEdges[vi ^ 1u];
  let h = hl[i];
  var o: VOut;
  o.clip = U.viewProj * vec4f(pos[i].xyz, 1.0);
  let t  = fogT(o.clip.w);
  // La malla del fondo se va hacia el azul del aire; la de delante conserva su
  // zona. Así el color sigue diciendo *dónde*, pero sólo donde se está mirando.
  o.rgb  = mix(colour[i].rgb, HAZE, t * 0.45);
  // El resalte multiplica el brillo por encima de 1. La malla de fondo va a un
  // brillo bajísimo para no saturar, así que sin este empujón el camino de la
  // selección es indistinguible del resto.
  // El empujón del resalte va en el *color*, no en el alfa: el factor de mezcla
  // se recorta a 1 antes de llegar al framebuffer, así que multiplicar el alfa
  // no subía nada — el camino salía tan apagado como la malla de fondo.
  // El camino de la selección va exento: son unas decenas de aristas, son largas
  // a propósito (cruzan a los vecinos) y son justo las que se está mirando.
  let lit = max(h, hl[j]) > 1.0;
  let ex  = select(expose(pos[i].xyz, pos[j].xyz), 1.0, lit);
  o.fade = depthFade(t) * alphaOf(h) * ex;
  o.uv   = vec2f(0.0);
  o.boost = boostOf(h);
  return o;
}

@fragment
fn fsEdge(v: VOut) -> @location(0) vec4f {
  // `boost` se interpola entre los dos extremos, así que una arista que sale del
  // barrio se apaga a lo largo de su recorrido: se ve hacia dónde va.
  let lit = v.rgb * U.edgeBright * (1.0 + v.boost * U.selEdge);
  // Y el camino cambia tono de zona por visibilidad. Llevar la arista a "color
  // pleno" no basta: un hilo de un píxel con el azul de su zona sigue siendo
  // invisible sobre negro, y compite con vecinos que son discos de veinte. Lo
  // que el camino cuenta es topología, no zona, así que aquí sí se blanquea.
  return vec4f(mix(lit, vec3f(1.0), clamp(v.boost * 0.6, 0.0, 0.85)), v.fade);
}

// -------------------------------------------------------------------- nodos
// Quad de 6 vértices por instancia. El desplazamiento se calcula en espacio de
// recorte: un radio de `s` unidades de mundo son `s·projXX` de clip en x, lo que
// sale perspectivamente correcto sin dividir por w a mano.
// Profundidad del polvo de fondo: un cuanto por delante del plano lejano. El
// búfer es depth16unorm, así que 1−1/65535 es el último valor que aún pasa la
// prueba contra el borrado a 1,0 — y queda detrás de cualquier nodo real.
// Sin esto, un punto atenuado por delante de un vecino le recorta un agujero:
// gana la prueba de profundidad y pinta su gris del 12% donde iba el disco.
const DUST_Z = 0.9999847;
/** Fracción a la que cae el suelo en píxeles en el fondo de la bruma. Sub-píxel
 *  a propósito: allí un nodo debe ser una mota, no un disco. */
const DUST_PX = 0.35;

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
);

@vertex
fn vsNode(@builtin(vertex_index) vi: u32,
          @builtin(instance_index) slot: u32) -> VOut {
  let inst = visNodes[slot];
  let c = colour[inst];
  let h = hl[inst];
  let b = boostOf(h);
  let corner = CORNERS[vi];
  var clip = U.viewProj * vec4f(pos[inst].xyz, 1.0);
  // El desplazamiento del quad sólo toca x/y/z, así que `clip.w` — y con él la
  // bruma — es el mismo antes y después de moverlo.
  let t = fogT(clip.w);

  // Un nodo resaltado crece: es lo que lo separa de sus 50.000 vecinos.
  //
  // Y el atenuado encoge, con su suelo en píxeles incluido. No es cosmética:
  // los nodos escriben profundidad, así que un punto de fondo por delante de un
  // vecino le recortaba un agujero en mitad del disco. El suelo en píxeles sólo
  // existe para poder *clicar* un nodo, y al fondo no se le clica.
  let grow = (1.0 + b * U.selScale) * mix(0.4, 1.0, alphaOf(h));
  var ox = c.w * grow * U.projXX;
  var oy = c.w * grow * U.projYY;
  // Suelo en píxeles, **relajado por la bruma**. El suelo existe para poder
  // *apuntar* un nodo, no para que se vea: forzar 2 px a los 50.000 convierte el
  // fondo en confeti blanco de densidad uniforme que compite con la malla y no
  // dice nada — ni cuántos hay, ni a qué distancia. Dejando que el fondo encoja,
  // los puntos vuelven a decir profundidad, y la nebulosa recupera el primer
  // plano para ella sola.
  //
  // Clicar no sufre: `pick.wgsl` proyecta posiciones y compite por distancia con
  // su propio radio de captura de 20 px, y no mira este suelo. Y encoger el
  // fondo es además *menos* área rasterizada, no más.
  //
  // El resaltado queda exento (`b > 0`): tiene que ser localizable aunque esté
  // al otro lado de la nube, que es justo lo que hace útil volar hacia él.
  let relax = select(t, 0.0, b > 0.0);
  let floorClip = U.minPx * mix(1.0, DUST_PX, relax) * grow * 2.0 * clip.w;
  ox = max(ox, floorClip / U.vpX);
  oy = max(oy, floorClip / U.vpY);
  let z = select(clip.z, clip.w * DUST_Z, alphaOf(h) < 1.0);
  clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, z, clip.w);

  var o: VOut;
  o.clip = clip;
  // Blanco, siempre. El color vive en las aristas: un nodo teñido de su región
  // compite con la malla que lo rodea y no añade nada que la malla no diga ya.
  o.rgb  = vec3f(1.0);
  o.fade = depthFade(t) * nodeAlpha(h);
  o.uv   = corner;
  o.boost = b;
  return o;
}

@fragment
fn fsNode(v: VOut) -> @location(0) vec4f {
  // Disco plano. El halo gaussiano anterior repartía el brillo en un degradado
  // que, a menos de un píxel de radio, dejaba los nodos como manchas invisibles
  // e imposibles de apuntar. fwidth da el ancho del borde en píxeles, así que el
  // antialiasado sale correcto a cualquier distancia sin difuminar el interior.
  let r  = length(v.uv);
  let aa = max(fwidth(r), 0.0001);

  // Marcador de la palabra elegida (sólo ella pasa de boost 1): núcleo sólido
  // más un aro suelto alrededor. El quad ya viene multiplicado por selScale, así
  // que el núcleo sigue siendo mucho mayor que un nodo normal y el aro marca el
  // sitio sin convertirlo en una mancha blanca que tape a sus vecinos.
  if (v.boost > 1.0) {
    let core = 1.0 - smoothstep(0.42 - aa * 2.0, 0.42, r);
    let ring = smoothstep(0.72 - aa * 2.0, 0.72, r) *
               (1.0 - smoothstep(0.90, 0.90 + aa * 2.0, r));
    let a = max(core, ring * 0.9);
    if (a * v.fade <= 0.015) { discard; }
    return vec4f(v.rgb * U.nodeBright, a * v.fade);
  }

  // El resto: disco liso. Un vecino resaltado ya se distingue por tamaño, y
  // sobre blanco puro no queda brillo que añadir — sólo sitio.
  let a = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
  // Umbral sobre el alfa *final*: lo que no se ve tampoco debe escribir
  // profundidad, o recorta lo que tiene detrás sin pintar nada a cambio.
  if (a * v.fade <= 0.015) { discard; }
  return vec4f(v.rgb * U.nodeBright, a * v.fade);
}
