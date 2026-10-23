import { useEffect, useState } from "react";
import type { Department, Division, ProjectOut, SavedZoneOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/i18n/core";
import { loadManifest, loadSearchIndex, type Manifest, type SearchEntry } from "@/components/explorer/lib/data";
import { preloadSearch, search, type SearchResult } from "@/components/explorer/lib/search";
import { createProjectTranslator, type ProjectCatalog, type ProjectTranslator } from "./i18n";

type Props = {
  locale: Locale;
  catalog: ProjectCatalog;
  signInPath: string;
  projectsPath: string;
  zonePath: string;
};

type Item = ProjectOut["items"][number];
type ItemIn =
  | { kind: "saved"; zone_id: string }
  | { kind: "division"; division: Division; zone_id: string }
  | { kind: "padron"; department: Department; padron: number };
type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "notFound" }
  | { kind: "failed" }
  | { kind: "ready"; project: ProjectOut };

const card = "rounded-lg border border-line bg-surface p-6";
const textarea =
  "min-h-24 w-full rounded-sm border border-input bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-subtle hover:border-ink-subtle focus-visible:border-focus";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Moves focus once React has drawn the change, as when the focused row goes away. */
const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus());

/** A key matching the API's item ids, to tell which zones the project already holds. */
const keyOf = (item: ItemIn) =>
  item.kind === "saved"
    ? `saved:${item.zone_id}`
    : item.kind === "division"
      ? `${item.division}:${item.zone_id}`
      : `padron:${item.department}:${item.padron}`;

/** A project: its zones, with links to their pages, and ways to add more. */
export default function ProjectApp({ locale, catalog, signInPath, projectsPath, zonePath }: Props) {
  const { t, number } = createProjectTranslator(locale, catalog);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [problem, setProblem] = useState<"changeFailed" | "full" | null>(null);
  // Read in the browser only: the page is also rendered ahead, where there is no address.
  const [id, setId] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(signInPath);

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
   * An ended session leads to sign-in.
   */
  const change = async (
    run: (
      modules: Awaited<ReturnType<typeof api>>,
    ) => Promise<{ status: number; apply?: (project: ProjectOut) => ProjectOut }>,
  ) => {
    setProblem(null);
    try {
      const { status, apply } = await run(await api());
      if (apply) setState((now) => (now.kind === "ready" ? { kind: "ready", project: apply(now.project) } : now));
      else if (status >= 400) setProblem(status === 409 ? "full" : "changeFailed");
      return status;
    } catch (error) {
      const { SignedOut } = await import("@/lib/account");
      if (error instanceof SignedOut) location.assign(signIn);
      else setProblem("changeFailed");
      return 0;
    }
  };

  const add = (item: ItemIn) =>
    change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.addProjectItem(id ?? "", item, init));
      return response.status === 200 ? { status: 200, apply: () => response.data } : { status: response.status };
    });

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
      return { status: response.status === 204 ? 204 : response.status };
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
  const held = new Set(project.items.map((i) => i.id));
  return (
    <div className="grid gap-6">
      <a href={projectsPath} className="text-sm text-link underline underline-offset-(--ia-link-underline-offset)">
        {t("project.back")}
      </a>
      <Header t={t} project={project} onEdit={edit} onDelete={() => void destroy(project)} />
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {t(`project.${problem === "full" ? "add.full" : problem}`)}
        </p>
      )}
      <Zones t={t} number={number} project={project} zonePath={zonePath} onRemove={(item) => void remove(item)} />
      <AddZones t={t} number={number} held={held} onAdd={add} />
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
  onEdit: (name: string, description: string) => Promise<number>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState<{ name: string; description: string } | null>(null);

  if (editing)
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
      <p className="max-w-prose whitespace-pre-line text-ink-muted">
        {project.description || t("project.noDescription")}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing({ name: project.name, description: project.description })}
        >
          {t("project.edit")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          {t("project.delete")}
        </Button>
      </div>
    </header>
  );
}

type Described = { kind: string; title: string; detail?: string; href?: string };

function useNames() {
  const [names, setNames] = useState<{ entries: Map<string, SearchEntry>; manifest: Manifest } | null>(null);
  useEffect(() => {
    void Promise.all([loadSearchIndex(), loadManifest()])
      .then(([entries, manifest]) =>
        setNames({ entries: new Map(entries.map((e) => [`${e.d}:${e.id}`, e])), manifest }),
      )
      .catch(() => undefined);
  }, []);
  return names;
}

