// Shaders de renderizado WebGPU para la Sala HNSW (Búsqueda Vectorial Multicapa)
// Efecto de "Focos de Luz" (Filamentos, Destellos Bloom, Halo Expansivo y Rayos Láser).

struct Uni {
  viewProj        : mat4x4f,   // 64 bytes
  projXX          : f32,       // 4 bytes
  projYY          : f32,       // 4 bytes
  layerSpacing    : f32,       // 4 bytes (distancia vertical entre láminas)
  activeLayer     : f32,       // 4 bytes (-1.0 = todas, 0, 1, 2 = capa focal)
  time            : f32,       // 4 bytes
  nodeSize        : f32,       // 4 bytes
  edgeAlpha       : f32,       // 4 bytes
  interLayerAlpha : f32,       // 4 bytes
  queryX          : f32,       // 4 bytes
  queryZ          : f32,       // 4 bytes
  showGridPlanes  : f32,       // 4 bytes
  animProgress    : f32,       // 4 bytes (progreso de animación del paso 0..1)
};

@group(0) @binding(0) var<uniform> U : Uni;

// ------------------------------------------------------------- 1. FOCOS DE LUZ (Node Billboard Shaders)
struct NodeVertex {
  @location(0) posLayer   : vec4f, // x, 0, z, layer (0, 1, 2)
  @location(1) colorState : vec4f, // rgb = color, a = estado de encendido (0.3=reposo, 1.0=encendido, 2.0=foco activo)
  @location(2) status     : vec4f, // x = isQuery, y = isCurrent, z = isTopK, w = isEvaluated
};

struct VOutNode {
  @builtin(position) clip   : vec4f,
  @location(0)       color  : vec4f,
  @location(1)       uv     : vec2f,
  @location(2)       params : vec4f, // x = isQuery, y = isCurrent, z = isTopK, w = isEvaluated
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

  let layer = node.posLayer.w;
  let y_pos = (layer - 1.0) * U.layerSpacing;
  let worldPos = vec4f(node.posLayer.x, y_pos, node.posLayer.z, 1.0);

  let projected = U.viewProj * worldPos;
  let corner = CORNERS[vid % 6u];

  let isLit = node.colorState.a; // 0.3 = apagado, 1.0 = iluminado, 2.0 = activo
  var point_size = 0.0042;

  if (layer >= 1.9) {
    point_size = 0.0060; // Nodos de autopista L2
  } else if (layer >= 0.9) {
    point_size = 0.0050; // Nodos regionales L1
  }

  // Si el foco está encendido o activo, el halo se expande como una bombilla encendida
  if (isLit > 1.5) { // Foco Activo / Salto Voraz
    point_size *= 2.2 + 0.3 * sin(U.time * 8.0);
  } else if (isLit > 0.8) { // Foco Encendido en el Camino o Top-K
    point_size *= 1.7 + 0.15 * sin(U.time * 5.0);
  } else if (node.status.w > 0.5) { // Sonda evaluada
    point_size *= 1.4;
  }

  if (node.status.x > 0.5) { // Query Marker
    point_size = 0.0090 + 0.0015 * sin(U.time * 6.0);
  }

  var alpha = 1.0;
  if (U.activeLayer >= 0.0 && abs(layer - U.activeLayer) > 0.1) {
    alpha = 0.15;
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
  out.params = vec4f(node.status.x, node.status.y, node.status.z, isLit);

  return out;
}

@fragment
fn fsNode(in : VOutNode) -> @location(0) vec4f {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) {
    discard;
  }

  let isQuery = in.params.x;
  let isCurrent = in.params.y;
  let isTopK = in.params.z;
  let isLit = in.params.w; // nivel de encendido del foco

  // Marcador de la Query (Diana radiante dorada)
  if (isQuery > 0.5) {
    let diamond = abs(in.uv.x) + abs(in.uv.y);
    if (diamond > 1.0) { discard; }
    let core = smoothstep(1.0, 0.15, diamond);
    let pulse = 0.8 + 0.2 * sin(U.time * 7.0);
    return vec4f(1.0, 0.85, 0.15, in.color.a * core * pulse);
  }

