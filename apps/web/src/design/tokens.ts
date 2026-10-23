/**
 * Single source of truth for every visual value of the site.
 * `pnpm tokens` renders this file into `src/styles/tokens.css` (CSS custom properties)
 * and `src/design/generated/data-ramps.json` (hex ramps used to color satellite maps),
 * so the interface and the map rasters can never drift apart.
 */

export type Oklch = readonly [lightness: number, chroma: number, hue: number];
export type ThemeName = "light" | "dark";

/** Raw palette. Components never read these directly; semantic tokens do. */
export const primitives = {
  indigo: {
    50: [0.975, 0.008, 264],
    100: [0.95, 0.016, 264],
    200: [0.9, 0.03, 264],
    300: [0.82, 0.05, 264],
    400: [0.68, 0.09, 264],
    500: [0.55, 0.13, 264],
    600: [0.46, 0.14, 264],
    700: [0.38, 0.12, 264],
    800: [0.3, 0.09, 264],
    900: [0.24, 0.07, 264],
    950: [0.18, 0.05, 264],
  },
  slate: {
    0: [1, 0, 0],
    25: [0.985, 0.004, 260],
    50: [0.972, 0.006, 260],
    100: [0.952, 0.008, 260],
    200: [0.915, 0.01, 262],
    300: [0.84, 0.014, 262],
    350: [0.78, 0.02, 262],
    400: [0.7, 0.02, 262],
    500: [0.52, 0.02, 262],
    600: [0.45, 0.03, 262],
    700: [0.38, 0.035, 264],
    800: [0.29, 0.03, 264],
    900: [0.2, 0.028, 264],
    925: [0.165, 0.025, 264],
    950: [0.145, 0.022, 264],
  },
  pasture: {
    500: [0.6, 0.16, 150],
    300: [0.76, 0.16, 150],
  },
  ember: {
    500: [0.55, 0.19, 27],
    300: [0.7, 0.17, 27],
  },
  /** Basemap water: a quiet blue that never competes with the water data family. */
  lake: {
    200: [0.885, 0.03, 232],
    900: [0.235, 0.03, 245],
  },
} as const satisfies Record<string, Record<number, Oklch>>;

type PrimitiveRef = {
  [P in keyof typeof primitives]: `${P}.${keyof (typeof primitives)[P] & number}`;
}[keyof typeof primitives];

/** What a color is for. Each theme maps every role to a primitive. */
export const semanticColors = {
  canvas: { light: "slate.25", dark: "slate.925" },
  surface: { light: "slate.0", dark: "slate.900" },
  "surface-sunken": { light: "slate.50", dark: "slate.950" },
  "surface-muted": { light: "slate.100", dark: "slate.800" },
  ink: { light: "indigo.950", dark: "slate.100" },
  "ink-muted": { light: "slate.600", dark: "slate.350" },
  "ink-subtle": { light: "slate.500", dark: "slate.400" },
  line: { light: "slate.200", dark: "slate.800" },
  "line-strong": { light: "slate.300", dark: "slate.700" },
  action: { light: "indigo.800", dark: "indigo.200" },
  "action-hover": { light: "indigo.700", dark: "indigo.100" },
  "action-ink": { light: "slate.0", dark: "indigo.950" },
  "action-soft": { light: "indigo.100", dark: "slate.800" },
  selection: { light: "indigo.200", dark: "indigo.700" },
  link: { light: "indigo.600", dark: "indigo.300" },
  focus: { light: "pasture.500", dark: "pasture.300" },
  danger: { light: "ember.500", dark: "ember.300" },
} as const satisfies Record<string, Record<ThemeName, PrimitiveRef>>;

/**
 * Data families. Every indicator belongs to one, and the family hue is the only place
 * color appears in the interface: maps, charts and the swatch beside an indicator name.
 */
export const dataFamilies = {
  productivity: { hue: 148, hueDrift: -22, chroma: 0.15 },
  water: { hue: 245, hueDrift: -18, chroma: 0.13 },
  soil: { hue: 62, hueDrift: 14, chroma: 0.13 },
  ecosystem: { hue: 300, hueDrift: -10, chroma: 0.14 },
  human: { hue: 18, hueDrift: 20, chroma: 0.16 },
} as const;

export type DataFamily = keyof typeof dataFamilies;

/** Seven steps from "little" to "a lot". Low values recede toward the surface in both themes. */
export const sequentialSteps = 7;
export const sequentialLightness: Record<ThemeName, readonly [number, number]> = {
  light: [0.955, 0.36],
  dark: [0.27, 0.9],
};

/**
 * Below / above the historical mean: brown and blue, a pair that stays apart under red–green
 * colour blindness (validated with the dataviz CVD check). A neutral grey midpoint means "as usual".
 */