function Zones({
  t,
  number,
  project,
  zonePath,
  onRemove,
}: {
  t: ProjectTranslator["t"];
  number: ProjectTranslator["number"];
  project: ProjectOut;
  zonePath: string;
  onRemove: (item: Item) => void;
}) {
  const names = useNames();
  const describe = (item: Item): Described => {
    if (item.kind === "saved")
      return item.zone
        ? {
            kind: t("project.kinds.saved"),
            title: item.zone.name,
            detail: [t("project.area", { value: number(item.zone.area_ha) }), item.zone.department]
              .filter(Boolean)
              .join(" · "),
            href: `${zonePath}?saved=${item.zone_id}`,
          }
        : { kind: t("project.kinds.saved"), title: t("project.zones.deleted") };
    if (item.kind === "padron")
      return {
        kind: t("project.kinds.padrones"),
        title: t("project.padron", { number: item.padron }),
        detail: names?.manifest.padrones[item.department]?.name,
        href: `${zonePath}?padron=${item.department}:${item.padron}`,
      };
    const entry = names?.entries.get(item.id);
    return {
      kind: kindOf(t, item.division),
      title: entry?.label ?? item.zone_id,
      detail: item.division.startsWith("cuencas-") ? undefined : entry?.detail,
      href: `${zonePath}?d=${item.division}&id=${item.zone_id}`,
    };
  };

  return (
    <section aria-labelledby="zones-title" className={card}>
      <h2 id="zones-title" tabIndex={-1} className="text-lg font-medium text-ink">
        {t("project.zones.title")}{" "}
        <span className="text-sm font-normal text-ink-subtle">
          {t("project.zones.count", { count: project.items.length })}
        </span>
      </h2>
      {project.items.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-ink-muted">{t("project.zones.empty")}</p>
      ) : (
        <ul className="mt-4 grid divide-y divide-line">
          {project.items.map((item) => {
            const zone = describe(item);
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 grow">
                  <p className="text-xs text-ink-subtle">{zone.kind}</p>
                  {zone.href ? (
                    <a
                      href={zone.href}
                      className="font-medium text-link underline-offset-(--ia-link-underline-offset) hover:underline"
                    >
                      {zone.title}
                    </a>
                  ) : (
                    <p className="font-medium text-ink-muted">{zone.title}</p>
                  )}
                  {zone.detail && <p className="text-xs text-ink-subtle">{zone.detail}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t("project.zones.removeLabel", { name: zone.title })}
                  onClick={() => onRemove(item)}
                >
                  {t("project.zones.remove")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const kindOf = (t: ProjectTranslator["t"], division: string) =>
  division.startsWith("cuencas-")
    ? t("project.kinds.cuencas", { grade: division.slice(-1) })
    : t("project.kinds.seccionales");

function AddZones({
  t,
  number,
  held,
  onAdd,
}: {
  t: ProjectTranslator["t"];
  number: ProjectTranslator["number"];
  held: Set<string>;
  onAdd: (item: ItemIn) => Promise<number>;
}) {
  const [library, setLibrary] = useState<SavedZoneOut[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSavedZones(init)))
      .then((response) => setLibrary(response.status === 200 ? response.data : []))
      .catch(() => setLibrary([]));
  }, []);

  useEffect(() => {
    if (!query.trim()) return setResults(null);
    let live = true;
    void loadManifest()
      .then((manifest) => search(query, manifest))
      .then((found) => {
        if (live) setResults(found.filter((r) => r.type === "padron" || r.entry.d !== "department"));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [query]);

  const available = library?.filter((zone) => !held.has(`saved:${zone.id}`)) ?? [];
  const toItem = (result: SearchResult): ItemIn =>
    result.type === "padron"
      ? { kind: "padron", department: result.department as Department, padron: result.padron }
      : { kind: "division", division: result.entry.d as Division, zone_id: result.entry.id };

  return (
    <section aria-labelledby="add-title" className={`${card} grid gap-6`}>
      <h2 id="add-title" className="text-lg font-medium text-ink">
        {t("project.add.title")}
      </h2>

      <div>
        <h3 id="library-title" tabIndex={-1} className="text-sm font-medium text-ink">
          {t("project.add.library")}
        </h3>
        {library !== null && available.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{t("project.add.libraryEmpty")}</p>
        ) : (
          <ul className="mt-2 grid divide-y divide-line">
            {available.map((zone) => (
              <Candidate
                key={zone.id}
                title={zone.name}
                detail={[t("project.area", { value: number(zone.area_ha) }), zone.department]
                  .filter(Boolean)
                  .join(" · ")}
                action={t("project.add.action")}
                label={t("project.add.actionLabel", { name: zone.name })}
                onAdd={() => void onAdd({ kind: "saved", zone_id: zone.id }).then(() => focusSoon("library-title"))}
              />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">{t("project.add.predefined")}</h3>
        <Input
          id="zone-search"
          type="search"
          className="mt-2"
          value={query}
          aria-label={t("project.add.searchLabel")}
          placeholder={t("project.add.searchPlaceholder")}
          onFocus={preloadSearch}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {results?.length === 0 && <p className="mt-2 text-sm text-ink-muted">{t("project.add.noResults")}</p>}
        {results && results.length > 0 && (
          <ul className="mt-2 grid divide-y divide-line">
            {results.map((result) => {
              const item = toItem(result);
              const inProject = held.has(keyOf(item));
              const title =
                result.type === "padron" ? t("project.padron", { number: result.padron }) : result.entry.label;
              return (
                <Candidate
                  key={keyOf(item)}
                  title={title}
                  detail={
                    result.type === "padron"
                      ? `${t("project.kinds.padrones")} · ${result.departmentName}`
                      : [kindOf(t, result.entry.d), result.entry.d.startsWith("cuencas-") ? null : result.entry.detail]
                          .filter(Boolean)
                          .join(" · ")
                  }
                  action={inProject ? t("project.add.added") : t("project.add.action")}
                  label={inProject ? undefined : t("project.add.actionLabel", { name: title })}
                  disabled={inProject}
                  onAdd={() => void onAdd(item).then(() => focusSoon("zone-search"))}
                />
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Candidate({
  title,
  detail,
  action,
  label,
  disabled,
  onAdd,
}: {
  title: string;
  detail?: string;
  action: string;
  label?: string;
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-4 py-2">
      <div className="min-w-0 grow">
        <p className="truncate text-sm text-ink">{title}</p>
        {detail && <p className="truncate text-xs text-ink-subtle">{detail}</p>}
      </div>
      <Button size="sm" variant="outline" disabled={disabled} aria-label={label} onClick={onAdd}>
        {action}
      </Button>
    </li>
  );
}
