import { useSyncExternalStore } from "react";
import type { DataFamily } from "@/design/tokens";
import generated from "@/design/generated/map-theme.json";

export type MapThemeName = "light" | "dark";
type ThemeColors = { chrome: Record<string, string>; luts: Record<DataFamily, string[]> };

/** Plain colors generated from the design tokens (`pnpm tokens`); MapLibre cannot read oklch. */
export const mapTheme = generated as unknown as Record<MapThemeName, ThemeColors> & {
  marks: Record<string, number>;
};
export const mapMarks = mapTheme.marks;

const media = () => matchMedia("(prefers-color-scheme: dark)");

function currentTheme(): MapThemeName {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return media().matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const query = media();
  query.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    query.removeEventListener("change", onChange);
  };
}

/** The theme in effect: the reader's choice (theme toggle) or the system's. */
export function useTheme(): MapThemeName {
  return useSyncExternalStore(subscribe, currentTheme, () => "light");
}
