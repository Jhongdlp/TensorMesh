import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Sitio estático: la prosa va en HTML puro y solo el visor se hidrata.
export default defineConfig({
  // El dominio canónico. Lo escribe a mano `src/components/Seo.astro` a partir
  // de `src/seo.json` —que es también quien se lo da a `pipeline/og.py`—, pero
  // Astro lo necesita aquí para resolver rutas absolutas por su cuenta, y
  // tenerlo en los dos sitios sin la misma cadena es pedir un canonical que
  // apunte a otro sitio que el sitemap.
  site: "https://tensormesh.vercel.app",
  integrations: [react()],
  vite: { assetsInclude: ["**/*.bin"] },
});
