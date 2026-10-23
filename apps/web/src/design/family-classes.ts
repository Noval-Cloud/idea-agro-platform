import type { DataFamily } from "./tokens";

/* Full class names, so Tailwind can find them when it scans the source. */
export const familyBackground: Record<DataFamily, string> = {
  productivity: "bg-family-productivity",
  water: "bg-family-water",
  soil: "bg-family-soil",
  ecosystem: "bg-family-ecosystem",
  human: "bg-family-human",
};

export const familyFill: Record<DataFamily, string> = {
  productivity: "fill-family-productivity",
  water: "fill-family-water",
  soil: "fill-family-soil",
  ecosystem: "fill-family-ecosystem",
  human: "fill-family-human",
};

export const familyStroke: Record<DataFamily, string> = {
  productivity: "stroke-family-productivity",
  water: "stroke-family-water",
  soil: "stroke-family-soil",
  ecosystem: "stroke-family-ecosystem",
  human: "stroke-family-human",
};
