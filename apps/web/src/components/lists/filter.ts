/** Text folded for matching: no accents, no case, so "tacuarembo" finds "Tacuarembó". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

/** Whether every word of the query appears in one of the fields. */
export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const haystack = fold(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

/** Every value a row holds, as text to search in, but for the fields named: search covers all unless left out. */
export function rowText(row: object, skip: string[]): string {
  const text = (value: unknown): string[] =>
    typeof value === "string" || typeof value === "number"
      ? [String(value)]
      : Array.isArray(value)
        ? value.flatMap(text)
        : [];
  return Object.entries(row)
    .filter(([field]) => !skip.includes(field))
    .flatMap(([, value]) => text(value))
    .join(" ");
}
