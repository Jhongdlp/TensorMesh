/**
 * Comprueba el `dist/` ya construido: metadatos, tarjetas de enlace y sitemap.
 *
 * Es la prueba del enlace compartido, que es la única que no se puede hacer
 * mirando la web. Un `og:image` relativo, una tarjeta que no se subió, un
 * canonical que apunta al dominio de pruebas: todo eso se ve igual de bien en
 * el navegador y se ve roto en el móvil de quien recibe el enlace, tres días
 * después, cuando Facebook ya lo cacheó.
 *
 * Lo que verifica, y por qué cada cosa:
 *
 * - `og:image` **absoluta y con el archivo en su sitio**: los raspadores de
 *   tarjetas no resuelven rutas relativas y no reintentan un 404.
 *   Y con las medidas que declara — 1200x630 o el recorte lo hace el cliente.
 * - **peso** por debajo de 300 KB: WhatsApp deja de mostrar la miniatura por
 *   encima de ~600 KB y es el sitio donde más se comparte un enlace así.
 * - `canonical` en el dominio de `seo.json`, no en otro.
 * - **títulos y descripciones** dentro de lo que caben en un resultado.
 * - **el sitemap** sólo lista páginas que existen en `dist/`, y todas.
 *
 *     node test/seo.mjs
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = dirname(fileURLToPath(new URL(".", import.meta.url)));
const DIST = join(WEB, "dist");
const seo = JSON.parse(readFileSync(join(WEB, "src", "seo.json"), "utf8"));
const SITE = seo.site.url;

let bad = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  bad++;
};

if (!existsSync(DIST)) {
  console.error("No hay dist/. Ejecuta `npm run build` antes que esta prueba.");
  process.exit(1);
}

/** Medidas de un JPEG sin dependencias: recorre los marcadores hasta un SOF. */
function jpegSize(file) {
  const b = readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

const meta = (html, attr, name) => {
  const re = new RegExp(`<meta[^>]*${attr}="${name}"[^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/content="([^"]*)"/)?.[1] ?? null;
};

const pages = seo.pages.filter((p) => !p.redirectTo);

for (const page of pages) {
  const file = join(DIST, page.path === "/" ? "index.html" : `${page.path}/index.html`);
  console.log(`\n${page.path}`);
  if (!existsSync(file)) {
    fail(`no se construyó ${file}`);
    continue;
  }
  const html = readFileSync(file, "utf8");

  // ── título y descripción ────────────────────────────────────────────────
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) fail("sin <title>");
  else if (title.length > 60) fail(`título de ${title.length} caracteres (>60)`);

  const desc = meta(html, "name", "description");
  if (!desc) fail("sin meta description");
  else if (desc.length < 70 || desc.length > 160)
    fail(`descripción de ${desc.length} caracteres (fuera de 70-160)`);

  // ── canonical ───────────────────────────────────────────────────────────
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const want = SITE + (page.path === "/" ? "/" : page.path);
  if (canonical !== want) fail(`canonical ${canonical} ≠ ${want}`);

  // ── la tarjeta ──────────────────────────────────────────────────────────
  const og = meta(html, "property", "og:image");
  const tw = meta(html, "name", "twitter:image");
  if (!og?.startsWith("https://")) fail(`og:image no es absoluta: ${og}`);
  if (tw !== og) fail("twitter:image no coincide con og:image");
  if (meta(html, "name", "twitter:card") !== "summary_large_image")
    fail("twitter:card no es summary_large_image");
  for (const need of ["og:title", "og:description", "og:url", "og:type", "og:site_name"])
    if (!meta(html, "property", need)) fail(`falta ${need}`);
  if (!meta(html, "property", "og:image:alt")) fail("falta og:image:alt");

  if (og?.startsWith(SITE)) {
    const img = join(DIST, og.slice(SITE.length));
    if (!existsSync(img)) {
      fail(`la tarjeta no está en dist: ${og}`);
    } else {
      const size = jpegSize(img);
      const w = meta(html, "property", "og:image:width");
      const h = meta(html, "property", "og:image:height");
      if (!size) fail("la tarjeta no es un JPEG legible");
      else if (String(size.w) !== w || String(size.h) !== h)
        fail(`la tarjeta mide ${size.w}x${size.h} y declara ${w}x${h}`);
      const kb = statSync(img).size / 1024;
      if (kb > 300) fail(`tarjeta de ${kb.toFixed(0)} KB (>300, WhatsApp la deja de mostrar)`);
      else console.log(`  ✓ tarjeta ${size.w}x${size.h}, ${kb.toFixed(0)} KB`);
    }
  }

  // ── datos estructurados ─────────────────────────────────────────────────
  const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
  if (!ld) fail("sin JSON-LD");
  else {
    try {
      const g = JSON.parse(ld)["@graph"];
      if (!Array.isArray(g) || !g.length) fail("JSON-LD sin @graph");
      else console.log(`  ✓ JSON-LD (${g.length} nodos)`);
    } catch (e) {
      fail(`JSON-LD ilegible: ${e.message}`);
    }
  }

  // ── un encabezado de primer nivel, aunque sea para el lector de pantalla ─
  if (!/<h1[\s>]/.test(html)) fail("sin <h1> en el HTML servido");
}

// ── sitemap y robots ──────────────────────────────────────────────────────
console.log("\nsitemap.xml / robots.txt / llms.txt");
const sitemap = readFileSync(join(DIST, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const page of pages) {
  const want = SITE + (page.path === "/" ? "/" : page.path);
  if (!locs.includes(want)) fail(`el sitemap no lista ${want}`);
}
for (const p of seo.pages.filter((x) => x.redirectTo))
  if (locs.includes(SITE + p.path)) fail(`el sitemap lista la redirección ${p.path}`);

const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail("robots.txt no apunta al sitemap");
if (!robots.includes("GPTBot")) fail("robots.txt no dice nada de los rastreadores de IA");

const llms = readFileSync(join(DIST, "llms.txt"), "utf8");
for (const page of pages.filter((p) => p.room))
  if (!llms.includes(page.path)) fail(`llms.txt no menciona ${page.path}`);

console.log(
  bad === 0
    ? `\n✓ ${pages.length} páginas, tarjetas, sitemap, robots y llms.txt correctos`
    : `\n✗ ${bad} problema(s)`,
);
process.exit(bad === 0 ? 0 : 1);