  // MODELO ÓPTICO DE FOCO / BOMBILLA (Filamento + Corona + Halo Bloom)
  let dist = sqrt(r2);

  // 1. Núcleo incandescente blanco/cálido ultra brillante al centro
  let core = smoothstep(0.35, 0.0, dist);

  // 2. Corona de color del foco
  let corona = smoothstep(0.75, 0.2, dist);

  // 3. Halo exterior difuso (Bloom de bombilla encendida)
  let halo = pow(clamp(1.0 - dist, 0.0, 1.0), 2.2);

  var finalRgb = in.color.rgb;
  var finalAlpha = 0.0;

  if (isLit > 1.5) {
    // FOCO ACTIVO: Núcleo blanco brillante con halo dorado expansivo
    finalRgb = mix(in.color.rgb, vec3f(1.0, 1.0, 0.9), core * 0.85) + vec3f(0.3, 0.25, 0.0) * halo;
    finalAlpha = clamp(core * 1.0 + corona * 0.8 + halo * 0.6, 0.0, 1.0);
  } else if (isLit > 0.8) {
    // FOCO ENCENDIDO (Camino recorrido o Top-K): Luminosidad constante cálida
    finalRgb = mix(in.color.rgb, vec3f(1.0, 0.95, 0.8), core * 0.6);
    finalAlpha = clamp(core * 0.95 + corona * 0.75 + halo * 0.45, 0.0, 1.0);
  } else {
    // FOCO EN REPOSO (Apagado / Tenue): Filamento sutil translúcido
    let filament = smoothstep(0.65, 0.35, dist);
    finalRgb = in.color.rgb * 0.75;
    finalAlpha = filament * 0.45 * in.color.a;
  }

  return vec4f(finalRgb, finalAlpha * in.color.a);
}

// ------------------------------------------------------------- 2. LÍNEAS, RAYOS Y PULSOS LÁSER
struct LineVertex {
  @location(0) pos : vec4f, // x, y_custom, z, layer_mode (99 = worldY directo)
  @location(1) col : vec4f, // rgb, lineType (1.0=edge, 2.0=path, 3.0=closer probe, 4.0=discard probe, 5.0=query laser, 6.0=vertical conduit)
};

struct VOutLine {
  @builtin(position) clip  : vec4f,
  @location(0)       color : vec4f,
  @location(1)       params: vec2f, // x = lineType, y = worldY
};

@vertex
fn vsLine(in : LineVertex) -> VOutLine {
  var out : VOutLine;
  let layer = in.pos.w;

  var worldY = in.pos.y;
  if (layer >= 0.0 && layer <= 2.5) {
    worldY = (layer - 1.0) * U.layerSpacing;
  }

  let worldPos = vec4f(in.pos.x, worldY, in.pos.z, 1.0);
  out.clip = U.viewProj * worldPos;

  let lineType = in.col.a;
  var alpha = 1.0;

  if (lineType < 1.5) {
    // Aristas normales del grafo en reposo
    alpha = U.edgeAlpha;
    if (U.activeLayer >= 0.0 && abs(layer - U.activeLayer) > 0.1) {
      alpha *= 0.10;
    }
  } else if (lineType < 2.5) {
    // Camino de energía dorado (Path)
    alpha = 0.95;
  } else if (lineType < 3.5) {
    // Sonda verde positiva (pulso brillante)
    alpha = 0.92;
  } else if (lineType < 4.5) {
    // Sonda roja descartada
    alpha = 0.35;
  } else if (lineType < 5.5) {
    // Baliza láser vertical de la Query
    alpha = 0.40 + 0.20 * sin(U.time * 4.0);
  } else {
    // Conducto vertical entre capas
    alpha = U.interLayerAlpha;
  }

  out.color = vec4f(in.col.rgb, alpha);
  out.params = vec2f(lineType, worldY);
  return out;
}

