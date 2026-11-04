/**
 * What an article's short citation ("Paruelo et al. 2024") says: its first author's surname and its year, and whether
 * it has several authors, which adds "et al.". Each place cites with its own texts.
 */
export const shortCitation = ({ authors, year }: { authors: string; year: number }) => ({
  several: authors.includes("&") || authors.includes("et al."),
  values: { surname: authors.split(",")[0].trim(), year },
});
