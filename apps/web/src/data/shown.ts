import { defaultIndicator, indicatorIds, type IndicatorId } from "./indicators";

/*
 * The indicators editors hid while their data is reviewed: the site keeps them, disabled, and shows none of their
 * data. A deploy build reads them from the API's catalog, and fails if it cannot; a build without one (checks, local)
 * shows every indicator. Only pages read this module: islands receive the shown indicators as a prop.
 */

async function fetchHidden(base: string): Promise<IndicatorId[]> {
  // A deploy build that waits on an API that does not answer would hang until Cloud Build gives up.
  const response = await fetch(new URL("/v1/catalog", base), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} /v1/catalog`);
  const { indicators } = (await response.json()) as { indicators: Record<string, { unavailable?: boolean }> };
  return indicatorIds.filter((id) => indicators[id]?.unavailable === true);
}

const api = import.meta.env.PUBLIC_API_URL;
export const hiddenIds: readonly IndicatorId[] = api?.startsWith("https://") ? await fetchHidden(api) : [];
export const isHidden = (id: IndicatorId) => hiddenIds.includes(id);
export const isShown = (id: IndicatorId) => !isHidden(id);
/** The shown indicators, in the site's order. */
export const shownIds: readonly IndicatorId[] = indicatorIds.filter((id) => !isHidden(id));
/** The indicator the explorer and the zone page open on. */
export const openingIndicator = defaultIndicator(shownIds);
