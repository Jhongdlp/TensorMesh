// La malla del relieve. Sin vertex buffers, como todo lo demás aquí.
//
// La rejilla se deriva del `vertex_index`: un quad son seis vértices y hay
// (res−1)² quads, así que la geometría no existe en memoria — se calcula. Y la
// **normal es analítica** (`normalOf`, derivando la altura por la regla de la
// cadena): muestrear vecinos daría facetas donde la función es lisa, y con
// Rastrigin —que ondula a la escala de la propia celda— las facetas mienten
// sobre dónde están los mínimos.

struct MUni {
  viewProj : mat4x4f,   // 64
  light    : vec4f,     // dirección de la luz, xyz
  hLo      : f32,       // rango de altura de mundo, para el mapa de color
  hHi      : f32,
  fogNear  : f32,
  fogSpan  : f32,
};

@group(0) @binding(0) var<uniform> M : MUni;

struct SOut {
  @builtin(position) clip : vec4f,
  @location(0)       rgb  : vec3f,
  @location(1)       fade : f32,
};

/** Rampa de pérdida: azul profundo en el suelo, ámbar en la cima.
 *
 *  **No es la rampa de `palette.mjs`**, y la diferencia es deliberada. Aquí hay
 *  dos codificaciones a la vez y cada una dice algo distinto: el relieve tiñe
 *  por **altura** y el caminante por **origen**. Compartir rampa las haría
 *  indistinguibles. Ésta va además a media saturación porque es fondo: quien
 *  tiene que destacar es el caminante. */
fn lossRamp(t: f32) -> vec3f {
  let u = clamp(t, 0.0, 1.0);
  let c0 = vec3f(0.051, 0.078, 0.251);
  let c1 = vec3f(0.200, 0.145, 0.431);
  let c2 = vec3f(0.478, 0.184, 0.463);
  let c3 = vec3f(0.761, 0.353, 0.235);
  let c4 = vec3f(0.949, 0.769, 0.420);
  if (u < 0.25) { return mix(c0, c1, u / 0.25); }
  if (u < 0.50) { return mix(c1, c2, (u - 0.25) / 0.25); }
  if (u < 0.75) { return mix(c2, c3, (u - 0.50) / 0.25); }
  return mix(c3, c4, (u - 0.75) / 0.25);
}

@vertex
fn vsSurface(@builtin(vertex_index) vi: u32) -> SOut {
  let R = S.res;
  let quad = vi / 6u;
  let c = vi % 6u;
  let qx = quad % (R - 1u);
  let qy = quad / (R - 1u);

  // Dos triángulos: (0,0)(1,0)(0,1) y (0,1)(1,0)(1,1).
  var ox = 0u;
  var oy = 0u;
  switch c {
    case 0u: { ox = 0u; oy = 0u; }
    case 1u: { ox = 1u; oy = 0u; }
    case 2u: { ox = 0u; oy = 1u; }
    case 3u: { ox = 0u; oy = 1u; }
    case 4u: { ox = 1u; oy = 0u; }
    default: { ox = 1u; oy = 1u; }
  }

  let gx = f32(qx + ox) / f32(R - 1u);
  let gy = f32(qy + oy) / f32(R - 1u);
  let p = vec2f(mix(S.lo.x, S.hi.x, gx), mix(S.lo.y, S.hi.y, gy));
  let w = worldOf(p);
  let nrm = normalOf(p);

  var o: SOut;
  o.clip = M.viewProj * vec4f(w, 1.0);

  // Color por altura, brillo por inclinación. La pendiente es lo que se ha
  // venido a mirar, así que va en la luz y no en el tono: un valle plano se lee
  // por lo liso, no porque cambie de color.
  let t = clamp((w.y - M.hLo) / max(M.hHi - M.hLo, 1e-4), 0.0, 1.0);
  let lam = max(dot(nrm, normalize(M.light.xyz)), 0.0);
  // Suelo ambiental generoso: en la parte plana la normal apunta arriba y sin
  // ambiente el fondo del valle quedaría negro, justo donde está la acción.
  let lit = 0.34 + 0.66 * lam;
  o.rgb = lossRamp(t) * lit * 0.62;
  o.fade = 1.0;
  return o;
}

@fragment
fn fsSurface(v: SOut) -> @location(0) vec4f {
  return vec4f(v.rgb, 1.0);
}
