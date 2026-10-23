import { useEffect, useRef, useState } from "react";
import type { AdminAccount, AuditOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInProviders } from "@/lib/sign-in-providers";
import type { AccountTranslator } from "./i18n";

type Props = { t: AccountTranslator["t"]; date: AccountTranslator["date"]; signInPath: string; me: string };
type Notice = "done" | "failed" | "own" | "recoveryNotApplicable" | null;
type Outcome = { status: number; type?: string | null; account?: AdminAccount; notice?: Notice };
type Run = (modules: Awaited<ReturnType<typeof api>>) => Promise<Outcome>;

const card = "rounded-lg border border-line bg-surface p-6";
const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
const nameOf = (account: AdminAccount) => account.name || account.email || account.id;

/** For admins: search accounts, change their roles and access, and read what admins did. */
export default function Users({ t, date, signInPath, me }: Props) {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [audit, setAudit] = useState<AuditOut[] | null>(null);
  // An action waiting for the person to confirm it is them; confirming retries it.
  const [waiting, setWaiting] = useState<Run | null>(null);
  const confirm = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void api()
        .then(([{ privately }, client]) => privately((init) => client.listAccounts({ q: query.trim() }, init)))
        .then((response) => live && setAccounts(response.status === 200 ? response.data : []))
        .catch(() => live && setAccounts([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const loadAudit = () =>
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listAudit(init)))
      .then((response) => setAudit(response.status === 200 ? response.data : []))
      .catch(() => setAudit([]));

  useEffect(loadAudit, []);

  // Confirming opens the provider's window, which browsers allow only right inside a click: it loads ahead.
  useEffect(() => {
    if (!waiting || confirm.current) return;
    void import("@/lib/account")
      .then(({ prepareConfirmation }) => prepareConfirmation(signInProviders[0]))
      .then((ready) => (confirm.current = ready))
      .catch(() => undefined);
  }, [waiting]);

  const act = async (run: Run) => {
    setNotice(null);
    try {
      const modules = await api();
      const outcome = await run(modules);
      if (outcome.status === 403 && outcome.type === modules[0].RECENT_SIGN_IN) return setWaiting(() => run);
      if (outcome.account) {
        const changed = outcome.account;
        setAccounts((all) => all?.map((a) => (a.id === changed.id ? changed : a)) ?? null);
      }
      setNotice(outcome.notice ?? (outcome.status < 300 ? "done" : outcome.status === 409 ? "own" : "failed"));
      loadAudit();
    } catch (error) {
      const { SignedOut } = await import("@/lib/account");
      if (error instanceof SignedOut) return location.assign(signInPath);
      setNotice("failed");
    }
  };

  const confirmAndRetry = async () => {
    const run = waiting;
    if (!run || !confirm.current) return;
    try {
      await confirm.current();
    } catch {
      return setNotice("failed");
    }
    setWaiting(null);
    await act(run);
  };

  const problem = (data: unknown) => (data as { type?: string | null }).type;

  const saveRoles = (account: AdminAccount, roles: ("editor" | "admin")[]) =>
    void act(async ([{ privately }, client]) => {
      const response = await privately((init) => client.changeAccountRoles(account.id, { roles }, init));
      return response.status === 200
        ? { status: 200, account: response.data }
        : { status: response.status, type: problem(response.data) };
    });

  const setAccess = (account: AdminAccount, disabled: boolean) => {
    if (disabled && !window.confirm(t("account.users.confirmDisable", { name: nameOf(account) }))) return;
    void act(async ([{ privately }, client]) => {
      const response = await privately((init) => client.changeAccountAccess(account.id, { disabled }, init));
      return response.status === 200
        ? { status: 200, account: response.data }
        : { status: response.status, type: problem(response.data) };
    });
  };

  const revoke = (account: AdminAccount) => {
    if (!window.confirm(t("account.users.confirmRevoke", { name: nameOf(account) }))) return;
    void act(async ([{ privately }, client]) => {
      const response = await privately((init) => client.revokeAccountSessions(account.id, init));
      return { status: response.status };
    });
  };

  const recover = (account: AdminAccount) =>
    void act(async ([{ privately }, client]) => {
      const response = await privately((init) => client.sendAccountRecovery(account.id, init));
      return response.status === 409 ? { status: 409, notice: "recoveryNotApplicable" } : { status: response.status };
    });

  return (
    <section id="users" aria-labelledby="users-title" className={card}>
      <h2 id="users-title" className="text-lg font-medium text-ink">
        {t("account.users.title")}
      </h2>
      <Input
        type="search"
        className="mt-4"
        value={query}
        aria-label={t("account.users.searchLabel")}
        placeholder={t("account.users.searchPlaceholder")}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {waiting && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-sm border border-line p-3 text-sm">
          <p className="grow text-ink">{t("account.users.confirmIdentity")}</p>
          <Button size="sm" onClick={() => void confirmAndRetry()}>
            {t("account.users.confirmAction")}
          </Button>
        </div>
      )}
      {notice && (
        <p role={notice === "done" ? "status" : "alert"} className="mt-3 text-sm text-ink-muted">
          {t(`account.users.${notice}`)}
        </p>
      )}
      {accounts?.length === 0 && <p className="mt-3 text-sm text-ink-muted">{t("account.users.empty")}</p>}
      <ul className="mt-4 grid divide-y divide-line">
        {accounts?.map((account) => (
          <li key={account.id} className="py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div className="min-w-0 grow">
                <p className="truncate text-sm font-medium text-ink">{nameOf(account)}</p>
                <p className="truncate text-xs text-ink-subtle">
                  {[
                    account.email,
                    account.roles.map((role) => t(`account.roles.${role}`)).join(", "),
                    account.disabled ? t("account.users.disabled") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={open === account.id}
                onClick={() => setOpen(open === account.id ? null : account.id)}
              >
                {open === account.id ? t("account.users.close") : t("account.users.manage")}
              </Button>
            </div>
            {open === account.id && (
              <Manage
                t={t}
                account={account}
                own={account.id === me}
                onRoles={(roles) => saveRoles(account, roles)}
                onAccess={(disabled) => setAccess(account, disabled)}
                onRevoke={() => revoke(account)}
                onRecover={() => recover(account)}
              />
            )}
          </li>
        ))}
      </ul>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink">{t("account.users.audit")}</summary>
        {audit?.length === 0 && <p className="mt-2 text-ink-muted">{t("account.users.auditEmpty")}</p>}
        <ol className="mt-3 grid gap-2">
          {audit?.map((entry, index) => (
            <li key={index}>
              <p className="text-ink">
                {t(`account.users.actions.${entry.action}`, {
                  actor: entry.actor_name,
                  target: entry.target_email || entry.target,
                  detail:
                    entry.detail
                      .split(",")
                      .filter(Boolean)
                      .map((role) => t(`account.roles.${role as "editor" | "admin"}`))
                      .join(", ") || t("account.users.noRoles"),
                })}
              </p>
              <time dateTime={entry.at} className="text-xs text-ink-subtle">
                {date(entry.at)}
              </time>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function Manage({
  t,
  account,
  own,
  onRoles,
  onAccess,
  onRevoke,
  onRecover,
}: {
  t: AccountTranslator["t"];
  account: AdminAccount;
  own: boolean;
  onRoles: (roles: ("editor" | "admin")[]) => void;
  onAccess: (disabled: boolean) => void;
  onRevoke: () => void;
  onRecover: () => void;
}) {
  const [roles, setRoles] = useState(() => new Set(account.roles.filter((r) => r !== "client")));
  const toggle = (role: "editor" | "admin") =>
    setRoles((now) => {
      const next = new Set(now);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });

  return (
    <div className="mt-3 grid gap-3 rounded-sm bg-surface-sunken p-3 text-sm">
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">{t("account.users.roles")}</legend>
        {(["editor", "admin"] as const).map((role) => (
          <label key={role} className="flex items-center gap-2 text-ink">
            <input
              type="checkbox"
              checked={roles.has(role)}
              // Admins keep their own admin role.
              disabled={own && role === "admin"}
              onChange={() => toggle(role)}
            />
            {t(`account.roles.${role}`)}
          </label>
        ))}
        <Button size="sm" variant="outline" onClick={() => onRoles([...roles])}>
          {t("account.users.saveRoles")}
        </Button>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={onRevoke}>
          {t("account.users.revoke")}
        </Button>
        {!own && (
          <Button size="sm" variant="ghost" onClick={() => onAccess(!account.disabled)}>
            {account.disabled ? t("account.users.enable") : t("account.users.disable")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRecover}>
          {t("account.users.recovery")}
        </Button>
      </div>
    </div>
  );
}
