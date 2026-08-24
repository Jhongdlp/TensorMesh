# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> El código, los comentarios y la UI de este proyecto están **en español**. Mantén
> esa convención al escribir código nuevo, comentarios y textos de interfaz.

## Qué es

**Atlas Vectorial**: galaxia navegable de embeddings fastText. 50.000 palabras por
idioma (es/en) colocadas en 3D por *simulación de fuerzas sobre su grafo kNN*, no
por reducción de dimensiones. Sitio estático, sin servidor ni API.

`README.md` en la raíz es el documento de referencia: contiene las métricas
medidas, las decisiones de render y el estado por fases. Consúltalo antes de
cambiar nada de rendimiento o de formato de datos.

## Estructura de dos mitades

```
pipeline/   Python offline. Vectores .vec → binarios CSR. Se ejecuta a mano.
data/       Artefactos intermedios (_*.npy/_npz, ignorados por git) + binarios.
web/        Astro + una isla React. Sólo lee los binarios ya publicados.
```

`pipeline/all.sh` copia los seis binarios de `data/<lang>/` a
`web/public/data/<lang>/`. **La web nunca ejecuta el pipeline**: si cambias el
formato de salida hay que republicar a mano o reejecutar `all.sh`.

El sexto es `vecs.bin` (15 MB por idioma) y es el único que **no se descarga**:
el comparador pide 300 bytes por palabra con `Range:`. Es también el que se
olvida al publicar a mano — si falta, el comparador se apaga solo y el resto del
atlas no se entera, que es a propósito.

## Comandos

### Pipeline (Python 3.14, sólo numpy/scipy/Pillow)

```bash
./pipeline/all.sh es en                  # todo de punta a punta (~200 s por idioma)
python3 pipeline/fetch.py    es 100000   # etapa 00, cachea data/raw/es.vec
python3 pipeline/build.py    es 50000 1200   # etapas 01-07 (palabras, epochs)
python3 pipeline/vectors.py  es          # etapa 08, vecs.bin para el comparador
python3 pipeline/validate.py es          # vecinos conocidos, analogías, regiones
python3 pipeline/preview.py  es          # PNG offline, sin navegador
python3 pipeline/tune.py     es kr=0.006 epochs=1200   # sólo etapa 06 sobre _graph.npz
python3 pipeline/recolor.py  es          # sólo etapa 05 (comunidades) + reempaquetado
python3 pipeline/export_fixture.py es    # regenera data/fixture/ para los tests WGSL
python3 pipeline/og.py                   # tarjetas de enlace 1200x630 → web/public/og/
python3 pipeline/og.py /hnsw             # sólo una
```

`tune.py` y `recolor.py` existen porque el kNN y la poda son lo caro: reutilizan
`data/<lang>/_graph.npz`. Usa esos para iterar, no `build.py`.

### Web (desde `web/`)

```bash
npm run dev            # astro dev
npm run build          # astro build → dist/
npm test               # check + unit + physics + render + descent + seo
npm run check          # tsc sobre src/galaxy/**/*.ts y src/components/**/*.tsx
npm run test:physics   # node test/physics.mjs
npm run test:render    # node test/render.mjs
node test/unit.mjs es  # lógica pura, sin GPU, < 1 s
npm run test:seo       # build + node test/seo.mjs (metadatos y tarjetas, sin GPU)
```

Test individual con argumentos (los runners son scripts, no un framework):

```bash
node test/render.mjs en 400          # idioma, pasos de física
SEL=1234 node test/render.mjs es     # captura del estado seleccionado
SEL=1234 SEL_FOCUS=0 node test/render.mjs es   # selección sin volar la cámara
```

`test/render.mjs` escribe `data/gpu_<lang>.png` — míralo, es media prueba.

**Los tests necesitan GPU real vía Dawn** (`@kmamal/gpu`), no navegador:
Chrome headless no expone WebGPU en esta máquina. `test/physics.mjs` depende de
`data/fixture/` (referencia numpy); si no existe, `export_fixture.py`.

`npm run check` **no** cubre `.astro` ni los `.wgsl`. Los errores de WGSL sólo
aparecen al compilar el módulo: los dos tests imprimen `getCompilationInfo()` y
abortan con `exit 1` ante un error, así que son el linter real de los shaders.

## Arquitectura de la web

### Dos motores, uno elegido en arranque

`Galaxy.tsx` sondea `gpuAvailable()` una vez y no cambia en caliente (un canvas no
puede tener contexto WebGL y WebGPU a la vez). Ambos cumplen la interfaz `Viewer`
(`select` / `pick` / `dispose`):

- **`galaxy/gpu/engine.ts`** — WebGPU, simulación viva. Es el camino principal.
- **`galaxy/scene.ts`** — Three.js/WebGL, posiciones fijas del pipeline. Respaldo.
  Sin física. `pick()` es async sólo para igualar la firma.

`Controls.tsx` (y los sliders de física) sólo se montan con WebGPU. La
**navegación no**: los dos motores orbitan con el ratón y vuelan con el teclado.
El teclado vive en `galaxy/keys.ts` (`KeyFly`) precisamente porque cada motor
tiene su propia cámara — `gpu/camera.ts` una a mano, `scene.ts` la de Three.js —
y meterlo dentro de una de las dos dejaba al otro motor sin teclas, que es lo que
pasó la primera vez.

`KeyFly` tiene **dos modos** y el motor se los pasa con `setMode`: en `orbit`
—el de casa— **la galaxia no se mueve de sitio**, ninguna tecla ni arrastre toca
el centro de la órbita (WASD giran igual que las flechas, Q/E alejan y acercan) y
el paneo con botón derecho está desactivado; en `fly` se suelta la cámara y WASD
trasladan. El pivote a la deriva era lo que hacía que el siguiente giro pareciese
torcido. El clamp del polo es `EPS = 0.035` rad en los dos motores, no `1e-4`:
con la vista paralela al `up` fijo el `lookAt` degenera y la imagen daba un giro
salvaje justo al llegar arriba o abajo.

El **tope de alejamiento** (`ZOOM_OUT = 2.5` en `keys.mjs`, en múltiplos del
encuadre completo) también vive en el módulo compartido y lo aplican los dos
motores al final de su `update()`, no en cada sitio que toca `distance` — son
tres (rueda, teclado y un vuelo en curso) y lo que importa es que ninguno pueda
dejar el frame fuera de rango. Al chocar se pone `vDist` a cero: sin eso la
inercia sigue empujando contra el tope y el primer empujón de vuelta se lo come
ella, con lo que el zoom se siente pegado. Sin tope la galaxia encoge hasta un
grumo de dos píxeles y la rueda parece haber dejado de funcionar; la salida
(`Inicio`, el botón de vista completa) existe pero exige saber que existe.

