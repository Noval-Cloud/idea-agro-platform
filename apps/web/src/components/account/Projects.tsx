import { useEffect, useMemo, useState } from "react";
import type { ProjectSummary } from "@idea-agro/api-client";
import { FolderOpen, FolderPlus, Map as MapIcon, MapPin, Plus, SearchX, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/lists/EmptyState";
import { ListCount, ListToolbar } from "@/components/lists/ListToolbar";
import { RowMenu, type RowAction } from "@/components/lists/RowMenu";
import { SearchField } from "@/components/lists/SearchField";
import { SortHeader, SortMenu, sortRows, type Sort } from "@/components/lists/Sorting";
import { ViewToggle, useListView } from "@/components/lists/ViewToggle";
import { matches } from "@/components/lists/filter";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import type { AccountTranslator } from "./i18n";

type Props = { translator: AccountTranslator; projectPath: string; mapPath: string; signInPath: string };

type Show = "all" | "mine" | "shared";
type Key = "changed" | "name" | "zones";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

const textarea =
  "min-h-20 w-full rounded-sm border border-input bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle hover:border-ink-subtle focus-visible:border-focus";

/** The account's projects, its own and those shared with it: found, sorted, opened, started and deleted. */
export default function Projects({ translator, projectPath, mapPath, signInPath }: Props) {
  const { t, collator } = translator;
  const [projects, setProjects] = useState<ProjectSummary[] | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [sort, setSort] = useState<Sort<Key>>({ key: "changed", descending: true });
  const [view, setView] = useListView("projects");

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listProjects(init)))
      .then((response) => setProjects(response.status === 200 ? response.data : null))
      .catch(() => setProjects(null));
  }, []);

  const remove = async (project: ProjectSummary) => {
    setFailed(false);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.deleteProject(project.id, init));
      // Already gone, as after a delete from another tab: the list just catches up.
      if (response.status === 204 || response.status === 404)
        setProjects((all) => all?.filter((p) => p.id !== project.id));
      else setFailed(true);
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut)
        return location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname)}`);
      setFailed(true);
    }
  };

  const shown = useMemo(() => {
    const found = (projects ?? []).filter(
      (p) =>
        (show === "all" || (show === "mine") === (p.role === "owner")) &&
        matches(query, p.name, p.description, p.owner_name),
    );
    return sortRows(
      found,
      sort,
      (p, key) => (key === "name" ? p.name : key === "zones" ? p.zone_count : p.updated_at),
      collator,
    );
  }, [projects, show, query, sort, collator]);
  const filtered = query !== "" || show !== "all";

  const href = (project: ProjectSummary) => `${projectPath}?id=${project.id}`;
  const actions = (project: ProjectSummary): RowAction[] => [
    { label: t("account.projects.open"), icon: <FolderOpen />, href: href(project) },
    { label: t("account.projects.onMap"), icon: <MapIcon />, href: `${mapPath}?reg=projects&proj=${project.id}` },
    ...(project.role === "owner"
      ? [{ label: t("account.projects.delete"), icon: <Trash2 />, onSelect: () => setDeleting(project), danger: true }]
      : []),
  ];

  const sortOptions: { key: Key; label: string; descending: boolean }[] = [
    { key: "changed", label: t("account.projects.sort.recent"), descending: true },
    { key: "name", label: t("account.projects.sort.name"), descending: false },
    { key: "zones", label: t("account.projects.sort.zones"), descending: true },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <ListToolbar
        end={
          <>
            <SortMenu t={t} sort={sort} options={sortOptions} onSort={setSort} />
            <ViewToggle t={t} view={view} onView={setView} />
            <NewProject translator={translator} projectPath={projectPath} signInPath={signInPath} />
          </>
        }
      >
        <SearchField
          t={t}
          value={query}
          label={t("account.projects.searchLabel")}
          placeholder={t("account.projects.searchPlaceholder")}
          onChange={setQuery}
        />
        <Segmented
          value={show}
          onValueChange={(value) => setShow(value as Show)}
          aria-label={t("account.projects.filter.label")}
        >
          {(["all", "mine", "shared"] as const).map((s) => (
            <SegmentedItem key={s} value={s}>
              {t(`account.projects.filter.${s}`)}
            </SegmentedItem>
          ))}
        </Segmented>
        {projects && projects.length > 0 && (
          <ListCount>
            {filtered
              ? t("lists.showing", { shown: shown.length, total: projects.length })
              : t("account.projects.count", { count: projects.length })}
          </ListCount>
        )}
      </ListToolbar>

      <div className="grid max-w-(--ia-layout-page) gap-6 pt-6">
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {t("account.projects.changeFailed")}
          </p>
        )}
        {projects === undefined ? (
          <p role="status" className="text-sm text-ink-muted">
            {t("account.loading")}
          </p>
        ) : projects === null ? (
          <p role="alert" className="text-sm text-danger">
            {t("account.projects.loadFailed")}
          </p>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FolderPlus />}
            title={t("account.projects.empty.title")}
            body={t("account.projects.empty.body")}
          >
            <NewProject translator={translator} projectPath={projectPath} signInPath={signInPath} align="center" />
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState icon={<SearchX />} title={t("lists.noResults.title")} body={t("lists.noResults.body")}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setQuery("");
                setShow("all");
              }}
            >
              {t("lists.clearFilters")}
            </Button>
          </EmptyState>
        ) : view === "table" ? (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-sunken text-left text-xs text-ink-subtle">
                <tr>
                  <SortHeader
                    label={t("account.projects.columns.name")}
                    column="name"
                    sort={sort}
                    natural={false}
                    onSort={setSort}
                    className="pl-4"
                  />
                  <SortHeader
                    label={t("account.projects.columns.zones")}
                    column="zones"
                    sort={sort}
                    natural
                    onSort={setSort}
                    className="hidden text-right sm:table-cell [&>button]:flex-row-reverse"
                  />
                  <th scope="col" className="hidden px-3 text-right font-medium md:table-cell">
                    {t("account.projects.columns.members")}
                  </th>
                  <th scope="col" className="hidden px-3 font-medium md:table-cell">
                    {t("account.projects.columns.role")}
                  </th>
                  <SortHeader
                    label={t("account.projects.columns.changed")}
                    column="changed"
                    sort={sort}
                    natural
                    onSort={setSort}
                    className="hidden lg:table-cell"
                  />
                  <th scope="col" className="w-12 pr-2">
                    <span className="sr-only">{t("lists.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((project) => (
                  <tr
                    key={project.id}
                    className="transition-colors duration-(--ia-motion-fast) hover:bg-surface-sunken"
                  >
                    <td className="max-w-0 py-2.5 pr-3 pl-4">
                      <a
                        href={href(project)}
                        className="block truncate font-medium text-ink underline-offset-(--ia-link-underline-offset) hover:underline"
                      >
                        {project.name}
                      </a>
                      <p className="truncate text-xs text-ink-subtle">
                        {project.description || t("account.projects.noDescription")}
                      </p>
                    </td>
                    <td className="hidden px-3 text-right text-ink-muted tabular-nums sm:table-cell">
                      {translator.number(project.zone_count)}
                    </td>
                    <td className="hidden px-3 text-right text-ink-muted tabular-nums md:table-cell">
                      {project.member_count
                        ? translator.number(project.member_count + 1)
                        : t("account.projects.onlyYou")}
                    </td>
                    <td className="hidden px-3 md:table-cell">
                      <Role translator={translator} project={project} />
                    </td>
                    <td className="hidden px-3 whitespace-nowrap text-ink-muted lg:table-cell">
                      <time dateTime={project.updated_at} title={translator.moment(project.updated_at)}>
                        {translator.ago(project.updated_at)}
                      </time>
                    </td>
                    <td className="pr-2 text-right">
                      <RowMenu label={t("lists.more", { name: project.name })} actions={actions(project)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4">
            {shown.map((project) => (
              <li key={project.id}>
                <article
                  className={cn(
                    "relative flex h-full flex-col rounded-lg border border-line bg-surface transition-[border-color,box-shadow] duration-(--ia-motion-fast) hover:border-line-strong hover:shadow-raised",
                    "has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-focus",
                  )}
                >
                  <div className="flex items-start gap-2 px-4 pt-4">
                    <div className="grid min-w-0 grow gap-1.5">
                      <Role translator={translator} project={project} />
                      <h3 className="truncate text-base font-medium text-ink">
                        <a href={href(project)} data-card-link className="outline-none after:absolute after:inset-0">
                          {project.name}
                        </a>
                      </h3>
                    </div>
                    <div className="relative -mt-1 -mr-2">
                      <RowMenu label={t("lists.more", { name: project.name })} actions={actions(project)} />
                    </div>
                  </div>
                  <p className="line-clamp-2 min-h-10 px-4 pt-1 text-sm text-ink-muted">
                    {project.description || t("account.projects.noDescription")}
                  </p>
                  <div className="mt-4 flex items-center gap-4 border-t border-line px-4 py-2.5 text-xs text-ink-subtle">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={iconSize.sm - 2} aria-hidden="true" />
                      {t("account.projects.zoneCount", { count: project.zone_count })}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={iconSize.sm - 2} aria-hidden="true" />
                      {project.member_count
                        ? t("account.projects.memberCount", { count: project.member_count + 1 })
                        : t("account.projects.onlyYou")}
                    </span>
                    <time
                      dateTime={project.updated_at}
                      title={translator.moment(project.updated_at)}
                      className="ml-auto"
                    >
                      {translator.ago(project.updated_at)}
                    </time>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={t("account.projects.confirmDelete.title", { name: deleting?.name ?? "" })}
        body={t("account.projects.confirmDelete.body")}
        confirm={t("account.projects.confirmDelete.action")}
        cancel={t("account.projects.cancel")}
        onConfirm={() => {
          if (deleting) void remove(deleting);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </TooltipProvider>
  );
}

/** The reader's role: owner, or the role given by whoever shared it. */
function Role({ translator: { t }, project }: { translator: AccountTranslator; project: ProjectSummary }) {
  const owner = project.role === "owner";
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        className={cn(
          "shrink-0 rounded-pill border px-2 py-0.5 font-medium",
          owner ? "border-line text-ink-muted" : "border-transparent bg-action-soft text-ink",
        )}
      >
        {t(`account.projects.roles.${project.role}`)}
      </span>
      {!owner && project.owner_name && (
        <span className="truncate text-ink-subtle">{t("account.projects.sharedBy", { name: project.owner_name })}</span>
      )}
    </span>
  );
}

/** Starts a project from its name and, if one likes, a description; it opens once created. */
function NewProject({
  translator: { t },
  projectPath,
  signInPath,
  align = "end",
}: {
  translator: AccountTranslator;
  projectPath: string;
  signInPath: string;
  align?: "end" | "center";
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [problem, setProblem] = useState<"failed" | "full" | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setProblem(null);
    setCreating(true);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) =>
        client.createProject({ name: name.trim(), description: description.trim() }, init),
      );
      if (response.status === 201) return location.assign(`${projectPath}?id=${response.data.id}`);
      setProblem(response.status === 409 ? "full" : "failed");
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut)
        return location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname)}`);
      setProblem("failed");
    }
    setCreating(false);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" aria-label={t("account.projects.create")}>
          <Plus aria-hidden="true" />
          <span className={align === "center" ? undefined : "hidden sm:inline"}>{t("account.projects.create")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void create();
          }}
        >
          <div className="grid gap-1">
            <h2 className="text-base font-medium text-ink">{t("account.projects.create")}</h2>
            <p className="text-sm text-ink-muted">{t("account.projects.createBody")}</p>
          </div>
          <label className="grid gap-1.5 text-sm text-ink-muted">
            {t("account.projects.nameLabel")}
            <Input
              value={name}
              name="name"
              maxLength={120}
              autoComplete="off"
              placeholder={t("account.projects.namePlaceholder")}
              onChange={(event) => setName(event.currentTarget.value)}
              className="h-10 text-sm"
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-sm text-ink-muted">
            {t("account.projects.descriptionLabel")}
            <textarea
              value={description}
              name="description"
              maxLength={2000}
              placeholder={t("account.projects.descriptionPlaceholder")}
              onChange={(event) => setDescription(event.currentTarget.value)}
              className={textarea}
            />
          </label>
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {t(`account.projects.${problem}`)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <PopoverClose asChild>
              <Button type="button" size="sm" variant="ghost">
                {t("account.projects.cancel")}
              </Button>
            </PopoverClose>
            <Button type="submit" size="sm" disabled={creating || !name.trim()}>
              {creating ? t("account.projects.creating") : t("account.projects.createAction")}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