export const divergingPoles = {
  below: { hue: 62, chroma: 0.14 },
  above: { hue: 230, chroma: 0.13 },
  neutral: { light: [0.87, 0.006, 260], dark: [0.36, 0.012, 264] },
} as const;
export const divergingArm: Record<ThemeName, readonly [number, number]> = {
  light: [0.8, 0.42],
  dark: [0.47, 0.85],
};

/** Chart chrome, one step off the surface so the data stays the loudest thing. */
export const vizChrome = {
  grid: { light: "slate.200", dark: "slate.800" },
  axis: { light: "slate.300", dark: "slate.700" },
  "series-reference": { light: "slate.500", dark: "slate.400" },
  "series-emphasis": { light: "indigo.700", dark: "indigo.300" },
} as const satisfies Record<string, Record<ThemeName, PrimitiveRef>>;

/**
 * The explorer's basemap and region outlines. A region line rides on a casing of the
 * opposite lightness, so it stays visible over every step of every ramp.
 */
export const mapChrome = {
  land: { light: "slate.100", dark: "slate.900" },
  water: { light: "lake.200", dark: "lake.900" },
  boundary: { light: "slate.400", dark: "slate.600" },
  "boundary-minor": { light: "slate.300", dark: "slate.700" },
  road: { light: "slate.300", dark: "slate.700" },
  label: { light: "slate.600", dark: "slate.350" },
  "label-halo": { light: "slate.25", dark: "slate.925" },
  "zone-line": { light: "indigo.950", dark: "slate.100" },
  "zone-casing": { light: "slate.0", dark: "slate.950" },
  /** The region under the pointer: a white line on a dark halo, readable over the ramps and the bare land. */
  "zone-hover": { light: "slate.0", dark: "slate.0" },
  "zone-hover-casing": { light: "slate.950", dark: "slate.950" },
  /** The chosen region: its outline and, fainter, its fill. */
  "zone-selected": { light: "indigo.500", dark: "indigo.400" },
  /** The reader's own zones (uploaded or drawn): set apart from the predefined divisions. */
  "zone-own": { light: "ember.500", dark: "ember.300" },
} as const satisfies Record<string, Record<ThemeName, PrimitiveRef>>;

/** Line widths (pixels) and opacities of the explorer map. */
export const mapMarks = {
  /** Region lines grow with the zoom: a light mesh over the whole country, firm lines up close. */
  "zone-width-low": 0.4,
  "zone-width": 0.75,
  "zone-width-high": 1.4,
  "zone-casing-opacity": 0.55,
  "zone-casing-opacity-low": 0.25,
  "zone-own-fill-opacity": 0.12,
  "zone-own-width": 1.5,
  "zone-casing-width": 2.25,
  "zone-hover-width": 3,
  "zone-hover-casing-width": 5,
  "zone-hover-casing-opacity": 0.6,
  /** Kept faint: any tint shifts the indicator's colours inside the zone being read. */
  "zone-selected-fill-opacity": 0.12,
  "zone-selected-width": 3,
  "zone-selected-casing-width": 5,
  "boundary-width": 1,
  "road-width": 0.6,
  "raster-opacity": 0.92,
  "label-halo-width": 1.5,
  "label-size": 12,
  "label-size-major": 13,
  "popup-offset": 14,
  /** Camera moves (ms), and the room left around the country for the map buttons and the time bar (px). */
  "fly-duration": 900,
  "fit-top": 24,
  "fit-bottom": 132,
  "fit-side": 24,
  "fit-controls": 64,
  "draw-outline-width": 2,
  /** Dash of the reader's own zones (line widths). */
  "own-dash-on": 3,
  "own-dash-off": 2,
} as const;

/** Samples per ramp in the continuous lookup tables that color the explorer's rasters. */
export const rampLutSteps = 64;

/** Mark specs shared by every chart and map (SVG user units unless stated). */
export const vizMarks = {
  "border-width": "0.75",
  "outline-width": "1",
  "hover-width": "1.5",
  "line-width": "2",
  "marker-radius": "4",
  "point-radius": "6",
  "ring-width": "2",
  "bar-max": "24",
  "bar-radius": "4",
  "dim-opacity": "0.5",
  /** Dash of reference lines (an average drawn across a chart). */
  "reference-dash": "4 3",
  "area-opacity": "0.1",
} as const;

