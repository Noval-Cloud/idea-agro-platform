import { defaultIndicator, indicatorIds, indicators, type IndicatorGroup, type IndicatorId } from "./indicators";

/*
 * The indicators the site shows: editors hide one while its data is reviewed. A deploy build reads them from the API,
 * and fails if it cannot; a build without one (checks, local) shows them all. Only pages read this module: islands
 * receive the shown indicators as a prop.
 */

async function fetchShown(base: string): Promise<IndicatorId[]> {
  // A deploy build that waits on an API that does not answer would hang until Cloud Build gives up.
  const response = await fetch(new URL("/v1/indicators", base), { signal: AbortSignal.timeout(30_000) });
  // An API older than the switch shows every indicator.
  if (response.status === 404) return [...indicatorIds];
  if (!response.ok) throw new Error(`${response.status} /v1/indicators`);
  const { indicators: found } = (await response.json()) as { indicators: string[] };
  return indicatorIds.filter((id) => found.includes(id));
}

const api = import.meta.env.PUBLIC_API_URL;
/** The shown indicators, in the site's order. */
export const shownIds: readonly IndicatorId[] = api?.startsWith("https://") ? await fetchShown(api) : indicatorIds;
export const isShown = (id: IndicatorId) => shownIds.includes(id);
export const shownByGroup = (group: IndicatorGroup) => shownIds.filter((id) => indicators[id].group === group);
/** The indicator the explorer and the zone page open on. */
export const openingIndicator = defaultIndicator(shownIds);
