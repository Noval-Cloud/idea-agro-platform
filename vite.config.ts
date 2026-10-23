import { defineConfig } from "vite-plus";

/** Generated files are written by scripts and kept byte-for-byte as produced. */
const generated = [
  "**/dist/**",
  "**/.astro/**",
  "apps/web/src/data/snapshot/**",
  "apps/web/src/design/generated/**",
  "apps/web/src/styles/tokens.css",
  "apps/web/public/favicon.svg",
];

export default defineConfig({
  fmt: {
    printWidth: 120,
    sortPackageJson: true,
    ignorePatterns: generated,
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    ignorePatterns: generated,
    options: { typeAware: true, typeCheck: true },
  },
});
