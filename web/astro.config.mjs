import { defineConfig } from "astro/config";
import react from "@astrojs/react";

// Sitio estático: la prosa va en HTML puro y solo el visor se hidrata.
export default defineConfig({
  integrations: [react()],
  vite: { assetsInclude: ["**/*.bin"] },
});