`KeyFly` sólo devuelve velocidades **normalizadas**
(fracción de la distancia de órbita, radianes, fracción de zoom) ya amortiguadas;
cada motor las traduce a su sistema. Ahí está también el tacto: los impulsos, la
amortiguación de 0,86 —la misma que el ratón—, el filtro de foco en un `<input>`
y la lista de teclas que despiertan el bucle de render.

En Linux, Chrome sin `chrome://flags/#enable-unsafe-webgpu` cae al respaldo
WebGL, así que **el camino que se ve en esta máquina al abrir el navegador suele
ser `scene.ts`**, no el motor principal. Cualquier control que sólo se enganche
en `gpu/` parecerá roto al probarlo.

### El dato nunca vuelve a la CPU

El invariante que gobierna el motor WebGPU: las posiciones viven en un
`storage buffer` de doble búfer que escribe `physics.wgsl` y leen directamente
`render.wgsl`, `cull.wgsl` y `pick.wgsl`. No hay vertex buffers, no hay subida
por frame. Consecuencias que hay que respetar al tocar `engine.ts`:

- Nada que necesite posiciones en CPU puede hacerse por frame. `focus()` copia
  **16 bytes** (un nodo) y sólo al enfocar; `readStats()` lee 32 bytes cada 400 ms.
- Hay un único buffer de staging por recurso, así que toda lectura pasa por
  `this.queue()`, que las serializa en una cadena de promesas.
- `pick()` es un dispatch sobre 50.000 nodos + mapeo de buffer: el hover se
  sondea cada `HOVER_MS = 90`, nunca por evento de ratón.

### Render dirigido por GPU

`cull.wgsl` compacta lo visible y **escribe los propios argumentos de draw** en
`drawArgs` con `atomicAdd`; el bucle emite `drawIndirect` sin saber cuántas
primitivas salen. Detalles frágiles:

- `drawArgs` son 32 bytes: nodos en offset 0 (`[6, count, 0, 0]`, quad de 6
  vértices instanciado) y aristas en offset 16 (`[count, 1, 0, 0]`, line-list).
  El contador atómico está en un **campo distinto** en cada caso.
- Se resetea con `ARGS_RESET` cada frame antes del cull.
- El descarte por **longitud en pantalla** (`minEdgePx`) es el que paga: una
  arista de medio píxel rasteriza igual que una de cien.
- `cullEdges` descarta de forma conservadora (sólo si ambos extremos caen fuera
  por el *mismo* plano); relajar eso abre huecos en la malla.

Los pipelines de nodos y aristas **comparten bind group**, así que su
`GPUBindGroupLayout` es explícito: con `layout: "auto"` cada pipeline genera uno
distinto e incompatible. Lo mismo para los dos entry points de `cull.wgsl`.

### Color: nodos blancos, zonas en las aristas

Los nodos son **blancos**, siempre. Todo el color lo ponen las aristas, y sale de
`galaxy/palette.mjs`: el **ángulo del centroide** de cada región en el plano
principal de la nube fija su posición en una **rampa de nebulosa** (`RAMP`), así
que dos regiones que se tocan reciben colores contiguos y el color se lee como
vecindad, no como etiqueta. Detalles que importan si lo tocas:

- la rampa es la parte que **no** se deduce del dato: doce anclas `[t, L, tono]`
  que recorren el círculo en orden de nebulosa (cian · azul eléctrico · violeta ·
  magenta · rosa · ámbar · amarillo · verde). Tiene que **cerrar** sobre sí misma
  o la galaxia se parte por una costura;
- **el croma no está en la rampa**: se pide `MAX_C = 0.45`, más del que cabe en
  sRGB, y `fitChroma` biseca hasta el borde exacto de la gama. Eso es lo que
  separa un neón de un pastel — con un croma fijo y modesto, el magenta (que
  llega a 0,31) se quedaba a medio gas igual que el cian (que sólo llega a 0,15);
- `L` se recorta a `L_MAX = 0.93`. No es cosmética: en Oklab, `L ≥ 1` es blanco y
  **no admite croma**, así que la inclinación por el tercer eje dejaba blancos y
  sin color a los nodos de las zonas claras;
- el reparto se **ecualiza** (`hueMap`): con el ángulo crudo, cuatro regiones
  apiñadas en el mismo sector salían del mismo color;
- cada nodo se desvía un poco del color de su región hacia la vecina, así que
  las fronteras se funden en vez de cortarse;
- el espacio es **Oklch**, no HSL: el blending es aditivo y suma *luz*, y en HSL
  el amarillo pesaría el triple que el azul al mismo brillo nominal. Interpolar
  la rampa en RGB tampoco vale: cian→magenta pasaría por un gris sucio.

El defecto de `edgeBright` es **0,85**, no 0,5: con los tonos en el borde de la
gama la malla a 0,5 se veía apagada. El control llega a 1,6 y a partir de ~1,3 el
núcleo se lava a blanco, que es un aspecto legítimo — pero deja de decir la zona.

### Canal de resalte

La selección no usa buffers extra: un solo `f32` por nodo en `dim`
(`<1` atenuado, `1` normal, `>1` resaltado, y el exceso es la intensidad). Los
cuatro escalones viven en `galaxy/highlight.mjs` (`rest` · `ring2` · `ring1` ·
`self`, más `hover`) y los comparten los dos motores y el test. Las aristas
heredan el resalte de sus extremos en el vertex shader. Seleccionar implica volar
la cámara (`focus`): con 50.000 nodos, brillo sin encuadre no basta.

Tres cosas que no son obvias y que se rompen solas si se tocan:

- el empujón del resalte va en el **color**, no en el alfa: el factor de mezcla
  se recorta a 1 antes del framebuffer, así que multiplicar el alfa no subía nada;
- `selEdge` **se deduce de `edgeBright`** (`(1/edgeB − 1) / (HL.self − 1)`), y no
  es un número fijo: lleva la arista a color pleno y ni un paso más. Con un valor
  fijo, al subir el brillo de la malla el camino se pasaba de 1 en los tres
  canales y salía blanco — perdiendo justo lo que el color transporta, la zona;
