/**
 * Sitemap generado del mismo `seo.json` que las cabeceras y las tarjetas.
 *
 * No es un archivo en `public/`: una lista de URLs escrita a mano se queda
 * vieja en el primer renombrado, y aquí el renombrado ya ha pasado una vez
 * (`/galaxia` → `/embedding-nebula`, `/descenso` → `/gradient-descent`). Las
 * rutas con `redirectTo` **no entran**: un sitemap que anuncia redirecciones
 * gasta presupuesto de rastreo en páginas que no son la respuesta.
 *
 * Lleva `image:image` por sala porque el contenido de este sitio es la imagen:
 * es lo único que Google Imágenes puede indexar de un canvas WebGPU.
 *
 * `lastmod` sale de la fecha del archivo `.astro` y no de la del build. Un
 * sitemap que dice «todo cambió hoy» en cada despliegue enseña a Google a no
 * hacerle caso.
 */
import type { APIRoute } from "astro";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import seo from "../seo.json";

const mtime = (file: string) => {
  try {
    const p = fileURLToPath(new URL(`./${file}`, import.meta.url));
    return statSync(p).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const GET: APIRoute = () => {
  const site = seo.site;
  const pages = seo.pages.filter((p) => !("redirectTo" in p));

  const urls = pages
    .map((p) => {
      const loc = site.url + (p.path === "/" ? "/" : p.path);
      const slug = p.path === "/" ? "home" : p.path.replace(/^\//, "");
      const title = (p as { title: string }).title;
      return [
        "  <url>",
        `    <loc>${esc(loc)}</loc>`,
        `    <lastmod>${mtime((p as { file: string }).file)}</lastmod>`,
        `    <changefreq>monthly</changefreq>`,
        `    <priority>${p.path === "/" ? "1.0" : "0.8"}</priority>`,
        "    <image:image>",
        `      <image:loc>${esc(`${site.url}/og/${slug}.jpg`)}</image:loc>`,
        `      <image:title>${esc(title)}</image:title>`,
        "    </image:image>",
        "  </url>",
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
