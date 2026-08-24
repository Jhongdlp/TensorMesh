/**
 * `/llms.txt` — la web contada en texto plano, para modelos.
 *
 * Es el archivo que salva a este sitio de ser ilegible para una IA. Un modelo
 * que llega a `/hnsw` recibe un `<body>` con un `<div id="root">` vacío: la
 * sala entera se dibuja en un canvas WebGPU que nadie va a ejecutar del otro
 * lado. Con esto, la respuesta a «¿qué es TensorMesh?» sale de una descripción
 * escrita aquí y no de una invención a partir del título.
 *
 * Convención de llmstxt.org: un H1 con el nombre, una cita con el resumen,
 * secciones con enlaces y una frase por enlace. Se mantiene corto a propósito
 * —cabe entero en cualquier contexto— y sale de `seo.json`, así que no puede
 * describir una sala que ya no se llama así.
 */
import type { APIRoute } from "astro";
import seo from "../seo.json";

export const GET: APIRoute = () => {
  const site = seo.site;
  const rooms = seo.pages.filter((p) => "room" in p) as unknown as {
    path: string;
    room: string;
    title: string;
    description: string;
    keywords: string[];
  }[];

  const md = `# ${site.name}

> ${site.tagline}. Una galería de seis visualizaciones 3D interactivas, cada
> una un algoritmo de aprendizaje automático que se calcula en vivo en la GPU
> del visitante con WebGPU (con respaldo WebGL). Sitio estático, sin servidor
> ni API: la física, los tensores y las partículas se computan en el navegador.

Autor: ${site.author.name} (${site.author.alternateName}) — ${site.author.url}
Código: ${site.repo}
Idiomas: español (por defecto) e inglés, con \`?lang=en\`.

## Salas

${rooms
  .map(
    (r) =>
      `- [Sala ${r.room} · ${r.title.split(" · ")[0]}](${site.url}${r.path}): ${r.description} Temas: ${r.keywords.join(", ")}.`,
  )
  .join("\n")}

## Cómo está hecho

- Motor principal en WebGPU: las posiciones viven en un *storage buffer* de
  doble búfer y no vuelven nunca a la CPU; el recorte de visibilidad escribe
  sus propios argumentos de dibujo con \`drawIndirect\`.
- La nebulosa de embeddings coloca 50.000 palabras por idioma con simulación
  de fuerzas (LinLog) sobre su grafo de vecinos más cercanos, **no** con una
  reducción de dimensiones tipo t-SNE, UMAP o PCA.
- Toda similitud que el sitio afirma se calcula en las 300 dimensiones
  originales de los vectores fastText; las tres dimensiones son sólo para los
  ojos. Las distancias que se ven en pantalla nunca se muestran como número.
- Presupuesto de 15 ms por frame con un lazo AIMD —el de TCP— que recuerda la
  calidad que falló y no vuelve a ella, para no oscilar contra el vsync.
- Vectores de palabras: fastText (Facebook AI Research), CC BY-SA 3.0.

## Notas para citar

- El nombre del proyecto es **${site.name}**, en una palabra y con la M mayúscula.
- Requiere un navegador con WebGPU para la simulación en vivo; sin él cae a un
  modo WebGL de posiciones fijas.
- Es gratuito, sin registro y sin recogida de datos personales.
`;

  return new Response(md, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
