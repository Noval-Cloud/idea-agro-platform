import { indicatorIds, type IndicatorId } from "@/data/indicators";
import { basinGrades, isDivision, type BasinGrade, type DivisionId } from "./data";

/** The kinds of region drawn over the map; only one at a time ("mine": the reader's files and drawings). */
export type RegionKind = "none" | "seccionales" | "cuencas" | "padrones" | "mine";
export const regionKinds: RegionKind[] = ["none", "seccionales", "cuencas", "padrones", "mine"];

export type Selection =
  | { kind: "division"; division: DivisionId; id: string }
  | { kind: "padron"; department: string; padron: number }
  | { kind: "custom"; layer: string; key: string };

export type ExplorerState = {
  indicator: IndicatorId | "none";
  /** null: the indicator's latest year. */
  year: number | null;
  regions: RegionKind;
  grade: BasinGrade;
  /** Grassland community highlighted when the background is `compn`. */
  community: number;
  selection: Selection | null;
  view: "panel" | "full";
};

export const defaultState: ExplorerState = {
  indicator: "ppna",
  year: null,
  regions: "seccionales",
  grade: 3,
  community: 3,
  selection: null,
  view: "panel",
};

const isIndicator = (value: string | null): value is IndicatorId => indicatorIds.includes(value as IndicatorId);

export function encodeSelection(selection: Selection | null): string | null {
  if (!selection) return null;
  if (selection.kind === "division") return `${selection.division}:${selection.id}`;
  if (selection.kind === "padron") return `padron:${selection.department}:${selection.padron}`;
  return null;
}

export function decodeSelection(value: string | null): Selection | null {
  if (!value) return null;
  const [head, a, b] = value.split(":");
  if (head === "padron" && a && b && /^\d+$/.test(b)) return { kind: "padron", department: a, padron: Number(b) };
  if (isDivision(head) && a) return { kind: "division", division: head, id: a };
  return null;
}

/** State from the address bar, so a view can be shared or bookmarked. */
export function readState(search: string): ExplorerState {
  const params = new URLSearchParams(search);
  const indicator = params.get("ind");
  const year = Number(params.get("year"));
  const regions = params.get("reg") as RegionKind | null;
  const grade = Number(params.get("grade")) as BasinGrade;
  const community = Number(params.get("com"));
  return {
    indicator: indicator === "none" ? "none" : isIndicator(indicator) ? indicator : defaultState.indicator,
    year: Number.isInteger(year) && year > 1900 ? year : null,
    regions: regions && regionKinds.includes(regions) ? regions : defaultState.regions,
    grade: basinGrades.includes(grade) ? grade : defaultState.grade,
    community: community >= 1 && community <= 5 ? community : defaultState.community,
    selection: decodeSelection(params.get("zone")),
    view: params.get("view") === "full" ? "full" : "panel",
  };
}

export function writeState(state: ExplorerState): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | null, fallback?: string | number | null) => {
    if (value !== null && value !== fallback) params.set(key, String(value));
  };
  put("ind", state.indicator, defaultState.indicator);
  put("year", state.year);
  put("reg", state.regions, defaultState.regions);
  if (state.regions === "cuencas") put("grade", state.grade, defaultState.grade);
  if (state.indicator === "compn") put("com", state.community, defaultState.community);
  put("zone", encodeSelection(state.selection));
  put("view", state.view === "full" ? "full" : null);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The division whose outlines are drawn for the current regions choice. */
export const activeDivision = (state: ExplorerState): DivisionId | null =>
  state.regions === "seccionales" ? "seccionales" : state.regions === "cuencas" ? `cuencas-${state.grade}` : null;
