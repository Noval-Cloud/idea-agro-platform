import { useEffect, useState } from "react";
import { BookOpen, SearchX, Type, UserCog } from "lucide-react";
import type { ArticlePublic, AuditOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import { EmptyState } from "@/components/lists/EmptyState";
import { FilterSelect } from "@/components/lists/FilterSelect";
import { ListCount, ListToolbar, underToolbar } from "@/components/lists/ListToolbar";
import { useQueryState } from "@/components/lists/state";
import type { AccountKey, AccountTranslator } from "./i18n";
import { PageHeader } from "./PageHeader";
import { periodKey, periodOf } from "./periods";

type Props = { translator: AccountTranslator; signInPath: string };
const kinds = ["all", "accounts", "texts", "articles"] as const;
type Kind = Exclude<(typeof kinds)[number], "all">;
const icons = { accounts: UserCog, texts: Type, articles: BookOpen };

const kindOf = (action: AuditOut["action"]): Kind =>
  action.startsWith("text_")
    ? "texts"
    : action.startsWith("article") || action === "citations_changed"
      ? "articles"
      : "accounts";

/** For admins: what admins and editors did, newest first, along a timeline grouped by when. */
export default function Audit({ translator, signInPath }: Props) {
  const { t, moment, time, month, list } = translator;
  const [audit, setAudit] = useState<AuditOut[] | null | "failed">(null);
  const [kindValue, setKind] = useQueryState("kind", "all");
  const kind = kinds.find((k) => k === kindValue) ?? "all";
  const [actor, setActor] = useQueryState("by", "all");
  // How each article is cited, to name it instead of by its id; without the list the ids show.
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
  // An account without a name is the platform's own.
  const who = (name: string) => name || t("account.users.system");
  const actors = [...new Set(entries.map((e) => who(e.actor_name)))].sort(translator.collator.compare);
  const shown = entries.filter(
    (e) => (kind === "all" || kindOf(e.action) === kind) && (actor === "all" || who(e.actor_name) === actor),
  );
  const now = new Date();
  const groups: { key: string; title: string; recent: boolean; entries: AuditOut[] }[] = [];
  for (const entry of shown) {
    const period = periodOf(new Date(entry.at), now);
    const key = periodKey(period);
    if (groups.at(-1)?.key !== key)
      groups.push({
        key,
        title:
          period.kind === "older"
            ? month(new Date(period.year, period.month, 1))
            : t(`account.audit.periods.${period.kind}`),
        // Within today and yesterday the hour says enough; further back, the date too.
        recent: period.kind === "today" || period.kind === "yesterday",
        entries: [],
      });
    groups.at(-1)?.entries.push(entry);
  }

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
    if (entry.action === "article_saved" && entry.detail === "pdf") return t("account.audit.pdf");
    if (entry.action === "citations_changed") return list(parts.map((id) => articles.get(id) ?? id));
    return list(parts);
  };

  return (
    <section aria-labelledby="audit-title" className="grid max-w-(--ia-layout-page) gap-4">
      <PageHeader id="audit-title" title={t("account.subpages.audit")} />
      <ListToolbar end={null}>
        <Segmented value={kind} onValueChange={setKind} aria-label={t("account.audit.filterLabel")}>
          {kinds.map((k) => (
            <SegmentedItem key={k} value={k}>
              {t(`account.audit.filters.${k}`)}
            </SegmentedItem>
          ))}
        </Segmented>
        <FilterSelect
          label={t("account.audit.actorLabel")}
          value={actor}
          all={t("account.audit.anyone")}
          options={actors}
          onChange={setActor}
        />
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
            title={entries.length === 0 ? t("account.audit.empty") : t("lists.noResults.title")}
          >
            {entries.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setKind("all");
                  setActor("all");
                }}
              >
                {t("lists.clearFilters")}
              </Button>
            )}
          </EmptyState>
        )}
        {groups.map((group) => (
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
                      <p className="text-sm text-ink">
                        {t(`account.audit.actions.${entry.action}`, {
                          actor: who(entry.actor_name),
                          target: target(entry),
                        })}
                      </p>
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
  );
}