- un nodo **atenuado encoge** y se dibuja a `DUST_Z` (un cuanto por delante del
  plano lejano): los nodos escriben profundidad, y un punto de fondo por delante
  de un vecino le recortaba un agujero negro en mitad del disco;
- el hover escribe **4 bytes** en `dim`, no los 200 KB del buffer: se sondea cada
  90 ms.

### El comparador y los vectores 300D

La ficha de una palabra sale del grafo. El comparador **no puede**: la similitud
entre dos palabras cualesquiera no está en `edges.bin`, que sólo guarda el peso
de las aristas del kNN podado. «camello» e «inglaterra» no son vecinos de nadie
en común, así que no hay número que leer. Y la regla es que toda afirmación se
calcula en 300D. De ahí `vecs.bin`.

Lo que hay que respetar si se toca:

- el registro son **300 bytes contiguos y sin cabecera**. Eso es lo que permite
  `Range: bytes=i*300-(i*300+299)`. Meter un `Float32` de escala por fila
  desalinearía cada registro sin comprar nada;
- **la escala no se publica**. El coseno es invariante a escala y
  `vectors.ts:decode` renormaliza. La escala por vector es cosa del emisor;
- es **int8 con escala por vector**, no global. Con escala global el error del
  coseno sube unas cinco veces: la mediana de `max|x|` es 0,19 y el máximo 0,54,
  así que unos pocos atípicos se llevarían todo el rango. `pipeline/vectors.py`
  mide el error en la misma corrida que produce el archivo y avisa si asoma al
  segundo decimal;
- `dims` viaja en `meta.json` porque el cliente necesita el tamaño del registro
  **antes** de pedir su primer rango;
- `vectors.ts` tiene que aguantar dos respuestas que no son hipótesis: un `200`
  con el archivo entero (servidor que ignora el rango → se cachea entero) y un
  `404` (`available = false` → el comparador se apaga sin romper nada).

`compare.mjs` es `.mjs` por lo mismo que `palette` y `path`: `test/unit.mjs` lo
importa tal cual. El MDS es clásico (Torgerson) con Jacobi sobre una matriz de
5×5 — exacto y sin iterar. **Los dos ejes comparten escala**: normalizarlos por
separado llena el recuadro a costa de estirar una dirección más que la otra, y
entonces las distancias del dibujo dejan de ser las de 300D, que es lo único que
ese gráfico promete.

La línea de referencia de las barras (`typical`) es la **mediana** de los pesos
del CSR, no la media: la cola de pares casi idénticos arrastraría la media a un
sitio donde casi nada la alcanza. Sin esa línea, un 0,35 no significa nada.

El grupo se enciende **solo** al cambiar la lista, y el efecto depende de
`roads` y no de `ids`: con `ids` encendería el grupo sin los caminos y volvería
a encenderlo un instante después, dando dos vuelos de cámara por palabra.

### La presentación

`Welcome.tsx`: cuatro pantallas que dicen qué es un embedding, que las
posiciones salen de unos muelles y no de una proyección, que el color es barrio,
y qué se puede hacer. Sin ellas la galaxia es un salvapantallas: nada en la
pantalla dice que cada punto sea una palabra.

- **Sale una vez** (`localStorage`, `atlas.intro.v1`) y **no sale sobre un
  enlace compartido**: si la URL trae `?w=` o `?cmp=`, alguien apuntó a algo
  concreto y taparlo es contestar a una pregunta que nadie hizo.
- **Se reabre** desde el botón `?` de la tira de herramientas, que sigue a la
  vista con el cajón plegado. Dentro del cuerpo del cajón desaparecería al
  plegarlo, justo cuando hace falta.
- Se sale por `Esc`, por el velo y por el botón — la misma regla que la
  selección. El `Escape` va **en captura**: el de `Galaxy.tsx` escucha en
  `window` y soltaría la selección de debajo en vez de cerrar el cuadro.
- El alto del cuadro tiene **suelo** (`min-height`) y el pie va con
  `margin-top: auto`: las cuatro pantallas no miden lo mismo y con el cuadro
  centrado el botón se movía bajo el dedo entre un «siguiente» y el siguiente.
- Los colores de la tercera lámina salen de `rampCss` en `palette.mjs`, no de
  una copia: una segunda rampa se queda desfasada en cuanto se toca la primera,
  y entonces la explicación del color deja de describir el color.
- El velo es translúcido y desenfocado, no negro: detrás se sigue viendo girar
  lo que se está explicando, que es la mitad del argumento.

### La primera pantalla: leyenda, familias, analogías y arranque

Al abrir el atlas no había ni una lectura ni un gesto. El raíl derecho está
vacío hasta el primer clic —los mandos de física sólo existen en WebGPU y la
ficha no existe sin selección—, y el color, que es la mitad de lo que el dibujo
dice, no se explicaba en ninguna parte. Cuatro piezas lo llenan, y todas siguen
la misma regla: **aparecen sólo cuando dicen algo**.

- **`Legend.tsx` + `regions.mjs` — la leyenda del mapa.** El nombre de una
  región son sus tres palabras **más frecuentes y no vacías** (`flags`): con las
  vacías dentro, media galaxia se titulaba «de · la · que». Pasar el ratón la
  enciende **sin mover la cámara** (`previewGroup`), que es lo que convierte la
  lista en mapa; clicar vuela, pero al **núcleo** (`core`, el 90% más cercano al
  centroide), no a los miembros sueltos que el grafo dejó lejos — misma razón
  que el percentil 95 del encuadre inicial. El resalte de paso lleva 110 ms de
  retardo: cada uno reescribe el canal `dim` entero.
- **`Pattern.tsx` + `pattern.mjs` — familias.** `*mente` enciende las 508 de
  golpe y se ve que **no se apilan**: salpican todos los barrios, que es la
  demostración de que aquí agrupa el significado y no la terminación. Busca
  sobre la clave **plegada** del índice (`*cion` encuentra «-ción»), sin comodín
  significa «contiene», y el patrón se escapa antes de compilar — la caja la
  teclea cualquiera y un `(` suelto no puede lanzar. Hay tope (`MAX = 1000`):
  resaltar 30.000 nodos es apagar 20.000.
