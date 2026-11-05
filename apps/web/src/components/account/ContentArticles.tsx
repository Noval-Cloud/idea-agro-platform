import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, ChevronRight, Plus, SearchX, X } from "lucide-react";
import type { ArticleIn, ArticleOut, ArticlePublic, PublishedArticles } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/lists/EmptyState";
import { FilterSelect } from "@/components/lists/FilterSelect";
import { ListCount, ListToolbar, underToolbar } from "@/components/lists/ListToolbar";
import { SearchField } from "@/components/lists/SearchField";
import { Tick } from "@/components/lists/Tick";
import { matches } from "@/components/lists/filter";
import { useQueryState } from "@/components/lists/state";
import { indicatorIds, type IndicatorId } from "@/data/indicators";
import { cn } from "@/lib/utils";
import type { AccountKey, AccountTranslator } from "./i18n";
import { useLeaveGuard } from "./TextEditor";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
type Client = Awaited<ReturnType<typeof api>>[1];
type Props = { translator: AccountTranslator; onChanged: () => void; changed: number };
const empty: ArticleIn = { authors: "", year: new Date().getFullYear(), title: "", lang: "en", source: "" };
const flags = ["framework", "uncited"] as const;

/** One private call; an answer other than `ok` statuses is an error. */
async function call<T>(run: (client: Client, init: RequestInit) => Promise<{ status: number; data: unknown }>) {
  const [{ privately }, client] = await api();
  const response = await privately((init) => run(client, init));
  if (response.status >= 300) throw new Error(String(response.status));
  return response.data as T;
}

/** The published articles and citations, loaded again after every change. */
export function usePublished(changed: number) {
  const [published, setPublished] = useState<PublishedArticles | null | "failed">(null);
  useEffect(() => {
    let live = true;
    void import("@idea-agro/api-client")
      // The public list is cacheable; an editor needs what was just saved.
      .then((client) => client.listArticles({ cache: "no-store" }))
      .then((response) => live && setPublished(response.status === 200 ? response.data : "failed"))
      .catch(() => live && setPublished("failed"));
    return () => {
      live = false;
    };
  }, [changed]);
  return published;
}

/** Whether an article has what was typed: in its title, authors, source or year. */
const found = (article: ArticlePublic, query: string) =>
  matches(query, article.title, article.authors, article.source, String(article.year));

/**
 * For editors: the scientific articles behind the indicators, found by a search and a few filters, each opened
 * in a side panel. Which indicator cites which is chosen on the indicator's page.
 */
