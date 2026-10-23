/*
 * Generative botanical line art for the grassland plate: leaves, culms and the inflorescence
 * that tells each species apart. Everything is computed at build time into SVG paths.
 */

type Point = [number, number];
export type Spikelet = { cx: number; cy: number; rx: number; ry: number; angle: number };
export type Specimen = { leaves: string; culm: string; axes: string; awns: string; spikelets: Spikelet[] };

const rad = (deg: number) => (deg * Math.PI) / 180;
const f = (n: number) => n.toFixed(1);
const along = ([x, y]: Point, angle: number, length: number): Point => [
  x + Math.sin(rad(angle)) * length,
  y - Math.cos(rad(angle)) * length,
];

/** A gently bent stroke from `a` to `b`; `bend` pushes the middle sideways. */
function bent(a: Point, b: Point, bend: number) {
  const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / length, dx / length];
  return `M${f(a[0])},${f(a[1])}Q${f(mx + nx * bend)},${f(my + ny * bend)} ${f(b[0])},${f(b[1])}`;
}

/** Long, arching basal leaves. */
function leaves(base: Point, count: number, length: number, spread: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = t * spread;
    const tip = along(base, angle * 1.4, length * (0.75 + 0.25 * Math.cos(t * Math.PI)));
    return bent([base[0] + t * 6, base[1]], tip, angle > 0 ? -length * 0.18 : length * 0.18);
  }).join("");
}

/** Spikelets set along an axis, alternating sides. */
function spikeletsAlong(from: Point, angle: number, length: number, count: number, size: number, oneSided = false) {
  return Array.from({ length: count }, (_, i) => {
    const [cx, cy] = along(from, angle, (length * (i + 0.6)) / count);
    const side = oneSided ? 1 : i % 2 === 0 ? 1 : -1;
    const offset = size * 0.9 * side;
    return {
      cx: cx + Math.cos(rad(angle)) * offset,
      cy: cy + Math.sin(rad(angle)) * offset,
      rx: size * 0.55,
      ry: size,
      angle: angle + side * 18,
    };
  });
}

export function specimen(kind: "notatum" | "affinis" | "selloana" | "neesiana", base: Point, height: number): Specimen {
  const top = along(base, kind === "neesiana" ? 6 : 2, height);
  const culm = bent(base, top, kind === "neesiana" ? 10 : 4);
  let axes = "";
  let awns = "";
  let spikelets: Spikelet[] = [];

  if (kind === "notatum") {
    // Two racemes forking from the top of the culm: the "horqueta".
    for (const angle of [-24, 22]) {
      const end = along(top, angle, height * 0.3);
      axes += bent(top, end, angle > 0 ? -3 : 3);
      spikelets = spikelets.concat(spikeletsAlong(top, angle, height * 0.3, 9, 3.2, true));
    }
  } else if (kind === "affinis") {
    // Two or three slender racemes from almost the same point.
    for (const [angle, k] of [
      [-14, 0.34],
      [4, 0.38],
      [20, 0.3],
    ]) {
      axes += bent(top, along(top, angle, height * k), angle * 0.1);
      spikelets = spikelets.concat(spikeletsAlong(top, angle, height * k, 8, 2.2));
    }
  } else if (kind === "selloana") {
    // A single cylindrical raceme with visible joints.
    const end = along(top, 2, height * 0.42);
    axes += `M${f(top[0] - 2.2)},${f(top[1])}L${f(end[0] - 2.2)},${f(end[1])}M${f(top[0] + 2.2)},${f(top[1])}L${f(end[0] + 2.2)},${f(end[1])}`;
    for (let i = 1; i < 10; i++) {
      const [x, y] = along(top, 2, (height * 0.42 * i) / 10);
      axes += `M${f(x - 2.2)},${f(y)}L${f(x + 2.2)},${f(y)}`;
    }
  } else {
    // An open panicle; every spikelet carries a long bent awn.
    const branches: [number, number, number][] = [
      [-38, 0.22, 0.25],
      [30, 0.2, 0.4],
      [-26, 0.18, 0.55],
      [22, 0.16, 0.7],
      [-12, 0.14, 0.85],
    ];
    const axisEnd = along(top, 4, height * 0.36);
    axes += bent(top, axisEnd, 3);
    for (const [angle, k, at] of branches) {
      const start = along(top, 4, height * 0.36 * at);
      const end = along(start, angle, height * k);
      axes += bent(start, end, angle > 0 ? -2 : 2);
      spikelets.push({ cx: end[0], cy: end[1], rx: 1.6, ry: 3.6, angle });
      const knee = along(end, angle * 0.6, 14);
      awns +=
        `M${f(end[0])},${f(end[1])}L${f(knee[0])},${f(knee[1])}` +
        bent(knee, along(knee, angle + (angle > 0 ? 50 : -50), 26), 4);
    }
  }

  return {
    leaves: leaves(
      base,
      kind === "affinis" ? 6 : 5,
      height * (kind === "affinis" ? 0.32 : 0.55),
      kind === "affinis" ? 140 : 70,
    ),
    culm,
    axes,
    awns,
    spikelets,
  };
}
