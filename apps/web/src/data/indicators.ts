import type { DataFamily } from "@/design/tokens";

export const indicatorIds = ["apar", "cob", "ppna", "compn", "rh", "et", "iose", "divtfe", "csue", "ahppn"] as const;
export type IndicatorId = (typeof indicatorIds)[number];
export type IndicatorGroup = "structure" | "environment";

/** How each indicator's national panel is drawn. */
export type IndicatorChart = "annualBars" | "seasonal" | "yearlyLine" | "range" | "communities";

export type Indicator = {
  family: DataFamily;
  group: IndicatorGroup;
  chart: IndicatorChart;
  /** Decimals shown in legends and figures. */
  digits: number;
  /** How the years of its series are named: July–June productive years or calendar years. */
  yearStyle?: "productive" | "calendar";
};

export const indicators: Record<IndicatorId, Indicator> = {
  apar: {
    family: "productivity",
    group: "structure",
    chart: "seasonal",
    digits: 0,
    yearStyle: "productive",
  },
  cob: {
    family: "ecosystem",
    group: "structure",
    chart: "yearlyLine",
    digits: 0,
    yearStyle: "calendar",
  },
  ppna: {
    family: "productivity",
    group: "structure",
    chart: "annualBars",
    digits: 0,
    yearStyle: "productive",
  },
  compn: {
    family: "ecosystem",
    group: "structure",
    chart: "communities",
    digits: 0,
  },
  rh: {
    family: "water",
    group: "environment",
    chart: "annualBars",
    digits: 0,
    yearStyle: "productive",
  },
  et: {
    family: "water",
    group: "environment",
    chart: "annualBars",
    digits: 0,
    yearStyle: "productive",
  },
  iose: {
    family: "ecosystem",
    group: "environment",
    chart: "yearlyLine",
    digits: 2,
    yearStyle: "productive",
  },
  divtfe: {
    family: "ecosystem",
    group: "environment",
    chart: "range",
    digits: 2,
  },
  csue: { family: "soil", group: "environment", chart: "range", digits: 1 },
  ahppn: { family: "human", group: "environment", chart: "range", digits: 0 },
};

export const indicatorsByGroup = (group: IndicatorGroup) => indicatorIds.filter((id) => indicators[id].group === group);

/** The indicator the explorer and the zone page open on: productivity, or the first shown one while it is hidden. */
export const defaultIndicator = (shown: readonly IndicatorId[]): IndicatorId | undefined =>
  shown.includes("ppna") ? "ppna" : shown[0];
