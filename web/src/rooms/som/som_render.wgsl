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
@group(0) @binding(1) var<storage, read>    weights : array<vec4f>;
@group(0) @binding(2) var<storage, read>    targets : array<vec4f>;

struct VOut {
  @builtin(position) clip  : vec4f,
  @location(0)       color : vec3f,
  @location(1)       uv    : vec2f,
  @location(2)       isGrid: f32,
};

// Rampa de temperatura para colorear por altura (cian -> ámbar -> rojo)
fn heatRamp(t: f32) -> vec3f {
  let u = clamp(t, 0.0, 1.0);
  let c0 = vec3f(0.12, 0.45, 0.98);   // Azul profundo
  let c1 = vec3f(0.20, 0.90, 0.95);   // Cian brillante
  let c2 = vec3f(1.00, 0.82, 0.20);   // Ámbar
  let c3 = vec3f(1.00, 0.25, 0.12);   // Rojo
  
  if (u < 0.33) {
    return mix(c0, c1, u / 0.33);
  }
  if (u < 0.66) {
    return mix(c1, c2, (u - 0.33) / 0.33);
  }
  return mix(c2, c3, (u - 0.66) / 0.34);
}

// Vertex Shader para la malla de Kohonen (SOM)
@vertex
fn vsGrid(@builtin(vertex_index) vid: u32) -> VOut {
  var out: VOut;
  
  let node = weights[vid];
  out.clip = U.viewProj * vec4f(node.xyz, 1.0);
  
  let w_val = node.w;
  let v_coord = floor(w_val / 4096.0);
  let u_coord = w_val - v_coord * 4096.0;
  
  if (U.mode < 0.5) {
    // Modo 0: Coloreado topológico UV arcoíris de alta estética
    let r = u_coord * 0.85 + 0.15;
    let g = v_coord * 0.85 + 0.15;
    let b = 1.0 - 0.45 * (u_coord + v_coord);
    out.color = vec3f(r, g, b);
  } else {
    // Modo 1: Coloreado por altura física (Z)
    let normalized_h = (node.z + 1.2) / 2.4;
    out.color = heatRamp(normalized_h);
  }
  
  out.uv = vec2f(u_coord, v_coord);
  out.isGrid = 1.0;
  return out;
}

// Fragment Shader para la malla
@fragment
fn fsGrid(in: VOut) -> @location(0) vec4f {
  let depth_fade = clamp(in.clip.w * 0.08, 0.0, 0.4);
  return vec4f(in.color, U.alpha * (1.0 - depth_fade));
}

// Vertex Shader para los puntos de datos objetivo (sampled targets)
const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0,  1.0), vec2f(1.0, -1.0), vec2f( 1.0, 1.0),
);

@vertex
fn vsTarget(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VOut {
  var out: VOut;
  
  if (U.showTarget < 0.5) {
    out.clip = vec4f(0.0, 0.0, 0.0, 0.0);
    return out;
  }
  
  let pos = targets[iid];
  let projected = U.viewProj * vec4f(pos.xyz, 1.0);
  
  let point_size = 0.006;
  let corner = CORNERS[vid % 6u];
  
  let offset = vec4f(
    corner.x * point_size * U.projXX * projected.w,
    corner.y * point_size * U.projYY * projected.w,
    0.0,
    0.0
  );
  
  out.clip = projected + offset;
  out.uv = corner;
  
  // Tonalidad según la figura o categoría
  if (pos.w == 1.0) {
    out.color = vec3f(0.95, 0.45, 0.78); // Magenta suave para filamento 1
  } else if (pos.w == 0.0) {
    out.color = vec3f(0.28, 0.85, 1.00); // Cian suave para filamento 2
  } else {
    out.color = vec3f(0.85, 0.88, 0.95); // Blanco starlight
  }
  
  out.isGrid = 0.0;
  return out;
}

// Fragment Shader para los puntos de datos objetivo
@fragment
fn fsTarget(in: VOut) -> @location(0) vec4f {
  if (in.isGrid > 0.5) {
    discard;
  }
  
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) {
    discard;
  }
  
  let antialias = smoothstep(1.0, 0.65, r2);
  let final_color = in.color * U.bright;
  return vec4f(final_color, antialias * 0.40);
}
