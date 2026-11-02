import type { APIRoute } from "astro";

/** When this build of the site was made: the Content section compares it with the last publish. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ built_at: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json" },
  });
