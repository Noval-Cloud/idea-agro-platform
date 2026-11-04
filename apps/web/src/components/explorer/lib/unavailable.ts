import { useSyncExternalStore } from "react";
import { indicatorIds, type IndicatorId } from "../../../data/indicators";
import { UNAVAILABLE } from "../../../data/national-source";
import type { Manifest } from "./data";

/*
 * Indicators hidden after the site was built: the catalog marks them `unavailable`, and the API answers their maps
 * and values with a 404 of this problem type. What the site learns at runtime joins the list it was built with.
 */

export class UnavailableError extends Error {}

/** Whether an API answer is the "temporarily unavailable" one, and not a wrong route or another failure. */
export const isUnavailableAnswer = (status: number, body: unknown) =>
  status === 404 && typeof body === "object" && body !== null && (body as { type?: unknown }).type === UNAVAILABLE;

/** The error for a failed response: `UnavailableError` for a hidden indicator's, a plain one else. */
export async function failure(response: Response, what: string): Promise<Error> {
  const body = response.status === 404 ? await response.json().catch(() => null) : null;
  return isUnavailableAnswer(response.status, body)
    ? new UnavailableError(`${response.status} ${what}`)
    : new Error(`${response.status} ${what}`);
}

/** The shown indicators, in order, less every list of hidden ones. */
export const shownWithout = (shown: readonly IndicatorId[], ...hidden: (readonly IndicatorId[])[]) =>
  shown.filter((id) => !hidden.some((list) => list.includes(id)));

/** The indicators the catalog marks unavailable. */
export const unavailableIn = (manifest: Manifest | null): IndicatorId[] =>
  manifest ? indicatorIds.filter((id) => manifest.indicators[id]?.unavailable) : [];

const none: readonly IndicatorId[] = [];
let withheld = none;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Remembers an indicator the API answered as unavailable, and tells whoever reads the list. */
export function markUnavailable(id: IndicatorId) {
  if (withheld.includes(id)) return;
  withheld = [...withheld, id];
  for (const listener of listeners) listener();
}

/** Marks the indicator when a failed read is the API's "temporarily unavailable" answer. */
export function reportUnavailable(indicator: IndicatorId, error: unknown) {
  if (error instanceof UnavailableError) markUnavailable(indicator);
}

/** The indicators the API has answered as unavailable on this page. */
export const useWithheld = () =>
  useSyncExternalStore(
    subscribe,
    () => withheld,
    () => none,
  );

/** The indicators marked so far, for tests. */
export const withheldNow = () => withheld;