- **`Analogy.tsx` + `analogy.mjs` — `rey − hombre + mujer`.** Es la única
  pregunta que **no** se contesta con filas sueltas: la respuesta es la más
  parecida de las cincuenta mil a un punto que no ocupa ninguna palabra. Por eso
  este panel —y sólo éste— llama a `Vectors.loadAll()` y baja `vecs.bin` entero
  (15 MB) **al pulsar**, con barra de progreso: quince segundos de botón mudo se
  leen como roto. El coseno se calcula contra los bytes int8 con la norma
  inversa precalculada, sin desempaquetar 60 MB de `Float32Array`. Las tres
  palabras de la pregunta se **excluyen** de la respuesta: sin eso, `rey −
  hombre + mujer` contesta `rey`.
- **`Start.tsx` — por dónde empezar.** Ocupa el hueco de la ficha mientras no
  hay ficha: seis ejemplos, palabra al azar y camino sorpresa. El azar sale de
  `common()` —rango de frecuencia < 4.000 y sin vacías—, no de las 50.000: caer
  en `zzzz` la primera vez enseña que el atlas está lleno de basura. El camino
  sorpresa **comprueba que hay camino** antes de ofrecerlo (el grafo podado deja
  islas).

### Reposo, encuadre y enlace

- **Modo atractor.** Veinte segundos sin ratón ni teclas **y con las manos
  vacías** (`canAttract`: sin selección, sin camino, sin grupo, sin
  presentación) y la galaxia deriva sola (`ATTRACT_YAW`, una vuelta cada ~95 s)
  encendiendo una palabra cada 5,5 s. Dos cosas que no son obvias: la deriva va
  dentro de la cámara de cada motor y `moving()` la cuenta, o el **salto de
  frame en reposo** se comería el movimiento; y el destello usa `spotTiers`,
  que **no atenúa a nadie** — con el reparto normal (`rest = 0,08`) el atractor
  apagaba la nebulosa justo cuando la nebulosa es el cartel.
- **Vista completa visible.** El icono de 15 px de la tira existía desde
  siempre y perderse seguía siendo el estado más fácil de alcanzar. Ahora hay
  una píldora `.go-home` en el lienzo que **sólo sale cuando hace falta**:
  cámara movida (`roamed`) o algo cogido. Por eso puede permitirse ser grande y
  escribir la palabra.
- **Compartir la vista** (`share.mjs`). La órbita entera en seis números
  (`?cam=x,y,z,d,th,ph`), no la matriz de vista: es el estado que **los dos
  motores comparten**, así que un enlace hecho en WebGPU abre igual en el
  respaldo WebGL. `decodeCam` devuelve `null` ante cualquier cosa que no sean
  seis números finitos con distancia positiva — la URL la escribe cualquiera y
  una cámara a medio leer es una pantalla negra sin explicación. Al abrir un
  enlace con cámara, la selección **no vuela** (`fly: false`): el encuadre del
  enlace es el mensaje.

### La salida tiene que verse tanto como la entrada

Seleccionar es un clic en un punto; soltar era un «×» de 11 px en la esquina de
un panel del raíl derecho — y con un grupo del comparador resaltado no había
ficha, así que no había ningún botón. Hay cuatro salidas y las cuatro llaman a
`clear()`: la píldora `.held` en el borde superior del lienzo (que dice **qué**
se tiene cogido), el botón de la ficha con la palabra escrita, `Esc`, y el
**clic en el vacío** —el que `hintOut` promete—. Este último es el que se cuela:
el `pick` que no acierta a nadie devuelve `null` y `choose(null)` parecía
bastar, pero `choose` no es la salida, es la entrada con el argumento vacío. Con
las manos vacías el clic en el hueco no hace nada, porque mover la cámara sola
al pinchar en el fondo es un gesto que nadie pidió.

`clear()` **también deshace el vuelo**, con el mismo `goHome()` del botón de
vista completa. Seleccionar clava el centro de la órbita en la palabra
(`focus`), así que apagar sólo el resalte dejaba la galaxia girando alrededor de
un punto cualquiera de un brazo: el atlas no parecía haber vuelto atrás, parecía
haberse torcido. Soltar devuelve el eje al centro que fijó `frame()`.

`Esc` vive en `Galaxy.tsx` y **no** en `KeyFly`: `KeyFly` se instancia una vez
por motor (`gpu/camera.ts` y `scene.ts`), y colgarla de uno la dejaría muerta en
el otro — el mismo error que ya documenta este archivo para el teclado. El
filtro de foco sí se comparte: `typing()` se exporta desde `keys.mjs`, porque
`Escape` dentro del buscador cierra el desplegable y sólo fuera suelta la
selección.

`.held` lleva `pointer-events: none` y sólo su botón los recupera: si no, la
píldora le robaría al lienzo la franja de arriba para orbitar.

`lit` es estado propio porque el resalte de grupo no pasa por `sel` ni por
`path`; sin él nada sabría que queda algo que soltar. Y `show()` lo apaga,
porque tanto `select` como `selectPath` reescriben el canal de resalte entero.

### La tira de herramientas, plegada y a pantalla completa

- **Modo inmersivo** (`.zen`, tecla `F`, botón de la tira). Pantalla completa
  del navegador **y** la interfaz fuera: quitar la barra del navegador dejando
  tres paneles que tapan un tercio del lienzo no es pantalla completa. El estado
  es propio y `requestFullscreen` es un extra que puede fallar (iframe sin
  permiso, navegador que lo niega) — atar el modo a la API dejaría el botón sin
  hacer nada en esos sitios. `fullscreenchange` lo apaga cuando se sale por
  fuera (`Esc`, `F11`), y `Esc` sale del modo **antes** que de la selección:
  quien lo pulsa con la interfaz escondida quiere la interfaz.
  Se esconde con `display: none` y no con `opacity`: un panel invisible que
  sigue recibiendo el ratón se lleva los arrastres que iban al lienzo.
  **La atribución no se esconde** — es el único requisito legal del proyecto y
  un modo de pantalla no es una excusa; se aparta al borde y baja de tinta.
  Y siempre queda un mando a la vista (`.zen-exit`, arriba a la derecha, con las
  teclas escritas): un modo del que no se ve cómo salir se sale cerrando la
  pestaña.
- **Plegado, el cajón mide lo que miden sus botones.** Antes seguía siendo una
  columna de borde a borde con la tira arriba y dos palmos de negro debajo, que
  además le robaba al lienzo el borde izquierdo entero para orbitar. El truco
  está en el cuerpo: escondido con `visibility` seguía **midiendo**, así que hay
  que darle `height: 0` al plegarlo o el cajón no encoge.
