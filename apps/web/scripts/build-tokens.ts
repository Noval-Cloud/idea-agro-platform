import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { clampChroma, formatHex, type Oklch as CuloriOklch } from "culori";
import {
  primitives,
  semanticColors,
  dataFamilies,
  sequentialSteps,
  sequentialLightness,
  divergingPoles,
  divergingArm,
  vizChrome,
  vizCompare,
  vizMarks,
  mapChrome,
  mapMarks,
  rampLutSteps,
  typography,
  space,
  layout,
  radius,
  focusRing,
  link,
  elevation,
  motion,
  layers,
  type Oklch,
  type ThemeName,
  type DataFamily,
} from "../src/design/tokens.ts";
import { markCell, markPixels, markRadius, markViewBox } from "../src/design/brand-mark.ts";

const root = resolve(import.meta.dirname, "..");
const cssPath = resolve(root, "src/styles/tokens.css");
const rampsPath = resolve(root, "src/design/generated/data-ramps.json");
const mapThemePath = resolve(root, "src/design/generated/map-theme.json");
const themes: ThemeName[] = ["light", "dark"];

const fit = ([l, c, h]: Oklch): Oklch => {
  const clamped = clampChroma({ mode: "oklch", l, c, h }, "oklch") as CuloriOklch;
  return [clamped.l, clamped.c ?? 0, clamped.h ?? h];
};
const css = ([l, c, h]: Oklch) => `oklch(${+l.toFixed(4)} ${+c.toFixed(4)} ${+h.toFixed(2)})`;
const hex = ([l, c, h]: Oklch) => formatHex({ mode: "oklch", l, c, h });

const resolveRef = (ref: string): Oklch => {
  const [scale, step] = ref.split(".") as [keyof typeof primitives, string];
  const value = (primitives[scale] as Record<string, Oklch>)[step];
  if (!value) throw new Error(`Unknown primitive ${ref}`);
  return value;
};

/** A point along a family's ramp: t = 0 is "little", t = 1 is "a lot". Chroma peaks mid-ramp. */
function rampAt(family: DataFamily, theme: ThemeName, t: number): Oklch {
  const { hue, hueDrift, chroma } = dataFamilies[family];
  const [from, to] = sequentialLightness[theme];
  const l = from + (to - from) * t;
  const c = chroma * (0.22 + 0.78 * Math.sin(Math.PI * (0.15 + 0.7 * t)));
  const h = hue + hueDrift * (1 - t);
  return fit([l, c, h]);
}

/** One hue, light to dark (or dark to light on a dark surface), in the chart steps. */
function sequentialRamp(family: DataFamily, theme: ThemeName): Oklch[] {
  return Array.from({ length: sequentialSteps }, (_, i) => rampAt(family, theme, i / (sequentialSteps - 1)));
}

/** Two hues meeting at a neutral grey: three steps per arm plus the midpoint. */
function divergingRamp(theme: ThemeName): Oklch[] {
  const [near, far] = divergingArm[theme];
  const arm = (pole: { hue: number; chroma: number }) =>
    [0, 1, 2].map((k) => {
      const t = k / 2;
      return fit([near + (far - near) * t, pole.chroma * (0.6 + 0.4 * t), pole.hue]);
    });
  const below = arm(divergingPoles.below).reverse();
  const above = arm(divergingPoles.above);
  return [...below, divergingPoles.neutral[theme] as Oklch, ...above];
}

const families = Object.keys(dataFamilies) as DataFamily[];
/** Ramp step used as the family's identity swatch: inside the categorical lightness band of each theme. */
const familySwatchStep: Record<ThemeName, number> = { light: 4, dark: 3 };
const ramps = Object.fromEntries(
  themes.map((theme) => [
    theme,
    {
      ...Object.fromEntries(families.map((f) => [f, sequentialRamp(f, theme)])),
      diverging: divergingRamp(theme),
    },
  ]),
) as Record<ThemeName, Record<DataFamily | "diverging", Oklch[]>>;

function themeBlock(theme: ThemeName): string[] {
  const lines: string[] = [];
  for (const [role, refs] of Object.entries(semanticColors))
    lines.push(`--ia-${role}: ${css(resolveRef(refs[theme]))};`);
  for (const [role, refs] of Object.entries(vizChrome))
    lines.push(`--ia-viz-${role}: ${css(resolveRef(refs[theme]))};`);
  for (const [family, colors] of Object.entries(vizCompare))
    colors[theme].forEach((ref, i) => lines.push(`--ia-viz-compare-${family}-${i + 1}: ${css(resolveRef(ref))};`));
  for (const [name, ramp] of Object.entries(ramps[theme])) {
    ramp.forEach((value, i) => lines.push(`--ia-viz-${name}-${i + 1}: ${css(value)};`));
  }
  for (const family of families)
    lines.push(`--ia-family-${family}: ${css(ramps[theme][family][familySwatchStep[theme]])};`);
  for (const [role, refs] of Object.entries(mapChrome))
    lines.push(`--ia-map-${role}: ${css(resolveRef(refs[theme]))};`);
  for (const [name, value] of Object.entries(elevation)) lines.push(`--ia-shadow-${name}: ${value[theme]};`);
  return lines;
}

