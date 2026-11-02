import { useEffect, useState } from "react";
import type { AuditOut } from "@idea-agro/api-client";
import type { AccountTranslator } from "./i18n";

type Props = { t: AccountTranslator["t"]; moment: AccountTranslator["moment"]; signInPath: string };

/** For admins: what admins and editors did, newest first. */
export default function Audit({ t, moment, signInPath }: Props) {
  const [audit, setAudit] = useState<AuditOut[] | null | "failed">(null);

  useEffect(() => {
    void Promise.all([import("@/lib/account"), import("@idea-agro/api-client")])
      .then(([{ privately }, client]) => privately((init) => client.listAudit(init)))
      .then((response) => setAudit(response.status === 200 ? response.data : "failed"))
      .catch(async (error: unknown) => {
        const { SignedOut } = await import("@/lib/account");
        if (error instanceof SignedOut) return location.assign(signInPath);
        setAudit("failed");
      });
  }, [signInPath]);

  return (
    <section aria-labelledby="audit-title" className="grid max-w-3xl gap-4">
      <div>
        <h2 id="audit-title" className="text-lg font-medium text-ink">
          {t("account.subpages.audit")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("account.audit.lead")}</p>
      </div>
      {audit === null && <p className="text-sm text-ink-muted">{t("account.loading")}</p>}
      {audit === "failed" && <p className="text-sm text-danger">{t("account.audit.failed")}</p>}
      {audit?.length === 0 && <p className="text-sm text-ink-muted">{t("account.audit.empty")}</p>}
      {Array.isArray(audit) && audit.length > 0 && (
        <ol className="grid divide-y divide-line border-y border-line text-sm">
          {audit.map((entry, index) => (
            <li key={index} className="grid gap-0.5 py-3">
              <p className="text-ink">
                {t(`account.audit.actions.${entry.action}`, {
                  actor: entry.actor_name,
                  target: entry.target_email || entry.target,
                  // Only a change of roles lists roles; a text's change lists its languages.
                  detail:
                    entry.action === "roles_changed"
                      ? entry.detail
                          .split(",")
                          .filter(Boolean)
                          .map((role) => t(`account.roles.${role as "editor" | "admin"}`))
                          .join(", ") || t("account.audit.noRoles")
                      : entry.detail,
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
