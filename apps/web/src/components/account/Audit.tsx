import { useEffect, useRef, useState } from "react";
import { BookOpen, Gauge, SearchX, Type, UserCog } from "lucide-react";
import type { AdminAccount, ArticlePublic, AuditOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AppliedFilters,
  FiltersToggle,
  toggleId,
  useFiltersShown,
  type Applied,
} from "@/components/lists/AppliedFilters";
import { DateFilter, dateLabel } from "@/components/lists/DateFilter";
import { EmptyState } from "@/components/lists/EmptyState";
import { matches } from "@/components/lists/filter";
import { ListCount, ListToolbar, underToolbar } from "@/components/lists/ListToolbar";
import { MultiFilter, chosenLabels, type ChoiceSection } from "@/components/lists/MultiFilter";
import { SearchField } from "@/components/lists/SearchField";
import { dateBounds, decodeDates, encodeDates } from "@/components/lists/dates";
import { useQueryList, useQueryState } from "@/components/lists/state";
import type { AccountKey, AccountTranslator } from "./i18n";
import { PageHeader } from "./PageHeader";
import { periodKey, periodOf } from "./periods";

type Props = { translator: AccountTranslator; signInPath: string };
const kinds = ["accounts", "indicators", "articles", "texts"] as const;
type Kind = (typeof kinds)[number];
const icons = { accounts: UserCog, indicators: Gauge, articles: BookOpen, texts: Type };
const groups = ["admin", "editor", "client"] as const;
type Group = (typeof groups)[number];
// "Made by" holds role groups and people side by side; a group's value says it is one.
const GROUP = "role:";

const kindOf = (action: AuditOut["action"]): Kind =>
  action.startsWith("text_")
    ? "texts"
    : action === "citations_changed"
      ? "indicators"
      : action.startsWith("article")
        ? "articles"
        : "accounts";

