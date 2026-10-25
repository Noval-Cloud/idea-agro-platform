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
