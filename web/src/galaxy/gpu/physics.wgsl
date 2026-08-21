// Layout LinLog (Noack) con repulsión por muestreo negativo.
//
// La repulsión honesta es O(n²); anvaka la resolvió con Barnes-Hut sobre un
// octree, difícil de portar a GPU. Aquí cada nodo se compara con K nodos al azar
// y el resultado se escala por n/K, lo que da un estimador insesgado en O(n) que
// cabe en un solo paso de compute.
//
// La atracción es un *gather* sobre el CSR, no un scatter sobre la lista de
// aristas: cada hilo lee los vecinos de su propio nodo y acumula en un registro.
// Eso evita atómicas por completo.
//
// El muestreo negativo se hace por **tile en memoria compartida**, no leyendo K
// posiciones sueltas del buffer global. Medido en la Vega 6: leer al azar era
// todo el coste — el paso escalaba con K (K=8 → 1,38 ms, K=32 → 3,15 ms) porque
// cada muestra es un fallo de caché sobre 800 KB. Con el tile, el workgroup trae
// 64 posiciones una sola vez y los 64 hilos muestrean de ahí: 64 lecturas
// incoherentes por workgroup en vez de 64·K, y el paso se vuelve **plano en K**
// (1,05 ms de K=8 a K=32). K deja de ser un mando de rendimiento.
//
// El precio es que los 64 nodos de un workgroup comparten esta ronda de
// muestras. Es correlación dentro del frame, no sesgo: el tile se resiembra cada
// frame con `P.frame`, así que a lo largo del recocido cada nodo ve un muestreo
// uniforme. El test estadístico contra numpy lo cubre.

struct Params {
  n       : u32,   // número de nodos
  k       : u32,   // muestras negativas por nodo
  frame   : u32,   // semilla temporal del generador
  pad     : u32,
  ks      : f32,   // fuerza de atracción
  kr      : f32,   // fuerza de repulsión
  scale   : f32,   // n/k, corrige el sesgo del muestreo
  dt      : f32,
  drag    : f32,
  alpha   : f32,   // recocido: 1 en simulación viva, decae al asentar
  fmax    : f32,   // techo de fuerza, evita que un nodo salga disparado
  gravity : f32,   // atracción al origen; 0 reproduce el modelo puro
};

@group(0) @binding(0) var<storage, read>       posIn   : array<vec4f>;
@group(0) @binding(1) var<storage, read_write> posOut  : array<vec4f>;
@group(0) @binding(2) var<storage, read_write> vel     : array<vec4f>;
@group(0) @binding(3) var<storage, read>       offsets : array<u32>;
@group(0) @binding(4) var<storage, read>       targets : array<u32>;
@group(0) @binding(5) var<storage, read>       weights : array<f32>;
@group(0) @binding(6) var<storage, read>       mass    : array<f32>;
@group(0) @binding(7) var<uniform>             P       : Params;

// PCG hash: barato, sin estado compartido y con buena decorrelación entre hilos.
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word  = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

var<workgroup> tileP : array<vec3f, 64>;
var<workgroup> tileM : array<f32, 64>;

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) gid: vec3u,
        @builtin(local_invocation_index) lane: u32,
        @builtin(workgroup_id) wg: vec3u) {
  // Sin early-return: workgroupBarrier exige control de flujo uniforme, así que
  // los hilos sobrantes del último workgroup siguen vivos y sólo se les corta la
  // escritura al final.
  let i = min(gid.x, P.n - 1u);

  // El workgroup coopera para traer 64 posiciones al azar a memoria compartida.
  // 64 lecturas incoherentes en vez de 64*K, y los K*64 muestreos salen de LDS.
  let pick = pcg(P.frame * 2246822519u + wg.x * 668265263u + lane) % P.n;
  tileP[lane] = posIn[pick].xyz;
  tileM[lane] = mass[pick];
  workgroupBarrier();

  let pi = posIn[i].xyz;
  var f  = vec3f(0.0);

  // --- atracción: magnitud constante w a lo largo de cada arista ---
  // Es la mitad que confunde a todo el mundo. En la energía de Noack
  // (Σ w·d − Σ ln d) la atracción es lineal en la *energía*, así que su
  // gradiente — la fuerza — tiene magnitud constante, no creciente.
  let a = offsets[i];
  let b = offsets[i + 1u];
  for (var j = a; j < b; j = j + 1u) {
    let d   = posIn[targets[j]].xyz - pi;
    let len = max(length(d), 1e-4);
    f += d * (P.ks * weights[j] / len);
  }

  // --- repulsión: K muestras negativas del tile, magnitud 1/d ---
  let mi = mass[i];
  var rnd = pcg(i * 2654435761u + P.frame * 40503u + 1u);
  for (var s = 0u; s < P.k; s = s + 1u) {
    rnd = pcg(rnd);
    let t  = rnd % 64u;
    let d  = pi - tileP[t];
    let d2 = dot(d, d) + 0.05;
    f += d * (P.kr * P.scale * mi * tileM[t] / d2);
  }

  f -= pi * P.gravity;

  let fl = length(f);
  if (fl > P.fmax) { f = f * (P.fmax / fl); }

  if (gid.x >= P.n) { return; }
  let v = (vel[i].xyz + f * (P.dt * P.alpha)) * P.drag;
  vel[i]    = vec4f(v, 0.0);
  posOut[i] = vec4f(pi + v * P.dt, 1.0);
}
