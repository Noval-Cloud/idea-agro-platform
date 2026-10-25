import { AlertDialog } from "radix-ui";
import { useI18n } from "./lib/i18n";
import type { MyZone } from "./lib/my-zones";

interface Props {
  /** The zone to delete, or null when nothing is asked. */
  zone: MyZone | null;
  /** Whether it is kept only in this browser. */
  local: boolean;
  onConfirm: (zone: MyZone) => void;
  onCancel: () => void;
}

/** Asks before deleting one of the reader's zones: a saved one also leaves every project it is in. */
export default function DeleteZone({ zone, local, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  return (
    <AlertDialog.Root open={zone !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-line bg-surface p-5 text-ink shadow-overlay">
          <AlertDialog.Title className="font-display text-lg">
            {t("explorer.mine.deleteTitle", { name: zone?.name ?? "" })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-ink-muted">
            {local ? t("explorer.mine.deleteLocal") : t("explorer.mine.deleteSaved")}
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel className="inline-flex h-10 items-center rounded-sm border border-ink-subtle px-4 text-sm font-medium text-ink hover:bg-action-soft">
              {t("explorer.mine.deleteCancel")}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={() => zone && onConfirm(zone)}
              className="inline-flex h-10 items-center rounded-sm bg-action px-4 text-sm font-medium text-action-ink hover:bg-action-hover"
            >
              {t("explorer.mine.deleteConfirm")}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
