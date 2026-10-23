import { loadPadronIndex, loadSearchIndex, type Manifest, type SearchEntry } from "./data";
import { fold } from "./geo";

export type SearchResult =
  | { type: "entry"; entry: SearchEntry; score: number }
  | { type: "padron"; department: string; departmentName: string; padron: number; score: number };

type Indexed = { entry: SearchEntry; label: string; words: string[]; number: string | null };
let indexed: Promise<Indexed[]> | null = null;

const prepare = () =>
  (indexed ??= loadSearchIndex().then((entries) =>
    entries.map((entry) => {
      const label = fold(entry.label);
      // Districts are "Department, N": their number is matched whole, never as part of a code.
      const number = entry.d === "seccionales" ? (label.split(" ").at(-1) ?? null) : null;
      const detail = entry.d.startsWith("cuencas-") ? "" : (entry.detail ?? "");
      const words = fold(`${entry.label} ${detail}`)
        .split(" ")
        .filter((w) => w && w !== number);
      return { entry, label, words, number };
    }),
  ));

/** Warms the index when the search box gets focus, so the first keystroke already has results. */
export const preloadSearch = () => void prepare();

const PER_GROUP = 5;
const groupOf = (entry: SearchEntry) => (entry.d.startsWith("cuencas-") ? "cuencas" : entry.d);
const grade = (entry: SearchEntry) => (entry.d.startsWith("cuencas-") ? Number(entry.d.slice(-1)) : 0);

/**
 * Every word must start a word of the zone's name (or be the district number). An exact name
 * ranks first, then names that start with the query; basins go from the largest grade down.
 * A query made only of digits also looks up parcel numbers and basin codes.
 */
export async function search(query: string, manifest: Manifest): Promise<SearchResult[]> {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const all = await prepare();
  const numeric = words.every((w) => /^\d+$/.test(w));
  const phrase = words.join(" ");

  const matches: SearchResult[] = [];
  for (const item of all) {
    const ok = words.every((w) =>
      /^\d+$/.test(w)
        ? item.number === w || (numeric && item.entry.d.startsWith("cuencas-") && item.entry.id.startsWith(w))
        : item.words.some((word) => word.startsWith(w)),
    );
    if (!ok) continue;
    const score = item.label === phrase ? 0 : item.label.startsWith(phrase) ? 1 : 2;
    matches.push({
      type: "entry",
      entry: item.entry,
      score: score * 10 + grade(item.entry) + item.label.length / 1000,
    });
  }
  matches.sort((a, b) => a.score - b.score);
  const perGroup = new Map<string, number>();
  const entries = matches.filter((m) => {
    if (m.type !== "entry") return false;
    const g = groupOf(m.entry);
    const n = perGroup.get(g) ?? 0;
    perGroup.set(g, n + 1);
    return n < PER_GROUP;
  });

  const number = words.find((w) => /^\d{1,6}$/.test(w));
  const padrones: SearchResult[] = [];
  if (number) {
    const index = await loadPadronIndex();
    const others = words.filter((w) => w !== number && w !== "padron" && w !== "parcel");
    for (const [department, numbers] of Object.entries(index)) {
      const name = manifest.padrones[department]?.name ?? department;
      if (
        others.length &&
        !others.every((w) =>
          fold(name)
            .split(" ")
            .some((word) => word.startsWith(w)),
        )
      )
        continue;
      if (binaryIncludes(numbers, Number(number)))
        padrones.push({ type: "padron", department, departmentName: name, padron: Number(number), score: 0 });
    }
  }
  return [...padrones.slice(0, PER_GROUP), ...entries];
}

function binaryIncludes(sorted: number[], value: number) {
  let [lo, hi] = [0, sorted.length - 1];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] === value) return true;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}
