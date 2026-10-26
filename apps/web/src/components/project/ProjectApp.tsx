import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProjectOut } from "@idea-agro/api-client";
import { ArrowLeft, LogOut, Map as MapIcon, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { iconSize } from "@/design/tokens";
import type { Locale } from "@/i18n/core";
import { cn } from "@/lib/utils";
import { createProjectTranslator, type ProjectCatalog, type ProjectKey, type ProjectTranslator } from "./i18n";
import { ActivityTab } from "./ProjectActivity";
import { PeopleTab } from "./ProjectPeople";
import { ZonesTab } from "./ProjectZones";
import { api, useZoneNames, type Change, type Item, type ItemIn } from "./shared";

type Props = {
  locale: Locale;
  catalog: ProjectCatalog;
  signInPath: string;
  projectsPath: string;
  zonePath: string;
  outlinePath: string;
  mapPath: string;
};

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "notFound" }
  | { kind: "failed" }
  | { kind: "ready"; project: ProjectOut };

const tabs = ["zones", "people", "activity"] as const;
type Tab = (typeof tabs)[number];

const textarea =
  "min-h-20 w-full rounded-sm border border-input bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle hover:border-ink-subtle focus-visible:border-focus";

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A project: its zones, the people it is shared with and what they changed, each in a tab. */
export default function ProjectApp({
  locale,
  catalog,
  signInPath,
  projectsPath,
  zonePath,
  outlinePath,
  mapPath,
}: Props) {
  const translator = useMemo(() => createProjectTranslator(locale, catalog), [locale, catalog]);
  const { t, number } = translator;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [problem, setProblem] = useState<ProjectKey | null>(null);
  // Read in the browser only: the page is also rendered ahead, where there is no address.
  const [id, setId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("zones");
  const [signIn, setSignIn] = useState(signInPath);
  const names = useZoneNames();
  const { ask, dialog } = useConfirm(t("project.cancel"));

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const found = params.get("id") ?? "";
    // Project ids are UUIDs; anything else would end up in an API path.
    setId(UUID.test(found) ? found : "");
    const opened = params.get("tab");
    if (tabs.includes(opened as Tab)) setTab(opened as Tab);
    setSignIn(`${signInPath}?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [signInPath]);

  useEffect(() => {
    if (id === null) return;
    if (!id) return setState({ kind: "notFound" });
    void (async () => {
      try {
        const [{ privately }, client] = await api();
        const response = await privately((init) => client.getProject(id, init));
        if (response.status === 200) setState({ kind: "ready", project: response.data });
        else setState({ kind: response.status === 404 ? "notFound" : "failed" });
      } catch (error) {
        const { SignedOut } = await import("@/lib/account");
        setState({ kind: error instanceof SignedOut ? "signedOut" : "failed" });
      }
    })();
  }, [id]);

  useEffect(() => {
    if (state.kind === "ready") document.title = `${state.project.name} · IDEA-Agro`;
  }, [state]);

  /** The open tab goes in the address, so a reload or a shared link opens it again. */
  const openTab = (next: string) => {
    setTab(next as Tab);
    const url = new URL(location.href);
    if (next === "zones") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    history.replaceState(history.state, "", url);
  };

  /**
   * Runs a change and applies its result to the latest project, so changes in flight do not undo each other.
   * Refusals show the message given for their status; an ended session leads to sign-in.
   */
  const change: Change = async (run, messages = {}, quiet = false) => {
    setProblem(null);
    try {
      const { status, apply } = await run(await api());
      if (apply) setState((now) => (now.kind === "ready" ? { kind: "ready", project: apply(now.project) } : now));
      else if (status >= 400 && !quiet) setProblem(messages[status] ?? "project.changeFailed");
      return status;
    } catch (error) {
      const { SignedOut } = await import("@/lib/account");
      if (error instanceof SignedOut) location.assign(signIn);
      else if (!quiet) setProblem("project.changeFailed");
      return 0;
    }
  };

  const add = (item: ItemIn) =>
    change(
      async ([{ privately }, client]) => {
        const response = await privately((init) => client.addProjectItem(id ?? "", item, init));
        return response.status === 200 ? { status: 200, apply: () => response.data } : { status: response.status };
      },
      { 409: "project.add.full" },
    );

  const remove = (item: Item) =>
    change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.removeProjectItem(id ?? "", item.id, init));
      // Gone already, as after a removal in another tab: the list just catches up.
      if (response.status !== 204 && response.status !== 404) return { status: response.status };
      return {
        status: 204,
        // A new time, so the activity reloads.
        apply: (project: ProjectOut) => ({
          ...project,
          items: project.items.filter((i) => i.id !== item.id),
          updated_at: new Date().toISOString(),
        }),
      };
    });

  const edit = (name: string, description: string) =>
    change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.changeProject(id ?? "", { name, description }, init));
      return response.status === 200 ? { status: 200, apply: () => response.data } : { status: response.status };
    });

  const destroy = async (project: ProjectOut) => {
    const sure = await ask({
      title: t("project.confirmDelete.title", { name: project.name }),
      body: t("project.confirmDelete.body"),
      confirm: t("project.confirmDelete.action"),
    });
    if (!sure) return;
    const status = await change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.deleteProject(project.id, init));
      return { status: response.status };
    });
    if (status === 204) location.assign(projectsPath);
  };

  const leave = async (project: ProjectOut) => {
    const me = project.members.find((m) => m.you);
    if (!me) return;
    const sure = await ask({
      title: t("project.confirmLeave.title", { name: project.name }),
      body: t("project.confirmLeave.body"),
      confirm: t("project.confirmLeave.action"),
    });
    if (!sure) return;
    const status = await change(async ([{ privately }, client]) => {
      // Emails go into the path: encoded, so none can reach another route.
      const response = await privately((init) =>
        client.removeProjectMember(project.id, encodeURIComponent(me.email), init),
      );
      return { status: response.status };
    });
    if (status === 204) location.assign(projectsPath);
  };

  if (state.kind !== "ready") {
    return (
      <div className="grid gap-4 pt-8">
        <p role={state.kind === "loading" ? "status" : "alert"} className="text-ink-muted">
          {t(`project.${state.kind === "signedOut" ? "signInToSee" : state.kind}`)}
        </p>
        {state.kind === "signedOut" && (
          <a href={signIn} className="text-link underline underline-offset-(--ia-link-underline-offset)">
            {t("project.signIn")}
          </a>
        )}
      </div>
    );
  }

  const { project } = state;
  const canEdit = project.role !== "viewer";
  return (
    <TooltipProvider delayDuration={300}>
      <Header
        translator={translator}
        project={project}
        projectsPath={projectsPath}
        mapHref={`${mapPath}?reg=projects&proj=${project.id}`}
        onEdit={canEdit ? edit : null}
        onDelete={() => void destroy(project)}
        onLeave={() => void leave(project)}
      />
      {problem && (
        <p role="alert" className="pb-4 text-sm text-danger">
          {t(problem)}
        </p>
      )}
      <Tabs value={tab} onValueChange={openTab}>
        <div className="border-b border-line">
          <TabsList aria-label={t("project.tabs.label")}>
            <TabsTrigger value="zones" count={number(project.items.length)}>
              {t("project.tabs.zones")}
            </TabsTrigger>
            <TabsTrigger value="people" count={number(project.members.length + 1)}>
              {t("project.tabs.people")}
            </TabsTrigger>
            <TabsTrigger value="activity">{t("project.tabs.activity")}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="zones">
          <ZonesTab
            translator={translator}
            project={project}
            names={names}
            zonePath={zonePath}
            outlinePath={outlinePath}
            ask={ask}
            onAdd={canEdit ? add : null}
            onRemove={canEdit ? (item) => void remove(item) : null}
          />
        </TabsContent>
        <TabsContent value="people">
          <PeopleTab translator={translator} project={project} change={change} ask={ask} />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab translator={translator} projectId={project.id} changedAt={project.updated_at} names={names} />
        </TabsContent>
      </Tabs>
      {dialog}
    </TooltipProvider>
  );
}

/** An action as an icon with its name in a tooltip: a link when it goes somewhere, a button otherwise. */
function IconAction({
  id,
  label,
  icon,
  href,
  danger,
  onClick,
}: {
  id?: string;
  label: string;
  icon: ReactNode;
  href?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors duration-(--ia-motion-fast) hover:bg-action-soft hover:text-ink",
    danger && "hover:text-danger",
  );
  return (
    <Tooltip label={label}>
      {href ? (
        <a href={href} aria-label={label} className={className}>
          {icon}
        </a>
      ) : (
        <button id={id} type="button" aria-label={label} onClick={onClick} className={className}>
          {icon}
        </button>
      )}
    </Tooltip>
  );
}

function Header({
  translator: { t, ago, moment },
  project,
  projectsPath,
  mapHref,
  onEdit,
  onDelete,
  onLeave,
}: {
  translator: ProjectTranslator;
  project: ProjectOut;
  projectsPath: string;
  mapHref: string;
  onEdit: ((name: string, description: string) => Promise<number>) | null;
  onDelete: () => void;
  onLeave: () => void;
}) {
  const [editing, setEditingState] = useState<{ name: string; description: string } | null>(null);
  const owner = project.role === "owner";
  // Closing the form gives focus back to the button that opened it.
  const setEditing = (next: { name: string; description: string } | null) => {
    setEditingState(next);
    if (!next) requestAnimationFrame(() => document.getElementById("project-edit")?.focus());
  };
  const icon = { size: iconSize.md, "aria-hidden": true } as const;

  const back = (
    <IconAction label={t("project.back")} href={projectsPath} icon={<ArrowLeft size={iconSize.lg} aria-hidden />} />
  );

  if (editing && onEdit)
    return (
      <header className="flex items-start gap-2 pt-6 pb-5 sm:gap-3">
        {back}
        <form
          className="grid min-w-0 grow gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!editing.name.trim()) return;
            void onEdit(editing.name.trim(), editing.description.trim()).then((status) => {
              if (status === 200) setEditing(null);
            });
          }}
        >
          <Input
            value={editing.name}
            maxLength={120}
            aria-label={t("project.name")}
            onChange={(event) => setEditing({ ...editing, name: event.currentTarget.value })}
            onKeyDown={(event) => event.key === "Escape" && setEditing(null)}
            className="h-11 font-display text-2xl"
            autoFocus
          />
          <textarea
            className={textarea}
            value={editing.description}
            maxLength={2000}
            aria-label={t("project.description")}
            placeholder={t("project.descriptionPlaceholder")}
            onChange={(event) => setEditing({ ...editing, description: event.currentTarget.value })}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!editing.name.trim()}>
              {t("project.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              {t("project.cancel")}
            </Button>
          </div>
        </form>
      </header>
    );

  return (
    // Arrow, title and actions share the title's first line; on phones the actions go under the text.
    <header className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1.5 pt-6 pb-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-3">
      <div className="flex h-lh items-center font-display text-3xl">{back}</div>
      <h1 className="font-display text-3xl font-medium tracking-tight hyphens-auto text-ink">{project.name}</h1>
      <div className="col-start-2 row-start-4 flex items-center gap-0.5 sm:col-start-3 sm:row-start-1 sm:h-lh sm:font-display sm:text-3xl">
        <IconAction label={t("project.onMap")} href={mapHref} icon={<MapIcon {...icon} />} />
        {onEdit && (
          <IconAction
            id="project-edit"
            label={t("project.edit")}
            icon={<Pencil {...icon} />}
            onClick={() => setEditing({ name: project.name, description: project.description })}
          />
        )}
        {owner ? (
          <IconAction label={t("project.delete")} icon={<Trash2 {...icon} />} danger onClick={onDelete} />
        ) : (
          <IconAction label={t("project.leave")} icon={<LogOut {...icon} />} danger onClick={onLeave} />
        )}
      </div>
      <p className="col-start-2 max-w-prose text-sm whitespace-pre-line text-ink-muted">
        {project.description || t("project.noDescription")}
      </p>
      <p className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
        <span
          className={cn(
            "rounded-pill border px-2 py-0.5 font-medium",
            owner ? "border-line text-ink-muted" : "border-transparent bg-action-soft text-ink",
          )}
        >
          {t(`project.roles.${project.role}`)}
        </span>
        {!owner && project.owner_name && <span>{t("project.sharedBy", { name: project.owner_name })}</span>}
        <time dateTime={project.updated_at} title={moment(project.updated_at)}>
          {t("project.changed", { when: ago(project.updated_at) })}
        </time>
      </p>
    </header>
  );
}