/** For admins: what admins and editors did, newest first, along a timeline grouped by when. */
export default function Audit({ translator, signInPath }: Props) {
  const { t, moment, time, month, list, day, collator } = translator;
  const [audit, setAudit] = useState<AuditOut[] | null | "failed">(null);
  const [query, setQuery] = useQueryState("q", "");
  const [by, setBy] = useQueryList("by");
  const [onValues, setOn] = useQueryList("on");
  const on = onValues.filter((k): k is Kind => (kinds as readonly string[]).includes(k));
  const [dateValue, setDateValue] = useQueryState("date", "");
  const dates = decodeDates(dateValue);
  const [filtersShown, showFilters] = useFiltersShown("audit");
  // How each article is cited, to name it instead of by its id; without the list the ids show.
  const [articles, setArticles] = useState<Map<string, string>>(new Map());
  // Every person named since the page opened, so one chosen stays named when the range or search leaves them out.
  const seen = useRef(new Map<string, string>());
  // "Made by" looks people up among every account, not only those in the log.
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<AdminAccount[]>([]);

  // An account without a name is the platform's own.
  const who = (entry: AuditOut) => entry.actor_name || t("account.users.system");

  // The API keeps the range, so its 200 latest actions are the range's.
  useEffect(() => {
    let live = true;
    const found = decodeDates(dateValue);
    const { since, until } = found ? dateBounds(found, new Date()) : {};
    void Promise.all([import("@/lib/account"), import("@idea-agro/api-client")])
      .then(([{ privately }, client]) =>
        privately((init) => client.listAudit({ since: since?.toISOString(), until: until?.toISOString() }, init)),
      )
      .then((response) => {
        if (!live) return;
        if (response.status !== 200) return setAudit("failed");
        for (const entry of response.data)
          if (!seen.current.has(entry.actor_id)) seen.current.set(entry.actor_id, who(entry));
        setAudit(response.data);
      })
      .catch(async (error: unknown) => {
        const { SignedOut } = await import("@/lib/account");
        if (error instanceof SignedOut) return location.assign(signInPath);
        if (live) setAudit("failed");
      });
    return () => {
      live = false;
    };
  }, [dateValue, signInPath]);

  useEffect(() => {
    let live = true;
    const text = lookup.trim();
    const timer = setTimeout(() => {
      if (!text) return setFound([]);
      void Promise.all([import("@/lib/account"), import("@idea-agro/api-client")])
        .then(([{ privately }, client]) => privately((init) => client.listAccounts({ q: text }, init)))
        .then((response) => {
          if (!live) return;
          if (response.status !== 200) return setFound([]);
          for (const a of response.data) seen.current.set(a.id, a.name || a.email || t("account.users.system"));
          setFound(response.data);
        })
        .catch(() => live && setFound([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [lookup]);

  useEffect(() => {
    const cite = (article: ArticlePublic) => {
      const values = { surname: article.authors.split(",")[0], year: article.year };
      const several = article.authors.includes("&") || article.authors.includes("et al.");
      return several ? t("account.audit.citeSeveral", values) : t("account.audit.citeOne", values);
    };
    void import("@idea-agro/api-client")
      .then((client) => client.listArticles())
      .then(
        (response) =>
          response.status === 200 && setArticles(new Map(response.data.articles.map((a) => [a.id, cite(a)]))),
      )
      .catch(() => undefined);
  }, []);

  const entries = Array.isArray(audit) ? audit : [];
  // By their roles now: a client is an account with no other role.
  const inGroup = (entry: AuditOut, group: Group) =>
    group === "client"
      ? entry.actor_roles.length > 0 && entry.actor_roles.every((r) => r === "client")
      : entry.actor_roles.includes(group);
  const nameOf = (id: string) => seen.current.get(id) ?? t("account.audit.someone");
  const chosenPeople = by.filter((value) => !value.startsWith(GROUP));
  // Without a search, whoever is chosen and whoever acted in the range; with one, the accounts it finds.
  const people = new Set(
    lookup.trim()
      ? [...found.map((a) => a.id), ...entries.filter((e) => matches(lookup, who(e))).map((e) => e.actor_id)]
      : [...chosenPeople, ...entries.map((e) => e.actor_id)],
  );
  const sections = {
    by: [
      {
        label: t("account.audit.groups.roles"),
        fixed: true,
        choices: groups.map((group) => ({ value: `${GROUP}${group}`, label: t(`account.audit.byRole.${group}`) })),
      },
      {
        label: t("account.audit.groups.people"),
        choices: [...people]
          .map((value) => ({ value, label: nameOf(value) }))
          .sort((a, b) => collator.compare(a.label, b.label)),
      },
    ],
    on: [{ choices: kinds.map((value) => ({ value, label: t(`account.audit.kinds.${value}`) })) }],
  } satisfies Record<string, ChoiceSection[]>;

  const target = (entry: AuditOut) => {
    if (entry.action === "citations_changed") {
      const key = `indicators.items.${entry.target}.name`;
      return translator.has(key) ? t(key as AccountKey) : entry.target;
    }
    if (entry.action.startsWith("article_")) return articles.get(entry.target) ?? entry.target;
    if (kindOf(entry.action) === "accounts") return entry.target_email || t("account.users.system");
    return entry.target;
  };
  const detail = (entry: AuditOut) => {
    const parts = entry.detail
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (entry.action === "roles_changed")
      return list(parts.map((role) => t(`account.roles.${role as "editor" | "admin"}`))) || t("account.audit.noRoles");
    if (entry.action.startsWith("text_"))
      return list(
        parts.map((l) => {
          const key = `account.content.languages.${l}`;
          return translator.has(key) ? t(key as AccountKey) : l;
        }),
      );
    if (entry.action === "articles_seeded")
      return t("account.audit.articleCount", { count: Number(entry.detail) || 0 });
    if (entry.action === "citations_changed") return list(parts.map((id) => articles.get(id) ?? id));
    return list(parts);
  };
  const sentence = (entry: AuditOut) =>
    t(`account.audit.actions.${entry.action}`, { actor: who(entry), target: target(entry) });

  const shown = entries.filter(
    (e) =>
      (by.length === 0 ||
        by.some((value) =>
          value.startsWith(GROUP) ? inGroup(e, value.slice(GROUP.length) as Group) : value === e.actor_id,
        )) &&
      (on.length === 0 || on.includes(kindOf(e.action))) &&
      matches(query, sentence(e), detail(e), moment(e.at)),
  );

  const applied: Applied[] = [];
  if (by.length)
    applied.push({
      key: "by",
      label: t("account.audit.filters.by"),
      value: list([...chosenLabels(sections.by.slice(0, 1), by), ...chosenPeople.map(nameOf)]),
      onRemove: () => setBy([]),
    });
  if (on.length)
    applied.push({
      key: "on",
      label: t("account.audit.filters.on"),
      value: list(chosenLabels(sections.on, on)),
      onRemove: () => setOn([]),
    });
  if (dates)
    applied.push({
      key: "date",
      label: t("lists.dates.label"),
      value: dateLabel(t, dates, day),
      onRemove: () => setDateValue(""),
    });
  const clearFilters = () => {
    setBy([]);
    setOn([]);
    setDateValue("");
  };

  const now = new Date();
  const timeline: { key: string; title: string; recent: boolean; entries: AuditOut[] }[] = [];
  for (const entry of shown) {
    const period = periodOf(new Date(entry.at), now);
    const key = periodKey(period);
    if (timeline.at(-1)?.key !== key)
      timeline.push({
        key,
        title:
          period.kind === "older"
            ? month(new Date(period.year, period.month, 1))
            : t(`account.audit.periods.${period.kind}`),
        // Within today and yesterday the hour says enough; further back, the date too.
        recent: period.kind === "today" || period.kind === "yesterday",
        entries: [],
      });
    timeline.at(-1)?.entries.push(entry);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <section aria-labelledby="audit-title" className="grid gap-4">
        <PageHeader id="audit-title" title={t("account.subpages.audit")} />
        <ListToolbar
          end={
            <FiltersToggle
              t={t}
              shown={filtersShown}
              controls="audit-filters"
              onToggle={() => showFilters(!filtersShown)}
            />
          }
          filters={{
            id: "audit-filters",
            shown: filtersShown,
            controls: (
              <>
                <MultiFilter
                  t={t}
                  label={t("account.audit.filters.by")}
                  sections={sections.by}
                  selected={by}
                  onChange={setBy}
                  searchable
                  searchLabel={t("account.audit.searchPeople")}
                  onSearch={setLookup}
                />
                <MultiFilter
                  t={t}
                  label={t("account.audit.filters.on")}
                  sections={sections.on}
                  selected={on}
                  onChange={setOn}
                />
                <DateFilter t={t} value={dates} onChange={(value) => setDateValue(encodeDates(value))} />
              </>
            ),
          }}
          applied={
            <AppliedFilters t={t} applied={applied} onClear={clearFilters} returnFocus={toggleId("audit-filters")} />
          }
        >
          <SearchField t={t} value={query} label={t("account.audit.searchLabel")} onChange={setQuery} />
          {Array.isArray(audit) && <ListCount>{t("account.audit.count", { count: shown.length })}</ListCount>}
        </ListToolbar>

        <div className={`grid max-w-3xl gap-6 ${underToolbar}`}>
          {audit === null && (
            <p role="status" className="text-sm text-ink-muted">
              {t("account.loading")}
            </p>
          )}
          {audit === "failed" && (
            <p role="alert" className="text-sm text-danger">
              {t("account.audit.failed")}
            </p>
          )}
          {Array.isArray(audit) && shown.length === 0 && (
            <EmptyState
              icon={<SearchX />}
              title={entries.length === 0 && !dates ? t("account.audit.empty") : t("lists.noResults.title")}
            >
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
          )}
          {timeline.map((group) => (
            <section key={group.key} aria-labelledby={`period-${group.key}`} className="grid gap-3">
              <h3 id={`period-${group.key}`} className="text-xs font-medium tracking-wide text-ink-subtle uppercase">
                {group.title}
              </h3>
              <ol className="relative grid gap-5 before:absolute before:top-2 before:bottom-2 before:left-3.75 before:w-px before:bg-line">
                {group.entries.map((entry, index) => {
                  const Icon = icons[kindOf(entry.action)];
                  const more = detail(entry);
                  return (
                    <li key={`${entry.at}-${index}`} className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                      <span className="z-1 grid size-8 place-items-center rounded-full border border-line bg-surface text-ink-muted">
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                      <div className="grid gap-0.5 pt-1">
                        <p className="text-sm text-ink">{sentence(entry)}</p>
                        {more && <p className="text-sm text-ink-muted">{more}</p>}
                        <time dateTime={entry.at} className="text-xs text-ink-subtle">
                          {group.recent ? time(entry.at) : moment(entry.at)}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </section>
    </TooltipProvider>
  );
}
