// Un hilo por caminante. Tres optimizadores en el mismo paso.
//
// Ni CSR, ni muestreo negativo, ni tile en memoria compartida: los caminantes
// no se ven entre sí, así que el paso es puramente local. Es mucho más barato
// que el paso LinLog del atlas — 0,49 ms de los 15 en la fase 00.
//
// **El anillo de uniformes vuelve, y lo trae Adam.** La fase 00 se lo ahorró
// porque nada cambiaba entre pasos. La corrección de sesgo de Adam depende del
// **número de paso**, así que cada dispatch necesita su propio `t` y, como
// `writeBuffer` se aplica en orden de cola —antes del command buffer entero, no
// entre sus pasadas—, hay que darle una ranura de 256 B a cada paso. Es
// exactamente por lo que el atlas tiene el suyo.

struct Params {
  opt  : u32,   // 0 SGD · 1 momento · 2 Adam
  step : u32,   // número de paso, empezando en 1. Sólo lo usa Adam.
  n    : u32,
  pad0 : u32,
  lr   : f32,
  // Recorte de la **norma** del gradiente, no de cada componente. En las
  // paredes de Rosenbrock el gradiente pasa de 2.000 y en las de Beale de
  // 70.000; con paso fijo eso es un salto que se sale del dominio y no vuelve.
  // Recortar la norma conserva la dirección; por componente la tuerce hacia las
  // diagonales. Adam no lo necesita —normaliza por su propia varianza— y por
  // eso allí llega un valor enorme que nunca muerde.
  clip : f32,
  mu   : f32,   // momento
  b1   : f32,   // Adam
  b2   : f32,
  eps  : f32,
  pad1 : f32,
  pad2 : f32,
};

@group(0) @binding(0) var<storage, read>       stIn  : array<vec2f>;
@group(0) @binding(1) var<storage, read_write> stOut : array<vec2f>;
// Acumuladores: xy es el momento (o `m` de Adam), zw es `v` de Adam. Va **sin**
// doble búfer a propósito: cada hilo sólo toca su propio elemento, así que
// leerlo y escribirlo en el sitio es seguro, y los dispatches de una misma
// pasada se ordenan entre sí.
@group(0) @binding(2) var<storage, read_write> acc   : array<vec4f>;
@group(0) @binding(3) var<uniform>             P     : Params;

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.n) { return; }

  var p = stIn[i];
  var g = fGrad(p);
  let gl = length(g);
  if (gl > P.clip) { g = g * (P.clip / gl); }

  var a = acc[i];

  switch P.opt {
    // Descenso a secas. El paso es el gradiente y nada más.
    case 0u: {
      p = p - g * P.lr;
    }
    // Momento. La velocidad acumula, así que atraviesa mesetas que a SGD le
    // cuestan miles de pasos — y se pasa de largo en los valles estrechos.
    case 1u: {
      a = vec4f(a.xy * P.mu - g * P.lr, a.zw);
      p = p + a.xy;
    }
    // Adam. Paso por coordenada, normalizado por la varianza reciente.
    default: {
      let m = a.xy * P.b1 + g * (1.0 - P.b1);
      let v = a.zw * P.b2 + g * g * (1.0 - P.b2);
      a = vec4f(m, v);
      // La corrección de sesgo es lo que todo el mundo se deja. Sin ella los
      // primeros ~50 pasos van a cámara lenta, porque `m` y `v` arrancan en
      // cero y tiran del paso hacia abajo. Es lo que mide el test contra numpy:
      // sin corregir, el error a 400 pasos se dispara y a un paso no se nota.
      let t = f32(P.step);
      let mh = m / (1.0 - pow(P.b1, t));
      let vh = v / (1.0 - pow(P.b2, t));
      p = p - P.lr * mh / (sqrt(vh) + P.eps);
    }
  }

  acc[i] = a;
  stOut[i] = confine(p);
}

// ------------------------------------------------------ el rastro de los cinco
//
// Un anillo de posiciones por cada caminante seguido. Es lo único de la sala
// que guarda historia, y se puede permitir guardarla porque son cinco: cinco
// por 384 frames por ocho bytes son quince kilobytes. Hacerlo para los ocho mil
// serían 24 MB y un montón de geometría que rasterizar, que es exactamente el
// cálculo que llevó a que la estela fuese una textura y no un historial.
//
// El anillo se escribe **después** de los pasos de este frame y en la misma
// pasada de cómputo: los dispatches de una pasada se ordenan entre sí, así que
// lo que se graba es el estado recién calculado y no el del frame anterior.

struct Trace {
  len    : u32,
  head   : u32,   // ranura que toca escribir
  traced : u32,
  pad0   : u32,
};

@group(0) @binding(4) var<storage, read_write> path : array<vec2f>;
@group(0) @binding(5) var<uniform>             T    : Trace;

@compute @workgroup_size(64)
fn record(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= T.traced) { return; }
  path[i * T.len + T.head] = stIn[i];
}
