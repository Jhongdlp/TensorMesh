// El campo, su gradiente y el paso a mundo. Una sola definición.
//
// Este trozo se **antepone** a `walkers.wgsl`, `surface.wgsl` y `render.wgsl`
// al crear los módulos: el paso baja por el gradiente, la malla necesita la
// altura *y* la normal, y el caminante necesita la altura para posarse encima.
// Tres copias de la misma fórmula es un caminante flotando sobre una superficie
// que no es la que desciende.
//
// El **grupo 1 es siempre la superficie**, en los tres pipelines. El grupo 0 es
// lo de cada pasada. Sin esa convención, `S` no puede declararse aquí y las
// funciones de abajo no compilan.

struct Surf {
  kind    : u32,   // 0 rosenbrock · 1 himmelblau · 2 beale · 3 silla · 4 rastrigin
  res     : u32,   // vértices por lado de la malla
  pad0    : u32,
  pad1    : u32,
  lo      : vec2f, // dominio
  hi      : vec2f,
  cx      : f32,   // centro del dominio, para centrar la escena en el origen
  cy      : f32,
  k       : f32,   // escala xy → mundo: el dominio siempre mide 4 de lado
  fMin    : f32,   // mínimo de f sobre el dominio; desplaza antes del log
  hScale  : f32,
  hOffset : f32,
  halfX   : f32,   // confinamiento, en unidades del problema
  halfY   : f32,
};

@group(1) @binding(0) var<uniform> S : Surf;

const TAU = 6.2831853;

fn fEval(p: vec2f) -> f32 {
  switch S.kind {
    // Rosenbrock. Valle plano y curvo: casi cualquiera lo encuentra en cuatro
    // pasos y luego tarda una eternidad en recorrerlo.
    case 0u: {
      let a = 1.0 - p.x;
      let b = p.y - p.x * p.x;
      return a * a + 100.0 * b * b;
    }
    // Himmelblau. **Cuatro** mínimos del mismo valor: el mapa de cuencas es el
    // contenido, no un efecto.
    case 1u: {
      let a = p.x * p.x + p.y - 11.0;
      let b = p.x + p.y * p.y - 7.0;
      return a * a + b * b;
    }
    // Beale. Una meseta enorme y casi plana con paredes verticales al borde:
    // la mayoría se queda parada donde no hay gradiente que seguir.
    case 2u: {
      let a = 1.5   - p.x + p.x * p.y;
      let b = 2.25  - p.x + p.x * p.y * p.y;
      let c = 2.625 - p.x + p.x * p.y * p.y * p.y;
      return a * a + b * b + c * c;
    }
    // Silla. **No tiene mínimo.** Es la que dice la verdad sobre qué frena de
    // verdad al entrenamiento en muchas dimensiones.
    case 3u: {
      return p.x * p.x - p.y * p.y;
    }
    // Rastrigin. Mínimos locales a puñados: el dibujo que todo el mundo tiene
    // en la cabeza, y que en alta dimensión casi nunca es el problema.
    default: {
      return 20.0
        + p.x * p.x - 10.0 * cos(TAU * p.x)
        + p.y * p.y - 10.0 * cos(TAU * p.y);
    }
  }
}

fn fGrad(p: vec2f) -> vec2f {
  switch S.kind {
    case 0u: {
      let b = p.y - p.x * p.x;
      return vec2f(-2.0 * (1.0 - p.x) - 400.0 * p.x * b, 200.0 * b);
    }
    case 1u: {
      let a = p.x * p.x + p.y - 11.0;
      let b = p.x + p.y * p.y - 7.0;
      return vec2f(4.0 * p.x * a + 2.0 * b, 2.0 * a + 4.0 * p.y * b);
    }
    case 2u: {
      let y2 = p.y * p.y;
      let y3 = y2 * p.y;
      let a = 1.5   - p.x + p.x * p.y;
      let b = 2.25  - p.x + p.x * y2;
      let c = 2.625 - p.x + p.x * y3;
      return vec2f(
        2.0 * a * (p.y - 1.0) + 2.0 * b * (y2 - 1.0) + 2.0 * c * (y3 - 1.0),
        2.0 * a * p.x + 4.0 * b * p.x * p.y + 6.0 * c * p.x * y2);
    }
    case 3u: {
      return vec2f(2.0 * p.x, -2.0 * p.y);
    }
    default: {
      return vec2f(2.0 * p.x + 10.0 * TAU * sin(TAU * p.x),
                   2.0 * p.y + 10.0 * TAU * sin(TAU * p.y));
    }
  }
}

/** Altura de mundo.
 *
 *  La vertical va en **logaritmo** y eso no es cosmético: Rosenbrock llega a
 *  2.509 en la esquina y a 0 en el mínimo, Beale pasa de 160.000. En lineal la
 *  escena es una pared y un suelo, sin valle entre medias. `log1p` es monótona,
 *  así que «hacia abajo» sigue siendo hacia abajo; lo que se pierde es la
 *  escala, y el pie de la sala lo dice.
 *
 *  El desplazamiento por `fMin` existe por la silla, que es la única con `f`
 *  negativa: sin él, `log1p` de un número menor que −1 devuelve NaN y la mitad
 *  del relieve desaparece. */
fn heightOf(p: vec2f) -> f32 {
  return S.hScale * log(1.0 + max(fEval(p) - S.fMin, 0.0)) + S.hOffset;
}

fn worldOf(p: vec2f) -> vec3f {
  return vec3f((p.x - S.cx) * S.k, heightOf(p), (p.y - S.cy) * S.k);
}

/** Normal analítica de la superficie, derivando `heightOf` por la regla de la
 *  cadena. No hay diferencias finitas: el gradiente ya está exacto arriba, y
 *  muestrear vecinos daría facetas donde la función es lisa. */
fn normalOf(p: vec2f) -> vec3f {
  let g = fGrad(p);
  let d = 1.0 + max(fEval(p) - S.fMin, 0.0);
  let dydx = (S.hScale * g.x / d) / S.k;
  let dydz = (S.hScale * g.y / d) / S.k;
  return normalize(vec3f(-dydx, 1.0, -dydz));
}

/** Confinamiento. Sólo importa en la silla, que no tiene mínimo y manda a todo
 *  el mundo al infinito: sin él el estado desborda a `inf` y el buffer se
 *  llena de NaN. Es una jaula ancha —vez y media el dominio— y el pie lo dice,
 *  porque *que no haya fondo* es justo lo que esa superficie enseña. */
fn confine(p: vec2f) -> vec2f {
  return vec2f(
    clamp(p.x, S.cx - S.halfX, S.cx + S.halfX),
    clamp(p.y, S.cy - S.halfY, S.cy + S.halfY));
}
