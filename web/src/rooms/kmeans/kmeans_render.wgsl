// Render de K-Means y Constelaciones 3D.
// Arquitectura idéntica al render de la Nebulosa: discos con antialiasing por fwidth,
// aristas aditivas con perspectiva aérea, y centroides focales nítidos.

struct Uni {
  viewProj        : mat4x4f,   // 64 bytes
  camPos          : vec4f,     // 16 bytes
  projXX          : f32,       // 4 bytes
  projYY          : f32,       // 4 bytes
  pointSize       : f32,       // 4 bytes (tamaño base de nodo)
  time            : f32,       // 4 bytes
  centroidSize    : f32,       // 4 bytes
  showTrajectories: f32,       // 4 bytes
  showConstell    : f32,       // 4 bytes
  selectedPointId : f32,       // 4 bytes
  vpX             : f32,       // 4 bytes (ancho viewport px)
  vpY             : f32,       // 4 bytes (alto viewport px)
  pad1            : f32,       // 4 bytes
  pad2            : f32,       // 4 bytes
};

@group(0) @binding(0) var<uniform> U : Uni;

// --------------------------------------------------------------------- Bruma y Perspectiva Aérea
const FOG_FLOOR = 0.22;
const HAZE = vec3f(0.09, 0.13, 0.24);

fn fogT(clipW: f32) -> f32 {
  let t = clamp((clipW - 1.5) / 4.5, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

fn depthFade(t: f32) -> f32 {
  return mix(1.0, FOG_FLOOR, t);
}

// ------------------------------------------------------------- 1. PUNTOS DE DATOS (Estilo Nebulosa)
struct PointVertex {
  @location(0) posCluster : vec4f, // x, y, z, clusterId
  @location(1) colorDist  : vec4f, // r, g, b, distToCentroid
  @location(2) pointId    : vec4f, // x = id, y = isSelected, z = 0, w = 0
};

struct VOutPoint {
  @builtin(position) clip       : vec4f,
  @location(0)       rgb        : vec3f,
  @location(1)       fade       : f32,
  @location(2)       uv         : vec2f,
  @location(3)       isSelected : f32,
};

const CORNERS = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
  vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
);

@vertex
fn vsPoint(
  @builtin(vertex_index) vid : u32,
  point : PointVertex
) -> VOutPoint {
  var out : VOutPoint;
  let worldPos = vec4f(point.posCluster.xyz, 1.0);
  var clip = U.viewProj * worldPos;
  let corner = CORNERS[vid % 6u];
  let isSel = point.pointId.y;

  let t = fogT(clip.w);
  let fade = depthFade(t);

  // Escala del punto: idéntica a la nebulosa
  let baseRadius = U.pointSize * (select(1.0, 3.2, isSel > 0.5));
  var ox = baseRadius * U.projXX * clip.w;
  var oy = baseRadius * U.projYY * clip.w;

  // Suelo mínimo en píxeles para que siempre sea nítido y legible
  let minPx = select(2.6, 6.0, isSel > 0.5);
  let floorClip = minPx * 2.0 * clip.w;
  ox = max(ox, floorClip / max(1.0, U.vpX));
  oy = max(oy, floorClip / max(1.0, U.vpY));

  clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, clip.z, clip.w);

  out.clip = clip;
  out.uv = corner;
  // Color del cluster con tinte estelar
  out.rgb = mix(point.colorDist.rgb, HAZE, t * 0.35);
  out.fade = fade;
  out.isSelected = isSel;
  return out;
}

