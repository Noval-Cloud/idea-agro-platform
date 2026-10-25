import { AlertDialog } from "radix-ui";
import { useI18n } from "./lib/i18n";

interface Props {
  /** The names of the zones just added to My zones, or null when nothing is asked. */
  zones: string[] | null;
  project: string;
  onAnswer: (add: boolean) => void;
}

/** With a project on the map, a zone just drawn or uploaded can go to the project too. */
export default function AddToProject({ zones, project, onAnswer }: Props) {
  const { t } = useI18n();
  return (
    <AlertDialog.Root open={zones !== null} onOpenChange={(open) => !open && onAnswer(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-line bg-surface p-5 text-ink shadow-overlay">
          <AlertDialog.Title className="font-display text-lg">
            {t("explorer.projects.addTitle", { project })}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-ink-muted">
            {t("explorer.projects.addText", { count: zones?.length ?? 0, name: zones?.[0] ?? "" })}
          </AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel className="inline-flex h-10 items-center rounded-sm border border-ink-subtle px-4 text-sm font-medium text-ink hover:bg-action-soft">
              {t("explorer.projects.addNo")}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={() => onAnswer(true)}
              className="inline-flex h-10 items-center rounded-sm bg-action px-4 text-sm font-medium text-action-ink hover:bg-action-hover"
            >
              {t("explorer.projects.addYes")}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
