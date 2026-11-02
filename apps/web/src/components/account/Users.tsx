import { useEffect, useRef, useState } from "react";
import { ChevronRight, SearchX } from "lucide-react";
import type { AccountRole, AdminAccount } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Sheet } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AppliedFilters,
  FiltersToggle,
  toggleId,
  useFiltersShown,
  type Applied,
} from "@/components/lists/AppliedFilters";
import { EmptyState } from "@/components/lists/EmptyState";
import { matches, rowText } from "@/components/lists/filter";
import { ListCount, ListToolbar, underToolbar } from "@/components/lists/ListToolbar";
import { MultiFilter, chosenLabels, type ChoiceSection } from "@/components/lists/MultiFilter";
import { SearchField } from "@/components/lists/SearchField";
import { SortHeader, decodeSort, encodeSort, sortRows, type Sort } from "@/components/lists/Sorting";
import { ViewToggle, useListView } from "@/components/lists/ViewToggle";
import { useQueryList, useQueryState } from "@/components/lists/state";
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
const roleChoices = ["admin", "editor", "client"] as const;
const statusChoices = ["active", "disabled"] as const;
const kindChoices = ["people", "system"] as const;
// Search covers every field but these: ids and pictures mean nothing to read, and roles go in as the row words them.
const unsearched = ["id", "picture", "roles"];
const keys = ["name", "joined"] as const;
type Key = (typeof keys)[number];

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
// People sign in with an email; an account without one is the platform's own, such as the tests'.
const isSystem = (account: AdminAccount) => !account.email;
const kindOf = (account: AdminAccount) => (isSystem(account) ? "system" : "people");
const statusOf = (account: AdminAccount) => (account.disabled ? "disabled" : "active");
/** The choices in the address that the filter knows, so a stale link narrows nothing by mistake. */
const known = <T extends string>(values: string[], choices: readonly T[]) =>
  values.filter((v): v is T => (choices as readonly string[]).includes(v));