- **Los botones miden 2,15 rem** (34 px) y no 1,7 (27): son la única navegación
  que queda a la vista con el cajón plegado, y 27 px están por debajo de lo que
  se acierta sin apuntar. Con puntero grueso suben a 2,75 rem (44 px). El tamaño
  del icono vive en `.tool svg`, no repartido por siete componentes.
- **La flecha del cajón va en negativo** (fondo blanco, flecha negra, trazo 2).
  Es el único mando que hay que encontrar *sobre la galaxia*, y un icono de
  trazo fino en blanco desaparece en cuanto detrás pasa un brazo claro de la
  nebulosa. Un bloque sólido no se pierde nunca. El trazo sube porque en oscuro
  sobre claro la línea se lee más fina que al revés.

### Lo que *no* sirve aquí: occlusion culling

Es la primera idea que trae cualquiera que venga de videojuegos, y en esta escena
no muerde. Dos razones, ambas medidas:

- **Las aristas no se tapan entre sí.** El pipeline es aditivo
  (`dstFactor: "one"`), sin escritura de profundidad y con `depthCompare:
  "always"`. Una arista «detrás» de otra no queda oculta: *suma luz*. Descartar
  las tapadas apagaría la nebulosa, que es justo lo que se está dibujando.
- **Los nodos no tapan nada.** Son discos de 2 px: 0,98 ms de los 10,49 del
  dibujo a 720p. Aunque el descarte fuese gratis y perfecto, el techo del ahorro
  está por debajo de 1 ms — y una pasada de profundidad más su pirámide Hi-Z
  cuesta más que eso.

Los juegos ganan con esto porque una pared tapa el 40% de la pantalla y esconde
una habitación de geometría opaca. Aquí no hay pared: hay niebla translúcida
sobre el 44% de los píxeles. La palanca equivalente en esta escena es reducir
**overdraw**, no visibilidad — y eso es lo que hace el adelgazamiento de la malla.

### Presupuesto de frame

`BUDGET = 15 ms`. Cuatro palancas, en orden de impacto:

1. **Opacidad de aristas** — a 0 se salta el draw entero.
2. **Adelgazamiento de la malla** (`lodScale` 0,35–1,0) — hash estable por arista
   en `cull.wgsl`, con el brillo compensado por `1/lod`. Medido: `keep` 0,40 baja
   el dibujo de 10,49 a 5,05 ms. Es la palanca correcta porque el coste no es el
   *número* de aristas sino la **longitud rasterizada total**: el descarte por
   `minEdgePx` sólo quita las cortas y se agota enseguida (de 123k a 68k aristas
   sólo ahorra 14,22 → 12,32 ms).
3. **Resolución adaptativa** (`resScale` 0,55–1,0).
4. **Salto de frame en reposo** (`params.running` falso + cámara quieta +
   `!dirty`).

Las dos del medio van **en cascada y en ese orden**: al ir corto se sacrifica
primero la malla y sólo después la resolución; al ir sobrado se recupera primero
la resolución. Los nodos son lo que hay que apuntar y clicar; la niebla, no.

Los umbrales se leen **contra el vsync**: a 60 Hz un frame sano mide 16,7 ms
porque el navegador lo bloquea ahí, así que «voy sobrado» es `dt < 1,15·BUDGET`
(clavado en el vsync) y «voy corto» es `dt > 1,3·BUDGET` (saltándomelo). Con el
umbral de recuperación por debajo del periodo de vsync la calidad bajaba y no
volvía a subir jamás.

Y el lazo es **AIMD** (el de TCP): baja de golpe (−0,10), sube a pasitos (+0,01),
y **recuerda el nivel que falló** en `lodCeil`, al que no vuelve. Esto no es
refinamiento: es la diferencia entre 60 fps y la *sensación* de 60 fps. Con vsync
el reloj sólo sabe decir 16,7 («entré») o 33,3 («me lo perdí»); un lazo sin
memoria oye «entré», sube la calidad hasta pasarse, oye 33,3, la baja, y vuelve a
empezar — **caza** cruzando el vsync para siempre. Simulado sobre el coste medido
a 1080p, 900 frames: sin memoria da 50 fps de media con el **33% de los frames
por debajo de 55**; con memoria, 59,9 fps y **0%**. La media apenas cambia; lo
que cambia es que deja de dar tirones.

`CALM = 90` frames (1,5 s) de tregua tras cada bajada, y el techo se re-tantea una
sola vez por periodo de calma — si no, acercarse a un barrio (donde el frustum ya
deja poquísimo) nunca devolvería la malla entera.

El camino de la selección está **exento** del adelgazamiento y del recorte por
longitud (`hl[a] > 1 || hl[b] > 1` en `cullEdges`): son unas decenas de aristas y
son justo las que se está mirando.

Cualquier cambio de parámetro que deba verse debe llamar a `invalidate()`.

## El armazón compartido: `styles/shell.css` y `components/icons.tsx`

El **mueble** de la página vive fuera de cada sala. `web/src/styles/shell.css`
tiene los tokens de tinta, el cajón izquierdo con su tira de herramientas, el
raíl derecho, la ficha, las píldoras del lienzo y el modo inmersivo; los iconos
de la tira están en `web/src/components/icons.tsx`. La clase raíz es `.shell`
más las de estado (`side-open`, `zen`).

El reparto es el mismo en todas las salas y **no** es decorativo:

- **izquierda**, lo que se elige y se ajusta;
- **derecha**, lo que la sala tiene que decir ahora mismo;
- **el lienzo**, para lo que se ha venido a ver, con las salidas apareciendo
  sólo cuando hacen falta.

Salió de aquí porque la sala del descenso se había inventado un mueble propio
—chips de diez píxeles a la derecha y un pie sin una sola regla de estilo, que
se dibujaba encima del título porque nadie le había dado posición— y no tenía
parentesco visible con el atlas. Ahora `descenso.astro` importa `shell.css` y
sólo escribe lo suyo.

**Lo que todavía no está resuelto**: `galaxia.astro` sigue llevando su propia
copia de esas reglas dentro de su `<style is:global>`. Es la implementación de
referencia —`shell.css` salió de ella— y por eso no se ha vaciado todavía: hay
diferencias de un par de píxeles en `.ctl`, `.held` y `.ctl-row`, y fundirlas
cambiaría el aspecto del atlas, que no era lo que se estaba arreglando. `.shell`
ya está en su clase raíz, así que el día que se unifiquen los valores basta con
importar la hoja y borrar el bloque. Los iconos **sí** están ya compartidos.

