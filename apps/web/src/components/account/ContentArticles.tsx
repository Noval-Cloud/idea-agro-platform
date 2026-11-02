import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, FileText, Plus, Search, X } from "lucide-react";
import type { ArticleIn, ArticleOut, ArticlePublic, PublishedArticles } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Modal, Sheet } from "@/components/ui/sheet";
import { indicatorIds, type IndicatorId } from "@/data/indicators";
import { cn } from "@/lib/utils";
import type { AccountKey, AccountTranslator } from "./i18n";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
type Client = Awaited<ReturnType<typeof api>>[1];
type Props = { translator: AccountTranslator; onChanged: () => void; changed: number };
const empty: ArticleIn = { authors: "", year: new Date().getFullYear(), title: "", lang: "en", source: "" };
type Flag = "framework" | "pdf" | "uncited";
const flags: Flag[] = ["framework", "pdf", "uncited"];

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
    void import("@idea-agro/api-client")
      // The public list is cacheable; an editor needs what was just saved.
      .then((client) => client.listArticles({ cache: "no-store" }))
      .then((response) => setPublished(response.status === 200 ? response.data : "failed"))
      .catch(() => setPublished("failed"));
  }, [changed]);
  return published;
}

/** Whether an article matches what was typed: its title, authors, source or year. */
const matches = (article: ArticlePublic, query: string) => {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = `${article.title} ${article.authors} ${article.source} ${article.year}`.toLocaleLowerCase();
  return words.every((word) => text.includes(word));
};

function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-60 grow">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

/**
 * For editors: the scientific articles behind the indicators, found by a search and a few filters, each opened
 * in a side panel. Which indicator cites which is chosen on the indicator's page.
 */