export const typography = {
  /** Families are self-hosted by the Astro Fonts API, which exposes these variables. */
  fontDisplay: "var(--font-newsreader)",
  fontSans: "var(--font-schibsted)",
  /** Code samples: the platform's monospace stack (no web font to download). */
  fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  /** Fluid sizes between a 360px and a 1440px viewport. */
  size: {
    "2xs": ["0.75rem", "1.1rem"],
    xs: ["0.8125rem", "1.2rem"],
    sm: ["0.875rem", "1.35rem"],
    base: ["1.0625rem", "1.65rem"],
    lg: ["clamp(1.125rem, 1.08rem + 0.2vw, 1.25rem)", "1.6"],
    xl: ["clamp(1.25rem, 1.17rem + 0.35vw, 1.5rem)", "1.45"],
    "2xl": ["clamp(1.5rem, 1.33rem + 0.75vw, 2rem)", "1.25"],
    "3xl": ["clamp(1.875rem, 1.54rem + 1.5vw, 2.875rem)", "1.15"],
    "4xl": ["clamp(2.25rem, 1.67rem + 2.6vw, 4rem)", "1.06"],
    display: ["clamp(2.5rem, 1.9rem + 2.6vw, 4.25rem)", "1.04"],
  },
  tracking: { tight: "-0.022em", snug: "-0.012em", normal: "0em", wide: "0.01em" },
  /** Line heights for text set apart from the size scale (titles in cards, figures). */
  leading: { tight: "1.15", snug: "1.3", normal: "1.5" },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;

export const space = {
  /** Base step of Tailwind's spacing scale (p-4 = 4 × unit). */
  unit: "0.25rem",
  gutter: "clamp(1rem, 0.6rem + 1.8vw, 2.5rem)",
  section: "clamp(4.5rem, 3rem + 6vw, 9rem)",
  stack: "clamp(2rem, 1.5rem + 2vw, 3.5rem)",
} as const;

export const layout = {
  /** Height of the site header bar; app pages size themselves to the viewport below it. */
  header: "4rem",
  /** The viewport below the header, for app pages (the explorer, the zone page). */
  app: "calc(100dvh - var(--ia-layout-header))",
  /** Width of floating panels (the explorer's layers menu), never wider than the screen. */
  panel: "min(calc(100vw - var(--ia-space-gutter) * 2), 24rem)",
  /** Width of the explorer's indicator panel: its content starts on the gutter, under the logo. */
  sidebar: "calc(19.5rem + var(--ia-space-gutter) * 2)",
  page: "80rem",
  prose: "40rem",
  measure: "68ch",
} as const;

/** Icon sizes in pixels (Lucide `size`). */
export const iconSize = { sm: 16, md: 18, lg: 20 } as const;

/** Keyboard focus ring. */
export const focusRing = { width: "2px", offset: "2px" } as const;

export const radius = {
  xs: "0.25rem",
  sm: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  pill: "999px",
} as const;

export const elevation = {
  raised: {
    light: "0 1px 2px oklch(0.24 0.07 264 / 0.06), 0 8px 24px -12px oklch(0.24 0.07 264 / 0.18)",
    dark: "0 1px 2px oklch(0 0 0 / 0.4), 0 12px 32px -16px oklch(0 0 0 / 0.7)",
  },
  overlay: {
    light: "0 2px 6px oklch(0.24 0.07 264 / 0.08), 0 24px 56px -20px oklch(0.24 0.07 264 / 0.32)",
    dark: "0 2px 6px oklch(0 0 0 / 0.5), 0 24px 56px -20px oklch(0 0 0 / 0.85)",
  },
} as const;

/** Link underline geometry. */
export const link = { "underline-offset": "0.2em", "underline-thickness": "1px" } as const;

/** Breakpoints, matching Tailwind's md and lg; used in `sizes` attributes of responsive images. */
export const breakpoints = { md: "48rem", lg: "64rem", xl: "80rem" } as const;
export const minWidth = (name: keyof typeof breakpoints) => `(min-width: ${breakpoints[name]})`;

export const motion = {
  "ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
  "ease-in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
  fast: "140ms",
  base: "220ms",
  reveal: "1800ms",
  /** Used by the reduced-motion reset: effectively no animation. */
  instant: "0.01ms",
  /** The landing's motion story: time on each scene, line drawing, slow drift, and the stagger between items. */
  scene: "7000ms",
  /** One year of the explorer's time-lapse. */
  timelapse: "1100ms",
  enter: "640ms",
  draw: "2200ms",
  drift: "9000ms",
  stagger: "160ms",
} as const;

export const layers = {
  /** The explorer's overlays (search, time bar, zone card) above MapLibre's own controls. */
  "map-overlay": "10",
  /** The regions bar above the map: its search results drop over the map's overlays, under the header. */
  "map-bar": "20",
  header: "40",
  popover: "50",
  tooltip: "60",
} as const;
