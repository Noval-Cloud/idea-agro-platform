import { useEffect, useState } from "react";
import type { Me } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/core";
import { createAccountTranslator, type AccountCatalog, type AccountSection } from "./i18n";
import { sectionRoles } from "./AccountNav";
import SavedZones from "./SavedZones";
import Projects from "./Projects";
import Users from "./Users";

type Props = {
  locale: Locale;
  catalog: AccountCatalog;
  section: AccountSection;
  sectionPaths: Record<AccountSection, string>;
  signInPath: string;
  homePath: string;
  zonePath: string;
  projectPath: string;
  explorePath: string;
};
type State = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; me: Me };

const card = "rounded-lg border border-line bg-surface p-6";

/** Where the anchors of the single account page, before it had sections, lead now. */
const formerAnchors: Record<string, { section: AccountSection; hash?: string }> = {
  "#zones": { section: "zones" },
  "#projects": { section: "projects" },
  "#content": { section: "content" },
  "#users": { section: "admin" },
};

export default function AccountApp({
  locale,
  catalog,
  section,
  sectionPaths,
  signInPath,
  homePath,
  zonePath,
  projectPath,
  explorePath,
}: Props) {
  const { t, date, moment, number, degrees } = createAccountTranslator(locale, catalog);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [ending, setEnding] = useState<"idle" | "working" | "failed">("idle");

  useEffect(() => {
    const former = section === "profile" ? formerAnchors[location.hash] : undefined;
    if (former) return location.replace(`${sectionPaths[former.section]}${former.hash ?? ""}`);
    import("@/lib/account")
      .then(({ loadMe }) => loadMe())
      .then((me) => {
        if (!me) return location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname + location.hash)}`);
        const role = sectionRoles[section];
        // A section outside the person's roles leads to their profile.
        if (role && !me.roles.includes(role)) return location.replace(sectionPaths.profile);
        setState({ kind: "ready", me });
      })
      .catch(() => setState({ kind: "failed" }));
  }, [section, sectionPaths, signInPath]);

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

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
      {state.kind !== "ready" ? (
        <p role="status" className="text-ink-muted">
          {state.kind === "loading" ? t("account.loading") : t("account.failed")}
        </p>
      ) : section === "profile" ? (
        <>
          <section id="profile" aria-labelledby="profile-title" className={card}>
            <h2 id="profile-title" className="text-lg font-medium text-ink">
              {t("account.profile.title")}
            </h2>
            <div className="mt-5 flex items-center gap-4">
              {state.me.picture ? (
                <img
                  src={state.me.picture}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-14 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-14 items-center justify-center rounded-full bg-surface-sunken text-xl text-ink"
                >
                  {(state.me.name ?? state.me.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <p className="font-medium text-ink">{state.me.name}</p>
                <p className="text-sm text-ink-muted">{state.me.email}</p>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 text-sm">
              <div>
                <dt className="text-ink-subtle">{t("account.profile.roles")}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {state.me.roles.map((role) => (
                    <span key={role} className="rounded-pill border border-line px-2.5 py-0.5 text-ink">
                      {t(`account.roles.${role}`)}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <p className="mt-6 text-xs text-ink-subtle">
              {t("account.profile.since", { date: date(state.me.created_at) })}
            </p>
          </section>

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
        </>
      ) : section === "zones" ? (
        <SavedZones
          t={t}
          number={number}
          degrees={degrees}
          zonePath={zonePath}
          explorePath={explorePath}
          signInPath={signInPath}
        />
      ) : section === "projects" ? (
        <Projects t={t} projectPath={projectPath} signInPath={signInPath} />
      ) : section === "content" ? (
        <section id="content" aria-labelledby="content-title" className={card}>
          <h2 id="content-title" className="text-lg font-medium text-ink">
            {t("account.content.title")}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-ink-muted">{t("account.content.body")}</p>
        </section>
      ) : (
        <Users t={t} moment={moment} signInPath={signInPath} me={state.me.id} />
      )}
    </div>
  );
}