export function Articles({ translator, onChanged, changed }: Props) {
  const { t } = translator;
  const published = usePublished(changed);
  // An article's id, or "new" for one being added.
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [on, setOn] = useState<Flag[]>([]);
  const [citedBy, setCitedBy] = useState<IndicatorId | "">("");
  const [seeding, setSeeding] = useState<"idle" | "busy" | "failed">("idle");

  if (published === null) return <p className="text-sm text-ink-muted">{t("account.loading")}</p>;
  if (published === "failed") return <p className="text-sm text-danger">{t("account.content.listFailed")}</p>;

  const name = (id: IndicatorId) => t(`indicators.items.${id}.name` as AccountKey);
  const citing = (article: string) => indicatorIds.filter((i) => (published.citations[i] ?? []).includes(article));
  const shown = published.articles.filter(
    (a) =>
      matches(a, query) &&
      (!on.includes("framework") || a.framework) &&
      (!on.includes("pdf") || a.pdf) &&
      (!on.includes("uncited") || citing(a.id).length === 0) &&
      (!citedBy || citing(a.id).includes(citedBy)),
  );
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
      key={open}
      id={open === "new" ? null : open}
      citedBy={open === "new" ? [] : citing(open).map(name)}
      translator={translator}
      onSaved={(id) => {
        setOpen(id);
        onChanged();
      }}
      onClose={() => setOpen(null)}
    />
  );

  if (published.articles.length === 0)
    return (
      <div className="grid justify-items-start gap-3 rounded-lg border border-dashed border-line p-6 text-sm text-ink-muted">
        <p className="max-w-prose">{t("account.content.articles.none")}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={seeding === "busy"} onClick={() => void seed()}>
            {t("account.content.articles.seed")}
          </Button>
          <Button variant="outline" onClick={() => setOpen("new")}>
            <Plus aria-hidden="true" />
            {t("account.content.articles.add")}
          </Button>
        </div>
        {seeding === "failed" && <p className="text-danger">{t("account.content.saveFailed")}</p>}
        {panel}
      </div>
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("account.content.articles.searchLabel")}
          placeholder={t("account.content.articles.searchPlaceholder")}
        />
        <select
          className="h-11 rounded-sm border border-input bg-surface px-3 text-sm text-ink"
          value={citedBy}
          onChange={(event) => setCitedBy(event.target.value as IndicatorId | "")}
          aria-label={t("account.content.articles.citedByLabel")}
        >
          <option value="">{t("account.content.articles.anyIndicator")}</option>
          {indicatorIds.map((id) => (
            <option key={id} value={id}>
              {name(id)}
            </option>
          ))}
        </select>
        <Button onClick={() => setOpen("new")}>
          <Plus aria-hidden="true" />
          {t("account.content.articles.add")}
        </Button>
      </div>
      <div role="group" aria-label={t("account.content.articles.filtersLabel")} className="flex flex-wrap gap-2">
        {flags.map((flag) => {
          const pressed = on.includes(flag);
          return (
            <button
              key={flag}
              type="button"
              aria-pressed={pressed}
              onClick={() => setOn(pressed ? on.filter((f) => f !== flag) : [...on, flag])}
              className={cn(
                "h-8 rounded-pill border px-3 text-sm transition-colors duration-(--ia-motion-fast)",
                pressed
                  ? "border-transparent bg-surface-selected font-medium text-ink"
                  : "border-line text-ink-muted hover:text-ink",
              )}
            >
              {t(`account.content.articles.flags.${flag}`)}
            </button>
          );
        })}
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {t("account.content.articles.count", { count: shown.length })}
      </p>
      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-sm text-ink-muted">
          {t("account.content.articles.noMatch")}
        </p>
      ) : (
        <ul className="grid divide-y divide-line rounded-lg border border-line bg-surface">
          {shown.map((article) => {
            const by = citing(article.id);
            return (
              <li key={article.id}>
                <button
                  type="button"
                  onClick={() => setOpen(article.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--ia-motion-fast) hover:bg-action-soft"
                >
                  <span className="grid min-w-0 grow gap-1">
                    <span lang={article.lang} className="line-clamp-2 text-sm text-ink">
                      {article.title}
                    </span>
                    <span className="line-clamp-1 text-xs text-ink-subtle">
                      {article.authors} · {article.year} · {article.source}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      {article.framework && <Chip>{t("account.content.articles.flags.framework")}</Chip>}
                      {article.pdf && (
                        <Chip>
                          <FileText aria-hidden="true" className="size-3" />
                          PDF
                        </Chip>
                      )}
                      <span>
                        {by.length > 0
                          ? t("account.content.articles.citedByCount", { count: by.length })
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

/** One article in a side panel: its data, its PDF and its removal. `id` is null for one being added. */
function ArticlePanel({
  id,
  citedBy,
  translator,
  onSaved,
  onClose,
}: {
  id: string | null;
  citedBy: string[];
  translator: AccountTranslator;
  onSaved: (id: string | null) => void;
  onClose: () => void;
}) {
  const { t, moment, list } = translator;
  const [article, setArticle] = useState<ArticleOut | null>(null);
  const [form, setForm] = useState<ArticleIn | null>(id ? null : empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "done" | "failed"; key: AccountKey } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const leave = useConfirm(t("account.content.keepEditing"));

  useEffect(() => {
    if (!id) return;
    void call<ArticleOut>((client, init) => client.getArticle(id, init))
      .then((found) => {
        setArticle(found);
        setForm(fromArticle(found));
      })
      .catch(() => setNotice({ tone: "failed", key: "account.content.failed" }));
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
  const act = async (run: () => Promise<ArticleOut | null>, done: AccountKey) => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await run();
      if (saved) {
        setArticle(saved);
        setForm(fromArticle(saved));
      }
      setNotice({ tone: "done", key: done });
      onSaved(saved ? saved.id : null);
    } catch {
      setNotice({ tone: "failed", key: "account.content.saveFailed" });
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    body &&
    act(
      () =>
        id
          ? call<ArticleOut>((client, init) => client.putArticle(id, body, init))
          : call<ArticleOut>((client, init) => client.addArticle(body, init)),
      "account.content.articles.saved",
    );
  const upload = (file: File) =>
    act(
      () => call<ArticleOut>((client, init) => client.putArticlePdf(id ?? "", { file }, init)),
      "account.content.articles.saved",
    );
  const removePdf = () =>
    act(
      () => call<ArticleOut>((client, init) => client.deleteArticlePdf(id ?? "", init)),
      "account.content.articles.saved",
    );
  const remove = () =>
    act(async () => {
      await call((client, init) => client.deleteArticle(id ?? "", init));
      return null;
    }, "account.content.articles.removed");

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
      <p
        role="status"
        className={cn("mr-auto min-w-0 text-sm", notice?.tone === "failed" ? "text-danger" : "text-ink-muted")}
      >
        {notice ? t(notice.key) : ""}
      </p>
      {id && (
        <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => setConfirming(true)}>
          {t("account.content.articles.remove")}
        </Button>
      )}
      <Button disabled={busy || !valid || (id !== null && !dirty)} onClick={() => void save()}>
        {id ? t("account.content.articles.save") : t("account.content.articles.create")}
      </Button>
    </div>
  );

  return (
    <Sheet
      open
      onClose={() => void close()}
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
        <p className={cn("text-sm", notice ? "text-danger" : "text-ink-muted")}>
          {notice ? t(notice.key) : t("account.loading")}
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
          {field("url", "account.content.articles.url")}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.framework ?? false}
              onChange={(event) => set({ framework: event.target.checked })}
            />
            {t("account.content.articles.frameworkLabel")}
          </label>

          {id && (
            <div className="grid gap-2 border-t border-line pt-5 text-sm">
              <p className="font-medium text-ink">{t("account.content.articles.pdf")}</p>
              {article?.pdf ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-ink-muted">
                    <FileText aria-hidden="true" className="size-4" />
                    {t("account.content.articles.pdfAttached")}
                  </span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removePdf()}>
                    {t("account.content.articles.pdfRemove")}
                  </Button>
                </div>
              ) : null}
              <label className="grid gap-1 text-ink-muted">
                {article?.pdf ? t("account.content.articles.pdfReplace") : t("account.content.articles.pdfUpload")}
                <input
                  type="file"
                  accept="application/pdf"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                  className="text-sm text-ink-muted"
                />
              </label>
            </div>
          )}
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
          void remove().then(onClose);
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
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<{ tone: "done" | "failed"; text: string; undo?: string[] } | null>(null);

  // The list follows what is published, except while a change is on its way.
  useEffect(() => {
    if (published && published !== "failed" && !busy) setChosen(published.citations[indicator] ?? []);
  }, [published, indicator]);

  if (published === null || chosen === null) return <p className="text-sm text-ink-muted">{t("account.loading")}</p>;
  if (published === "failed") return <p className="text-sm text-danger">{t("account.content.listFailed")}</p>;

  const byId = new Map<string, ArticlePublic>(published.articles.map((a) => [a.id, a]));
  const save = async (next: string[], done: string, undo?: string[]) => {
    const before = chosen;
    setChosen(next);
    setBusy(true);
    setNotice(null);
    try {
      await call((client, init) => client.citeArticles(indicator, { articles: next }, init));
      setNotice({ tone: "done", text: done, undo });
      onChanged();
    } catch {
      setChosen(before);
      setNotice({ tone: "failed", text: t("account.content.saveFailed") });
    } finally {
      setBusy(false);
    }
  };
  const move = (index: number, by: number) => {
    const next = [...chosen];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    void save(next, t("account.content.citations.moved"));
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{t("account.content.citations.lead")}</p>
        <Button disabled={busy} onClick={() => setPicking(true)}>
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
                    {article ? `${article.authors} · ${article.year}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={t("account.content.citations.up", { title })}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    disabled={busy || index === chosen.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={t("account.content.citations.down", { title })}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    disabled={busy}
                    onClick={() =>
                      void save(
                        chosen.filter((c) => c !== articleId),
                        t("account.content.citations.removed", { title }),
                        chosen,
                      )
                    }
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
          notice?.tone === "failed" ? "text-danger" : "text-ink-muted",
        )}
      >
        {notice?.text}
        {notice?.undo && (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            disabled={busy}
            onClick={() => void save(notice.undo ?? [], t("account.content.citations.restored"))}
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
          onPick={(ids) => {
            setPicking(false);
            void save([...chosen, ...ids], t("account.content.citations.added", { count: ids.length }));
          }}
        />
      )}
    </div>
  );
}

/** Picks several articles at once, found by a search. */
function ArticlePicker({
  translator,
  articles,
  onClose,
  onPick,
}: {
  translator: AccountTranslator;
  articles: ArticlePublic[];
  onClose: () => void;
  onPick: (ids: string[]) => void;
}) {
  const { t } = translator;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const shown = articles.filter((a) => matches(a, query));
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("account.content.citations.pickTitle")}
      close={t("account.content.close")}
      className="h-[min(40rem,calc(100dvh-2rem))]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-sm text-ink-muted">
            {t("account.content.citations.picked", { count: picked.length })}
          </span>
          <Button variant="ghost" onClick={onClose}>
            {t("account.content.cancel")}
          </Button>
          <Button disabled={picked.length === 0} onClick={() => onPick(picked)}>
            {picked.length
              ? t("account.content.citations.addPicked", { count: picked.length })
              : t("account.content.citations.add")}
          </Button>
        </div>
      }
    >
      <div className="sticky top-0 z-1 bg-surface pb-3">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t("account.content.articles.searchLabel")}
          placeholder={t("account.content.articles.searchPlaceholder")}
        />
      </div>
      {articles.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("account.content.citations.allCited")}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("account.content.articles.noMatch")}</p>
      ) : (
        <ul className="grid gap-1">
          {shown.map((article) => (
            <li key={article.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-sm p-2.5 text-sm transition-colors duration-(--ia-motion-fast) hover:bg-action-soft",
                  picked.includes(article.id) && "bg-surface-selected",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0"
                  checked={picked.includes(article.id)}
                  onChange={() => toggle(article.id)}
                />
                <span className="grid min-w-0 gap-0.5">
                  <span lang={article.lang} className="text-ink">
                    {article.title}
                  </span>
                  <span className="text-xs text-ink-subtle">
                    {article.authors} · {article.year}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
