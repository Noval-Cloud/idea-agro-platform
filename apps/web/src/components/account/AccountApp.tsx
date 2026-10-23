import { useEffect, useState } from "react";
import type { Me } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/core";
import { createAccountTranslator, type AccountCatalog } from "./i18n";
import SavedZones from "./SavedZones";
import Projects from "./Projects";
import Users from "./Users";

type Props = {
  locale: Locale;
  catalog: AccountCatalog;
  signInPath: string;
  homePath: string;
  zonePath: string;
  projectPath: string;
  explorePath: string;
};
type State = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; me: Me };

const card = "rounded-lg border border-line bg-surface p-6";

export default function AccountApp({
  locale,
  catalog,
  signInPath,
  homePath,
  zonePath,
  projectPath,
  explorePath,
}: Props) {
  const { t, date, number } = createAccountTranslator(locale, catalog);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [ending, setEnding] = useState<"idle" | "working" | "failed">("idle");

  useEffect(() => {
    import("@/lib/account")
      .then(({ loadMe }) => loadMe())
      .then((me) => {
        if (me) setState({ kind: "ready", me });
        else location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname + location.hash)}`);
      })
      .catch(() => setState({ kind: "failed" }));
  }, [signInPath]);

  // The sections appear after the account loads, too late for the browser to reach the address's anchor.
  useEffect(() => {
    if (state.kind === "ready" && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [state.kind]);

  const endSessions = async () => {
    if (!window.confirm(t("account.sessions.confirm"))) return;
    setEnding("working");
    const { signOutEverywhere, SignedOut } = await import("@/lib/account");
    try {
      await signOutEverywhere();
      location.assign(homePath);
    } catch (error) {
      if (error instanceof SignedOut) location.assign(signInPath);
      else setEnding("failed");
    }
  };

  if (state.kind !== "ready") {
    return (
      <p role="status" className="text-ink-muted">
        {state.kind === "loading" ? t("account.loading") : t("account.failed")}
      </p>
    );
  }

  const { me } = state;
  return (
    <div className="grid gap-6">
      <section id="profile" aria-labelledby="profile-title" className={card}>
        <h2 id="profile-title" className="text-lg font-medium text-ink">
          {t("account.profile.title")}
        </h2>
        <div className="mt-5 flex items-center gap-4">
          {me.picture ? (
            <img src={me.picture} alt="" referrerPolicy="no-referrer" className="size-14 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-14 items-center justify-center rounded-full bg-surface-sunken text-xl text-ink"
            >
              {(me.name ?? me.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <p className="font-medium text-ink">{me.name}</p>
            <p className="text-sm text-ink-muted">{me.email}</p>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-subtle">{t("account.profile.roles")}</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {me.roles.map((role) => (
                <span key={role} className="rounded-pill border border-line px-2.5 py-0.5 text-ink">
                  {t(`account.roles.${role}`)}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-ink-subtle">{t("account.profile.email")}</dt>
            <dd className="mt-1 text-ink">{me.email}</dd>
          </div>
        </dl>
        <p className="mt-6 text-xs text-ink-subtle">{t("account.profile.since", { date: date(me.created_at) })}</p>
      </section>

      <SavedZones t={t} number={number} zonePath={zonePath} explorePath={explorePath} signInPath={signInPath} />

      <Projects t={t} projectPath={projectPath} signInPath={signInPath} />

      {me.roles.includes("editor") && (
        <section id="content" aria-labelledby="content-title" className={card}>
          <h2 id="content-title" className="text-lg font-medium text-ink">
            {t("account.content.title")}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{t("account.content.body")}</p>
        </section>
      )}

      {me.roles.includes("admin") && <Users t={t} date={date} signInPath={signInPath} me={me.id} />}

      <section id="sessions" aria-labelledby="sessions-title" className={card}>
        <h2 id="sessions-title" className="text-lg font-medium text-ink">
          {t("account.sessions.title")}
        </h2>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">{t("account.sessions.body")}</p>
        <Button variant="outline" className="mt-5" disabled={ending === "working"} onClick={endSessions}>
          {t("account.sessions.action")}
        </Button>
        {ending === "failed" && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {t("account.sessions.failed")}
          </p>
        )}
      </section>
    </div>
  );
}