## Segunda sala: `descenso` (fase 01)

`web/src/pages/descenso.astro` + `web/src/rooms/descent/`. Cinco superficies
clásicas, tres optimizadores, relieve sombreado con curvas de nivel, estelas por
acumulación en pantalla y presupuesto de frame.

La fase 00 preguntaba si el armazón del atlas se despega de su dato. La
respuesta, medida y todavía vigente:

- **Se hereda entero el armazón.** `gpu/camera.ts` y `keys.mjs` entran sin tocar
  una línea —órbita, rueda, vuelo con teclado e `Inicio` funcionan solos—,
  `palette.mjs` tiñe el color por origen y, desde el rediseño, `shell.css` e
  `icons.tsx` ponen la interfaz entera.
- **No se hereda ningún shader.** `physics.wgsl`, `cull.wgsl` y `pick.wgsl` no
  aplican; tampoco `loader.ts`, el CSR ni el canal de resalte.
- **El paso cuesta ~3,5 ms de los 15** a 40.000 caminantes y 8 pasos por frame.
  Es local y sin vecinos: mucho más barato que LinLog.

Página aparte y no un modo de `index.astro` a propósito: `Galaxy.tsx` habla en
vocabulario de grafo y no generaliza, un canvas no admite WebGL y WebGPU a la
vez, y quien viene por el gradiente no debe descargar los 2,1 MB del atlas.

### Cómo se dibuja, y por qué así

Cuatro decisiones que son el rediseño entero, y las cuatro contestan a lo mismo:
la sala se veía **rara y muda** — una tela marrón con confeti encima.

- **La bolita se dibuja dos veces.** `vsWalker`/`fsWalker` va dentro de la
  textura de estelas, en aditivo, pequeña y tenue: es el rastro. `vsHead`/`fsHead`
  va **sobre el lienzo ya compuesto**, con mezcla alfa y sombreado de esfera
  (normal reconstruida del propio quad, difuso, especular duro y filo): es la
  bolita. Un solo dibujo aditivo hace muy bien el flujo y muy mal *un
  caminante*, y la pregunta de la sala es cómo baja **uno**. La cabeza va en la
  pasada de composición, después de la estela: al revés, la estela le sumaría
  luz encima y volveríamos al confeti. Por eso esa pasada tiene ahora adjunto de
  profundidad y `compPipe` declara un `depthStencil` que no lee ni escribe.
- **Curvas de nivel en el relieve** (`band()` en `surface.wgsl`, ancho constante
  en pantalla vía `fwidth`). La malla sombreada dice dónde hay pendiente pero no
  cuánta. Las curvas van sobre la altura de mundo —que es la pérdida en
  logaritmo—, así que cada una es un escalón igual: se apiñan donde cae rápido y
  se separan donde el valle es plano. Es lo que convierte el relieve en un mapa.
- **Diana en cada mínimo conocido** (`Surface.min` en `field.mjs`, ya en mundo
  xz al escribir el uniforme). Sin blanco a la vista, «descender» no tiene a
  dónde. En Himmelblau son cuatro y ésa es la superficie entera; **la silla no
  tiene ninguna, y que no la haya es su respuesta**. El bucle de las cuatro
  ranuras va **sin `continue`** —apaga multiplicando por `m.z`— porque `fwidth`
  es una derivada y no todos los backends la admiten bajo una rama.
- **La vertical se aplanó y la cámara subió.** `H_SPAN` pasó de 4,3 a 2,2 y el
  ángulo polar por defecto de 1,15 rad a 0,78 (`PHI_RELIEF`). Con la vertical
  tan alta como el ancho y la cámara casi de canto, el relieve no parecía un
  paisaje sino una tela doblada: las paredes de pérdida alta se levantaban por
  encima de la cámara, tapaban el valle y se acababa mirando la cara de abajo de
  la malla. El encuadre usa `radius · 0,95`: menos recorta las esquinas del
  dominio, que en la silla es justo por donde se escapan.

Y dos que son de reparto, no de dibujo:

- **`N_DEFAULT` bajó de 40.000 a 8.000**, con `N_REF = 40.000` aparte como
  referencia de exposición. A cuarenta mil, con dos píxeles de radio y mezcla
  aditiva, lo que se ve es niebla. El mando sigue llegando a `N_MAX`.
- **El color del caminante es un mando** (`Options.heat`). Por **altura** —rojo
  arriba, cian abajo— el enjambre se enfría al bajar y «asentado» deja de ser
  una palabra del HUD; por **origen** es el mapa de cuencas de Himmelblau.
  Arranca en altura porque es la que se entiende sin leer nada. Cambiarlo borra
  la estela: media traza contando la lectura anterior es peor que ninguna.

### Lo que se rompe solo si se toca

- **`field.wgsl` se antepone** a `walkers.wgsl`, `surface.wgsl` y `render.wgsl`
  al crear los módulos. La función y su gradiente se definen una vez: el paso
  baja por el gradiente y el vértice necesita la altura, y dos copias dejan al
  caminante flotando sobre una superficie que no es la que desciende.
- **Rosenbrock tiene dos tiempos con un factor 400 entre ellos.** El término en
  y es `200·(y − x²)`, así que en menos de diez pasos todos han caído sobre la
  parábola; recorrerla hasta (1,1) cuesta cuatro mil. Por eso el motor va a un
  paso por frame los primeros 40 y a ocho después. El botón de **un paso**
  (`stepOnce`, tecla `N`) existe por lo mismo: nadie ve lo que no puede parar.
- **`projXX`/`projYY` salen de la proyección, no de `viewProj`.** Mismo error
  que ya documenta el atlas: con `viewProj[0]` el caminante cambia de tamaño al
  orbitar.
- El rastro y la bolita leen exactamente lo mismo, pero con `layout: "auto"`
  cada pipeline se inventa su propio layout: hacen falta **dos juegos de bind
  groups**, no uno.

```bash
node test/descent.mjs                       # compila shaders + numpy + PNG
DESC_FRAMES=14 DESC_N=2500 node test/descent.mjs   # a medio descender
python3 pipeline/export_descent_fixture.py  # regenera data/fixture/descent/
```

