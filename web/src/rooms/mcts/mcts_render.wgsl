// Shaders de renderizado WebGPU para la Sala 05: Árboles de Razonamiento MCTS
// Efecto de Árbol Fractal de Pensamientos con Pulsos de Retropropagación y Vía Dorada.

struct Uni {
  viewProj        : mat4x4f,   // 64 bytes
  projXX          : f32,       // 4 bytes
  projYY          : f32,       // 4 bytes
  treeScale       : f32,       // 4 bytes
  time            : f32,       // 4 bytes
  nodeSize        : f32,       // 4 bytes
  edgeAlpha       : f32,       // 4 bytes
  pulseProgress   : f32,       // 4 bytes (0.0 a 1.0 para ondas de backpropagation)
  activePhase     : f32,       // 4 bytes (0=select, 1=expand, 2=eval, 3=backprop, 4=finalize)
  showLevels      : f32,       // 4 bytes
  pad1            : f32,       // 4 bytes
  pad2            : f32,       // 4 bytes
  pad3            : f32,       // 4 bytes
};

@group(0) @binding(0) var<uniform> U : Uni;

// ------------------------------------------------------------- 1. NODOS DE PENSAMIENTO (Billboards con Bloom)
struct NodeVertex {
  @location(0) posDepth   : vec4f, // x, y, z, depth
  @location(1) colorState : vec4f, // rgb = color, a = state (0=unvisited, 1=active, 2=backprop, 3=golden, 4=pruned)
  @location(2) metrics    : vec4f, // visits, value, reward, isGolden
};

struct VOutNode {
  @builtin(position) clip   : vec4f,
  @location(0)       color  : vec4f,
  @location(1)       uv     : vec2f,
  @location(2)       params : vec4f, // state, isGolden, value, depth
};

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
  vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
);

@vertex
fn vsNode(
  @builtin(vertex_index) vid : u32,
  node : NodeVertex
) -> VOutNode {
  var out : VOutNode;

  let worldPos = vec4f(node.posDepth.xyz, 1.0);
  let projected = U.viewProj * worldPos;
  let corner = CORNERS[vid % 6u];

  let state = node.colorState.a;
  let isGolden = node.metrics.w;
  let value = node.metrics.y;
  let visits = node.metrics.x;

  // Tamaño de foco según importancia e iluminación
  var point_size = U.nodeSize * (0.8 + 0.15 * log2(max(1.0, visits)));

  if (isGolden > 0.5) {
    point_size *= 1.8 + 0.2 * sin(U.time * 6.0); // Vía Dorada palpitante
  } else if (state > 1.5 && state < 2.5) {
    point_size *= 1.6 + 0.3 * sin(U.time * 12.0); // Onda de retropropagación activa
  } else if (state > 0.5 && state < 1.5) {
    point_size *= 1.4; // Nodo activo en selección
  } else if (state > 3.5) {
    point_size *= 0.65; // Rama podada marchita
  }

  var alpha = 1.0;
  if (state > 3.5) {
    alpha = 0.20; // Rama podada muy tenue
  }

  let offset = vec4f(
    corner.x * point_size * U.projXX * projected.w,
    corner.y * point_size * U.projYY * projected.w,
    0.0,
    0.0
  );

  out.clip = projected + offset;
  out.uv = corner;
  out.color = vec4f(node.colorState.rgb, alpha);
  out.params = vec4f(state, isGolden, value, node.posDepth.w);

  return out;
}

@fragment
fn fsNode(in : VOutNode) -> @location(0) vec4f {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) {
    discard;
  }

  let dist = sqrt(r2);
  let state = in.params.x;
  let isGolden = in.params.y;

  // 1. Núcleo blanco incandescente de filamento
  let core = smoothstep(0.35, 0.0, dist);

  // 2. Corona del color del estado
  let corona = smoothstep(0.75, 0.18, dist);

  // 3. Halo difuso exterior (Bloom)
  let halo = pow(clamp(1.0 - dist, 0.0, 1.0), 2.2);

  var finalRgb = in.color.rgb;
  var finalAlpha = 0.0;

  if (isGolden > 0.5) {
    // VÍA DORADA: Oro radiante con halo cálido
    finalRgb = mix(vec3f(1.0, 0.85, 0.20), vec3f(1.0, 1.0, 0.9), core * 0.9) + vec3f(0.35, 0.25, 0.0) * halo;
    finalAlpha = clamp(core * 1.0 + corona * 0.85 + halo * 0.7, 0.0, 1.0);
  } else if (state > 1.5 && state < 2.5) {
    // RETROPROPAGACIÓN: Destello azul cian / lavanda de energía ascendente
    finalRgb = mix(vec3f(0.2, 0.8, 1.0), vec3f(1.0, 1.0, 1.0), core * 0.9) + vec3f(0.0, 0.3, 0.5) * halo;
    finalAlpha = clamp(core * 1.0 + corona * 0.8 + halo * 0.6, 0.0, 1.0);
  } else if (state > 0.5 && state < 1.5) {
    // NODO ACTIVO EN SELECCIÓN: Verde esmeralda de exploración
    finalRgb = mix(vec3f(0.3, 0.95, 0.5), vec3f(1.0, 1.0, 0.9), core * 0.75);
    finalAlpha = clamp(core * 0.95 + corona * 0.75 + halo * 0.5, 0.0, 1.0);
  } else if (state > 3.5) {
    // NODO PODADO: Filamento apagado
    let filament = smoothstep(0.65, 0.35, dist);
    finalRgb = vec3f(0.4, 0.3, 0.35);
    finalAlpha = filament * 0.25;
  } else {
    // NODO ESTÁNDAR: Filamento blanco sutil
    let filament = smoothstep(0.65, 0.35, dist);
    finalRgb = in.color.rgb;
    finalAlpha = filament * 0.55 * in.color.a;
  }

  return vec4f(finalRgb, finalAlpha * in.color.a);
}