function staticBlock(): string[] {
  const lines = [
    `--ia-font-display: ${typography.fontDisplay};`,
    `--ia-font-sans: ${typography.fontSans};`,
    `--ia-font-mono: ${typography.fontMono};`,
  ];
  for (const [name, [size, leading]] of Object.entries(typography.size)) {
    lines.push(`--ia-text-${name}: ${size};`, `--ia-text-${name}-leading: ${leading};`);
  }
  for (const [name, value] of Object.entries(typography.tracking)) lines.push(`--ia-tracking-${name}: ${value};`);
  for (const [name, value] of Object.entries(typography.leading)) lines.push(`--ia-leading-${name}: ${value};`);
  for (const [name, value] of Object.entries(typography.weight)) lines.push(`--ia-weight-${name}: ${value};`);
  for (const [name, value] of Object.entries(space)) lines.push(`--ia-space-${name}: ${value};`);
  // The room the explorer map leaves around the country, for markup that must match its first view.
  for (const [name, value] of Object.entries(mapMarks))
    if (name.startsWith("fit-")) lines.push(`--ia-map-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(layout)) lines.push(`--ia-layout-${name}: ${value};`);
  for (const [name, value] of Object.entries(radius)) lines.push(`--ia-radius-${name}: ${value};`);
  for (const [name, value] of Object.entries(focusRing)) lines.push(`--ia-focus-${name}: ${value};`);
  for (const [name, value] of Object.entries(link)) lines.push(`--ia-link-${name}: ${value};`);
  for (const [name, value] of Object.entries(motion)) lines.push(`--ia-motion-${name}: ${value};`);
  for (const [name, value] of Object.entries(layers)) lines.push(`--ia-layer-${name}: ${value};`);
  for (const [name, value] of Object.entries(vizMarks)) lines.push(`--ia-viz-mark-${name}: ${value};`);
  return lines;
}

const indent = (lines: string[], depth = 1) => lines.map((l) => "  ".repeat(depth) + l).join("\n");
const output = `/* Generated by scripts/build-tokens.ts from src/design/tokens.ts. Do not edit by hand. */

:root {
  color-scheme: light;
${indent([...staticBlock(), ...themeBlock("light")])}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${indent(themeBlock("dark"), 2)}
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
${indent(themeBlock("dark"))}
}

/* A section that stays dark in both themes (the landing's motion stage). */
.surface-inverse {
  color-scheme: dark;
${indent(themeBlock("dark"))}
}
`;

mkdirSync(dirname(rampsPath), { recursive: true });
writeFileSync(cssPath, output);
writeFileSync(
  rampsPath,
  JSON.stringify(
    Object.fromEntries(
      themes.map((t) => [
        t,
        {
          land: hex(resolveRef(semanticColors["surface-muted"][t])),
          ...Object.fromEntries(Object.entries(ramps[t]).map(([k, v]) => [k, v.map(hex)])),
        },
      ]),
    ),
    null,
    2,
  ) + "\n",
);
/*
 * The explorer map reads plain colors (MapLibre does not parse oklch): basemap chrome,
 * a few interface roles, and a continuous lookup table per data family to color its rasters.
 */
const mapUiRoles = ["canvas", "surface", "ink", "ink-muted", "ink-subtle", "line", "line-strong", "action"] as const;
writeFileSync(
  mapThemePath,
  JSON.stringify(
    {
      marks: mapMarks,
      ...Object.fromEntries(
        themes.map((theme) => [
          theme,
          {
            chrome: Object.fromEntries(
              [
                ...Object.entries(mapChrome).map(([role, refs]) => [role, refs[theme]] as const),
                ...mapUiRoles.map((role) => [role, semanticColors[role][theme]] as const),
              ].map(([role, ref]) => [role, hex(resolveRef(ref))]),
            ),
            luts: Object.fromEntries(
              families.map((f) => [
                f,
                Array.from({ length: rampLutSteps }, (_, i) => hex(rampAt(f, theme, i / (rampLutSteps - 1)))),
              ]),
            ),
          },
        ]),
      ),
    },
    null,
    2,
  ) + "\n",
);

/* The brand mark (see src/design/brand-mark.ts), drawn with the light productivity ramp. */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${markViewBox} ${markViewBox}">${markPixels
  .map(
    (p) =>
      `<rect x="${p.x}" y="${p.y}" width="${markCell}" height="${markCell}" rx="${markRadius}" fill="${hex(ramps.light.productivity[p.ramp - 1])}"/>`,
  )
  .join("")}</svg>\n`;
writeFileSync(resolve(root, "public/favicon.svg"), favicon);

console.log(`tokens: ${cssPath}\nramps: ${rampsPath}\nmap theme: ${mapThemePath}`);
