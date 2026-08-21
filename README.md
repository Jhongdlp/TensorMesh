# Atlas Vectorial

Galaxia navegable de embeddings: las palabras se colocan en 3D por **simulación
de fuerzas sobre su grafo de vecinos más cercanos**, no por reducción de
dimensiones. Sin servidor, sin API, sin coste.

Plan técnico completo: https://claude.ai/code/artifact/bb9b0833-4b78-4972-b79e-8bdda5e7b858

## Estado

**Fases 1-3 completas**: vertical slice, pipeline completo y motor de layout
vivo en WebGPU.

| | español | inglés |
|---|---|---|
| Palabras | 50.000 | 50.000 |
| Aristas | 147.307 | 144.386 |
| Grado medio / mediana / máx | 5,89 / 6 / 73 | 5,78 / 6 / 78 |
| Regiones | 28 | 28 |
| Datos publicados | 2.138 KB | 2.081 KB |
| Bytes por nodo | 43,8 | 42,6 |
| Por la red (brotli) | 1.426 KB | 1.386 KB |
| Tiempo de pipeline | 204 s | 224 s |

La referencia `anvaka/pm` gasta 53 bytes/nodo con menos información por palabra.

### Motor WebGPU

La física corre en un compute shader y las posiciones nunca salen de la GPU: el
mismo buffer que escribe la simulación es el que leen los shaders de render, así
que no hay copia por frame. Medido sobre una AMD Vega 6 **integrada**, a 50.000
nodos y 1280×720:

Medido con **timestamps de GPU**, mediana de 64 frames, a 1280×720:

| pasada | ms |
|---|---|
| Descarte (2 dispatches) | 0,26 |
| Dibujo, sin descarte | 13,30 |
| Dibujo, con descarte | 10,49 |
| Dibujo, con descarte y malla al 40% | 5,05 |
| Física (1 paso), muestreo global | 2,29 |
| Física (1 paso), muestreo por tile | **1,05** |

En vista completa, con la malla adelgazada, el frame entero baja de **13,04 ms a
6,36 ms de tiempo de GPU**.

⚠️ **Sobre medir en esta máquina.** Una GPU integrada comparte presupuesto de
potencia con la CPU: a 72 °C el *mismo código* rinde la mitad. Medir A entero y
después B entero da la diferencia del reloj, no la del código — así llegué a
publicar «+18%», «+4%» y «−2%» para el mismo cambio. Y sincronizar por frame para
aislarlos cuesta ~100 ms en las bindings de Dawn, más que el trabajo medido. La
única instrumentación que da números reproducibles aquí son los timestamps que
escribe la propia GPU al entrar y salir de cada pasada.

### Técnicas de optimización

**Descarte en GPU con dibujo indirecto.** Dos pasadas de compute compactan lo
visible y escriben los propios argumentos de draw; la CPU nunca sabe cuántas
primitivas salen. Cuesta 0,26 ms y quita el 44% de las aristas en vista completa
y el 68% de los nodos con zoom.

| | nodos | aristas | ganancia |
|---|---|---|---|
| Vista completa | 50.000 → 45.297 | 130.459 → 73.914 | **+13-15%** |
| Zoom ×4 | 39.884 → 12.924 | 32.985 → 18.839 | **+18-20%** |

Dos criterios: frustum, y **longitud en pantalla** — una arista de medio píxel
rasteriza igual que una de cien, y en el núcleo denso hay decenas de miles.

**Adelgazamiento de la malla.** El descarte por longitud se agota: de 123.000 a
68.000 aristas el dibujo sólo baja de 14,22 a 12,32 ms, porque quita las aristas
*cortas* y el coste vive en las largas. No es el número de aristas, es la
**longitud rasterizada total**. Así que la malla se adelgaza entera con un hash
estable por arista — estable para que el subconjunto no parpadee, y para que
subir el nivel sólo *añada* aristas — y el brillo se compensa por `1/keep`, que
es exactamente lo que hace falta para que una nebulosa aditiva conserve su luz
total. En vista completa la malla es niebla: lo que se lee es densidad y color,
no aristas sueltas, así que media niebla al doble de brillo se lee igual.

| malla | aristas | dibujo |
|---|---|---|
| 100% | 68.262 | 10,49 ms |
| 60% | 41.043 | 6,95 ms |
| 40% | 27.504 | **5,05 ms** |
| 35% (suelo) | 24.023 | 4,78 ms |

