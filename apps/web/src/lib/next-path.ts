/**
 * Where to go once signed in: a path of this site taken from `?next=`, or the fallback.
 * The browser's own URL parser decides, so tricks such as `//host`, `/\host` or a tab after the slash
 * cannot lead to another site.
 */
export function nextPath(wanted: string | null, origin: string, fallback: string): string {
  if (!wanted) return fallback;
  try {
    const url = new URL(wanted, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
