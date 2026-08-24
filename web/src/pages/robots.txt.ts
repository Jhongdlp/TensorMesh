/**
 * robots.txt generado, no escrito a mano, por lo mismo que el sitemap.
 *
 * Dos decisiones que no son la plantilla de siempre:
 *
 * - **`/data/` cerrado.** Ahí viven los binarios del atlas: 2,1 MB por idioma
 *   de posiciones y aristas, más los 15 MB de `vecs.bin`. No hay nada que
 *   indexar en un CSR de int8 y sí un presupuesto de rastreo que gastar. El
 *   sitio se rastrea entero en unos cientos de KB si esto está cerrado.
 *
 * - **Los rastreadores de IA entran, y se dice explícitamente.** Este sitio
 *   existe para que se lea y se cite; que ChatGPT, Claude o Perplexity puedan
 *   describir qué hay en cada sala es exactamente lo que se busca. La regla
 *   general ya los cubriría, pero nombrarlos deja escrito que es a propósito
 *   —y es el sitio donde se cambia de idea el día que se quiera cerrar.
 *   `Google-Extended` y `Applebot-Extended` no afectan al rastreo ni al
 *   posicionamiento: sólo dicen si el contenido puede entrenar sus modelos.
 */
import type { APIRoute } from "astro";
import seo from "../seo.json";

const AI = [
  "GPTBot",            // OpenAI, entrenamiento
  "OAI-SearchBot",     // OpenAI, búsqueda de ChatGPT
  "ChatGPT-User",      // OpenAI, visita a petición del usuario
  "ClaudeBot",         // Anthropic, entrenamiento
  "Claude-User",       // Anthropic, visita a petición del usuario
  "Claude-SearchBot",  // Anthropic, búsqueda
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",   // Gemini / Vertex: sólo consentimiento de entrenamiento
  "Applebot-Extended",
  "Bytespider",
  "meta-externalagent",
  "cohere-ai",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "YouBot",
];

export const GET: APIRoute = () => {
  const site = seo.site;
  const body = [
    "# TensorMesh — https://github.com/Jhongdlp",
    "",
    "User-agent: *",
    "Allow: /",
    "Disallow: /data/          # binarios del atlas: 17 MB sin nada que indexar",
    "",
    "# Buscadores y asistentes de IA: bienvenidos, y a propósito.",
    ...AI.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", "Disallow: /data/", ""]),
    "# Guía para modelos: qué es cada sala, en texto plano.",
    `# ${site.url}/llms.txt`,
    "",
    `Sitemap: ${site.url}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
