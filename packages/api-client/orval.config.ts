import { defineConfig } from "orval";

const input = "../../services/api/openapi.json";

export default defineConfig({
  api: {
    input,
    output: {
      mode: "single",
      target: "src/generated/api.ts",
      client: "react-query",
      httpClient: "fetch",
      override: { mutator: { path: "src/fetcher.ts", name: "apiFetch" } },
    },
  },
  schemas: {
    input,
    output: { mode: "single", target: "src/generated/zod.ts", client: "zod" },
  },
});
