// Selección en GPU.
//
// Con las posiciones moviéndose cada frame, un raycaster de CPU o un KD-tree son
// inviables: habría que reconstruir el índice constantemente. Aquí cada hilo
// proyecta su nodo, mide la distancia al cursor en píxeles y compite por un
// único u32 con atomicMin. La distancia va en los bits altos y el índice en los
// bajos, así que el mínimo del entero *es* el nodo más cercano.
//
// Requiere n < 2^17 = 131.072 nodos, holgado para los 50.000 actuales.

struct PickU {
  viewProj : mat4x4f,
  cursor   : vec2f,   // píxeles, origen arriba-izquierda
  vp       : vec2f,   // tamaño del viewport en píxeles
  n        : u32,
  radius   : f32,     // radio de captura en píxeles
  pad0     : f32,
  pad1     : f32,
};

@group(0) @binding(0) var<uniform>             U    : PickU;
@group(0) @binding(1) var<storage, read>       pos  : array<vec4f>;
@group(0) @binding(2) var<storage, read_write> best : atomic<u32>;

const NONE : u32 = 0xFFFFFFFFu;

@compute @workgroup_size(64)
fn pick(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= U.n) { return; }

  let clip = U.viewProj * vec4f(pos[i].xyz, 1.0);
  if (clip.w <= 0.0) { return; }              // detrás de la cámara

  let ndc = clip.xy / clip.w;
  let sx  = (ndc.x * 0.5 + 0.5) * U.vp.x;
  let sy  = (1.0 - (ndc.y * 0.5 + 0.5)) * U.vp.y;
  let d   = distance(vec2f(sx, sy), U.cursor);
  if (d > U.radius) { return; }

  // 13 bits de distancia (0-128 px con 1/64 de resolución) + 17 de índice
  let dq  = u32(clamp(d, 0.0, 127.9) * 64.0);
  let key = (dq << 17u) | (i & 0x1FFFFu);
  atomicMin(&best, key);
}
