/** A CSS time token in milliseconds (`7000ms` or `7s`; a minifier may rewrite one into the other). */
export function cssTime(value: string): number {
  const v = value.trim();
  const n = Number.parseFloat(v);
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : n;
}
