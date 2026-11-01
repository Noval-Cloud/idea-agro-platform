import type { Plural } from "./core";

/*
 * The catalogs as editable texts: each leaf is a text, keyed by its dotted path (`zone.season.title`). The code holds
 * which texts exist and their defaults; editors' published versions replace them when the site is built.
 */

export type Text = string | Plural;
export type Edits = Record<string, Text>;

/** Which texts allow Markdown; the rest are plain. A pattern's `*` stands for one part of a key. */
export const markdownKeys = ["indicators.items.*.measures", "indicators.items.*.method", "journey.scenes.*.text"];

export function isMarkdown(key: string): boolean {
  const parts = key.split(".");
  return markdownKeys.some((pattern) => {
    const wanted = pattern.split(".");
    return wanted.length === parts.length && wanted.every((part, i) => part === "*" || part === parts[i]);
  });
}

const isPlural = (node: unknown): node is Plural =>
  typeof node === "object" && node !== null && "other" in node && typeof (node as Plural).other === "string";

/** Every text of a catalog, by key. */
export function texts(catalog: object, prefix = ""): [string, Text][] {
  return Object.entries(catalog).flatMap(([name, node]: [string, unknown]): [string, Text][] => {
    const key = `${prefix}${name}`;
    if (typeof node === "string" || isPlural(node)) return [[key, node]];
    return texts(node as object, `${key}.`);
  });
}

/** The catalog with the edits in place of its defaults; an edit whose key the catalog lacks is left out. */
export function withEdits<C extends object>(catalog: C, edits: Edits): C {
  const copy = structuredClone(catalog) as Record<string, unknown>;
  for (const [key, text] of Object.entries(edits)) {
    const parts = key.split(".");
    let node: Record<string, unknown> | undefined = copy;
    for (const part of parts.slice(0, -1)) node = node?.[part] as Record<string, unknown> | undefined;
    const last = parts[parts.length - 1];
    if (!node || !(last in node)) continue;
    // A plain text takes a plain edit, and a plural one a plural edit.
    if (typeof node[last] === typeof text && isPlural(node[last]) === isPlural(text)) node[last] = text;
  }
  return copy as C;
}
