import { useEffect, useState } from "react";

/**
 * A list's choice kept in the address (search, filter, sort), so coming back to the page finds the list as it
 * was left. The default stays out of the address.
 */
export function useQueryState(key: string, fallback: string): [string, (value: string) => void] {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    const found = new URLSearchParams(location.search).get(key);
    if (found !== null) setValue(found);
  }, [key]);
  const set = (next: string) => {
    setValue(next);
    const url = new URL(location.href);
    if (next === fallback) url.searchParams.delete(key);
    else url.searchParams.set(key, next);
    history.replaceState(history.state, "", url);
  };
  return [value, set];
}
