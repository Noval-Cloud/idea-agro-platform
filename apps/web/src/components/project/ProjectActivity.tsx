import { useEffect, useState } from "react";
import type { ActivityOut } from "@idea-agro/api-client";
import type { ProjectTranslator } from "./i18n";
import { api, card, zoneName, type ZoneNames } from "./shared";

/** Who changed what and when, newest first; reloaded whenever the project changes. */
export function Activity({
  t,
  moment,
  projectId,
  changedAt,
  names,
}: {
  t: ProjectTranslator["t"];
  moment: ProjectTranslator["moment"];
  projectId: string;
  changedAt: string;
  names: ZoneNames | null;
}) {
  const [entries, setEntries] = useState<ActivityOut[] | null>(null);

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.getProjectActivity(projectId, init)))
      .then((response) => setEntries(response.status === 200 ? response.data : []))
      .catch(() => setEntries([]));
  }, [projectId, changedAt]);

  const role = (value: string) =>
    value === "collaborator" || value === "viewer" ? t(`project.roles.${value}`).toLocaleLowerCase() : value;

  return (
    <section aria-labelledby="activity-title" className={card}>
      <h2 id="activity-title" className="text-lg font-medium text-ink">
        {t("project.activity.title")}
      </h2>
      {entries?.length === 0 && <p className="mt-3 text-sm text-ink-muted">{t("project.activity.empty")}</p>}
      {entries && entries.length > 0 && (
        <ol className="mt-4 grid gap-3">
          {entries.map((entry, index) => (
            <li key={index} className="grid gap-0.5 text-sm">
              <p className="text-ink">
                {t(`project.activity.actions.${entry.action}`, {
                  actor: entry.actor_name || t("project.activity.someone"),
                  zone: zoneName(t, names, entry.subject, entry.detail),
                  subject: entry.subject,
                  role: role(entry.detail),
                  detail: entry.detail,
                })}
              </p>
              <time dateTime={entry.at} className="text-xs text-ink-subtle">
                {moment(entry.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
