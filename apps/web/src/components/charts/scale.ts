/** Linear mapping from a data domain to 0–100 (percent of the plot box). */
export function linear([d0, d1]: [number, number], [r0, r1]: [number, number] = [0, 100]) {
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** Round, human-friendly ticks covering a domain (1, 2, 2.5 or 5 times a power of ten). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

export const finite = (values: (number | null)[]) =>
  values.filter((v): v is number => v !== null && Number.isFinite(v));

/** An SVG path in a 0–100 box, breaking the line where values are missing. */
export function linePath(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    pen = true;
  });
  return d;
}
