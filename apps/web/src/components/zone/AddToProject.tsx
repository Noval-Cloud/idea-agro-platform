import { useEffect, useState } from "react";
import type { DivisionItemIn, PadronItemIn, ProjectSummary, SavedItemIn } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { readHint } from "@/lib/account-hint";
import type { createAppTranslator } from "@/components/explorer/lib/i18n";

type Props = {
  t: ReturnType<typeof createAppTranslator>["t"];
  item: SavedItemIn | DivisionItemIn | PadronItemIn;
  projectsPath: string;
  signInPath: string;
};

const select =
  "h-9 min-w-0 rounded-sm border border-input bg-surface px-2 text-sm text-ink hover:border-ink-subtle focus-visible:border-focus";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** For a signed-in person: puts the zone in one of their projects. */
export default function AddToProject({ t, item, projectsPath, signInPath }: Props) {
  const [signedIn, setSignedIn] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[] | null | undefined>(undefined);
  const [chosen, setChosen] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => setSignedIn(readHint() !== null), []);
  if (!signedIn) return null;

  const signIn = () => location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname + location.search)}`);

  const failed = () => setMessage({ text: t("zone.projects.failed"), ok: false });

  const open = async () => {
    setMessage(null);
    setProjects(null);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.listProjects(init));
      if (response.status !== 200) {
        setProjects(undefined);
        return failed();
      }
      const editable = response.data.filter((p) => p.role !== "viewer");
      setProjects(editable);
      setChosen(editable[0]?.id ?? "");
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut) return signIn();
      setProjects(undefined);
      failed();
    }
  };

  const add = async () => {
    const project = projects?.find((p) => p.id === chosen);
    if (!project) return;
    // Others could reshape the person's own land: they confirm it first.
    if (item.kind === "saved" && project.others_can_edit && !window.confirm(t("zone.projects.warnShared"))) return;
    setMessage(null);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.addProjectItem(project.id, item, init));
      if (response.status === 200) setMessage({ text: t("zone.projects.added", { name: project.name }), ok: true });
      else setMessage({ text: t(response.status === 409 ? "zone.projects.full" : "zone.projects.failed"), ok: false });
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut) return signIn();
      failed();
    }
  };

  return (
    <div className="mt-6 grid gap-2 text-sm">
      {projects === undefined ? (
        <div>
          <Button size="sm" variant="outline" onClick={() => void open()}>
            {t("zone.projects.label")}
          </Button>
        </div>
      ) : projects === null ? (
        <p role="status" className="text-ink-muted">
          {t("zone.projects.loading")}
        </p>
      ) : projects.length === 0 ? (
        <p className="text-ink-muted">
          {t("zone.projects.none")}{" "}
          <a href={projectsPath} className="text-link underline underline-offset-(--ia-link-underline-offset)">
            {t("zone.projects.create")}
          </a>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={select}
            value={chosen}
            aria-label={t("zone.projects.choose")}
            onChange={(event) => setChosen(event.currentTarget.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => void add()}>
            {t("zone.projects.add")}
          </Button>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-ink-muted" : "text-danger"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
