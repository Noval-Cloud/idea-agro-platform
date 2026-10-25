import { useEffect, useState, type ReactNode } from "react";
import type { Me } from "@idea-agro/api-client";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  outlinePath: string;
  explorePath: string;
  mapPath: string;
};
type State = { kind: "loading" } | { kind: "failed" } | { kind: "ready"; me: Me };

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
  outlinePath,
  explorePath,
  mapPath,
}: Props) {
  const translator = createAccountTranslator(locale, catalog);
  const { t, date, moment } = translator;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [ending, setEnding] = useState<"idle" | "working" | "failed">("idle");
  const [confirming, setConfirming] = useState(false);

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

  if (state.kind !== "ready")
    return (
      <p role="status" className="pt-8 text-ink-muted">
        {state.kind === "loading" ? t("account.loading") : t("account.failed")}
      </p>
    );
  const { me } = state;

  if (section === "zones")
    return (
      <SavedZones
        translator={translator}
        zonePath={zonePath}
        outlinePath={outlinePath}
        explorePath={explorePath}
        signInPath={signInPath}
      />
    );
  if (section === "projects")
    return <Projects translator={translator} projectPath={projectPath} mapPath={mapPath} signInPath={signInPath} />;
  if (section === "content")
    return (
      <section id="content" aria-labelledby="content-title" className="grid max-w-3xl gap-2 pt-8">
        <h2 id="content-title" className="text-lg font-medium text-ink">
          {t("account.content.title")}
        </h2>
        <p className="max-w-prose text-sm text-ink-muted">{t("account.content.body")}</p>
      </section>
    );
  if (section === "admin")
    return (
      <div className="max-w-(--ia-layout-page) pt-8">
        <Users t={t} moment={moment} signInPath={signInPath} me={me.id} />
      </div>
    );

  return (
    <div className="max-w-3xl pt-8">
      <header className="flex items-center gap-5 pb-8">
        {me.picture ? (
          <img
            src={me.picture}
            alt=""
            width={64}
            height={64}
            referrerPolicy="no-referrer"
            className="size-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface-muted font-display text-2xl text-ink"
          >
            {(me.name ?? me.email ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="grid min-w-0 gap-0.5">
          {(me.name ?? me.email) && (
            <h2 className="truncate font-display text-2xl font-medium tracking-tight text-ink">
              {me.name ?? me.email}
            </h2>
          )}
          {me.name && me.email && <p className="truncate text-sm text-ink-muted">{me.email}</p>}
          <p className="mt-1 text-xs text-ink-subtle">{t("account.profile.identityBody")}</p>
          <p className="text-xs text-ink-subtle">{t("account.profile.since", { date: date(me.created_at) })}</p>
        </div>
      </header>

      <div className="divide-y divide-line border-t border-line">
        <Setting title={t("account.profile.roles")} body={t("account.profile.rolesBody")}>
          <ul className="flex flex-wrap gap-1.5">
            {me.roles.map((role) => (
              <li key={role} className="rounded-pill border border-line px-2.5 py-0.5 text-sm text-ink">
                {t(`account.roles.${role}`)}
              </li>
            ))}
          </ul>
        </Setting>
        <Setting id="sessions" title={t("account.sessions.title")} body={t("account.sessions.body")}>
          <div className="grid justify-items-start gap-3">
            <Button variant="outline" size="sm" disabled={ending === "working"} onClick={() => setConfirming(true)}>
              <LogOut aria-hidden="true" />
              {t("account.sessions.action")}
            </Button>
            {ending === "failed" && (
              <p role="alert" className="text-sm text-danger">
                {t("account.sessions.failed")}
              </p>
            )}
          </div>
        </Setting>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t("account.sessions.confirmTitle")}
        body={t("account.sessions.confirm")}
        confirm={t("account.sessions.confirmAction")}
        cancel={t("account.sessions.cancel")}
        onConfirm={() => {
          setConfirming(false);
          void endSessions();
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/** One setting of the profile: what it is on the left, its value and actions on the right. */
function Setting({ id, title, body, children }: { id?: string; title: string; body: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-label={title}
      className="grid gap-4 py-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-10"
    >
      <div>
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <p className="mt-1 text-sm text-ink-muted">{body}</p>
      </div>
      <div className="min-w-0 md:pt-0.5">{children}</div>
    </section>
  );
}
