import { useEffect, useState } from "react";
import { BookOpen, Type, UserCog } from "lucide-react";
import type { ArticlePublic, AuditOut } from "@idea-agro/api-client";
import { cn } from "@/lib/utils";
import type { AccountKey, AccountTranslator } from "./i18n";

type Props = { translator: AccountTranslator; signInPath: string };
type Kind = "accounts" | "texts" | "articles";
type Filter = "all" | Kind;
const filters: Filter[] = ["all", "accounts", "texts", "articles"];
const icons = { accounts: UserCog, texts: Type, articles: BookOpen };

const kindOf = (action: AuditOut["action"]): Kind =>
  action.startsWith("text_")
    ? "texts"
    : action.startsWith("article") || action === "citations_changed"
      ? "articles"
      : "accounts";

const DAY = 86_400_000;
const startOfDay = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();

/** How an article is cited in a sentence: its first author's surname and its year. */
const cite = (article: ArticlePublic) => {
  const several = article.authors.includes("&") || article.authors.includes("et al.");
  return `${article.authors.split(",")[0]}${several ? " et al." : ""} ${article.year}`;
};

/** The stretch of time an entry falls in, from today back: today, yesterday, this week, this month, then by month. */
function periodOf(at: Date, now: Date): { key: string; label?: AccountKey; month?: Date } {
  const today = startOfDay(now);
  const day = startOfDay(at);
  // Weeks start on Monday.
  const weekStart = today - ((now.getDay() + 6) % 7) * DAY;
  if (day >= today) return { key: "today", label: "account.audit.periods.today" };
  if (day >= today - DAY) return { key: "yesterday", label: "account.audit.periods.yesterday" };
  if (day >= weekStart) return { key: "week", label: "account.audit.periods.week" };
  if (at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth())
    return { key: "month", label: "account.audit.periods.month" };
  return { key: `${at.getFullYear()}-${at.getMonth()}`, month: new Date(at.getFullYear(), at.getMonth(), 1) };
}

/** For admins: what admins and editors did, newest first, along a timeline grouped by when. */
export default function Audit({ translator, signInPath }: Props) {
  const { t, moment, time, month, list } = translator;
  const [audit, setAudit] = useState<AuditOut[] | null | "failed">(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [actor, setActor] = useState("");
  // The articles' citations, to name them instead of by their ids; without them the ids show.
  const [articles, setArticles] = useState<Map<string, string>>(new Map());

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

  useEffect(() => {
    void import("@idea-agro/api-client")
      .then((client) => client.listArticles())
      .then(
        (response) =>
          response.status === 200 && setArticles(new Map(response.data.articles.map((a) => [a.id, cite(a)]))),
      )
      .catch(() => undefined);
  }, []);

  const entries = Array.isArray(audit) ? audit : [];
  const actors = [...new Set(entries.map((e) => e.actor_name))].sort(translator.collator.compare);
  const shown = entries.filter(
    (e) => (filter === "all" || kindOf(e.action) === filter) && (!actor || e.actor_name === actor),
  );
  const now = new Date();
  const groups: { key: string; title: string; entries: AuditOut[] }[] = [];
  for (const entry of shown) {
    const period = periodOf(new Date(entry.at), now);
    const title = period.label ? t(period.label) : month(period.month ?? new Date(entry.at));
    if (groups.at(-1)?.key !== period.key) groups.push({ key: period.key, title, entries: [] });
    groups.at(-1)?.entries.push(entry);
  }

  const target = (entry: AuditOut) => {
    if (entry.action === "citations_changed") {
      const key = `indicators.items.${entry.target}.name`;
      return translator.has(key) ? t(key as AccountKey) : entry.target;
    }
    if (entry.action.startsWith("article_")) return articles.get(entry.target) ?? entry.target;
    return entry.target_email || entry.target;
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
    if (entry.action === "article_saved" && entry.detail === "pdf") return t("account.audit.pdf");
    if (entry.action === "citations_changed") return parts.map((id) => articles.get(id) ?? id).join(" · ");
    return parts.join(", ");
  };
  // Within today and yesterday the hour says enough; further back, the date too.
  const when = (entry: AuditOut, period: string) =>
    period === "today" || period === "yesterday" ? time(entry.at) : moment(entry.at);
  const select = "h-11 rounded-sm border border-input bg-surface px-3 text-sm text-ink";

  return (
    <section aria-labelledby="audit-title" className="grid max-w-3xl gap-6 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="audit-title" className="text-xl font-medium text-ink">
          {t("account.subpages.audit")}
        </h2>
        {Array.isArray(audit) && (
          <p role="status" className="text-sm text-ink-muted">
            {t("account.audit.count", { count: shown.length })}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label={t("account.audit.filterLabel")}
          className="flex rounded-sm border border-line p-0.5"
        >
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "h-9 rounded-xs px-3 text-sm whitespace-nowrap transition-colors duration-(--ia-motion-fast)",
                filter === f ? "bg-surface-selected font-medium text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              {t(`account.audit.filters.${f}`)}
            </button>
          ))}
        </div>
        <select
          className={select}
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          aria-label={t("account.audit.actorLabel")}
        >
          <option value="">{t("account.audit.anyone")}</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {audit === null && <p className="text-sm text-ink-muted">{t("account.loading")}</p>}
      {audit === "failed" && <p className="text-sm text-danger">{t("account.audit.failed")}</p>}
      {Array.isArray(audit) && shown.length === 0 && (
        <p className="rounded-lg border border-dashed border-line p-6 text-sm text-ink-muted">
          {entries.length === 0 ? t("account.audit.empty") : t("account.audit.noMatch")}
        </p>
      )}
      {groups.map((group) => (
        <section key={group.key} aria-label={group.title} className="grid gap-3">
          <h3 className="text-xs font-medium tracking-wide text-ink-subtle uppercase">{group.title}</h3>
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
                    <p className="text-sm text-ink">
                      {t(`account.audit.actions.${entry.action}`, { actor: entry.actor_name, target: target(entry) })}
                    </p>
                    {more && <p className="text-sm text-ink-muted">{more}</p>}
                    <time dateTime={entry.at} className="text-xs text-ink-subtle">
                      {when(entry, group.key)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </section>
  );
}