// ------------------------------------------------------------- 2. ARISTAS Y PULSOS SINÁPTICOS (Tree Links)
struct LineVertex {
  @location(0) pos : vec4f, // x, y, z, linkType (1=normal, 2=active_path, 3=backprop_pulse, 4=golden)
  @location(1) col : vec4f, // rgb, alpha
};

struct VOutLine {
  @builtin(position) clip  : vec4f,
  @location(0)       color : vec4f,
  @location(1)       params: vec2f, // x = linkType, y = worldY
};

@vertex
fn vsLine(in : LineVertex) -> VOutLine {
  var out : VOutLine;
  let worldPos = vec4f(in.pos.xyz, 1.0);
  out.clip = U.viewProj * worldPos;

  let linkType = in.pos.w;
  var alpha = in.col.a;

  if (linkType > 3.5) {
    alpha = 0.95; // Vía Dorada
  } else if (linkType > 2.5) {
    alpha = 0.90; // Pulso de retropropagación
  } else if (linkType > 1.5) {
    alpha = 0.75; // Camino activo
  } else {
    alpha *= U.edgeAlpha;
  }

  out.color = vec4f(in.col.rgb, alpha);
  out.params = vec2f(linkType, in.pos.y);
  return out;
}

@fragment
fn fsLine(in : VOutLine) -> @location(0) vec4f {
  let linkType = in.params.x;

  // Si es pulso de retropropagación, animar la onda viajando de abajo hacia arriba (+Y)
  if (linkType > 2.5 && linkType < 3.5) {
    let waveY = fract(U.time * 2.5); // Ascenso hacia la raíz
    let normY = fract((in.params.y + 1.5) * 0.4);
    let dist = abs(normY - waveY);
    let glow = smoothstep(0.15, 0.0, dist) * 0.7;
    return vec4f(in.color.rgb + vec3f(glow), clamp(in.color.a + glow, 0.0, 1.0));
  }

  return in.color;
}

// ------------------------------------------------------------- 3. ANILLOS DE PROFUNDIDAD DEL ÁRBOL
struct RingVertex {
  @location(0) pos : vec3f, // x, 0, z
  @location(1) uv  : vec2f,
};

struct VOutRing {
  @builtin(position) clip  : vec4f,
  @location(0)       uv    : vec2f,
  @location(1)       depth : f32,
};

@vertex
fn vsRing(
  @builtin(instance_index) iid : u32,
  in : RingVertex
) -> VOutRing {
  var out : VOutRing;
  let depth = f32(iid);
  let y_pos = 1.4 - depth * 0.58;
  let scale = 0.45 + depth * 0.45;

  let worldPos = vec4f(in.pos.x * scale, y_pos, in.pos.z * scale, 1.0);
  out.clip = U.viewProj * worldPos;
  out.uv = in.uv;
  out.depth = depth;
  return out;
}

@fragment
fn fsRing(in : VOutRing) -> @location(0) vec4f {
  if (U.showLevels < 0.5) {
    discard;
  }

  let distCenter = length(in.uv - vec2f(0.5, 0.5)) * 2.0;
  if (distCenter > 1.0) {
    discard;
  }

  // Anillo perimétrico circular sutil
  let ringEdge = abs(distCenter - 0.98);
  let ringGlow = smoothstep(0.06, 0.005, ringEdge) * 0.15;

  var levelCol = vec3f(0.3, 0.5, 0.8);
  if (in.depth < 0.5) {
    levelCol = vec3f(1.0, 0.85, 0.2); // Raíz
  }

  return vec4f(levelCol, ringGlow);
}
