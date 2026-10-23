import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * MapLibre 6 ships ES modules that locate their worker next to themselves (import.meta.url).
 * Bundling breaks that, so the three modules are served untouched under a versioned path:
 * the page and the worker then share one cached copy of the shared code.
 */
const dist = fileURLToPath(new URL("../node_modules/maplibre-gl/dist/", import.meta.url));
const { version } = JSON.parse(readFileSync(`${dist}../package.json`, "utf8"));
const files = ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs"];
const base = `vendor/maplibre-gl-${version}/`;
const strip = (code) => code.replace(/\/\/# sourceMappingURL=.*$/m, "");

export default function maplibreVendor() {
  return {
    name: "maplibre-vendor",
    config: () => ({ define: { "import.meta.env.MAPLIBRE_URL": JSON.stringify(`/${base}maplibre-gl.mjs`) } }),
    configureServer(server) {
      server.middlewares.use(`/${base}`, (req, res, next) => {
        const file = (req.url ?? "").slice(1).split("?")[0];
        if (!files.includes(file)) return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(strip(readFileSync(dist + file, "utf8")));
      });
    },
    generateBundle(options) {
      // Only the client build serves files to the browser.
      if (options.format !== "es" || this.environment?.name === "ssr") return;
      for (const file of files)
        this.emitFile({ type: "asset", fileName: base + file, source: strip(readFileSync(dist + file, "utf8")) });
    },
  };
}