export function Articles({ translator, onChanged, changed }: Props) {
  const { t, list } = translator;
  const published = usePublished(changed);
  // An article's id, or "new" for one being added; `session` gives each opening a fresh panel.
  const [open, setOpen] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const [query, setQuery] = useQueryState("q", "");
  const [citedBy, setCitedBy] = useQueryState("indicator", "all");
  const [flagsValue, setFlags] = useQueryState("only", "");
  const on = flags.filter((f) => flagsValue.split(",").includes(f));
  const [seeding, setSeeding] = useState<"idle" | "busy" | "failed">("idle");
  const toast = useToast();

  if (published === null)
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("account.loading")}
      </p>
    );
  if (published === "failed")
    return (
      <p role="alert" className="text-sm text-danger">
        {t("account.content.listFailed")}
      </p>
    );

  const name = (id: IndicatorId) => t(`indicators.items.${id}.name` as AccountKey);
  const citing = (article: string) => indicatorIds.filter((i) => (published.citations[i] ?? []).includes(article));
  const shown = published.articles.filter(
    (a) =>
      found(a, query) &&
      (!on.includes("framework") || a.framework) &&
      (!on.includes("uncited") || citing(a.id).length === 0) &&
      (citedBy === "all" || citing(a.id).includes(citedBy as IndicatorId)),
  );
  const openPanel = (id: string) => {
    setSession((n) => n + 1);
    setOpen(id);
  };
  const seed = async () => {
    setSeeding("busy");
    try {
      await call((client, init) => client.seedArticles(init));
      setSeeding("idle");
      onChanged();
    } catch {
      setSeeding("failed");
    }
  };
  const panel = open && (
    <ArticlePanel
      key={session}
      id={open === "new" ? null : open}
      citedBy={open === "new" ? [] : citing(open).map(name)}
      translator={translator}
      onDone={(done, removed) => {
        setOpen(null);
        onChanged();
        toast(t(done));
        // A removed article takes its row with it: focus goes to the search.
        if (removed) requestAnimationFrame(() => document.getElementById("list-search")?.focus());
      }}
      onClose={() => setOpen(null)}
    />
  );
  const add = (
    <Button size="sm" onClick={() => openPanel("new")}>
      <Plus aria-hidden="true" />
      {t("account.content.articles.add")}
    </Button>
  );

  if (published.articles.length === 0)
    return (
      <>
        <EmptyState icon={<BookOpen />} title={t("account.content.articles.none")}>
          <Button size="sm" busy={seeding === "busy"} onClick={() => void seed()}>
            {t("account.content.articles.seed")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => openPanel("new")}>
            <Plus aria-hidden="true" />
            {t("account.content.articles.add")}
          </Button>
        </EmptyState>
        {seeding === "failed" && (
          <p role="alert" className="text-sm text-danger">
            {t("account.content.saveFailed")}
          </p>
        )}
        {panel}
      </>
    );

  return (
    <div className="grid gap-4">
      <ListToolbar end={add}>
        <SearchField t={t} value={query} label={t("account.content.articles.searchLabel")} onChange={setQuery} />
        <FilterSelect
          label={t("account.content.articles.citedByLabel")}
          value={citedBy}
          all={t("account.content.articles.anyIndicator")}
          options={[...indicatorIds]}
          labelOf={(id) => name(id as IndicatorId)}
          onChange={setCitedBy}
        />
        <div role="group" aria-label={t("account.content.articles.filtersLabel")} className="flex flex-wrap gap-2">
          {flags.map((flag) => {
            const pressed = on.includes(flag);
            return (
              <button
                key={flag}
                type="button"
                aria-pressed={pressed}
                onClick={() => setFlags((pressed ? on.filter((f) => f !== flag) : [...on, flag]).join(","))}
                className={cn(
                  "h-9 rounded-sm border px-3 text-sm transition-colors duration-(--ia-motion-fast)",
                  pressed
                    ? "border-ink-subtle bg-action-soft text-ink"
                    : "border-input text-ink-muted hover:border-ink-subtle hover:text-ink",
                )}
              >
                {t(`account.content.articles.flags.${flag}`)}
              </button>
            );
          })}
        </div>
        <ListCount>
          {shown.length === published.articles.length
            ? t("account.content.articles.count", { count: shown.length })
            : t("lists.showing", { shown: shown.length, total: published.articles.length })}
        </ListCount>
      </ListToolbar>
      <div className={underToolbar}>
        {shown.length === 0 ? (
          <EmptyState icon={<SearchX />} title={t("lists.noResults.title")} body={t("lists.noResults.body")}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setQuery("");
                setCitedBy("all");
                setFlags("");
              }}
            >
              {t("lists.clearFilters")}
            </Button>
          </EmptyState>
        ) : (
          <ul className="grid divide-y divide-line rounded-lg border border-line bg-surface">
            {shown.map((article) => {
              const by = citing(article.id);
              return (
                <li key={article.id}>
                  <button
                    type="button"
                    onClick={() => openPanel(article.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--ia-motion-fast) hover:bg-action-soft"
                  >
                    <span className="grid min-w-0 grow gap-1">
                      <span lang={article.lang} className="line-clamp-2 text-sm text-ink">
                        {article.title}
                      </span>
                      <span className="line-clamp-1 text-xs text-ink-subtle">
                        {t("account.content.articles.meta", {
                          authors: article.authors,
                          year: article.year,
                          source: article.source,
                        })}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        {article.framework && <Chip>{t("account.content.articles.flags.framework")}</Chip>}
                        <span>
                          {by.length > 0
                            ? t("account.content.articles.citedBy", { names: list(by.map(name)) })
                            : t("account.content.articles.citedByNone")}
                        </span>
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {panel}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-surface-muted px-2 py-0.5 text-2xs font-medium text-ink">
      {children}
    </span>
  );
}

const fromArticle = (found: ArticleOut): ArticleIn => ({
  authors: found.authors,
  year: found.year,
  title: found.title,
  lang: found.lang,
  source: found.source,
  doi: found.doi ?? null,
  url: found.url ?? null,
  framework: found.framework,
});

/**
 * One article in a side panel: its data and its removal, each closing the panel once done. `id` is null for one
 * being added.
 */
function ArticlePanel({
  id,
  citedBy,
  translator,
  onDone,
  onClose,
}: {
  id: string | null;
  citedBy: string[];
  translator: AccountTranslator;
  /** What was done, to confirm it, and whether the article is gone. */
  onDone: (done: AccountKey, removed: boolean) => void;
  onClose: () => void;
}) {
  const { t, moment, list } = translator;
  const [article, setArticle] = useState<ArticleOut | null>(null);
  const [form, setForm] = useState<ArticleIn | null>(id ? null : empty);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [failed, setFailed] = useState<AccountKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const leave = useConfirm(t("account.content.keepEditing"));

  useEffect(() => {
    if (!id) return;
    void call<ArticleOut>((client, init) => client.getArticle(id, init))
      .then((found) => {
        setArticle(found);
        setForm(fromArticle(found));
      })
      .catch(() => setFailed("account.content.failed"));
  }, [id]);

  const set = (patch: Partial<ArticleIn>) => form && setForm({ ...form, ...patch });
  const clean = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
  const body: ArticleIn | null = form && {
    ...form,
    authors: form.authors.trim(),
    title: form.title.trim(),
    source: form.source.trim(),
    doi: clean(form.doi),
    url: clean(form.url),
  };
  const valid =
    body !== null &&
    body.authors !== "" &&
    body.title !== "" &&
    Number.isInteger(body.year) &&
    body.year >= 1800 &&
    body.year <= 2100 &&
    /^[a-z]{2,3}(-[A-Z]{2})?$/.test(body.lang) &&
    (!body.doi || /^10\.\d{4,9}\/\S+$/.test(body.doi)) &&
    (!body.url || /^https?:\/\/\S+$/.test(body.url));
  const dirty = form !== null && JSON.stringify(form) !== JSON.stringify(article ? fromArticle(article) : empty);
  useLeaveGuard(dirty);

  const close = async () => {
    if (dirty) {
      const discard = await leave.ask({
        title: t("account.content.leaveTitle"),
        body: t("account.content.leaveBody"),
        confirm: t("account.content.leave"),
      });
      if (!discard) return;
    }
    onClose();
  };
  const act = async (action: "save" | "remove", run: () => Promise<unknown>, done: AccountKey) => {
    setBusy(action);
    setFailed(null);
    try {
      await run();
    } catch {
      setBusy(null);
      return setFailed("account.content.saveFailed");
    }
    onDone(done, action === "remove");
  };
  const save = () =>
    body &&
    (id
      ? act(
          "save",
          () => call<ArticleOut>((client, init) => client.putArticle(id, body, init)),
          "account.content.articles.saved",
        )
      : act(
          "save",
          () => call<ArticleOut>((client, init) => client.addArticle(body, init)),
          "account.content.articles.added",
        ));
  const remove = () =>
    act(
      "remove",
      () => call((client, init) => client.deleteArticle(id ?? "", init)),
      "account.content.articles.removed",
    );

  // The API's own limits, so a long value is caught while typing.
  const lengths = { authors: 500, title: 500, source: 300, doi: 200, url: 500 };
  const field = (name: "authors" | "title" | "source" | "doi" | "url", key: AccountKey, hint?: AccountKey) => (
    <label className="grid content-start gap-1 text-sm text-ink">
      {t(key)}
      {name === "title" ? (
        <textarea
          rows={2}
          value={form?.title ?? ""}
          maxLength={lengths.title}
          onChange={(event) => set({ title: event.target.value })}
          className="w-full min-w-0 rounded-sm border border-input bg-surface px-3 py-2 text-base text-ink transition-colors duration-(--ia-motion-fast) hover:border-ink-subtle focus-visible:border-focus"
        />
      ) : (
        <Input
          value={form?.[name] ?? ""}
          maxLength={lengths[name]}
          autoComplete="off"
          spellCheck={name === "source"}
          onChange={(event) => set({ [name]: event.target.value })}
        />
      )}
      {hint && <span className="text-xs text-ink-subtle">{t(hint)}</span>}
    </label>
  );

  const footer = form && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <p role="status" className="mr-auto min-w-0 text-sm text-danger">
        {failed ? t(failed) : ""}
      </p>
      {id && (
        <Button
          variant="ghost"
          className="text-danger"
          busy={busy === "remove"}
          disabled={busy !== null}
          onClick={() => setConfirming(true)}
        >
          {t("account.content.articles.remove")}
        </Button>
      )}
      <Button
        busy={busy === "save"}
        disabled={busy !== null || !valid || (id !== null && !dirty)}
        onClick={() => void save()}
      >
        {id ? t("account.content.articles.save") : t("account.content.articles.create")}
      </Button>
    </div>
  );

  return (
    <Sheet
      open
      onClose={() => void close()}
      busy={busy !== null}
      title={id ? t("account.content.articles.editTitle") : t("account.content.articles.add")}
      description={
        id
          ? citedBy.length > 0
            ? t("account.content.articles.citedBy", { names: list(citedBy) })
            : t("account.content.articles.citedByNone")
          : undefined
      }
      close={t("account.content.close")}
      footer={footer}
    >
      {!form ? (
        <p className={cn("text-sm", failed ? "text-danger" : "text-ink-muted")}>
          {failed ? t(failed) : t("account.loading")}
        </p>
      ) : (
        <div className="grid gap-5">
          {article?.updated_by && (
            <p className="text-xs text-ink-muted">
              {t("account.content.publishedBy", {
                name: article.updated_by.name,
                at: article.updated_at ? moment(article.updated_at) : "",
              })}
            </p>
          )}
          {field("title", "account.content.articles.title", "account.content.articles.titleHint")}
          {field("authors", "account.content.articles.authors", "account.content.articles.authorsHint")}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid content-start gap-1 text-sm text-ink">
              {t("account.content.articles.year")}
              <Input
                type="number"
                inputMode="numeric"
                min={1800}
                max={2100}
                value={form.year}
                onChange={(event) => set({ year: Number(event.target.value) })}
              />
            </label>
            <label className="grid content-start gap-1 text-sm text-ink">
              {t("account.content.articles.lang")}
              <Input
                value={form.lang}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => set({ lang: event.target.value.trim() })}
              />
              <span className="text-xs text-ink-subtle">{t("account.content.articles.langHint")}</span>
            </label>
          </div>
          {field("source", "account.content.articles.source", "account.content.articles.sourceHint")}
          {field("doi", "account.content.articles.doi", "account.content.articles.doiHint")}
          {field("url", "account.content.articles.url", "account.content.articles.urlHint")}
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={form.framework ?? false}
              onChange={(event) => set({ framework: event.target.checked })}
            />
            <span className="grid gap-0.5">
              {t("account.content.articles.frameworkLabel")}
              <span className="text-xs text-ink-subtle">{t("account.content.articles.frameworkHint")}</span>
            </span>
          </label>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={t("account.content.articles.removeTitle")}
        body={t("account.content.articles.removeBody")}
        confirm={t("account.content.articles.remove")}
        cancel={t("account.content.cancel")}
        onConfirm={() => {
          setConfirming(false);
          void remove();
        }}
        onCancel={() => setConfirming(false)}
      />
      {leave.dialog}
    </Sheet>
  );
}

/**
 * For editors: the articles an indicator cites, in the order the site lists them. Every change is published at
 * once; a removal can be undone.
 */
export function IndicatorArticles({
  translator,
  onChanged,
  indicator,
  published,
}: {
  translator: AccountTranslator;
  onChanged: () => void;
  indicator: IndicatorId;
  published: ReturnType<typeof usePublished>;
}) {
  const { t } = translator;
  const toast = useToast();
  const [chosen, setChosen] = useState<string[] | null>(null);
  // The change on its way: `pick`, `undo`, or a button and its article, such as `up:<id>`.
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // A failure, or the last removal with what Undo brings back.
  const [notice, setNotice] = useState<{ text: string; undo?: string[] } | null>(null);

  // The list follows what is published, except while a change is on its way.
  useEffect(() => {
    if (published && published !== "failed" && busy === null) setChosen(published.citations[indicator] ?? []);
  }, [published, indicator]);

  if (published === null || chosen === null) return <p className="text-sm text-ink-muted">{t("account.loading")}</p>;
  if (published === "failed") return <p className="text-sm text-danger">{t("account.content.listFailed")}</p>;

  const byId = new Map<string, ArticlePublic>(published.articles.map((a) => [a.id, a]));
  /** Saves the list; the list's own buttons show it at once, and go back if it fails. */
  const save = async (next: string[], action: string, early = true) => {
    const before = chosen;
    if (early) setChosen(next);
    setBusy(action);
    try {
      await call((client, init) => client.citeArticles(indicator, { articles: next }, init));
      setChosen(next);
      onChanged();
      return true;
    } catch {
      setChosen(before);
      return false;
    } finally {
      setBusy(null);
    }
  };
  const failed = () => setNotice({ text: t("account.content.saveFailed") });
  const move = async (articleId: string, index: number, by: number) => {
    const next = [...chosen];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    if (!(await save(next, `${by < 0 ? "up" : "down"}:${articleId}`))) return failed();
    setNotice(null);
    toast(t("account.content.citations.moved"));
  };
  const remove = async (articleId: string, title: string) => {
    const before = chosen;
    const next = chosen.filter((c) => c !== articleId);
    if (!(await save(next, `remove:${articleId}`))) return failed();
    setNotice({ text: t("account.content.citations.removed", { title }), undo: before });
    // A removal takes the focused button with it: focus goes to its undo.
    requestAnimationFrame(() => document.getElementById("citation-undo")?.focus());
  };
  const undo = async (articles: string[]) => {
    if (!(await save(articles, "undo"))) return failed();
    setNotice(null);
    toast(t("account.content.citations.restored"));
    // The undo goes with its line: focus waits on the button that adds articles.
    requestAnimationFrame(() => document.getElementById("citations-add")?.focus());
  };
  const pick = async (ids: string[]) => {
    // The picker stays open until they are saved, so the list behind changes only then.
    if (!(await save([...chosen, ...ids], "pick", false))) return false;
    setPicking(false);
    setNotice(null);
    toast(t("account.content.citations.added", { count: ids.length }));
    return true;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{t("account.content.citations.lead")}</p>
        <Button id="citations-add" disabled={busy !== null} onClick={() => setPicking(true)}>
          <Plus aria-hidden="true" />
          {t("account.content.citations.add")}
        </Button>
      </div>
      {chosen.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-sm text-ink-muted">
          {t("account.content.citations.none")}
        </p>
      ) : (
        <ol className="grid divide-y divide-line rounded-lg border border-line bg-surface">
          {chosen.map((articleId, index) => {
            const article = byId.get(articleId);
            const title = article?.title ?? articleId;
            return (
              <li key={articleId} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 pt-0.5 text-right text-xs text-ink-subtle tabular-nums"
                >
                  {index + 1}
                </span>
                <span className="grid min-w-0 grow gap-1">
                  <span lang={article?.lang} className="text-ink">
                    {title}
                  </span>
                  <span className="text-xs text-ink-subtle">
                    {article
                      ? t("account.content.articles.byline", { authors: article.authors, year: article.year })
                      : ""}
                  </span>
                </span>
                <span className="flex shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    busy={busy === `up:${articleId}`}
                    disabled={busy !== null || index === 0}
                    onClick={() => void move(articleId, index, -1)}
                    aria-label={t("account.content.citations.up", { title })}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    busy={busy === `down:${articleId}`}
                    disabled={busy !== null || index === chosen.length - 1}
                    onClick={() => void move(articleId, index, 1)}
                    aria-label={t("account.content.citations.down", { title })}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    busy={busy === `remove:${articleId}`}
                    disabled={busy !== null}
                    onClick={() => void remove(articleId, title)}
                    aria-label={t("account.content.citations.remove", { title })}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p
        role="status"
        className={cn(
          "flex min-h-5 flex-wrap items-center gap-x-2 text-sm",
          notice?.undo ? "text-ink-muted" : "text-danger",
        )}
      >
        {notice?.text}
        {notice?.undo && (
          <Button
            id="citation-undo"
            variant="link"
            size="sm"
            className="h-auto px-0"
            busy={busy === "undo"}
            disabled={busy !== null}
            onClick={() => void undo(notice.undo ?? [])}
          >
            {t("account.content.citations.undo")}
          </Button>
        )}
      </p>
      {picking && (
        <ArticlePicker
          translator={translator}
          articles={published.articles.filter((a) => !chosen.includes(a.id))}
          onClose={() => setPicking(false)}
          onPick={pick}
        />
      )}
    </div>
  );
}

/** Picks several articles at once, found by a search, and stays open until they are saved. */
function ArticlePicker({
  translator,
  articles,
  onClose,
  onPick,
}: {
  translator: AccountTranslator;
  articles: ArticlePublic[];
  onClose: () => void;
  /** Saves the articles picked; whether it could. */
  onPick: (ids: string[]) => Promise<boolean>;
}) {
  const { t } = translator;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState<"idle" | "busy" | "failed">("idle");
  const shown = articles.filter((a) => found(a, query));
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  const add = async () => {
    setAdding("busy");
    // Once saved, the picker closes.
    if (!(await onPick(picked))) setAdding("failed");
  };

  return (
    <Sheet
      open
      onClose={onClose}
      busy={adding === "busy"}
      title={t("account.content.citations.pickTitle")}
      close={t("account.content.close")}
      footer={
        <div className="flex items-center justify-end gap-2">
          <div className="mr-auto grid min-w-0 text-sm">
            <span className="text-ink-muted">{t("account.content.citations.picked", { count: picked.length })}</span>
            <span role="status" className="text-danger">
              {adding === "failed" ? t("account.content.saveFailed") : ""}
            </span>
          </div>
          <Button variant="ghost" disabled={adding === "busy"} onClick={onClose}>
            {t("account.content.cancel")}
          </Button>
          <Button busy={adding === "busy"} disabled={picked.length === 0} onClick={() => void add()}>
            {picked.length
              ? t("account.content.citations.addPicked", { count: picked.length })
              : t("account.content.citations.add")}
          </Button>
        </div>
      }
    >
      {/* The search stays at the panel's top while the articles scroll; the offsets undo the Sheet body's py-5. */}
      <div className="sticky -top-5 z-1 -mt-5 bg-surface pt-5 pb-3">
        <SearchField
          id="picker-search"
          collapsible={false}
          t={t}
          value={query}
          onChange={setQuery}
          label={t("account.content.articles.searchLabel")}
          className="sm:w-full"
        />
      </div>
      {articles.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("account.content.citations.allCited")}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("lists.noResults.title")}</p>
      ) : (
        // A focused tick clears the pinned search when going back up.
        <ul className="grid gap-1 [&_input]:scroll-mt-20">
          {shown.map((article) => (
            <li key={article.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-sm p-2.5 text-sm transition-colors duration-(--ia-motion-fast) hover:bg-action-soft has-focus-visible:bg-action-soft",
                  picked.includes(article.id) && "bg-surface-selected",
                )}
              >
                <Tick checked={picked.includes(article.id)} onChange={() => toggle(article.id)} />
                <span className="grid min-w-0 gap-0.5">
                  <span lang={article.lang} className="text-ink">
                    {article.title}
                  </span>
                  <span className="text-xs text-ink-subtle">
                    {t("account.content.articles.byline", { authors: article.authors, year: article.year })}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
