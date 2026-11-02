import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Rows3, Search } from "lucide-react";
import type { AdminAccount } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { signInProviders } from "@/lib/sign-in-providers";
import { cn } from "@/lib/utils";
import type { AccountTranslator } from "./i18n";

type Props = { translator: AccountTranslator; signInPath: string; me: string };
type Notice = "done" | "failed" | "own" | "recoveryNotApplicable" | null;
type Outcome = { status: number; type?: string | null; account?: AdminAccount; notice?: Notice };
type Run = (modules: Awaited<ReturnType<typeof api>>) => Promise<Outcome>;
/** An action and what it is called, for the person to recognize when asked to confirm it. */
type Action = { run: Run; label: string; account: AdminAccount };
type Sort = "name" | "newest" | "oldest";
type Filter = "all" | "admin" | "editor" | "client" | "disabled" | "system";
type View = "table" | "cards";

const sorts: Sort[] = ["name", "newest", "oldest"];
const filters: Filter[] = ["all", "admin", "editor", "client", "disabled", "system"];
const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
const VIEW_KEY = "ia-users-view";
// People sign in with an email; an account without one is the platform's own, such as the tests'.
const isSystem = (account: AdminAccount) => !account.email;

const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
};

/** For admins: find accounts, and change their roles and access in a side panel. */
export default function Users({ translator, signInPath, me }: Props) {
  const { t, date, collator } = translator;
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [sort, setSort] = useState<Sort>("name");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>(readView);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  // An action waiting for the person to confirm it is them; confirming retries it.
  const [waiting, setWaiting] = useState<Action | null>(null);
  const [confirmReady, setConfirmReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Grows after every action, so the role checkboxes go back to what the account really has.
  const [settled, setSettled] = useState(0);
  const confirm = useRef<(() => Promise<void>) | null>(null);
  const asking = useConfirm(t("account.users.cancel"));

  const nameOf = (account: AdminAccount) => account.name || account.email || t("account.users.system");

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

  const choose = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // The view is a convenience; without storage it is not remembered.
    }
  };

  // Confirming opens the provider's window, which browsers allow only right inside a click: it loads ahead.
  useEffect(() => {
    if (!waiting || confirm.current) return;
    void import("@/lib/account")
      .then(({ prepareConfirmation }) => prepareConfirmation(signInProviders[0]))
      .then((ready) => {
        confirm.current = ready;
        setConfirmReady(true);
      })
      .catch(() => setNotice("failed"));
  }, [waiting]);

  const act = async (action: Action) => {
    if (busy) return;
    setNotice(null);
    // A new action replaces one still waiting for confirmation.
    setWaiting(null);
    setBusy(true);
    try {
      const modules = await api();
      const outcome = await action.run(modules);
      if (outcome.status === 403 && outcome.type === modules[0].RECENT_SIGN_IN) return setWaiting(action);
      if (outcome.account) {
        const changed = outcome.account;
        setAccounts((all) => all?.map((a) => (a.id === changed.id ? changed : a)) ?? null);
      }
      setNotice(outcome.notice ?? (outcome.status < 300 ? "done" : outcome.status === 409 ? "own" : "failed"));
      // The page shows the admin's own roles and sessions: it starts over when they change.
      if (outcome.status < 300 && action.account.id === me) return location.reload();
    } catch (error) {
      const { SignedOut } = await import("@/lib/account");
      if (error instanceof SignedOut) return location.assign(signInPath);
      setNotice("failed");
    } finally {
      setBusy(false);
      setSettled((n) => n + 1);
    }
  };

  const confirmAndRetry = async () => {
    const action = waiting;
    if (!action || !confirm.current) return;
    try {
      await confirm.current();
    } catch {
      return setNotice("failed");
    }
    await act(action);
  };

  const problem = (data: unknown) => (data as { type?: string | null }).type;

  const saveRoles = (account: AdminAccount, roles: ("editor" | "admin")[]) =>
    void act({
      account,
      label: t("account.users.saveRoles"),
      run: async ([{ privately }, client]) => {
        const response = await privately((init) => client.changeAccountRoles(account.id, { roles }, init));
        return response.status === 200
          ? { status: 200, account: response.data }
          : { status: response.status, type: problem(response.data) };
      },
    });

  const setAccess = async (account: AdminAccount, disabled: boolean) => {
    if (
      disabled &&
      !(await asking.ask({
        title: t("account.users.disable"),
        body: t("account.users.confirmDisable", { name: nameOf(account) }),
        confirm: t("account.users.disable"),
      }))
    )
      return;
    void act({
      account,
      label: disabled ? t("account.users.disable") : t("account.users.enable"),
      run: async ([{ privately }, client]) => {
        const response = await privately((init) => client.changeAccountAccess(account.id, { disabled }, init));
        return response.status === 200
          ? { status: 200, account: response.data }
          : { status: response.status, type: problem(response.data) };
      },
    });
  };

  const revoke = async (account: AdminAccount) => {
    if (
      !(await asking.ask({
        title: t("account.users.revoke"),
        body: t("account.users.confirmRevoke", { name: nameOf(account) }),
        confirm: t("account.users.revoke"),
        tone: "primary",
      }))
    )
      return;
    void act({
      account,
      label: t("account.users.revoke"),
      run: async ([{ privately }, client]) => {
        const response = await privately((init) => client.revokeAccountSessions(account.id, init));
        return { status: response.status };
      },
    });
  };

  const recover = (account: AdminAccount) =>
    void act({
      account,
      label: t("account.users.recovery"),
      run: async ([{ privately }, client]) => {
        const response = await privately((init) => client.sendAccountRecovery(account.id, init));
        return response.status === 409 ? { status: 409, notice: "recoveryNotApplicable" } : { status: response.status };
      },
    });

  // The platform's own accounts show only when asked for.
  const shown = (accounts ?? [])
    .filter((a) => (filter === "system") === isSystem(a))
    .filter((a) =>
      filter === "all" || filter === "system"
        ? true
        : filter === "disabled"
          ? a.disabled
          : filter === "client"
            ? !a.roles.some((r) => r !== "client")
            : a.roles.includes(filter),
    )
    .sort((a, b) =>
      sort === "name"
        ? collator.compare(nameOf(a), nameOf(b))
        : (sort === "newest" ? -1 : 1) * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    );
  const opened = accounts?.find((a) => a.id === open) ?? null;
  // Every account is a client; only the roles beyond it say something.
  const roles = (account: AdminAccount) => account.roles.filter((r) => r !== "client");
  const select = "h-11 rounded-sm border border-input bg-surface px-3 text-sm text-ink";

  return (
    <section aria-labelledby="users-title" className="grid gap-6 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="users-title" className="text-xl font-medium text-ink">
          {t("account.subpages.users")}
        </h2>
        {accounts && (
          <p role="status" className="text-sm text-ink-muted">
            {t("account.users.count", { count: shown.length })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 grow">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            value={query}
            className="pl-9"
            aria-label={t("account.users.searchLabel")}
            placeholder={t("account.users.searchPlaceholder")}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <select
          className={select}
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          aria-label={t("account.users.filterLabel")}
        >
          {filters.map((f) => (
            <option key={f} value={f}>
              {t(`account.users.filters.${f}`)}
            </option>
          ))}
        </select>
        <select
          className={select}
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          aria-label={t("account.users.sortLabel")}
        >
          {sorts.map((s) => (
            <option key={s} value={s}>
              {t(`account.users.sorts.${s}`)}
            </option>
          ))}
        </select>
        <div
          role="group"
          aria-label={t("account.users.viewLabel")}
          className="hidden rounded-sm border border-line p-0.5 sm:flex"
        >
          {(["table", "cards"] as const).map((v) => {
            const Icon = v === "table" ? Rows3 : LayoutGrid;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={t(`account.users.views.${v}`)}
                title={t(`account.users.views.${v}`)}
                onClick={() => choose(v)}
                className={cn(
                  "grid size-9 place-items-center rounded-xs transition-colors duration-(--ia-motion-fast)",
                  view === v ? "bg-surface-selected text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
              </button>
            );
          })}
        </div>
      </div>

      {accounts === null ? (
        <p className="text-sm text-ink-muted">{t("account.loading")}</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-sm text-ink-muted">
          {t("account.users.empty")}
        </p>
      ) : (
        <>
          {/* Phones always get cards: a table does not fit. */}
          <ul className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", view === "table" && "sm:hidden")}>
            {shown.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => setOpen(account.id)}
                  className="grid h-full w-full content-start gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors duration-(--ia-motion-fast) hover:border-line-strong hover:bg-action-soft"
                >
                  <span className="flex items-center gap-3">
                    <Avatar account={account} name={nameOf(account)} />
                    <span className="grid min-w-0">
                      <span className="truncate text-sm font-medium text-ink">{nameOf(account)}</span>
                      {account.name && account.email && (
                        <span className="truncate text-xs text-ink-muted">{account.email}</span>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
                    {roles(account).map((role) => (
                      <RoleChip key={role}>{t(`account.roles.${role}`)}</RoleChip>
                    ))}
                    {isSystem(account) && <RoleChip>{t("account.users.systemChip")}</RoleChip>}
                    {account.disabled && <RoleChip tone="danger">{t("account.users.disabled")}</RoleChip>}
                    <span>{t("account.users.since", { date: date(account.created_at) })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {view === "table" && (
            <div className="hidden overflow-x-auto rounded-lg border border-line bg-surface sm:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-xs text-ink-subtle">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      {t("account.users.columns.name")}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      {t("account.users.columns.roles")}
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      {t("account.users.columns.since")}
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      <span className="sr-only">{t("account.users.manage")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((account) => (
                    <tr key={account.id} className="transition-colors duration-(--ia-motion-fast) hover:bg-action-soft">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar account={account} name={nameOf(account)} />
                          <span className="grid min-w-0">
                            <span className="truncate font-medium text-ink">{nameOf(account)}</span>
                            {account.name && account.email && (
                              <span className="truncate text-xs text-ink-muted">{account.email}</span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          {roles(account).map((role) => (
                            <RoleChip key={role}>{t(`account.roles.${role}`)}</RoleChip>
                          ))}
                          {isSystem(account) && <RoleChip>{t("account.users.systemChip")}</RoleChip>}
                          {account.disabled && <RoleChip tone="danger">{t("account.users.disabled")}</RoleChip>}
                          {roles(account).length === 0 && !account.disabled && !isSystem(account) && (
                            <span className="text-ink-subtle">{t("account.roles.client")}</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted tabular-nums">
                        {date(account.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(account.id)}>
                          {t("account.users.manage")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {opened && (
        <Sheet
          open
          onClose={() => {
            setOpen(null);
            setNotice(null);
            setWaiting(null);
          }}
          title={nameOf(opened)}
          description={opened.name && opened.email ? opened.email : undefined}
          close={t("account.users.close")}
          footer={
            notice || waiting ? (
              <div className="grid gap-2">
                {waiting && (
                  <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
                    <p className="grow text-ink">
                      {t("account.users.confirmIdentity", { action: waiting.label, name: nameOf(waiting.account) })}
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => setWaiting(null)}>
                      {t("account.users.cancel")}
                    </Button>
                    <Button size="sm" disabled={!confirmReady || busy} onClick={() => void confirmAndRetry()}>
                      {t("account.users.confirmAction")}
                    </Button>
                  </div>
                )}
                {notice && (
                  <p role={notice === "done" ? "status" : "alert"} className="text-sm text-ink-muted">
                    {t(`account.users.${notice}`)}
                  </p>
                )}
              </div>
            ) : undefined
          }
        >
          <Manage
            key={`${opened.id}-${settled}`}
            translator={translator}
            account={opened}
            own={opened.id === me}
            busy={busy}
            onRoles={(next) => saveRoles(opened, next)}
            onAccess={(disabled) => void setAccess(opened, disabled)}
            onRevoke={() => void revoke(opened)}
            onRecover={() => recover(opened)}
          />
        </Sheet>
      )}
      {asking.dialog}
    </section>
  );
}

function Avatar({ account, name }: { account: AdminAccount; name: string }) {
  return account.picture ? (
    <img
      src={account.picture}
      alt=""
      width={32}
      height={32}
      referrerPolicy="no-referrer"
      className="size-8 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-sm font-medium text-ink"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function RoleChip({ children, tone }: { children: string; tone?: "danger" }) {
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 text-2xs font-medium",
        tone === "danger" ? "bg-danger/15 text-danger" : "bg-action-soft text-ink",
      )}
    >
      {children}
    </span>
  );
}

/** What an admin can do with an account, each with what it means. */
function Manage({
  translator,
  account,
  own,
  busy,
  onRoles,
  onAccess,
  onRevoke,
  onRecover,
}: {
  translator: AccountTranslator;
  account: AdminAccount;
  own: boolean;
  busy: boolean;
  onRoles: (roles: ("editor" | "admin")[]) => void;
  onAccess: (disabled: boolean) => void;
  onRevoke: () => void;
  onRecover: () => void;
}) {
  const { t, date } = translator;
  const [roles, setRoles] = useState(() => new Set(account.roles.filter((r) => r !== "client")));
  const toggle = (role: "editor" | "admin") =>
    setRoles((now) => {
      const next = new Set(now);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  const changed =
    roles.size !== account.roles.filter((r) => r !== "client").length ||
    [...roles].some((r) => !account.roles.includes(r));
  const part = "grid gap-3 border-b border-line py-5 first:pt-0 last:border-b-0";

  return (
    <div className="grid text-sm">
      <p className="pb-5 text-xs text-ink-subtle">{t("account.users.since", { date: date(account.created_at) })}</p>
      <fieldset className={part}>
        <legend className="contents">
          <span className="font-medium text-ink">{t("account.users.roles")}</span>
        </legend>
        <p className="text-ink-muted">{t("account.users.rolesBody")}</p>
        {(["editor", "admin"] as const).map((role) => (
          <label key={role} className="flex items-start gap-3 text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={roles.has(role)}
              // Admins keep their own admin role.
              disabled={own && role === "admin"}
              onChange={() => toggle(role)}
            />
            <span className="grid gap-0.5">
              {t(`account.roles.${role}`)}
              <span className="text-xs text-ink-muted">{t(`account.users.roleHints.${role}`)}</span>
            </span>
          </label>
        ))}
        <Button
          size="sm"
          className="justify-self-start"
          disabled={busy || !changed}
          onClick={() => onRoles([...roles])}
        >
          {t("account.users.saveRoles")}
        </Button>
      </fieldset>
      <div className={part}>
        <p className="font-medium text-ink">{t("account.users.sessions")}</p>
        <p className="text-ink-muted">{t("account.users.sessionsBody")}</p>
        <Button size="sm" variant="outline" className="justify-self-start" disabled={busy} onClick={onRevoke}>
          {t("account.users.revoke")}
        </Button>
      </div>
      {!own && (
        <div className={part}>
          <p className="font-medium text-ink">{t("account.users.access")}</p>
          <p className="text-ink-muted">
            {account.disabled ? t("account.users.accessDisabled") : t("account.users.accessBody")}
          </p>
          <Button
            size="sm"
            variant="outline"
            className={cn("justify-self-start", !account.disabled && "text-danger")}
            disabled={busy}
            onClick={() => onAccess(!account.disabled)}
          >
            {account.disabled ? t("account.users.enable") : t("account.users.disable")}
          </Button>
        </div>
      )}
      <div className={part}>
        <p className="font-medium text-ink">{t("account.users.recoveryTitle")}</p>
        <p className="text-ink-muted">{t("account.users.recoveryBody")}</p>
        <Button size="sm" variant="ghost" className="-ml-3 justify-self-start" disabled={busy} onClick={onRecover}>
          {t("account.users.recovery")}
        </Button>
      </div>
    </div>
  );
}