Por debajo del 35% la niebla se vuelve alambre: se ven aristas sueltas en vez de
densidad. El camino de la selección está exento — no se adelgaza nunca.

**Repulsión por tile en memoria compartida.** El muestreo negativo leía K
posiciones al azar de un buffer de 800 KB: en una integrada eso es K fallos de
caché por nodo, y el paso escalaba con K (1,38 ms a K=8, 3,15 ms a K=32). Ahora
cada workgroup trae 64 posiciones **una sola vez** a memoria compartida y sus 64
hilos muestrean de ahí: 64 lecturas incoherentes por workgroup en lugar de 64·K,
y el paso se vuelve **plano en K** — 1,05 ms de K=8 a K=32. Los 64 nodos de un
workgroup comparten la ronda de muestras, pero el tile se resiembra cada frame,
así que es correlación dentro del frame y no sesgo: el test estadístico contra
numpy sigue coincidiendo al 0,09%.

**Control del presupuesto tipo AIMD.** El de TCP: bajar de golpe, subir a pasitos
y no volver al nivel que acaba de fallar. Con vsync a 60 Hz el reloj sólo sabe
decir 16,7 ms («entré») o 33,3 («me lo perdí»), así que un lazo sin memoria sube
la calidad hasta pasarse, la baja, y **caza** cruzando el vsync para siempre.
Simulado sobre el coste medido a 1080p, 900 frames:

| lazo | fps medio | frames < 55 fps |
|---|---|---|
| sin memoria | 50,0 | **33%** |
| con techo aprendido | 59,9 | **0%** |

La media apenas cambia. Lo que cambia es que deja de dar tirones — que era todo
el problema.

**Resolución adaptativa.** El coste es de relleno, así que bajar el búfer interno
es directo: 16,55 ms a 1,00× → **12,72 ms a 0,55×**. Va *después* del
adelgazamiento en la cascada del presupuesto: emborronar los nodos cuesta más
que aclarar la niebla, porque los nodos son lo que hay que poder apuntar.

**Salto de frame en reposo.** Sin física ni cámara moviéndose no se dibuja nada.
En una integrada esto no es sólo batería: al no calentarla, los frames que sí
importan corren al doble.

**Opacidad de aristas.** A cero se salta el draw entero. Es a la vez mando de
legibilidad y acelerador. Selección en GPU por `atomicMin` sobre un u32 que empaqueta distancia e
índice: exacta, O(n), y válida con los nodos en movimiento — donde un KD-tree
haría falta reconstruirlo cada frame.

**Mejora progresiva**: sin WebGPU el sitio cae al motor Three.js/WebGL con las
posiciones precalculadas. Se ve igual, sin simulación viva, y nunca se rompe.

### Decisiones de legibilidad

Los nodos se dibujan como **discos planos con mezcla alfa y prueba de
profundidad**, no como halos aditivos. El halo gaussiano original repartía el
brillo en un degradado que, con un radio efectivo de medio píxel, dejaba los
nodos invisibles e imposibles de apuntar. Tres cambios lo arreglan:

- borde antialiasado con `fwidth` en vez de caída exponencial;
- suelo de radio en píxeles (`minPx`), que es lo que hace un nodo clicable;
- mezcla alfa en lugar de aditiva, para que un punto no se lave con los de
  detrás, más profundidad para que el cercano tape al lejano.

No hay etiquetas permanentes: taparían justo lo que hay que clicar. El nombre
aparece en un tooltip al pasar el ratón, sondeado cada 90 ms — cada consulta es
un dispatch sobre 50.000 nodos, así que no puede ir por evento de ratón.

**Se navega con ratón y con teclado, con los dos motores.** El ratón orbita,
arrastra con el botón derecho y acerca con la rueda; el teclado además *vuela*: `W`/`S` avanzan y
retroceden, `A`/`D` van de lado, `Q`/`E` bajan y suben, las flechas giran e
inclinan, `+`/`−` acercan y alejan, `Mayús` triplica la velocidad, `Alt` la afina
y `Inicio` devuelve la vista completa. Volar mueve el **objetivo** de la órbita,
no sólo la cámara, que es lo que permite atravesar la nube en vez de rodearla, y
todo se escala con la distancia de órbita: avanzar cuesta lo mismo pegado a una
palabra que viendo la galaxia entera. Las teclas entran como impulsos amortiguados con la misma
constante que el ratón — soltar una frena igual que soltar el botón — y sólo
despiertan el bucle de render las teclas que la cámara pilota, así que en reposo
el frame se sigue saltando entero. El tacto vive en un módulo único
(`galaxy/keys.ts`) que devuelve velocidades normalizadas: cada motor las traduce
a su propia cámara, y ninguno de los dos se queda sin teclado.