/** For admins: find accounts, and change their roles and access in a side panel. */
export default function Users({ translator, signInPath, me }: Props) {
  const { t, date, collator, list } = translator;
  const [query, setQuery] = useQueryState("q", "");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  // The API lists the newest accounts; a search also asks it for older ones, by the start of a name or email.
  const [older, setOlder] = useState<AdminAccount[]>([]);
  const [roleValues, setRoles] = useQueryList("role");
  const [statusValues, setStatuses] = useQueryList("status");
  const [kindValues, setKinds] = useQueryList("account", ["people"]);
  const roles = known(roleValues, roleChoices);
  const statuses = known(statusValues, statusChoices);
  const kinds = known(kindValues, kindChoices);
  const [filtersShown, showFilters] = useFiltersShown("users");
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
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listAccounts(undefined, init)))
      .then((response) => live && setAccounts(response.status === 200 ? response.data : []))
      .catch(() => live && setAccounts([]));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    const text = query.trim();
    const timer = setTimeout(() => {
      if (!text) return setOlder([]);
      void api()
        .then(([{ privately }, client]) => privately((init) => client.listAccounts({ q: text }, init)))
        .then((response) => live && response.status === 200 && setOlder(response.data))
        .catch(() => undefined);
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
        setOlder((all) => all.map((a) => (a.id === changed.id ? changed : a)));
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

  const loaded = accounts ?? [];
  const everyone = [...loaded, ...older.filter((a) => !loaded.some((b) => b.id === a.id))];
  // What a row shows, and so what search finds: its fields, and its roles, status and date in words.
  const words = (a: AdminAccount) => [
    rowText(a, unsearched),
    ...(rolesOf(a).length || isSystem(a) ? rolesOf(a) : (["client"] as const)).map((role) =>
      t(`account.roles.${role}`),
    ),
    t(`account.users.statuses.${statusOf(a)}`),
    isSystem(a) ? t("account.users.system") : "",
    date(a.created_at),
  ];
  const shown = sortRows(
    everyone.filter(
      (a) =>
        (kinds.length === 0 || kinds.includes(kindOf(a))) &&
        (roles.length === 0 ||
          roles.some((role) =>
            role === "client" ? rolesOf(a).length === 0 : a.roles.includes(role as AccountRole),
          )) &&
        (statuses.length === 0 || statuses.includes(statusOf(a))) &&
        matches(query, ...words(a)),
    ),
    sort,
    (a, key) => (key === "name" ? nameOf(a) : new Date(a.created_at).getTime()),
    collator,
  );
  const sections = {
    role: [{ choices: roleChoices.map((value) => ({ value, label: t(`account.roles.${value}`) })) }],
    status: [{ choices: statusChoices.map((value) => ({ value, label: t(`account.users.statuses.${value}`) })) }],
    account: [{ choices: kindChoices.map((value) => ({ value, label: t(`account.users.kinds.${value}`) })) }],
  } satisfies Record<string, ChoiceSection[]>;
  // Only people show unless asked otherwise, so that choice is the starting point, not a filter.
  const peopleOnly = kinds.length === 1 && kinds[0] === "people";
  const clearFilters = () => {
    setRoles([]);
    setStatuses([]);
    setKinds(["people"]);
  };
  const applied: Applied[] = [];
  if (roles.length)
    applied.push({
      key: "role",
      label: t("account.users.filters.role"),
      value: list(chosenLabels(sections.role, roles)),
      onRemove: () => setRoles([]),
    });
  if (statuses.length)
    applied.push({
      key: "status",
      label: t("account.users.filters.status"),
      value: list(chosenLabels(sections.status, statuses)),
      onRemove: () => setStatuses([]),
    });
  if (!peopleOnly)
    applied.push({
      key: "account",
      label: t("account.users.filters.account"),
      // None ticked narrows nothing, as in every filter: all of them show.
      value: list(chosenLabels(sections.account, kinds.length ? kinds : [...kindChoices])),
      onRemove: () => setKinds(["people"]),
    });
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
      <section aria-labelledby="users-title" className="grid gap-4">
        <PageHeader id="users-title" title={t("account.subpages.users")} />
        <ListToolbar
          end={
            <>
              <FiltersToggle
                t={t}
                shown={filtersShown}
                controls="users-filters"
                onToggle={() => showFilters(!filtersShown)}
              />
              <ViewToggle t={t} view={view} onView={setView} />
            </>
          }
          filters={{
            id: "users-filters",
            shown: filtersShown,
            controls: (
              <>
                <MultiFilter
                  t={t}
                  label={t("account.users.filters.role")}
                  sections={sections.role}
                  selected={roles}
                  onChange={setRoles}
                />
                <MultiFilter
                  t={t}
                  label={t("account.users.filters.status")}
                  sections={sections.status}
                  selected={statuses}
                  onChange={setStatuses}
                />
                <MultiFilter
                  t={t}
                  label={t("account.users.filters.account")}
                  sections={sections.account}
                  selected={kinds}
                  onChange={setKinds}
                  fallback={["people"]}
                />
              </>
            ),
          }}
          applied={
            <AppliedFilters t={t} applied={applied} onClear={clearFilters} returnFocus={toggleId("users-filters")} />
          }
        >
          <SearchField t={t} value={query} label={t("account.users.searchLabel")} onChange={setQuery} />
          {accounts && <ListCount>{t("account.users.count", { count: shown.length })}</ListCount>}
        </ListToolbar>

        <div className={underToolbar}>
          {accounts === null ? (
            <p role="status" className="text-sm text-ink-muted">
              {t("account.loading")}
            </p>
          ) : shown.length === 0 ? (
            <EmptyState icon={<SearchX />} title={t("lists.noResults.title")} body={t("lists.noResults.body")}>
              {(query || applied.length > 0) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    clearFilters();
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
                      <span className="grid min-w-0 grow">
                        <span className="truncate text-sm font-medium text-ink">{nameOf(account)}</span>
                        {account.name && account.email && (
                          <span className="truncate text-xs text-ink-muted">{account.email}</span>
                        )}
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
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
                    <td aria-hidden="true" className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((account) => (
                    <tr
                      key={account.id}
                      className="relative transition-colors duration-(--ia-motion-fast) hover:bg-action-soft has-focus-visible:bg-action-soft"
                    >
                      <td className="py-3 pr-3 pl-4">
                        <span className="flex items-center gap-3">
                          <Avatar account={account} name={nameOf(account)} />
                          <span className="grid min-w-0">
                            {/* The whole row opens the account; the name is what a keyboard or reader reaches. */}
                            <button
                              type="button"
                              onClick={() => show(account)}
                              className="truncate text-left font-medium text-ink after:absolute after:inset-0"
                            >
                              {nameOf(account)}
                            </button>
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
                      <td className="py-3 pr-4">
                        <ChevronRight aria-hidden="true" className="ml-auto size-4 text-ink-subtle" />
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
