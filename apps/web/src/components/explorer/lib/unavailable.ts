import { useSyncExternalStore } from "react";
import { indicatorIds, type IndicatorId } from "../../../data/indicators";
import type { Manifest } from "./data";

/*
 * Indicators hidden after the site was built: the catalog marks them `unavailable`, and the API answers their maps
 * and values with a 404 of this problem type. What the site learns at runtime joins the list it was built with.
 */

const PROBLEM = "urn:idea-agro:problem:indicator-temporarily-unavailable";

export class UnavailableError extends Error {}

/** Whether an API answer is the "temporarily unavailable" one, and not a wrong route or another failure. */
export const isUnavailableAnswer = (status: number, body: unknown) =>
  status === 404 && typeof body === "object" && body !== null && (body as { type?: unknown }).type === PROBLEM;

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

let withheld: readonly IndicatorId[] = [];
const listeners = new Set<() => void>();

/** Remembers an indicator the API answered as unavailable, and tells whoever reads the list. */
export function markUnavailable(id: IndicatorId) {
  if (withheld.includes(id)) return;
  withheld = [...withheld, id];
  for (const listener of listeners) listener();
}

/** The indicators the API has answered as unavailable on this page. */
export const useWithheld = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => withheld,
    () => [] as readonly IndicatorId[],
  );
