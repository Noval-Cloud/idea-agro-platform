import { useEffect, useState } from "react";
import type { ProjectOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/core";
import { createProjectTranslator, type ProjectCatalog, type ProjectKey, type ProjectTranslator } from "./i18n";
import { Activity } from "./ProjectActivity";
import { People } from "./ProjectPeople";
import { AddZones, Zones } from "./ProjectZones";
import { api, card, focusSoon, useZoneNames, type Change, type Item, type ItemIn } from "./shared";

type Props = {
  locale: Locale;
  catalog: ProjectCatalog;
  signInPath: string;
  projectsPath: string;
  zonePath: string;
};

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "notFound" }
  | { kind: "failed" }
  | { kind: "ready"; project: ProjectOut };

const textarea =
  "min-h-24 w-full rounded-sm border border-input bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle hover:border-ink-subtle focus-visible:border-focus";

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** A project: its zones with links to their pages, the people it is shared with, and what they changed. */
export default function ProjectApp({ locale, catalog, signInPath, projectsPath, zonePath }: Props) {
  const { t, number, moment } = createProjectTranslator(locale, catalog);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [problem, setProblem] = useState<ProjectKey | null>(null);
  // Read in the browser only: the page is also rendered ahead, where there is no address.
  const [id, setId] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(signInPath);
  const names = useZoneNames();

  useEffect(() => {
    const found = new URLSearchParams(location.search).get("id") ?? "";
    // Project ids are UUIDs; anything else would end up in an API path.
    setId(UUID.test(found) ? found : "");
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

  /**
   * Runs a change and applies its result to the latest project, so changes in flight do not undo each other.
   * Refusals show the message given for their status; an ended session leads to sign-in.
   */
  const change: Change = async (run, messages = {}) => {
    setProblem(null);
    try {
      const { status, apply } = await run(await api());
      if (apply) setState((now) => (now.kind === "ready" ? { kind: "ready", project: apply(now.project) } : now));
      else if (status >= 400) setProblem(messages[status] ?? "project.changeFailed");
      return status;
    } catch (error) {
      const { SignedOut } = await import("@/lib/account");
      if (error instanceof SignedOut) location.assign(signIn);
      else setProblem("project.changeFailed");
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
      focusSoon("zones-title");
      return {
        status: 204,
        apply: (project: ProjectOut) => ({ ...project, items: project.items.filter((i) => i.id !== item.id) }),
      };
    });

  const edit = (name: string, description: string) =>
    change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.changeProject(id ?? "", { name, description }, init));
      return response.status === 200 ? { status: 200, apply: () => response.data } : { status: response.status };
    });

  const destroy = async (project: ProjectOut) => {
    if (!window.confirm(t("project.confirmDelete", { name: project.name }))) return;
    const status = await change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.deleteProject(id ?? "", init));
      return { status: response.status };
    });
    if (status === 204) location.assign(projectsPath);
  };

  if (state.kind !== "ready") {
    return (
      <div className="grid gap-4">
        <a href={projectsPath} className="text-sm text-link underline underline-offset-(--ia-link-underline-offset)">
          {t("project.back")}
        </a>
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
    <div className="grid gap-6">
      <a href={projectsPath} className="text-sm text-link underline underline-offset-(--ia-link-underline-offset)">
        {t("project.back")}
      </a>
      <Header t={t} project={project} onEdit={canEdit ? edit : null} onDelete={() => void destroy(project)} />
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {t(problem)}
        </p>
      )}
      <Zones
        t={t}
        number={number}
        project={project}
        names={names}
        zonePath={zonePath}
        onRemove={canEdit ? (item) => void remove(item) : null}
      />
      {canEdit && (
        <AddZones
          t={t}
          number={number}
          held={new Set(project.items.map((i) => i.id))}
          othersCanEdit={project.others_can_edit}
          onAdd={add}
        />
      )}
      <People t={t} project={project} change={change} onLeft={() => location.assign(projectsPath)} />
      <Activity t={t} moment={moment} projectId={project.id} changedAt={project.updated_at} names={names} />
    </div>
  );
}

function Header({
  t,
  project,
  onEdit,
  onDelete,
}: {
  t: ProjectTranslator["t"];
  project: ProjectOut;
  onEdit: ((name: string, description: string) => Promise<number>) | null;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState<{ name: string; description: string } | null>(null);

  if (editing && onEdit)
    return (
      <form
        className={`${card} grid gap-3`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!editing.name.trim()) return;
          void onEdit(editing.name.trim(), editing.description.trim()).then((status) => {
            if (status === 200) setEditing(null);
          });
        }}
      >
        <label className="grid gap-1 text-sm text-ink-muted">
          {t("project.name")}
          <Input
            value={editing.name}
            maxLength={120}
            onChange={(event) => setEditing({ ...editing, name: event.currentTarget.value })}
            autoFocus
          />
        </label>
        <label className="grid gap-1 text-sm text-ink-muted">
          {t("project.description")}
          <textarea
            className={textarea}
            value={editing.description}
            maxLength={2000}
            placeholder={t("project.descriptionPlaceholder")}
            onChange={(event) => setEditing({ ...editing, description: event.currentTarget.value })}
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!editing.name.trim()}>
            {t("project.save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
            {t("project.cancel")}
          </Button>
        </div>
      </form>
    );

  return (
    <header className="grid gap-3">
      <h1 className="font-display text-3xl font-medium tracking-tight text-ink">{project.name}</h1>
      {project.role !== "owner" && (
        <p className="text-sm text-ink-subtle">
          {[t("project.sharedBy", { name: project.owner_name ?? "" }), t(`project.roles.${project.role}`)].join(" · ")}
        </p>
      )}
      <p className="max-w-prose whitespace-pre-line text-ink-muted">
        {project.description || t("project.noDescription")}
      </p>
      {(onEdit || project.role === "owner") && (
        <div className="flex gap-2">
          {onEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing({ name: project.name, description: project.description })}
            >
              {t("project.edit")}
            </Button>
          )}
          {project.role === "owner" && (
            <Button size="sm" variant="ghost" onClick={onDelete}>
              {t("project.delete")}
            </Button>
          )}
        </div>
      )}
    </header>
  );
}
