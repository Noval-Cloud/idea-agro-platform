/**
 * Where to go once signed in: an address of this site taken from `?next=`, or the fallback.
 * The browser's URL parser resolves it, and the whole resolved address is returned: returning only its path
 * would let `/..//host` become `//host`, another site.
 */
export function nextPath(wanted: string | null, origin: string, fallback: string): string {
  if (!wanted) return fallback;
  try {
    const url = new URL(wanted, origin);
    return url.origin === origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}
