/*
 * Build-time line art for the landing's motion story: rolling hills (the cuchillas) and grass
 * blades. Blades are generated with a seeded random, so every build draws the same field.
 */

export const STAGE = { width: 640, height: 400 } as const;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Rolling hills: each layer a smooth line across the stage, closed down to its bottom. */
export const hills = {
  far: "M0,236C90,214 190,226 280,218S470,196 560,206S620,214 640,212L640,400L0,400Z",
  mid: "M0,270C110,252 230,268 330,258S520,238 640,252L640,400L0,400Z",
  near: "M0,312C140,300 260,316 380,306S560,292 640,300L640,400L0,400Z",
};

/** Grass blades as one path of short curves, rising from a band of the ground. */
export function blades(options: {
  seed: number;
  count: number;
  top: number;
  bottom: number;
  height: [number, number];
}) {
  const random = seeded(options.seed);
  let d = "";
  for (let i = 0; i < options.count; i++) {
    const x = random() * STAGE.width;
    const base = options.top + random() * (options.bottom - options.top);
    // Nearer blades (lower on the stage) are taller.
    const depth = (base - options.top) / (options.bottom - options.top || 1);
    const h = options.height[0] + (options.height[1] - options.height[0]) * depth * (0.6 + random() * 0.4);
    const lean = (random() - 0.5) * h * 0.7;
    d += `M${x.toFixed(1)},${base.toFixed(1)}q${(lean * 0.2).toFixed(1)},${(-h * 0.6).toFixed(1)} ${lean.toFixed(1)},${(-h).toFixed(1)}`;
  }
  return d;
}
