import { useEffect, useRef, useState } from "react";
import { SearchX } from "lucide-react";
import type { AdminAccount } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/lists/EmptyState";
import { FilterSelect } from "@/components/lists/FilterSelect";
import { ListCount, ListToolbar, underToolbar } from "@/components/lists/ListToolbar";
import { SearchField } from "@/components/lists/SearchField";
import { SortHeader, SortMenu, decodeSort, encodeSort, sortRows, type Sort } from "@/components/lists/Sorting";
import { ViewToggle, useListView } from "@/components/lists/ViewToggle";
import { useQueryState } from "@/components/lists/state";
import { signInProviders } from "@/lib/sign-in-providers";
import { cn } from "@/lib/utils";
import type { AccountTranslator } from "./i18n";
import { PageHeader } from "./PageHeader";
import { useLeaveGuard } from "./TextEditor";

type Props = { translator: AccountTranslator; signInPath: string; me: string };
type Notice = "done" | "failed" | "own" | "recoveryNotApplicable" | null;
type Outcome = { status: number; type?: string | null; account?: AdminAccount; notice?: Notice };
type Run = (modules: Awaited<ReturnType<typeof api>>) => Promise<Outcome>;
/** An action and what it is called, for the person to recognize when asked to confirm it. */
type Action = { run: Run; label: string; account: AdminAccount };
type Role = "editor" | "admin";
const filters = ["admin", "editor", "client", "disabled", "system"] as const;
type Filter = "all" | (typeof filters)[number];
const keys = ["name", "joined"] as const;
type Key = (typeof keys)[number];

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
// People sign in with an email; an account without one is the platform's own, such as the tests'.
const isSystem = (account: AdminAccount) => !account.email;

