import { useRef, useState } from "react";
import { Dialog, DropdownMenu } from "radix-ui";
import { ChevronDown, FileUp, PenLine, Plus, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { zoneFileTypes } from "./lib/files";
import { useI18n } from "./lib/i18n";

interface Props {
  drawing: boolean;
  onUpload: (file: File) => void;
  onDraw: (drawing: boolean) => void;
}

const control =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 border text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const quiet = "border-ink-subtle bg-surface text-ink hover:bg-action-soft";
const menuItem =
  "flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink outline-none select-none data-highlighted:bg-action-soft";

/** "Add zone": the button uploads a file, its arrow offers every way to add one. While drawing, it cancels. */
export default function AddZone(props: Props) {
  const { t } = useI18n();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upload = (chosen: File | undefined) => {
    if (!chosen) return;
    setUploading(false);
    props.onUpload(chosen);
  };

  return (
    <>
      {props.drawing ? (
        <button
          type="button"
          onClick={() => props.onDraw(false)}
          aria-pressed="true"
          className={cn(control, "rounded-sm border-action bg-action px-3 text-action-ink")}
        >
          <X size={iconSize.sm} aria-hidden="true" />
          {t("explorer.regions.drawCancel")}
        </button>
      ) : (
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={() => setUploading(true)}
            className={cn(control, quiet, "rounded-l-sm px-3")}
            title={t("explorer.regions.uploadHint")}
          >
            <Plus size={iconSize.sm} aria-hidden="true" />
            <span className="hidden sm:inline">{t("explorer.mine.add")}</span>
            <span className="sr-only sm:hidden">{t("explorer.mine.add")}</span>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={cn(control, quiet, "-ml-px w-9 rounded-r-sm")}
              aria-label={t("explorer.mine.addMore")}
              title={t("explorer.mine.addMore")}
            >
              <ChevronDown size={iconSize.sm} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-(--ia-layer-popover) min-w-56 rounded-md border border-line bg-surface p-1 shadow-overlay"
              >
                <DropdownMenu.Item className={menuItem} onSelect={() => setUploading(true)}>
                  <FileUp size={iconSize.sm} className="text-ink-muted" aria-hidden="true" />
                  {t("explorer.mine.uploadFile")}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => props.onDraw(true)}>
                  <PenLine size={iconSize.sm} className="text-ink-muted" aria-hidden="true" />
                  {t("explorer.mine.drawPolygon")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}

      <Dialog.Root open={uploading} onOpenChange={setUploading}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-line bg-surface p-5 text-ink shadow-overlay">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-display text-lg">{t("explorer.mine.uploadFile")}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-muted">
                  {t("explorer.regions.uploadHint")}
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft hover:text-ink"
                aria-label={t("explorer.zone.close")}
              >
                <X size={iconSize.sm} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <button
              type="button"
              onClick={() => file.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                upload(e.dataTransfer.files[0]);
              }}
              className={cn(
                "grid place-items-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm text-ink-muted hover:bg-action-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                dragging ? "border-action bg-action-soft" : "border-ink-subtle",
              )}
            >
              <FileUp size={iconSize.lg} aria-hidden="true" />
              <span className="font-medium text-ink">{t("explorer.mine.choose")}</span>
              <span>{t("explorer.mine.drop")}</span>
            </button>
            <input
              ref={file}
              type="file"
              accept={zoneFileTypes}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                upload(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
