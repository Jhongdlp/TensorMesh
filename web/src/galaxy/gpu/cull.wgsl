// Descarte en GPU con dibujo indirecto.
//
// Dos pasadas de compute construyen listas compactadas de lo que realmente se
// ve, y escriben los argumentos de draw en el propio buffer. La CPU nunca sabe
// cuántos nodos ni aristas se van a dibujar: sube los mismos comandos siempre y
// la GPU decide. Es el patrón clásico de render dirigido por GPU.
//
// Tres criterios, y el tercero es el que de verdad paga:
//   · frustum — lo que queda fuera de la pantalla no cuesta nada
//   · longitud en pantalla — una arista de medio píxel rasteriza igual que una
//     de cien, y en el núcleo denso hay decenas de miles. Ahí está el overdraw.
//   · densidad (`keep`) — adelgaza la malla entera por un hash estable.
//
// El tercero existe porque los dos primeros se agotan. Medido en la Vega 6 a
// 1280×720, vista completa: de 123.061 aristas a 68.355 el dibujo sólo baja de
// 14,22 a 12,32 ms. Recortar por longitud quita las aristas *cortas*, y el coste
// vive en las largas: no es el número de aristas, es la longitud rasterizada
// total. Subir `minEdgePx` de 1,2 a 6 quita 5.700 aristas más y ahorra 2 ms.
//
// `keep` sí ataca la magnitud correcta, porque adelgaza uniformemente y se lleva
// por delante tanto largas como cortas: 0,40 deja 27.504 aristas y el dibujo baja
// a 4,92 ms — 2,1× — y con el brillo compensado por 1/keep la nebulosa suma la
// misma luz. En vista completa la malla es niebla: lo que se lee es densidad y
// color, no aristas sueltas, así que media niebla al doble de brillo se lee
// igual. Al acercarse el descarte por frustum ya deja pocas y `keep` vuelve a 1.

struct CullU {
  viewProj  : mat4x4f,
  vp        : vec2f,   // viewport en píxeles
  n         : u32,
  edgeCount : u32,
  minEdgePx : f32,     // por debajo de esto la arista no aporta nada visible
  margin    : f32,     // holgura en el frustum para el radio del nodo
  maxDist   : f32,     // rango de dibujo; 0 = sin límite
  keep      : f32,     // fracción de la malla que sobrevive; 1 = sin adelgazar
};

// Coincide con el layout de draw indirecto no indexado:
//   [vertexCount, instanceCount, firstVertex, firstInstance]
// Los nodos son instancias de un quad de 6 vértices; las aristas, vértices de
// una line-list. Por eso el contador atómico está en un campo distinto en cada
// caso, y el valor devuelto por atomicAdd sirve además como hueco de escritura.
struct DrawArgs {
  nodeVertexCount   : u32,
  nodeInstanceCount : atomic<u32>,
  nodeFirstVertex   : u32,
  nodeFirstInstance : u32,
  edgeVertexCount   : atomic<u32>,
  edgeInstanceCount : u32,
  edgeFirstVertex   : u32,
  edgeFirstInstance : u32,
};

@group(0) @binding(0) var<uniform>             U        : CullU;
@group(0) @binding(1) var<storage, read>       pos      : array<vec4f>;
@group(0) @binding(2) var<storage, read>       edgeIdx  : array<u32>;
@group(0) @binding(3) var<storage, read_write> visNodes : array<u32>;
@group(0) @binding(4) var<storage, read_write> visEdges : array<u32>;
@group(0) @binding(5) var<storage, read_write> args     : DrawArgs;
// Canal de resalte, el mismo que lee el render. Aquí sólo sirve para *eximir*:
// el camino de la selección no puede adelgazarse ni recortarse por longitud, o
// clicar una palabra le borraría parte de sus vecinos.
@group(0) @binding(6) var<storage, read>       hl       : array<f32>;

// PCG hash: el mismo de physics.wgsl. Estable por índice de arista, así que el
// subconjunto no parpadea entre frames y subir `keep` sólo *añade* aristas —
// nunca reordena las que ya estaban.
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word  = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

@compute @workgroup_size(64)
fn cullNodes(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= U.n) { return; }

  let c = U.viewProj * vec4f(pos[i].xyz, 1.0);
  if (c.w <= 0.0) { return; }                       // detrás de la cámara
  let m = U.margin * c.w;
  if (c.x < -c.w - m || c.x > c.w + m) { return; }
  if (c.y < -c.w - m || c.y > c.w + m) { return; }
  if (c.z < 0.0 || c.z > c.w) { return; }
  if (U.maxDist > 0.0 && c.w > U.maxDist) { return; }  // rango de dibujo

  let slot = atomicAdd(&args.nodeInstanceCount, 1u);
  visNodes[slot] = i;
}

@compute @workgroup_size(64)
fn cullEdges(@builtin(global_invocation_id) gid: vec3u) {
  let e = gid.x;
  if (e >= U.edgeCount) { return; }

  let a  = edgeIdx[e * 2u];
  let b  = edgeIdx[e * 2u + 1u];
  let ca = U.viewProj * vec4f(pos[a].xyz, 1.0);
  let cb = U.viewProj * vec4f(pos[b].xyz, 1.0);
  if (ca.w <= 0.0 && cb.w <= 0.0) { return; }

  // Descarte conservador: sólo si los dos extremos caen fuera por el *mismo*
  // plano. Si están fuera por planos distintos el segmento puede cruzar la
  // pantalla, y descartarlo abriría huecos en la malla.
  if (ca.x < -ca.w && cb.x < -cb.w) { return; }
  if (ca.x >  ca.w && cb.x >  cb.w) { return; }
  if (ca.y < -ca.w && cb.y < -cb.w) { return; }
  if (ca.y >  ca.w && cb.y >  cb.w) { return; }
  if (ca.z >  ca.w && cb.z >  cb.w) { return; }

  // El camino de la selección se dibuja entero, cueste lo que cueste: son unas
  // decenas de aristas y son justo las que se está mirando.
  let lit = hl[a] > 1.0 || hl[b] > 1.0;

  if (!lit && ca.w > 0.0 && cb.w > 0.0) {
    if (U.maxDist > 0.0 && min(ca.w, cb.w) > U.maxDist) { return; }
    let sa = ca.xy / ca.w * U.vp * 0.5;
    let sb = cb.xy / cb.w * U.vp * 0.5;
    if (distance(sa, sb) < U.minEdgePx) { return; }
  }

  // 2,3283064e-10 = 1/2^32: lleva el hash a [0,1).
  if (!lit && U.keep < 1.0 && f32(pcg(e)) * 2.3283064e-10 >= U.keep) { return; }

  let slot = atomicAdd(&args.edgeVertexCount, 2u);
  visEdges[slot] = a;
  visEdges[slot + 1u] = b;
}
