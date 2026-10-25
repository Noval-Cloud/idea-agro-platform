import type { ProjectSummary } from "@idea-agro/api-client";
import { Select } from "radix-ui";
import { Check, ChevronDown, FolderPlus } from "lucide-react";
import { iconSize } from "@/design/tokens";
import AddZone from "./AddZone";
import { useI18n } from "./lib/i18n";

interface Props {
  /** The reader's projects, or null while they load. */
  projects: ProjectSummary[] | null;
  project: string | null;
  signedIn: boolean;
  signInHref: string;
  drawing: boolean;
  onProject: (id: string) => void;
  onUpload: (file: File) => void;
  onDraw: (drawing: boolean) => void;
  onCreate: () => void;
}

/** One of the reader's projects on the map: chosen here, added to, or a new one started. */
export default function ProjectsBar(props: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  if (!props.signedIn)
    return (
      <p className="min-w-0 truncate text-sm text-ink-muted">
        {t("explorer.projects.signIn")}{" "}
        <a href={props.signInHref} className="text-link underline underline-offset-(--ia-link-underline-offset)">
          {t("explorer.regions.mineSignInLink")}
        </a>
      </p>
    );
  const chosen = props.projects?.find((p) => p.id === props.project) ?? null;

  return (
    <>
      <Select.Root value={props.project ?? ""} onValueChange={props.onProject} disabled={!props.projects?.length}>
        <Select.Trigger
          className="inline-flex h-10 min-w-0 grow items-center justify-between gap-3 rounded-sm border border-ink-subtle bg-surface px-3 text-left text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-ink-subtle sm:max-w-sm"
          aria-label={t("explorer.projects.label")}
        >
          <span className="truncate">
            <Select.Value
              placeholder={
                props.projects === null
                  ? t("explorer.projects.loadingList")
                  : props.projects.length
                    ? t("explorer.projects.choose")
                    : t("explorer.projects.none")
              }
            />
          </span>
          <Select.Icon>
            <ChevronDown size={iconSize.sm} className="text-ink-subtle" aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            sideOffset={4}
            className="z-(--ia-layer-popover) max-h-96 w-(--radix-select-trigger-width) min-w-64 overflow-hidden rounded-md border border-line bg-surface p-1 text-ink shadow-overlay"
          >
            <Select.Viewport>
              {props.projects?.map((p) => (
                <Select.Item
                  key={p.id}
                  value={p.id}
                  className="relative flex cursor-pointer items-center justify-between gap-3 rounded-sm py-2 pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-action-soft"
                >
                  <Select.ItemIndicator className="absolute left-2 inline-flex">
                    <Check size={iconSize.sm} aria-hidden="true" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{p.name}</Select.ItemText>
                  <span className="text-2xs text-ink-subtle">
                    {t("explorer.regions.count", { count: p.zone_count, value: i18n.number(p.zone_count) })}
                  </span>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {chosen && chosen.role !== "viewer" && (
        <AddZone drawing={props.drawing} onUpload={props.onUpload} onDraw={props.onDraw} />
      )}
      <button
        type="button"
        onClick={props.onCreate}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border border-ink-subtle bg-surface px-3 text-xs font-medium whitespace-nowrap text-ink hover:bg-action-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <FolderPlus size={iconSize.sm} aria-hidden="true" />
        <span className="hidden sm:inline">{t("explorer.projects.create")}</span>
        <span className="sr-only sm:hidden">{t("explorer.projects.create")}</span>
      </button>
    </>
  );
}
