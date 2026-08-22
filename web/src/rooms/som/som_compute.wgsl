struct Uni {
  viewProj    : mat4x4f,   // 64 bytes
  projXX      : f32,       // 4 bytes (projection[0][0] para NDC)
  projYY      : f32,       // 4 bytes (projection[1][1])
  vpX         : f32,       // 4 bytes (viewport width en px)
  vpY         : f32,       // 4 bytes (viewport height en px)
  eta         : f32,       // 4 bytes (tasa de aprendizaje)
  sigma       : f32,       // 4 bytes (radio de vecindad)
  sampleIdx   : u32,       // 4 bytes (índice del punto objetivo muestreado)
  gridRes     : u32,       // 4 bytes (e.g., 64)
  toroidal    : u32,       // 4 bytes (1 = torus, 0 = plana)
  showTarget  : f32,       // 4 bytes (1.0 = dibujar puntos objetivo, 0.0 = ocultar)
  mode        : f32,       // 4 bytes (0 = color por grilla, 1 = color por altura)
  alpha       : f32,       // 4 bytes (opacidad de la malla)
  bright      : f32,       // 4 bytes (brillo de los puntos objetivo)
  pad1        : f32,
  pad2        : f32,
};

@group(0) @binding(0) var<uniform>          U       : Uni;
@group(0) @binding(1) var<storage, read_write> weights : array<vec4f>;
@group(0) @binding(2) var<storage, read>       targets : array<vec4f>;

// Inicializa la grilla como un plano horizontal en Z = 0
@compute @workgroup_size(256)
fn init(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  let total_nodes = U.gridRes * U.gridRes;
  if (idx >= total_nodes) {
    return;
  }
  
  let col = idx % U.gridRes;
  let row = idx / U.gridRes;
  
  // Mapear col y row a rango [-1.1, 1.1]
  let x = (f32(col) / f32(U.gridRes - 1) - 0.5) * 2.2;
  let y = (f32(row) / f32(U.gridRes - 1) - 0.5) * 2.2;
  let z = 0.0;
  
  // Guardamos las coordenadas iniciales de la grilla en el canal 'w'
  // para colorear por su topología original de forma persistente.
  let u_coord = f32(col) / f32(U.gridRes - 1);
  let v_coord = f32(row) / f32(U.gridRes - 1);
  let id_packed = u_coord + v_coord * 4096.0; // Codificación compacta en w
  
  weights[idx] = vec4f(x, y, z, id_packed);
}

// Un paso de entrenamiento del Mapa Autoorganizado
// Encuentra el BMU (Best Matching Unit) para el punto 'targets[U.sampleIdx]'
// y actualiza los pesos de toda la grilla.
var<workgroup> local_min_dist : array<f32, 256>;
var<workgroup> local_min_idx  : array<u32, 256>;
var<workgroup> bmu_idx        : u32;

@compute @workgroup_size(256)
fn train(@builtin(local_invocation_id) lid: vec3u) {
  let local_id = lid.x;
  let total_nodes = U.gridRes * U.gridRes;
  let X = targets[U.sampleIdx].xyz;
  
  // 1. Cada hilo busca el mínimo en un subconjunto de 16 nodos (4096 / 256 = 16)
  var min_dist = 99999.0;
  var min_idx = 0u;
  
  for (var k = 0u; k < 16u; k = k + 1u) {
    let idx = local_id + k * 256u;
    if (idx < total_nodes) {
      let dist = distance(weights[idx].xyz, X);
      if (dist < min_dist) {
        min_dist = dist;
        min_idx = idx;
      }
    }
  }
  
  local_min_dist[local_id] = min_dist;
  local_min_idx[local_id] = min_idx;
  workgroupBarrier();
  
  // 2. Reducción en paralelo en memoria compartida para hallar el BMU global
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (local_id < s) {
      if (local_min_dist[local_id + s] < local_min_dist[local_id]) {
        local_min_dist[local_id] = local_min_dist[local_id + s];
        local_min_idx[local_id] = local_min_idx[local_id + s];
      }
    }
    workgroupBarrier();
  }
  
  // Guardamos el índice del BMU en memoria compartida
  if (local_id == 0u) {
    bmu_idx = local_min_idx[0];
  }
  workgroupBarrier();
  
  // 3. Todos los hilos actualizan sus respectivos 16 nodos
  let bmu_row = bmu_idx / U.gridRes;
  let bmu_col = bmu_idx % U.gridRes;
  
  for (var k = 0u; k < 16u; k = k + 1u) {
    let idx = local_id + k * 256u;
    if (idx < total_nodes) {
      let row = idx / U.gridRes;
      let col = idx % U.gridRes;
      
      // Distancia topológica en la grilla
      var dx = f32(col) - f32(bmu_col);
      var dy = f32(row) - f32(bmu_row);
      
      // Si la topología es toroidal, la distancia envuelve los bordes
      if (U.toroidal == 1u) {
        let half_res = f32(U.gridRes) / 2.0;
        if (dx > half_res) {
          dx = dx - f32(U.gridRes);
        } else if (dx < -half_res) {
          dx = dx + f32(U.gridRes);
        }
        if (dy > half_res) {
          dy = dy - f32(U.gridRes);
        } else if (dy < -half_res) {
          dy = dy + f32(U.gridRes);
        }
      }
      
      let dist2 = dx * dx + dy * dy;
      
      // Factor de vecindad gaussiana
      let h = exp(-dist2 / (2.0 * U.sigma * U.sigma));
      
      // Actualizar pesos (desplazar hacia el target X)
      let old_weight = weights[idx];
      let new_pos = old_weight.xyz + U.eta * h * (X - old_weight.xyz);
      weights[idx] = vec4f(new_pos, old_weight.w);
    }
  }
}
