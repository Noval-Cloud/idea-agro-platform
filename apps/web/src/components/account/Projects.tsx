import { useEffect, useState } from "react";
import type { ProjectSummary } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountTranslator } from "./i18n";

type Props = { t: AccountTranslator["t"]; projectPath: string; signInPath: string };

const card = "rounded-lg border border-line bg-surface p-6";

/** The account's projects: open one, or create a new one and go to it. */
export default function Projects({ t, projectPath, signInPath }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[] | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<"failed" | "full" | null>(null);
  const [creating, setCreating] = useState(false);

  const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listProjects(init)))
      .then((response) => setProjects(response.status === 200 ? response.data : null))
      .catch(() => setProjects(null));
  }, []);

  const create = async () => {
    setProblem(null);
    setCreating(true);
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.createProject({ name: name.trim() }, init));
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
    <section id="projects" aria-labelledby="projects-title" className={card}>
      <h2 id="projects-title" className="text-lg font-medium text-ink">
        {t("account.projects.title")}
      </h2>
      {projects === undefined ? (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {t("account.loading")}
        </p>
      ) : projects === null ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t("account.failed")}
        </p>
      ) : projects.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-ink-muted">{t("account.projects.empty")}</p>
      ) : (
        <ul className="mt-4 grid divide-y divide-line">
          {projects.map((project) => (
            <li key={project.id} className="py-3">
              <a
                href={`${projectPath}?id=${project.id}`}
                className="font-medium text-link underline-offset-(--ia-link-underline-offset) hover:underline"
              >
                {project.name}
              </a>
              <p className="text-xs text-ink-subtle">
                {[
                  t("account.projects.zoneCount", { count: project.zone_count }),
                  project.role !== "owner" && t("account.projects.sharedBy", { name: project.owner_name ?? "" }),
                  project.role !== "owner" && t(`account.projects.roles.${project.role}`),
                  project.description,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <Input
          value={name}
          maxLength={120}
          placeholder={t("account.projects.namePlaceholder")}
          aria-label={t("account.projects.nameLabel")}
          onChange={(event) => setName(event.currentTarget.value)}
          className="max-w-xs grow"
        />
        <Button type="submit" size="sm" disabled={creating || !name.trim()}>
          {t("account.projects.create")}
        </Button>
      </form>
      {problem && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t(`account.projects.${problem}`)}
        </p>
      )}
    </section>
  );
}
