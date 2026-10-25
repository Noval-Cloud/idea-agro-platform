import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { SavedZoneOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { iconSize } from "@/design/tokens";
import { importBatches, readZoneFile, zoneFileTypes, type FileZone } from "@/components/explorer/lib/files";
import type { AccountTranslator } from "./i18n";

type Props = {
  t: AccountTranslator["t"];
  number: AccountTranslator["number"];
  signInPath: string;
  onSaved: (zones: SavedZoneOut[]) => void;
};

/** Reads a file's polygons, shows them, and saves them to the library. Drawing stays on the map. */
export default function ImportZones({ t, number, signInPath, onSaved }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [found, setFound] = useState<{ file: string; zones: FileZone[] } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = async (file: File) => {
    setNotice(null);
    try {
      const zones = await readZoneFile(file, (n) => t("account.zones.import.unnamed", { number: n }));
      if (!zones.length) return setNotice({ text: t("account.zones.import.empty", { name: file.name }), ok: false });
      setFound({ file: file.name, zones });
    } catch {
      setNotice({ text: t("account.zones.import.unreadable", { name: file.name }), ok: false });
    }
  };

  const save = async () => {
    if (!found) return;
    setSaving(true);
    setNotice(null);
    let saved = 0;
    try {
      const [{ privately }, client] = await Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
      const items = found.zones.map((z) => ({
        key: z.key,
        zone: { name: z.name, source: "uploaded" as const, geometry: z.geometry },
      }));
      for (const batch of importBatches(items)) {
        const response = await privately((init) => client.importSavedZones({ zones: batch.map((b) => b.zone) }, init));
        if (response.status !== 201) {
          const detail = (response.data as { detail?: string | null }).detail ?? String(response.status);
          return setNotice({ text: t("account.zones.import.failed", { reason: detail }), ok: false });
        }
        saved += response.data.length;
        onSaved(response.data);
        // Saved zones leave the list one import at a time, so trying again sends only the rest.
        const sent = new Set(batch.map((b) => b.key));
        setFound((now) => now && { ...now, zones: now.zones.filter((z) => !sent.has(z.key)) });
      }
      setFound(null);
      setNotice({ text: t("account.zones.import.saved", { count: saved }), ok: true });
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut)
        return location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname)}`);
      setNotice({ text: t("account.zones.import.interrupted"), ok: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 grid gap-3">
      <input
        ref={input}
        type="file"
        accept={zoneFileTypes}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared, so choosing the same file again reads it again.
          event.currentTarget.value = "";
          if (file) void pick(file);
        }}
      />
      {found ? (
        <div className="grid gap-3 rounded-sm border border-line p-4">
          <p className="text-sm font-medium text-ink">
            {t("account.zones.import.found", { count: found.zones.length, name: found.file })}
          </p>
          <ul className="grid max-h-64 grid-cols-[minmax(0,1fr)] divide-y divide-line overflow-y-auto text-sm">
            {found.zones.map((zone) => (
              <li key={zone.key} className="flex items-center gap-4 py-2">
                <span className="min-w-0 grow truncate text-ink">{zone.name}</span>
                <span className="shrink-0 text-ink-subtle">
                  {t("account.zones.area", { value: number(zone.areaKm2 * 100) })}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving
                ? t("account.zones.import.saving")
                : t("account.zones.import.save", { count: found.zones.length })}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setFound(null)}>
              {t("account.zones.import.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
            <Upload size={iconSize.sm} aria-hidden="true" />
            {t("account.zones.import.action")}
          </Button>
          <p className="text-xs text-ink-subtle">{t("account.zones.import.hint")}</p>
        </div>
      )}
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={notice.ok ? "text-sm text-ink-muted" : "text-sm text-danger"}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