@fragment
fn fsPoint(in : VOutPoint) -> @location(0) vec4f {
  let r  = length(in.uv);
  let aa = max(fwidth(r), 0.0001);

  if (in.isSelected > 0.5) {
    // Marcador del concepto seleccionado (estilo Nebulosa: núcleo + aro fino)
    let core = 1.0 - smoothstep(0.40 - aa * 2.0, 0.40, r);
    let ring = smoothstep(0.70 - aa * 2.0, 0.70, r) * (1.0 - smoothstep(0.88, 0.88 + aa * 2.0, r));
    let a = max(core, ring * 0.95);
    if (a * in.fade <= 0.01) { discard; }
    return vec4f(mix(in.rgb, vec3f(1.0), 0.4), a * in.fade);
  }

  // Disco plano nítido con antialiasing por fwidth (sin degradados borrosos)
  let a = 1.0 - smoothstep(1.0 - aa * 2.0, 1.0, r);
  if (a * in.fade <= 0.01) { discard; }

  // Centro blanco brillante como en las estrellas de la Nebulosa
  let starCore = 1.0 - smoothstep(0.30, 0.50, r);
  let finalRgb = mix(in.rgb, vec3f(1.0), starCore * 0.70);

  return vec4f(finalRgb, a * in.fade);
}

// ------------------------------------------------------------- 2. CENTROIDES GRAVITACIONALES (Centroids)
struct CentroidVertex {
  @location(0) posId    : vec4f, // x, y, z, centroidId
  @location(1) colorPop : vec4f, // r, g, b, pointsCount
};

struct VOutCentroid {
  @builtin(position) clip  : vec4f,
  @location(0)       rgb   : vec3f,
  @location(1)       uv    : vec2f,
  @location(2)       fade  : f32,
};

@vertex
fn vsCentroid(
  @builtin(vertex_index) vid : u32,
  centroid : CentroidVertex
) -> VOutCentroid {
  var out : VOutCentroid;
  let worldPos = vec4f(centroid.posId.xyz, 1.0);
  var clip = U.viewProj * worldPos;
  let corner = CORNERS[vid % 6u];

  let t = fogT(clip.w);
  let fade = depthFade(t);

  let csize = U.centroidSize * (1.15 + 0.08 * sin(U.time * 4.0 + centroid.posId.w));
  var ox = csize * U.projXX * clip.w;
  var oy = csize * U.projYY * clip.w;

  let minPx = 9.0;
  let floorClip = minPx * 2.0 * clip.w;
  ox = max(ox, floorClip / max(1.0, U.vpX));
  oy = max(oy, floorClip / max(1.0, U.vpY));

  clip = vec4f(clip.x + corner.x * ox, clip.y + corner.y * oy, clip.z, clip.w);

  out.clip = clip;
  out.uv = corner;
  out.rgb = centroid.colorPop.rgb;
  out.fade = fade;
  return out;
}

@fragment
fn fsCentroid(in : VOutCentroid) -> @location(0) vec4f {
  let r  = length(in.uv);
  let aa = max(fwidth(r), 0.0001);

  // 1. Núcleo central brillante
  let core = 1.0 - smoothstep(0.40 - aa * 2.0, 0.40, r);

  // 2. Anillo orbital nítido
  let ring = smoothstep(0.72 - aa * 2.0, 0.72, r) * (1.0 - smoothstep(0.88, 0.88 + aa * 2.0, r));

  let a = max(core, ring * 0.95);
  if (a * in.fade <= 0.01) { discard; }

  let finalRgb = mix(in.rgb, vec3f(1.0), core * 0.85);
  return vec4f(finalRgb, a * in.fade);
}

// ------------------------------------------------------------- 3. ARISTAS Y CONSTELACIONES (Estilo Nebulosa)
struct LineVertex {
  @location(0) pos : vec4f, // x, y, z, lineType (1=trajectory, 2=intra_edge, 3=selected_beam)
  @location(1) col : vec4f, // r, g, b, alpha
};

struct VOutLine {
  @builtin(position) clip  : vec4f,
  @location(0)       rgb   : vec3f,
  @location(1)       fade  : f32,
};

@vertex
fn vsLine(in : LineVertex) -> VOutLine {
  var out : VOutLine;
  let worldPos = vec4f(in.pos.xyz, 1.0);
  out.clip = U.viewProj * worldPos;

  let t = fogT(out.clip.w);
  let fade = depthFade(t) * in.col.a;

  out.rgb = mix(in.col.rgb, HAZE, t * 0.45);
  out.fade = fade;
  return out;
}

@fragment
fn fsLine(in : VOutLine) -> @location(0) vec4f {
  return vec4f(in.rgb, in.fade);
}
