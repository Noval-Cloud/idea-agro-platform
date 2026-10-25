import { useEffect, useState } from "react";
import type { Department, Division, ProjectOut } from "@idea-agro/api-client";
import { loadManifest, loadSearchIndex, type Manifest, type SearchEntry } from "@/components/explorer/lib/data";
import type { ProjectKey, ProjectTranslator } from "./i18n";

export type Item = ProjectOut["items"][number];
export type ItemIn =
  | { kind: "saved"; zone_id: string }
  | { kind: "division"; division: Division; zone_id: string }
  | { kind: "padron"; department: Department; padron: number };

export const field =
  "h-9 min-w-0 rounded-sm border border-input bg-surface px-2 text-sm text-ink hover:border-ink-subtle focus-visible:border-focus";

export const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
export type Modules = Awaited<ReturnType<typeof api>>;

/** A change's answer, and how it changes the project on screen. */
export type Outcome = { status: number; apply?: (project: ProjectOut) => ProjectOut };
/** Runs a change; `messages` names the message to show for a refused status. */
export type Change = (
  run: (modules: Modules) => Promise<Outcome>,
  messages?: Partial<Record<number, ProjectKey>>,
) => Promise<number>;

/** A key matching the API's item ids, to tell which zones the project already holds. */
export const keyOf = (item: ItemIn) =>
  item.kind === "saved"
    ? `saved:${item.zone_id}`
    : item.kind === "division"
      ? `${item.division}:${item.zone_id}`
      : `padron:${item.department}:${item.padron}`;

export type ZoneNames = { entries: Map<string, SearchEntry>; manifest: Manifest };

/** Names of predefined zones and departments, from the map's own data. */
export function useZoneNames(): ZoneNames | null {
  const [names, setNames] = useState<ZoneNames | null>(null);
  useEffect(() => {
    void Promise.all([loadSearchIndex(), loadManifest()])
      .then(([entries, manifest]) =>
        setNames({ entries: new Map(entries.map((e) => [`${e.d}:${e.id}`, e])), manifest }),
      )
      .catch(() => undefined);
  }, []);
  return names;
}

export const kindOf = (t: ProjectTranslator["t"], division: string) =>
  division.startsWith("cuencas-")
    ? t("project.kinds.cuencas", { grade: division.slice(-1) })
    : t("project.kinds.seccionales");

/** A zone's name from its item key; a saved zone's comes from its record, or the log, when known. */
export function zoneName(t: ProjectTranslator["t"], names: ZoneNames | null, key: string, saved?: string): string {
  const [kind, rest = "", number = ""] = key.split(":");
  if (kind === "saved") return saved || t("project.zones.deleted");
  if (kind === "padron") return t("project.padron", { number });
  return names?.entries.get(key)?.label ?? rest;
}