**Los nodos son blancos; el color vive en las aristas.** Y no es un color
arbitrario: el **ángulo del centroide** de cada región en el plano principal de
la nube fija su posición en una rampa cíclica, ecualizada para que ninguna región
pise a otra. Así dos regiones que se tocan reciben colores contiguos y el color
se lee como vecindad en vez de como etiqueta — la paleta cíclica anterior
(`community % 8`) pintaba igual dos regiones opuestas y distinto dos contiguas.
La rampa recorre los tonos en orden de nebulosa (cian, azul eléctrico, violeta,
magenta, rosa, ámbar, amarillo, verde) y el croma no lo fija la rampa: se pide
más del que cabe en sRGB y una bisección lo deja en el borde exacto de la gama.
Eso es lo que separa un neón de un pastel — con un croma fijo y modesto, el
magenta, que llega a 0,31, se quedaba a medio gas igual que el cian, que sólo
llega a 0,15.
Cada nodo se desvía un poco hacia el tono de la región vecina, así que las
fronteras se funden y la malla se ve como el campo continuo que de verdad es.
El espacio es Oklch: con blending aditivo el brillo se suma, y en HSL el amarillo
pesaría el triple que el azul al mismo brillo nominal.

**Seleccionar es enfocar un barrio, no encender un punto.** Cuatro escalones —la
palabra, sus vecinos, los vecinos de sus vecinos y el resto— y el elegido crece
×6 con un aro alrededor. El segundo anillo es el que convierte un puñado de
puntos sueltos en un barrio con forma: sin él las aristas se cortan en seco y el
camino no lleva a ninguna parte. El resto de la galaxia baja al 8%: ni a cero,
que deja la selección flotando en el vacío, ni más arriba, donde 50.000 puntos
vuelven a taparla.

**Comparar varias palabras es otra pregunta, y necesita otro dato.** La ficha
enseña el barrio de una palabra: sus vecinos y el camino hasta otra. Pero
«cuánto se parecen camello e inglaterra» no está en el grafo — no son vecinos,
así que no hay arista entre ellos ni peso que leer — y la regla del proyecto es
que toda afirmación se calcula en 300D. De ahí `vecs.bin` y las peticiones por
rango: el comparador baja 300 bytes por palabra y calcula el coseno de verdad.

Admite hasta **cinco** palabras: son diez parejas, que aún caben en una lista
que se lee de un vistazo; con seis son quince y hay que buscar. Cuatro vistas
del mismo dato, cada una diciendo algo que las otras no:

- **las barras** dan el número y, sobre todo, la vara de medir. Un 0,35 suelto
  no significa nada; junto a la línea de «así de parecidas son dos palabras que
  el kNN llamó vecinas» —0,63 en español, 0,60 en inglés— se lee de golpe;
- **la matriz** aparece a partir de tres palabras, cuando los pares dejan de
  caber en la cabeza. Es monocroma a propósito: en ese panel el color ya
  significa zona, y teñir además la celda por magnitud daría dos lecturas al
  mismo color a dos centímetros de distancia;
- **la constelación** enseña la forma del grupo, que no está en ninguna lista.
  Es escalado multidimensional clásico sobre la matriz de similitudes, y la
  distancia que proyecta es la euclídea real en 300D: con los vectores
  normalizados, `|u − v|² = 2 − 2·cos` exactamente. Los dos ejes comparten
  escala — normalizarlos por separado llenaría el recuadro a costa de estirar
  una dirección más que la otra, y entonces las distancias del dibujo dejarían
  de ser las que promete. Se muestra el **estrés**: `rey · reina · hombre ·
  mujer` pierde el 8% al aplanar y sale como el paralelogramo de la analogía;
  cinco palabras sin relación pierden el 30% y hay que decirlo;
- **los saltos y los vecinos en común** devuelven al grafo dibujado: son la
  parte que se puede ir a mirar con los ojos.

