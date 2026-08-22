// Estelas: una textura que se apaga.
//
// La tentación es guardar historial por caminante. No sale: cien mil caminantes
// por 32 posiciones por 8 bytes son 25 MB y un montón de líneas que rasterizar,
// y el coste crece con el número de caminantes justo cuando lo que se quiere es
// subirlo.
//
// Esto es la misma idea que ya gobierna la nebulosa del atlas —la mezcla
// aditiva suma luz— pero aplicada **en el tiempo**: cada frame la textura se
// multiplica por un factor menor que uno y encima se suman los caminantes de
// este frame. Coste fijo, independiente de cuántos haya.
//
// El precio, y hay que decirlo: la textura está en **espacio de pantalla**, así
// que lo acumulado deja de valer en cuanto la cámara se mueve. El motor lo
// resuelve bajando el factor de persistencia mientras hay movimiento, de modo
// que la estela vieja se disuelve en unos frames en vez de quedarse pegada
// describiendo un encuadre que ya no existe.

// ------------------------------------------------------------- triángulo lleno
// Tres vértices que cubren el objetivo de sobra. Un triángulo y no un quad:
// evita la costura diagonal por la que dos triángulos se solapan en el borde.
@vertex
fn vsFull(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  return vec4f(p[vi], 0.0, 1.0);
}

// ------------------------------------------------------------------- atenuado
// El pipeline lleva mezcla `(zero, constant)`, así que lo que devuelva este
// fragmento da igual: el destino se multiplica por la constante de mezcla, que
// el motor fija cada frame con `setBlendConstant`. Es la forma de leer y
// escribir el mismo adjunto sin una segunda textura de ping-pong.
@fragment
fn fsFade() -> @location(0) vec4f {
  return vec4f(0.0);
}

// ----------------------------------------------------------------- composición
@group(0) @binding(0) var trailTex : texture_2d<f32>;
@group(0) @binding(1) var trailSmp : sampler;

@fragment
fn fsComposite(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / vec2f(textureDimensions(trailTex));
  let c = textureSampleLevel(trailTex, trailSmp, uv, 0.0);
  // **Curva de exposición**, no la acumulación cruda. La textura es rgba16float
  // y no tiene techo, así que en el fondo del valle —donde pasan los cuarenta
  // mil— el valor se dispara y al volcarlo a 8 bits sale una mancha blanca
  // plana: justo donde más información hay, ninguna. `1 − e^(−c)` es la
  // respuesta de una película: lineal donde hay poca luz, comprimida donde hay
  // mucha, y nunca satura del todo. Es además lo que permite que la persistencia
  // llegue hasta «permanente» sin que la imagen se lave.
  let e = vec3f(1.0) - exp(-c.rgb);
  // Sale por mezcla aditiva sobre el relieve ya dibujado: las estelas *suman
  // luz* sobre el terreno en vez de taparlo, que es lo que las hace legibles
  // sobre una ladera clara y sobre el fondo del valle a la vez.
  return vec4f(e, 1.0);
}