`test/descent.mjs` escribe `data/descent.png` (las cinco superficies) y
`data/descent_opt.png` (los tres optimizadores sobre Rosenbrock). **Míralos, son
media prueba.** La corrida por defecto llega a converger, y ahí las bolitas
están todas metidas en la aguja del mínimo: para ver *cómo bajan* hay que parar
antes con `DESC_FRAMES`. Chrome en esta máquina cae al respaldo WebGL —donde
estos shaders no existen—, así que el estado convergido **sólo** se puede ver
por Dawn.

## Lo que se ve sin abrir la web

El HTML que sale del build tiene el `<body>` **vacío**: la portada y las seis
salas son islas `client:only`. Un navegador lo rellena en 200 ms; el raspador de
tarjetas de WhatsApp, GPTBot, ClaudeBot, PerplexityBot y cualquier lector de
texto, no. Todo lo que este sitio puede *decir* sin ejecutarse vive en cuatro
sitios y **ninguno de los cuatro escribe su propio texto**:

```
src/seo.json          la fuente única: dominio, títulos, descripciones, temas
├── components/Seo.astro    <head>: canonical, OG, Twitter, JSON-LD, manifest
├── components/SeoBody.astro <h1> para lector de pantalla + alternativa <noscript>
├── pages/{sitemap.xml,robots.txt,llms.txt}.ts   endpoints, no archivos en public/
└── pipeline/og.py           las tarjetas 1200x630 de public/og/
```

Está en **JSON y no en un `.ts`** porque el quinto lector es Python. Y está en
un solo archivo porque el fallo que evita no se ve en la web: se ve tres días
después, en el móvil de quien recibió el enlace, cuando Facebook ya cacheó una
tarjeta que dice el título viejo.

Detalles que no son obvios:

- **La tarjeta es un JPEG, no la página.** Ningún raspador ejecuta WebGPU, así
  que la miniatura del enlace es una composición offline: la captura de
  `public/previews/` recortada, un velo que se abre de izquierda a derecha
  —degradado por columnas, no una caja: un borde recto se lee como recorte mal
  hecho— y encima la misma tipografía de la web. `zoom`/`focus` por página
  existen porque MCTS y K-Means tienen el sujeto pequeño y centrado, justo
  debajo del titular.
- **La de la portada es la aplicación de verdad**, con el cajón izquierdo, la
  tira de herramientas y la atribución: dice «esto se toca», que es lo que una
  composición tipográfica no dice. La hace `node test/shot.mjs` conduciendo un
  Chromium por el protocolo de DevTools —`--screenshot` a secas dispara antes
  de que el visor haya dibujado— y `layout: "ui"` en `seo.json` le escribe la
  marca y el titular **por la derecha**, que es el lado que la captura deja
  libre; `raw` la deja sin nada encima. Dos cosas hay que hacer antes de
  disparar: marcar `atlas.intro.v1` (en un perfil nuevo la presentación tapa la
  pantalla) y capturar ya en 1200x630, porque el cajón se coloca respecto a la
  ventana y recortar un 16:9 después lo parte. Con `SHOT_GPU=1` el navegador
  levanta WebGPU sobre la Vega y la captura sale del motor bueno, no del
  respaldo WebGL.
- **La miniatura no usa los valores de casa del render** (`SHOT_TUNE`, que
  mueve los mandos de `Controls.tsx` como los movería una mano). Los de casa
  están pensados para que la sala se pueda *usar*: punto de 2 px, que es lo que
  se acierta con el ratón, y malla contenida para que no tape los puntos. Una
  miniatura no se usa: se mira a 200 px de ancho y de un vistazo, y ahí lo que
  hay que ver es la nebulosa. `minPx=1, edgeBright=1.05, minEdgePx=0.4` cambia
  el punteado por una malla encendida. El desplegable de simulación hay que
  abrirlo antes —los `input` no están en el DOM plegados— y volver a cerrarlo
  antes de disparar.
- **`og:image` absoluta, con `width`/`height` y por debajo de 300 KB.** Las
  rutas relativas no las resuelve nadie, sin medidas varios clientes se rinden
  antes de pedirla, y WhatsApp deja de mostrar la miniatura al pasarse de peso.
  Las tres cosas las comprueba `test/seo.mjs` sobre el `dist/` real.
- **`/data/` va cerrado en `robots.txt`.** Son 17 MB de int8 sin nada que
  indexar y todo el presupuesto de rastreo que gastar.
- **Los rastreadores de IA entran a propósito**, nombrados uno a uno, y
  `/llms.txt` les cuenta en texto plano lo que el canvas no puede contarles.
  Es lo que separa «TensorMesh es una web de IA» de una descripción correcta.
- **El `<h1>` de las salas es `.sr-only`.** No había ninguno: el título de la
  sala es un canvas y los únicos `<h2>` aparecen al seleccionar algo. Va oculto
  porque en pantalla taparía lo que hay que mirar, dice literalmente lo mismo
  que el `<title>` —que es lo que lo separa de un texto oculto— y de paso el
  lector de pantalla deja de entrar a la sala sin saber dónde está.
- **Las rutas viejas en español están vacías.** `Astro.redirect` en sitio
  estático **no renderiza la plantilla**: escribe su propia página de 329 bytes.
  `galaxia.astro` arrastraba 2.100 líneas de la sala entera que no llegaban al
  build. El 301 de verdad lo dan `netlify.toml` y `web/vercel.json`.

## Layouts duplicados (lo que se rompe en silencio)

Tres sitios describen los mismos bytes y **no hay tipo compartido entre ellos**:

| Estructura | Escritor | Lector(es) |
|---|---|---|
| Binarios `.bin` | `pipeline/build.py` (`pack`) | `web/src/galaxy/loader.ts`, `web/test/render.mjs` |
| Uniform de física (48 B) | `engine.ts:writePhys` | `physics.wgsl:Params`, `test/physics.mjs:writeParams` |
| Uniform de render (128 B) | `engine.ts:writeRender` | `render.wgsl:Uni`, `test/render.mjs` |
| Uniform de cull (96 B) | `engine.ts:writeCull` | `cull.wgsl:CullU`, `test/render.mjs` |
| Bind group de cull (7 entradas) | `engine.ts:cullBGL` | `cull.wgsl`, `test/render.mjs:cullBGL` |
| Uniform de pick (96 B) | `engine.ts:pick` | `pick.wgsl:PickU`, `test/render.mjs` |
| `vecs.bin` (300 B/palabra) | `pipeline/vectors.py` | `galaxy/vectors.ts`, `test/unit.mjs` |
| Uniform del relieve (160 B) | `rooms/descent/engine.ts:writeMesh` | `rooms/descent/surface.wgsl:MUni`, `test/descent.mjs` |
| Uniform del caminante (128 B) | `rooms/descent/engine.ts:writeWalker` | `rooms/descent/render.wgsl:Uni`, `test/descent.mjs` |
| Encuadre y ángulo de la sala | `rooms/descent/engine.ts` (`PHI_RELIEF`, `radius·0,95`) | `test/descent.mjs:camera` |
| Dominio y altura del campo | `rooms/descent/field.wgsl` | `rooms/descent/field.mjs` (encuadre y siembra) |

