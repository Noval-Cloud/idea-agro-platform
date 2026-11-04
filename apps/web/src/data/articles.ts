import copy from "./articles.json";
import type { IndicatorId } from "./indicators";

/*
 * The scientific articles behind the indicators, and which each indicator cites, as editors keep them. A deploy build
 * reads them from the API; checks, local builds and an API never loaded with them read the committed copy, which
 * `node scripts/articles.ts` refreshes.
 */

export type Article = {
  id: string;
  authors: string;
  year: number;
  /** In the language it was published in, which `lang` names (BCP 47). */
  title: string;
  lang: string;
  source: string;
  doi?: string | null;
  url?: string | null;
  framework: boolean;
};
export type Published = { articles: Article[]; citations: Record<string, string[]> };

const api = import.meta.env.PUBLIC_API_URL;

async function fetchArticles(base: string): Promise<Published | null> {
  // A deploy build that waits on an API that does not answer would hang until Cloud Build gives up.
  const response = await fetch(new URL("/v1/articles", base), { signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} /v1/articles`);
  const found = (await response.json()) as Published;
  // Only a store never loaded falls back; one whose articles were all removed shows none.
  return found.articles.length || Object.keys(found.citations).length ? found : null;
}

const published: Published = (api?.startsWith("https://") ? await fetchArticles(api) : null) ?? (copy as Published);
const byId = new Map(published.articles.map((a) => [a.id, a]));

/** Every article, newest first. */
export const articles = published.articles;
/** The reference framework the indicators follow, newest first. */
export const frameworkArticles = articles.filter((a) => a.framework);
/** The articles an indicator cites, in its order. */
export const citations = (indicator: IndicatorId): Article[] =>
  (published.citations[indicator] ?? []).map((id) => byId.get(id)).filter((a): a is Article => a !== undefined);
/** The indicators that cite an article. */
export const citedBy = (article: string): IndicatorId[] =>
  Object.entries(published.citations)
    .filter(([, ids]) => ids.includes(article))
    .map(([indicator]) => indicator as IndicatorId);

export const doiUrl = (doi: string) => `https://doi.org/${doi}`;
/** Where an article is read: its link, else its DOI. */
export const articleUrl = (article: Article) => article.url ?? (article.doi ? doiUrl(article.doi) : undefined);