El grupo se enciende **solo** en la galaxia al añadir o quitar una palabra, y se
enciende con los caminos entre las elegidas, no sólo con ellas: sin los caminos
serían cinco puntos sueltos en el vacío, y con ellos se ve por qué barrios cruza
el parecido. Antes había un botón «ver en la galaxia» y era el paso que nadie
daba — se escribían cinco palabras, se leía la tabla y uno se iba sin haber
mirado nunca el atlas, que es la mitad de la respuesta.

**La salida tiene que verse tanto como la entrada.** Seleccionar era fácil —un
clic en un punto— y soltar era un «×» de 11 px en la esquina de un panel del
raíl derecho; con un grupo del comparador resaltado no había ficha, así que no
había ningún botón en absoluto. Ahora hay tres salidas visibles y todas hacen lo
mismo: una píldora en el borde superior del lienzo que dice **qué** se tiene
cogido y lleva el botón de soltar, el botón de la ficha con la palabra escrita
en vez del aspa, y `Esc`. La pista del cajón cambia con el estado: mientras no
hay nada cogido dice cómo coger, y en cuanto lo hay dice cómo soltar, en el
mismo renglón. `Esc` vive en el componente y no en `KeyFly` a propósito: `KeyFly`
se instancia una vez por motor, y colgarla de uno la habría dejado muerta en el
otro — que es justo el camino que se ve al abrir el navegador en Linux sin la
bandera de WebGPU.

Y la comparación va en la URL (`?cmp=rey,reina,hombre,mujer`), como ya iban
`?w=` y `?to=`: «mira lo que se parecen éstas» no se puede decir de otra forma
sin pedirle a quien lee que las teclee una a una.

Siguiente: **fase 4**, las lecciones.

### Tests

```bash
cd web && npm test        # tipos + unidad + física + render
```

`test/unit.mjs` no toca la GPU y corre en menos de un segundo: buscador,
caminos, escalones de resalte, teclado, el contrato de bytes de los binarios y
el comparador. De este último comprueba lo que se rompe en silencio — que el
offset `i * 300` de `vecs.bin` cae en la palabra `i`, contrastando su coseno
contra los pesos que el pipeline guardó en el CSR — y que el MDS es exacto:
sobre un cuadrado de lado 1 tiene que devolver estrés 0 y las distancias
intactas.

`test/physics.mjs` ejecuta el WGSL real contra la referencia numpy vía Dawn
(`@kmamal/gpu`), sin navegador. Dos comprobaciones: con K=0 la simulación es
determinista y debe coincidir salvo error de coma flotante; con K=24 los flujos
aleatorios difieren, así que se comparan métricas agregadas.
`test/render.mjs` dibuja la galaxia a una textura, escribe un PNG, mide cada
draw por separado y verifica la selección en GPU.

## Pipeline

```
pipeline/fetch.py     00  descarga en streaming (corta el .vec tras N líneas)
pipeline/build.py     01  limpieza + marcado de palabras vacías
                      02  normalización L2
                      03  kNN exacto (numpy/BLAS, sin FAISS)
                      04  poda: kNN mutuo + columna vertebral MST
                      05  comunidades: propagación + fusión aglomerativa
                      06  layout: semilla PCA + LinLog con muestreo negativo
                      07  empaquetado a binarios CSR
pipeline/vectors.py   08  vectores 300D a int8 para el comparador
pipeline/preview.py       render offline con PIL (iteración rápida, sin navegador)
pipeline/tune.py          reejecuta solo la etapa 06 sobre el grafo cacheado
pipeline/validate.py      vecinos conocidos, analogías, coherencia de regiones
pipeline/recolor.py       recalcula solo la etapa 05 y reempaqueta
pipeline/all.sh           las dos galaxias de punta a punta
pipeline/export_fixture.py  referencia numpy para validar el compute shader
```

Solo necesita `numpy`, `scipy` y `Pillow`. Funciona en Python 3.14: el vertical
slice evita `umap-learn`/`numba` usando PCA como semilla.

```bash
./pipeline/all.sh es en          # todo: descarga, build, validación, publicación
```

O por etapas:

```bash
python3 pipeline/fetch.py    es 100000
python3 pipeline/build.py    es 50000 1200
python3 pipeline/vectors.py  es
python3 pipeline/validate.py es
python3 pipeline/preview.py  es
```

