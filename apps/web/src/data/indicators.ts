import type { DataFamily } from "@/design/tokens";
import type { ReferenceId } from "./references";

export const indicatorIds = ["apar", "cob", "ppna", "compn", "rh", "et", "iose", "divtfe", "csue", "ahppn"] as const;
export type IndicatorId = (typeof indicatorIds)[number];
export type IndicatorGroup = "structure" | "environment";

/** How each indicator's national panel is drawn. */
export type IndicatorChart = "annualBars" | "seasonal" | "yearlyLine" | "range" | "communities";

export type Indicator = {
  family: DataFamily;
  group: IndicatorGroup;
  chart: IndicatorChart;
  references: ReferenceId[];
  /** Legend unit factor applied to the raster values. */
  legendFactor?: number;
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
    references: ["monteith1972", "pineiro2006"],
    digits: 0,
    yearStyle: "productive",
  },
  cob: {
    family: "ecosystem",
    group: "structure",
    chart: "yearlyLine",
    references: ["baeza2022"],
    digits: 0,
    yearStyle: "calendar",
  },
  ppna: {
    family: "productivity",
    group: "structure",
    chart: "annualBars",
    references: ["pineiro2006", "baeza2010"],
    digits: 0,
    yearStyle: "productive",
  },
  compn: {
    family: "ecosystem",
    group: "structure",
    chart: "communities",
    references: ["lezama2019", "baeza2010"],
    digits: 0,
  },
  /** The landing's snapshot holds RH's former annual asset, the mean monthly yield: ×12 gives mm per year. */
  rh: {
    family: "water",
    group: "environment",
    chart: "annualBars",
    references: ["gallego2023"],
    legendFactor: 12,
    digits: 0,
    yearStyle: "productive",
  },
  et: {
    family: "water",
    group: "environment",
    chart: "annualBars",
    references: ["gallego2023"],
    digits: 0,
    yearStyle: "productive",
  },
  iose: {
    family: "ecosystem",
    group: "environment",
    chart: "yearlyLine",
    references: ["paruelo2016"],
    digits: 2,
    yearStyle: "productive",
  },
  divtfe: {
    family: "ecosystem",
    group: "environment",
    chart: "range",
    references: ["paruelo2001", "alcarazSegura2013"],
    digits: 2,
  },
  csue: { family: "soil", group: "environment", chart: "range", references: ["renard1997"], digits: 1 },
  ahppn: { family: "human", group: "environment", chart: "range", references: ["baezaParuelo2018"], digits: 0 },
};

export const indicatorsByGroup = (group: IndicatorGroup) => indicatorIds.filter((id) => indicators[id].group === group);
