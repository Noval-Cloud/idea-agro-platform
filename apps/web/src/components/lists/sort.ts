export type Sort<K extends string> = { key: K; descending: boolean };

/** Rows in the sort's order: text by the locale's collation, numbers and times by value. */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: Sort<K>,
  value: (row: T, key: K) => string | number,
  collator: Intl.Collator,
): T[] {
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    const order = typeof x === "string" && typeof y === "string" ? collator.compare(x, y) : Number(x) - Number(y);
    return sort.descending ? -order : order;
  });
}

/** The sort after choosing a key: the current one turns around, another starts in its usual direction. */
export const chooseSort = <K extends string>(sort: Sort<K>, key: K, natural: boolean): Sort<K> => ({
  key,
  descending: sort.key === key ? !sort.descending : natural,
});

/** A sort as it goes in the address: the key, after a minus when descending. */
export const encodeSort = <K extends string>(sort: Sort<K>) => `${sort.descending ? "-" : ""}${sort.key}`;

export function decodeSort<K extends string>(value: string, keys: readonly K[], fallback: Sort<K>): Sort<K> {
  const key = value.replace(/^-/, "") as K;
  return keys.includes(key) ? { key, descending: value.startsWith("-") } : fallback;
}