## Web

```bash
cd web && npm run dev
```

Astro con una única isla React; toda la prosa futura será HTML estático.

```
src/galaxy/loader.ts        binarios → TypedArrays, sin parseo
src/galaxy/scene.ts         motor WebGL (Three.js), respaldo estático
src/galaxy/gpu/physics.wgsl LinLog + muestreo negativo, un solo paso de compute
src/galaxy/gpu/render.wgsl  aristas y nodos, sin vertex buffers
src/galaxy/gpu/pick.wgsl    selección por atomicMin
src/galaxy/gpu/engine.ts    buffers, pipelines y bucle de frame
src/galaxy/gpu/camera.ts    mat4 y cámara orbital, sin dependencias
src/galaxy/vectors.ts       vecs.bin por rangos HTTP, caché y respaldo
src/galaxy/compare.mjs      matriz de similitudes, MDS clásico, vecinos comunes
src/components/Compare.tsx  el comparador: hasta 5 palabras a la vez
```

## Formato de datos

| Archivo | Contenido | 50.000 nodos |
|---|---|---|
| `positions.bin` | Int16 ×3 + escala en meta | 293 KB |
| `edges.bin` | CSR: offsets Uint32, destinos Uint16, pesos Uint8 | 1.058 KB |
| `labels.bin` | offsets Uint32 + blob UTF-8 | 591 KB |
| `attrs.bin` | comunidad Uint8, rango Uint16, banderas Uint8 | 195 KB |
| **total** | | **2.138 KB** → 43,8 bytes/nodo |
| `vecs.bin` | 300 × int8 por palabra, sin cabecera | 14.648 KB |

`vecs.bin` va aparte de la cuenta porque **no se descarga**. Es el archivo que
el comparador necesita —la similitud entre dos palabras cualesquiera no está en
`edges.bin`, que sólo guarda el peso de las aristas del kNN podado— y se lee a
trozos: el registro es contiguo y sin cabecera, así que la palabra `i` se pide
con `Range: bytes=i*300-(i*300+299)`. **300 bytes por palabra en el cable**, no
15 MB. Si el servidor ignora el rango y responde 200, el cliente se queda el
archivo entero y sigue funcionando; si el archivo no está, el comparador se
apaga y el resto del atlas no se entera.

La cuantización es int8 con escala **por vector**, y la escala no se publica: el
coseno es invariante a escala y el cliente renormaliza al decodificar. Medido
sobre 200.000 pares al azar de `data/es`:

| error del coseno vs float32 | medio | p99 | máximo |
|---|---|---|---|
| int8, escala por vector | 0,00050 | 0,00166 | 0,00332 |

La ficha muestra dos decimales, así que el error queda por debajo de lo que se
ve. Con una escala **global** sube unas cinco veces: la mediana de `max|x|` es
0,19 pero el máximo es 0,54, y un puñado de vectores atípicos se llevaría todo
el rango.

Con 50.000 palabras los índices de arista caben justo en `Uint16` (máximo
65.535). Escalar más obliga a `Uint32` y duplica el archivo más pesado.

La referencia (`anvaka/pm`) gasta 53 bytes/nodo y lleva menos información por
palabra. Dos decisiones lo explican: CSR en vez de su array con centinelas
negativos, y las etiquetas como blob binario en vez de un `JSON.parse` de 1,4 MB.

## Reglas que no se rompen

- **Toda afirmación se calcula en 300D.** Los vecinos y las similitudes salen de
  los vectores originales; el 3D existe solo para los ojos.
- **Nunca se muestra una distancia medida en la galaxia.** El número junto a cada
  vecino es similitud coseno en 300D.
- Las palabras vacías se marcan, no se borran: son parte legítima del modelo.
- El brillo del render se escala con la densidad: el blending aditivo suma luz,
  y una constante calibrada a 5.000 nodos satura a blanco puro con 50.000.
- Las posiciones no salen de la GPU. Al quitar las etiquetas desapareció la
  lectura periódica de 480 KB; ahora sólo se leen 16 bytes, y sólo al centrar la
  cámara en una palabra concreta.

## Atribución

Vectores [fastText](https://fasttext.cc/docs/en/crawl-vectors.html) de Facebook
Research, licencia **CC BY-SA 3.0**. La atribución es obligatoria en el sitio
publicado.
