import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as {
  version: string;
};

// L'interfaccia del modulo e' servita dal motore sotto /plugins/cuelith.songs/<versione>/ui/:
// percorsi relativi, niente file incorporati come data: (CSP del motore).
export default defineConfig({
  base: "./",
  root: "src/ui",
  plugins: [react()],
  define: { __SONGS_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
});