/** For admins: find accounts, and change their roles and access in a side panel. */
export default function Users({ translator, signInPath, me }: Props) {
  const { t, date, collator } = translator;
  const [query, setQuery] = useQueryState("q", "");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [filterValue, setFilter] = useQueryState("role", "all");
  const filter: Filter = filters.find((f) => f === filterValue) ?? "all";
  const [sortValue, setSortValue] = useQueryState("sort", "name");
  const sort = decodeSort<Key>(sortValue, keys, { key: "name", descending: false });
  const setSort = (next: Sort<Key>) => setSortValue(encodeSort(next));
  const [view, setView] = useListView("users");
  const [open, setOpen] = useState<string | null>(null);
  // The roles ticked in the open account's panel, saved only when asked.
  const [draft, setDraft] = useState<Set<Role>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  // An action waiting for the person to confirm it is them; confirming retries it.
  const [waiting, setWaiting] = useState<Action | null>(null);
  const [confirmReady, setConfirmReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useRef<(() => Promise<void>) | null>(null);
  const asking = useConfirm(t("account.users.cancel"));

  const nameOf = (account: AdminAccount) => account.name || account.email || t("account.users.system");
  // Every account is a client; only the roles beyond it say something.
  const rolesOf = (account: AdminAccount) => account.roles.filter((r): r is Role => r !== "client");
  const opened = accounts?.find((a) => a.id === open) ?? null;
  const unsaved =
    opened !== null && (draft.size !== rolesOf(opened).length || rolesOf(opened).some((r) => !draft.has(r)));
  const release = useLeaveGuard(unsaved);

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

  const show = (account: AdminAccount) => {
    setNotice(null);
    setWaiting(null);
    setDraft(new Set(rolesOf(account)));
    setOpen(account.id);
  };
  const close = async () => {
    if (
      unsaved &&
      !(await asking.ask({
        title: t("account.content.leaveTitle"),
        body: t("account.users.leaveBody"),
        confirm: t("account.content.leave"),
      }))
    )
      return;
    setOpen(null);
    setNotice(null);
    setWaiting(null);
  };

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
      if (outcome.status < 300 && action.account.id === me) {
        release();
        return location.reload();
      }
    } catch (error) {
      const { SignedOut } = await import("@/lib/account");
      if (error instanceof SignedOut) return location.assign(signInPath);
      setNotice("failed");
    } finally {
      setBusy(false);
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

  const saveRoles = (account: AdminAccount, roles: Role[]) =>
    void act({
      account,
      label: t("account.users.saveRoles"),
      run: async ([{ privately }, client]) => {
        const response = await privately((init) => client.changeAccountRoles(account.id, { roles }, init));
        if (response.status !== 200) return { status: response.status, type: problem(response.data) };
        setDraft(new Set(rolesOf(response.data)));
        return { status: 200, account: response.data };
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
  const listed = (accounts ?? []).filter((a) => (filter === "system") === isSystem(a));
  const shown = sortRows(
    listed.filter((a) =>
      filter === "all" || filter === "system"
        ? true
        : filter === "disabled"
          ? a.disabled
          : filter === "client"
            ? rolesOf(a).length === 0
            : a.roles.includes(filter),
    ),
    sort,
    (a, key) => (key === "name" ? nameOf(a) : new Date(a.created_at).getTime()),
    collator,
  );
  const sortOptions: { key: Key; label: string; descending: boolean }[] = [
    { key: "name", label: t("account.users.sorts.name"), descending: false },
    { key: "joined", label: t("account.users.sorts.joined"), descending: true },
  ];
  const chips = (account: AdminAccount) => (
    <>
      {rolesOf(account).map((role) => (
        <RoleChip key={role}>{t(`account.roles.${role}`)}</RoleChip>
      ))}
      {isSystem(account) && <RoleChip>{t("account.users.systemChip")}</RoleChip>}
      {account.disabled && <RoleChip tone="danger">{t("account.users.disabled")}</RoleChip>}
    </>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <section aria-labelledby="users-title" className="grid max-w-(--ia-layout-page) gap-4">
        <PageHeader id="users-title" title={t("account.subpages.users")} />
        <ListToolbar
          end={
            <>
              <SortMenu t={t} sort={sort} options={sortOptions} onSort={setSort} />
              <ViewToggle t={t} view={view} onView={setView} />
            </>
          }
        >
          <SearchField
            t={t}
            value={query}
            label={t("account.users.searchLabel")}
            placeholder={t("account.users.searchPlaceholder")}
            onChange={setQuery}
          />
          <FilterSelect
            label={t("account.users.filterLabel")}
            value={filter}
            all={t("account.users.filters.all")}
            options={[...filters]}
            labelOf={(f) => t(`account.users.filters.${f as (typeof filters)[number]}`)}
            onChange={setFilter}
          />
          {accounts && <ListCount>{t("account.users.count", { count: shown.length })}</ListCount>}
        </ListToolbar>

        <div className={underToolbar}>
          {accounts === null ? (
            <p role="status" className="text-sm text-ink-muted">
              {t("account.loading")}
            </p>
          ) : shown.length === 0 ? (
            <EmptyState icon={<SearchX />} title={t("lists.noResults.title")} body={t("lists.noResults.body")}>
              {(query || filter !== "all") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  {t("lists.clearFilters")}
                </Button>
              )}
            </EmptyState>
          ) : view === "cards" ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => show(account)}
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
                      {chips(account)}
                      <span>{t("account.users.since", { date: date(account.created_at) })}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-sunken text-xs text-ink-subtle">
                  <tr>
                    <SortHeader
                      label={t("account.users.columns.name")}
                      column="name"
                      sort={sort}
                      natural={false}
                      onSort={setSort}
                      className="pl-4"
                    />
                    <th scope="col" className="hidden px-3 font-medium sm:table-cell">
                      {t("account.users.columns.roles")}
                    </th>
                    <SortHeader
                      label={t("account.users.columns.since")}
                      column="joined"
                      sort={sort}
                      natural
                      onSort={setSort}
                      className="hidden md:table-cell"
                    />
                    <th scope="col" className="px-3">
                      <span className="sr-only">{t("account.users.manage")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((account) => (
                    <tr key={account.id} className="transition-colors duration-(--ia-motion-fast) hover:bg-action-soft">
                      <td className="py-3 pr-3 pl-4">
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
                      <td className="hidden px-3 py-3 sm:table-cell">
                        <span className="flex flex-wrap gap-1.5">
                          {chips(account)}
                          {rolesOf(account).length === 0 && !account.disabled && !isSystem(account) && (
                            <span className="text-ink-subtle">{t("account.roles.client")}</span>
                          )}
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 whitespace-nowrap text-ink-muted tabular-nums md:table-cell">
                        {date(account.created_at)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("account.users.manageName", { name: nameOf(account) })}
                          onClick={() => show(account)}
                        >
                          {t("account.users.manage")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {opened && (
          <Sheet
            open
            onClose={() => void close()}
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
                    <p
                      role={notice === "done" ? "status" : "alert"}
                      className={cn("text-sm", notice === "done" ? "text-ink-muted" : "text-danger")}
                    >
                      {t(`account.users.${notice}`)}
                    </p>
                  )}
                </div>
              ) : undefined
            }
          >
            <Manage
              translator={translator}
              account={opened}
              own={opened.id === me}
              busy={busy}
              roles={draft}
              unsaved={unsaved}
              onToggle={(role) =>
                setDraft((now) => {
                  const next = new Set(now);
                  if (next.has(role)) next.delete(role);
                  else next.add(role);
                  return next;
                })
              }
              onRoles={() => saveRoles(opened, [...draft])}
              onAccess={(disabled) => void setAccess(opened, disabled)}
              onRevoke={() => void revoke(opened)}
              onRecover={() => recover(opened)}
            />
          </Sheet>
        )}
        {asking.dialog}
      </section>
    </TooltipProvider>
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
  roles,
  unsaved,
  onToggle,
  onRoles,
  onAccess,
  onRevoke,
  onRecover,
}: {
  translator: AccountTranslator;
  account: AdminAccount;
  own: boolean;
  busy: boolean;
  roles: Set<Role>;
  unsaved: boolean;
  onToggle: (role: Role) => void;
  onRoles: () => void;
  onAccess: (disabled: boolean) => void;
  onRevoke: () => void;
  onRecover: () => void;
}) {
  const { t, date } = translator;
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
              onChange={() => onToggle(role)}
            />
            <span className="grid gap-0.5">
              {t(`account.roles.${role}`)}
              <span className="text-xs text-ink-muted">{t(`account.users.roleHints.${role}`)}</span>
            </span>
          </label>
        ))}
        <Button size="sm" className="justify-self-start" disabled={busy || !unsaved} onClick={onRoles}>
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