@fragment
fn fsLine(in : VOutLine) -> @location(0) vec4f {
  let lineType = in.params.x;

  // Si es un conducto vertical de energía, dibujar un pulso de luz descendente animado
  if (lineType > 5.5) {
    let pulseY = fract(U.time * 1.5);
    let normY = fract((in.params.y + 2.0) * 0.5);
    let distToPulse = abs(normY - pulseY);
    let pulseGlow = smoothstep(0.12, 0.0, distToPulse) * 0.6;
    return vec4f(in.color.rgb + vec3f(pulseGlow), clamp(in.color.a + pulseGlow, 0.0, 1.0));
  }

  return in.color;
}

// ------------------------------------------------------------- 3. LÁMINAS DE CAPA Y RADAR 3D
struct GridVertex {
  @location(0) pos : vec3f, // x, 0, z
  @location(1) uv  : vec2f,
};

struct VOutGrid {
  @builtin(position) clip  : vec4f,
  @location(0)       uv    : vec2f,
  @location(1)       layer : f32,
  @location(2)       world : vec3f,
};

@vertex
fn vsGrid(
  @builtin(instance_index) iid : u32,
  in : GridVertex
) -> VOutGrid {
  var out : VOutGrid;
  let layer = f32(iid);
  let y_pos = (layer - 1.0) * U.layerSpacing;

  let worldPos = vec4f(in.pos.x, y_pos, in.pos.z, 1.0);
  out.clip = U.viewProj * worldPos;
  out.uv = in.uv;
  out.layer = layer;
  out.world = worldPos.xyz;
  return out;
}

@fragment
fn fsGrid(in : VOutGrid) -> @location(0) vec4f {
  if (U.showGridPlanes < 0.5) {
    discard;
  }

  var baseColor = vec3f(0.85, 0.88, 0.95);
  var baseAlpha = 0.035;

  // Código de color por lámina
  if (in.layer >= 1.9) {
    baseColor = vec3f(1.0, 0.82, 0.20); // L2: Oro (Autopista)
    baseAlpha = 0.045;
  } else if (in.layer >= 0.9) {
    baseColor = vec3f(0.20, 0.85, 1.00); // L1: Cian (Regional)
    baseAlpha = 0.040;
  } else {
    baseColor = vec3f(0.35, 0.95, 0.60); // L0: Esmeralda (Base Completa)
    baseAlpha = 0.035;
  }

  if (U.activeLayer >= 0.0 && abs(in.layer - U.activeLayer) < 0.1) {
    baseAlpha += 0.06;
  }

  // 1. Borde perimetral brillante de la lámina
  let distBorder = min(min(in.uv.x, 1.0 - in.uv.x), min(in.uv.y, 1.0 - in.uv.y));
  var borderGlow = 0.0;
  if (distBorder < 0.025) {
    borderGlow = smoothstep(0.025, 0.002, distBorder) * 0.35;
  }

  // 2. Rejilla ortogonal sutil
  let gx = abs(fract(in.uv.x * 6.0 - 0.5) - 0.5) / fwidth(in.uv.x * 6.0);
  let gy = abs(fract(in.uv.y * 6.0 - 0.5) - 0.5) / fwidth(in.uv.y * 6.0);
  let gridLines = 1.0 - min(min(gx, gy), 1.0);

  // 3. Onda de radar concéntrica en el plano bajo la Query
  let dx = in.world.x - U.queryX;
  let dz = in.world.z - U.queryZ;
  let distQuery = sqrt(dx * dx + dz * dz);
  let radarWave = sin(distQuery * 12.0 - U.time * 5.0);
  var radarGlow = 0.0;
  if (distQuery < 0.65) {
    radarGlow = smoothstep(0.85, 0.98, radarWave) * (1.0 - distQuery / 0.65) * 0.20;
  }

  let finalAlpha = clamp(baseAlpha + borderGlow + gridLines * 0.02 + radarGlow, 0.0, 0.50);
  return vec4f(baseColor, finalAlpha);
}
