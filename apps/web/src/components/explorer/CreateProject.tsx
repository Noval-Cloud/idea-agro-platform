import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { useI18n } from "./lib/i18n";
import type { MyZone } from "./lib/my-zones";

interface Props {
  open: boolean;
  /** The reader's zones in the account, which a project can hold. */
  zones: MyZone[];
  busy: boolean;
  onCreate: (name: string, zoneIds: string[]) => void;
  onClose: () => void;
}

/** A new project, with the reader's zones on the map: every one is in unless unchecked. */
export default function CreateProject({ open, zones, busy, onCreate, onClose }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setName("");
    setLeft(new Set());
  }, [open]);
  const chosen = zones.filter((z) => !left.has(z.key));

  return (
    <Dialog.Root open={open} onOpenChange={(now) => !now && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 rounded-md border border-line bg-surface p-5 text-ink shadow-overlay">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-display text-lg">{t("explorer.projects.createTitle")}</Dialog.Title>
            <Dialog.Close
              className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft hover:text-ink"
              aria-label={t("explorer.zone.close")}
            >
              <X size={iconSize.sm} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-ink-muted">{t("explorer.projects.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              maxLength={120}
              placeholder={t("explorer.projects.namePlaceholder")}
              className="h-10 rounded-sm border border-ink-subtle bg-surface px-3 text-ink outline-none placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </label>
          <fieldset className="grid min-h-0 gap-2">
            <legend className="text-sm text-ink-muted">{t("explorer.projects.zones")}</legend>
            {zones.length ? (
              <ul className="grid min-h-0 gap-1 overflow-y-auto rounded-sm border border-line p-1">
                {zones.map((zone) => (
                  <li key={zone.key}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-sm hover:bg-action-soft">
                      <input
                        type="checkbox"
                        checked={!left.has(zone.key)}
                        onChange={(e) => {
                          const on = e.currentTarget.checked;
                          setLeft((all) => {
                            const next = new Set(all);
                            if (on) next.delete(zone.key);
                            else next.add(zone.key);
                            return next;
                          });
                        }}
                        className="size-4 accent-(--ia-action)"
                      />
                      <span className="min-w-0 truncate">{zone.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-subtle">{t("explorer.projects.noZones")}</p>
            )}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Dialog.Close className="inline-flex h-10 items-center rounded-sm border border-ink-subtle px-4 text-sm font-medium text-ink hover:bg-action-soft">
              {t("explorer.mine.deleteCancel")}
            </Dialog.Close>
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() =>
                onCreate(
                  name.trim(),
                  chosen.map((z) => z.key),
                )
              }
              className="inline-flex h-10 items-center rounded-sm bg-action px-4 text-sm font-medium text-action-ink hover:bg-action-hover disabled:opacity-50"
            >
              {busy ? t("explorer.projects.creating") : t("explorer.projects.createConfirm", { count: chosen.length })}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
