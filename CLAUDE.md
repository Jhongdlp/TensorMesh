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

`pipeline/all.sh` copia los cinco binarios de `data/<lang>/` a
`web/public/data/<lang>/`. **La web nunca ejecuta el pipeline**: si cambias el
formato de salida hay que republicar a mano o reejecutar `all.sh`.

## Comandos

### Pipeline (Python 3.14, sólo numpy/scipy/Pillow)

```bash
./pipeline/all.sh es en                  # todo de punta a punta (~200 s por idioma)
python3 pipeline/fetch.py    es 100000   # etapa 00, cachea data/raw/es.vec
python3 pipeline/build.py    es 50000 1200   # etapas 01-07 (palabras, epochs)
python3 pipeline/validate.py es          # vecinos conocidos, analogías, regiones
python3 pipeline/preview.py  es          # PNG offline, sin navegador
python3 pipeline/tune.py     es kr=0.006 epochs=1200   # sólo etapa 06 sobre _graph.npz
python3 pipeline/recolor.py  es          # sólo etapa 05 (comunidades) + reempaquetado
python3 pipeline/export_fixture.py es    # regenera data/fixture/ para los tests WGSL
```

`tune.py` y `recolor.py` existen porque el kNN y la poda son lo caro: reutilizan
`data/<lang>/_graph.npz`. Usa esos para iterar, no `build.py`.

### Web (desde `web/`)

```bash
npm run dev            # astro dev
npm run build          # astro build → dist/
npm test               # check + physics + render
npm run check          # tsc sobre src/galaxy/**/*.ts y src/components/**/*.tsx
npm run test:physics   # node test/physics.mjs
npm run test:render    # node test/render.mjs
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

`test/render.mjs` además **reimplementa** `perspective`/`lookAt`/`multiply` de
`camera.ts` y el cálculo de centroide+p95. Si tocas cualquiera de esas cosas en
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
  vectores originales; el 3D existe sólo para los ojos.
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
