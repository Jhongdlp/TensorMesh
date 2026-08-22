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
  light    : vec4f,     // dirección de la luz, xyz · w = cuántos mínimos hay
  hLo      : f32,       // rango de altura de mundo, para el mapa de color
  hHi      : f32,
  fogNear  : f32,
  fogSpan  : f32,
  // Los mínimos conocidos, ya en **mundo xz** (el shader no repite la
  // transformación del dominio). xy es la posición, z marca la ranura usada.
  mins     : array<vec4f, 4>,
};
// 64 + 16 + 16 + 64 = 160 bytes. Cualquier campo nuevo obliga a tocar
// `engine.ts:writeMesh` y `test/descent.mjs` a la vez.

@group(0) @binding(0) var<uniform> M : MUni;

struct SOut {
  @builtin(position) clip : vec4f,
  @location(0)       rgb  : vec3f,
  @location(1)       hw   : f32,    // altura de mundo, para las curvas de nivel
  @location(2)       wxz  : vec2f,  // planta, para las dianas de los mínimos
  @location(3)       fog  : f32,
  @location(4)       uv   : vec2f,  // coordenadas de malla normalizadas (0..1)
};

/** Rampa de pérdida: azul profundo en el suelo, ámbar en la cima.
 *
 *  **No es la rampa de `palette.mjs`**, y la diferencia es deliberada. Aquí hay
 *  dos codificaciones a la vez y cada una dice algo distinto: el relieve tiñe
 *  por **altura** y el caminante por origen o por su propia altura. Compartir
 *  rampa las haría indistinguibles. Ésta va además a media saturación porque es
 *  fondo: quien tiene que destacar es el caminante. */
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
  let lit = 0.38 + 0.62 * lam;
  o.rgb = lossRamp(t) * lit * 0.76;
  o.hw  = w.y;
  o.wxz = w.xz;
  o.fog = clamp((o.clip.w - M.fogNear) / max(M.fogSpan, 1e-4), 0.0, 1.0);
  o.uv  = vec2f(gx, gy);
  return o;
}

/** Una banda de un píxel cada vez que `u` cruza un entero.
 *
 *  `fwidth` es lo que la hace de ancho constante **en pantalla**: sin dividir
 *  por la derivada, las curvas del fondo del valle salen gordas y las de la
 *  ladera desaparecen, que es exactamente al revés de lo que interesa. */
fn band(u: f32, px: f32) -> f32 {
  let d = abs(fract(u - 0.5) - 0.5) / max(fwidth(u), 1e-5);
  return 1.0 - smoothstep(0.0, px, d);
}

@fragment
fn fsSurface(v: SOut) -> @location(0) vec4f {
  var o = v.rgb;

  // ---------------------------------------------------------- cuadrícula ortogonal de la malla
  // Sutil y limpia para evitar patrones de moiré en superficies periódicas:
  let gridU = band(v.uv.x * 20.0, 1.0) * 0.08;
  let gridV = band(v.uv.y * 20.0, 1.0) * 0.08;
  let wire = max(gridU, gridV);
  o += (v.rgb * 1.2 + vec3f(0.10, 0.14, 0.22)) * wire;

  // ---------------------------------------------------------- curvas de nivel
  // Escalones de la pérdida en logaritmo:
  let span = max(M.hHi - M.hLo, 1e-4);
  let u = (v.hw - M.hLo) / span;
  let minor = band(u * 36.0, 1.0) * 0.08;
  let major = band(u *  6.0, 1.15) * 0.24;
  o += (v.rgb * 1.6 + vec3f(0.10, 0.14, 0.20)) * (minor + major);

  // ------------------------------------------------------------ los mínimos
  // Una diana luminosa donde está el fondo con núcleo sólido:
  var ring = 0.0;
  var core = 0.0;
  for (var i = 0u; i < 4u; i++) {
    let m = M.mins[i];
    let d = length(v.wxz - m.xy);
    let e = clamp(fwidth(d) * 1.4, 1e-4, 0.02);
    let a = 1.0 - smoothstep(0.0, e, abs(d - 0.075));
    let b = (1.0 - smoothstep(0.0, e, abs(d - 0.135))) * 0.65;
    let c = (1.0 - smoothstep(0.0, 0.040, d)) * 0.95;
    ring += (a + b) * m.z;
    core += c * m.z;
  }
  o += vec3f(0.85, 0.95, 1.0) * clamp(ring, 0.0, 1.0) * 0.65;
  o += vec3f(0.15, 0.92, 1.0) * clamp(core, 0.0, 1.0) * 0.95;

  // Perspectiva aérea
  o = mix(o, vec3f(0.012, 0.016, 0.030), v.fog * 0.55);
  return vec4f(o, 1.0);
}
