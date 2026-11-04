export type ShortCitation =
  | { key: "citeOne" | "citeSeveral"; values: { surname: string; year: number } }
  | { key: "citeTwo"; values: { surname: string; secondSurname: string; year: number } };

const surname = (author: string) => author.split(",")[0].trim();

/**
 * An article's short citation: "Monteith 1972", "Cazzuli & Paruelo 2023" or, from three authors, "Paruelo et al. 2025".
 * `key` names the text it takes in each place that cites. Authors are written as cited: "Surname, I.", the last one
 * after "&", or ending in "et al.".
 */
export function shortCitation({ authors, year }: { authors: string; year: number }): ShortCitation {
  const [first, ...after] = authors.split("&");
  const firstNames = first.split(",").filter((part) => part.trim()).length;
  if (authors.includes("et al.") || after.length > 1 || (after.length === 1 && firstNames > 2))
    return { key: "citeSeveral", values: { surname: surname(authors), year } };
  if (after.length === 1)
    return { key: "citeTwo", values: { surname: surname(first), secondSurname: surname(after[0]), year } };
  return { key: "citeOne", values: { surname: surname(authors), year } };
}