Los metadatos **ya no se duplican**: `web/src/seo.json` es la fuente única de
`Seo.astro`, `SeoBody.astro`, los endpoints de `sitemap.xml`/`robots.txt`/
`llms.txt` y `pipeline/og.py`. Si añades una página, empieza por ahí: sin su
entrada, `<Seo path="...">` aborta el build en vez de publicar una página muda.

`perspective`/`lookAt`/`multiply` viven en `test/mat.mjs` y el codificador PNG en
`test/png.mjs`: los comparten `render.mjs` y `descent.mjs`. Siguen siendo un
reimplementado de `camera.ts` —esa duplicación no está resuelta—, pero es **una**
y no una por test. Si tocas cualquiera de esas cosas en
`src/`, hay que replicarlo en el test o el PNG deja de representar la web.

El color de zona y los escalones de resalte **ya no se duplican**: viven en
`src/galaxy/palette.mjs` y `src/galaxy/highlight.mjs` y el test los importa. Son
`.mjs` con JSDoc y no `.ts` justamente por eso — `package.json` es
`type: commonjs` y Node no carga un `.ts` como módulo, mientras que `tsc` sí
tipa un `.mjs` (`allowJs`). Si añades lógica compartida con el test, ése es el
sitio.

Ojo con la convención de NDC: WebGPU usa z en `[0,1]` (estilo D3D), no `[-1,1]`.
La matriz de proyección de `camera.ts` **no** es la de WebGL/Three.js.

## Límites duros

- **65.535 nodos**: los destinos del CSR son `Uint16` en `edges.bin`. Pasar de ahí
  obliga a `Uint32` y duplica el archivo más pesado.
- **131.072 nodos**: `pick.wgsl` empaqueta 13 bits de distancia + 17 de índice en
  un `u32` para el `atomicMin`.
- El encuadre usa **centroide + percentil 95**, no la esfera envolvente: cuatro
  outliers la estiran y dejan el cuerpo de la galaxia diminuto en el centro.

## Reglas que no se rompen

- **La repulsión muestrea desde memoria compartida**, no del buffer global. En la
  integrada el muestreo negativo era puro fallo de caché y el paso escalaba con
  K; con el tile por workgroup el paso es **plano en K** (1,05 ms de K=8 a K=32
  frente a 1,38–3,15 ms antes). K ya no es un mando de rendimiento.
- **Toda afirmación se calcula en 300D.** Vecinos y similitudes salen de los
  vectores originales; el 3D existe sólo para los ojos. El comparador es el caso
  que lo pone a prueba: la similitud entre dos palabras que no son vecinas no
  está en ningún binario del grafo, así que hay que bajar sus vectores.
- **La constelación del comparador no es la galaxia**, y el pie lo dice. Sale de
  un MDS sobre las similitudes de las palabras elegidas y de nada más; dos
  palabras pueden salir juntas ahí y lejos en el atlas sin que ninguna mienta.
  Se muestra el estrés por eso mismo.
- **Nunca hay un solo camino de vuelta.** Todo lo que se coge —una palabra, un
  camino, un grupo— se suelta con `Esc`, con el botón de la píldora, con el de
  la ficha y con un clic en el vacío, y las cuatro llaman al mismo `clear()`. Un estado del que sólo se sale
  por un botón de 11 px es un estado del que no se sale. Y volver incluye la
  cámara: `clear()` llama a `goHome()`, porque un eje que se queda clavado en la
  última palabra es parte del estado del que no se salía.
- **El atractor no apaga la galaxia.** Encender una palabra atenuando las otras
  49.999 es correcto cuando alguien la ha pedido; en reposo, no la ha pedido
  nadie y lo único que hay que enseñar es la nebulosa (`spotTiers`).
- **`vecs.bin` entero sólo bajo demanda.** El comparador pide filas de 300
  bytes; sólo la analogía baja los 15 MB, y sólo al pulsar. Quien no juega a
  eso no paga la descarga.
- **Nunca se muestra una distancia medida en la galaxia.** El número junto a cada
  vecino es similitud coseno en 300D, y el pie de la ficha lo dice explícitamente.
- Las palabras vacías se **marcan** (`flags`), no se borran: son parte legítima
  del modelo.
- El brillo de aristas se escala con su número (`0.34 * 15949 / m`): el blending
  aditivo suma luz y una constante calibrada a 16.000 aristas satura a blanco con
  147.000.
- **La atribución a fastText (CC BY-SA 3.0) es obligatoria en el sitio publicado.**
  Está en `Galaxy.tsx` como `.attrib`; no la quites.
- Sin etiquetas permanentes en el canvas: taparían justo lo que hay que clicar.
- **Los nodos son blancos y el color vive en las aristas.** Un punto teñido de su
  región compite con la malla que lo rodea y no dice nada que la malla no diga ya.
- **El color de región no es arbitrario**: sale de la posición del centroide, así
  que zonas vecinas comparten tono. Una paleta cíclica por índice de comunidad
  (`community % 8`) daba color a regiones opuestas y lo quitaba a las contiguas.
- **Rampa de nebulosa, no círculo de tonos**, y **croma al borde de la gama**:
  el orden de los tonos es el de una nebulosa; la saturación, la de un neón.
- Nodos como **discos planos** con mezcla alfa y prueba de profundidad, no halos
  aditivos. Con radio de medio píxel el halo gaussiano los volvía invisibles e
  imposibles de apuntar. El borde va antialiasado con `fwidth`.

## Medir rendimiento en esta máquina

La GPU es una **AMD Vega 6 integrada** que comparte presupuesto de potencia con la
CPU: a 72 °C el mismo código rinde la mitad. Medir A entero y luego B entero da la
diferencia del reloj, no la del código. **Los únicos números reproducibles son los
timestamps de GPU por pasada**, mediana de ≥64 frames. No publiques un porcentaje
obtenido de otra forma.
