import { useEffect, useState } from "react";
import type { ArticleIn, ArticleOut, ArticlePublic, PublishedArticles } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { indicatorIds, type IndicatorId } from "@/data/indicators";
import { cn } from "@/lib/utils";
import type { AccountKey, AccountTranslator } from "./i18n";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
type Client = Awaited<ReturnType<typeof api>>[1];
const card = "rounded-lg border border-line bg-surface";
const empty: ArticleIn = { authors: "", year: new Date().getFullYear(), title: "", lang: "en", source: "" };

/** One private call; an answer other than `ok` statuses is an error. */
async function call<T>(run: (client: Client, init: RequestInit) => Promise<{ status: number; data: unknown }>) {
  const [{ privately }, client] = await api();
  const response = await privately((init) => run(client, init));
  if (response.status >= 300) throw new Error(String(response.status));
  return response.data as T;
}

/** The published articles and citations, loaded again after every change. */
function usePublished(changed: number) {
  const [published, setPublished] = useState<PublishedArticles | null | "failed">(null);
  useEffect(() => {
    void import("@idea-agro/api-client")
      .then((client) => client.listArticles())
      .then((response) => setPublished(response.status === 200 ? response.data : "failed"))
      .catch(() => setPublished("failed"));
  }, [changed]);
  return published;
}

/**
 * For editors: the scientific articles behind the indicators. They are added, changed and removed here, with an
 * optional PDF; which indicator cites which is chosen in the indicators' view.
 */
export function Articles({ translator, onChanged, changed }: Props) {
  const { t } = translator;
  const published = usePublished(changed);
  // An article's id, or "new" for one being added.
  const [selected, setSelected] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<"idle" | "busy" | "failed">("idle");

  if (published === null) return <p className="text-sm text-ink-muted">{t("account.loading")}</p>;
  if (published === "failed") return <p className="text-sm text-danger">{t("account.content.listFailed")}</p>;

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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="grid content-start gap-3">
        <Button variant="outline" className="justify-self-start" onClick={() => setSelected("new")}>
          {t("account.content.articles.add")}
        </Button>
        <ul className={cn(card, "grid max-h-128 divide-y divide-line overflow-y-auto")}>
          {published.articles.length === 0 && (
            <li className="grid gap-3 p-4 text-sm text-ink-muted">
              <p>{t("account.content.articles.none")}</p>
              <Button
                size="sm"
                className="justify-self-start"
                disabled={seeding === "busy"}
                onClick={() => void seed()}
              >
                {t("account.content.articles.seed")}
              </Button>
              {seeding === "failed" && <p className="text-danger">{t("account.content.saveFailed")}</p>}
            </li>
          )}
          {published.articles.map((article) => (
            <li key={article.id}>
              <button
                type="button"
                onClick={() => setSelected(article.id)}
                aria-current={selected === article.id ? "true" : undefined}
                className={cn(
                  "grid w-full gap-1 p-3 text-left transition-colors duration-(--ia-motion-fast) hover:bg-action-soft",
                  selected === article.id && "bg-surface-selected",
                )}
              >
                <span lang={article.lang} className="line-clamp-2 text-sm text-ink">
                  {article.title}
                </span>
                <span className="text-xs text-ink-subtle">
                  {article.authors} · {article.year}
                  {article.framework ? ` · ${t("account.content.articles.framework")}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        {selected ? (
          <ArticleEditor
            key={selected}
            id={selected === "new" ? null : selected}
            translator={translator}
            onSaved={(id) => {
              setSelected(id);
              onChanged();
            }}
          />
        ) : (
          <p className={cn(card, "p-6 text-sm text-ink-muted")}>{t("account.content.articles.pick")}</p>
        )}
      </div>
    </div>
  );
}

type Props = { translator: AccountTranslator; onChanged: () => void; changed: number };

function ArticleEditor({
  id,
  translator,
  onSaved,
}: {
  id: string | null;
  translator: AccountTranslator;
  onSaved: (id: string | null) => void;
}) {
  const { t, moment } = translator;
  const [article, setArticle] = useState<ArticleOut | null>(null);
  const [form, setForm] = useState<ArticleIn | null>(id ? null : empty);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "done" | "failed"; key: AccountKey } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!id) return;
    void call<ArticleOut>((client, init) => client.getArticle(id, init))
      .then((found) => {
        setArticle(found);
        setForm({
          authors: found.authors,
          year: found.year,
          title: found.title,
          lang: found.lang,
          source: found.source,
          doi: found.doi ?? null,
          url: found.url ?? null,
          framework: found.framework,
        });
      })
      .catch(() => setNotice({ tone: "failed", key: "account.content.failed" }));
  }, [id]);

  if (!form)
    return (
      <p className={cn(card, "p-6 text-sm", notice ? "text-danger" : "text-ink-muted")}>
        {notice ? t(notice.key) : t("account.loading")}
      </p>
    );

  const set = (patch: Partial<ArticleIn>) => setForm({ ...form, ...patch });
  const clean = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
  const body: ArticleIn = {
    ...form,
    authors: form.authors.trim(),
    title: form.title.trim(),
    source: form.source.trim(),
    doi: clean(form.doi),
    url: clean(form.url),
  };
  const valid =
    body.authors !== "" &&
    body.title !== "" &&
    Number.isInteger(body.year) &&
    body.year >= 1800 &&
    body.year <= 2100 &&
    /^[a-z]{2,3}(-[A-Z]{2})?$/.test(body.lang) &&
    (!body.doi || /^10\.\d{4,9}\/\S+$/.test(body.doi)) &&
    (!body.url || /^https?:\/\/\S+$/.test(body.url));

  const act = async (run: () => Promise<ArticleOut | null>, done: AccountKey) => {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await run();
      if (saved) setArticle(saved);
      setNotice({ tone: "done", key: done });
      onSaved(saved ? saved.id : null);
    } catch {
      setNotice({ tone: "failed", key: "account.content.saveFailed" });
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    act(
      () =>
        id
          ? call<ArticleOut>((client, init) => client.putArticle(id, body, init))
          : call<ArticleOut>((client, init) => client.addArticle(body, init)),
      "account.content.published",
    );
  const upload = (file: File) =>
    act(
      () => call<ArticleOut>((client, init) => client.putArticlePdf(id ?? "", { file }, init)),
      "account.content.published",
    );
  const removePdf = () =>
    act(() => call<ArticleOut>((client, init) => client.deleteArticlePdf(id ?? "", init)), "account.content.published");
  const remove = () =>
    act(async () => {
      await call((client, init) => client.deleteArticle(id ?? "", init));
      return null;
    }, "account.content.articles.removed");

  // The API's own limits, so a long value is caught while typing.
  const lengths = { authors: 500, title: 500, source: 300, doi: 200, url: 500 };
  const field = (name: "authors" | "title" | "source" | "doi" | "url", key: AccountKey, hint?: AccountKey) => (
    <label className="grid gap-1 text-sm text-ink">
      {t(key)}
      <Input
        value={form[name] ?? ""}
        maxLength={lengths[name]}
        onChange={(event) => set({ [name]: event.target.value })}
      />
      {hint && <span className="text-xs text-ink-subtle">{t(hint)}</span>}
    </label>
  );

  return (
    <article className={cn(card, "grid gap-4 p-5 sm:p-6")}>
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
        <label className="grid gap-1 text-sm text-ink">
          {t("account.content.articles.year")}
          <Input
            type="number"
            min={1800}
            max={2100}
            value={form.year}
            onChange={(event) => set({ year: Number(event.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm text-ink">
          {t("account.content.articles.lang")}
          <Input value={form.lang} onChange={(event) => set({ lang: event.target.value.trim() })} />
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
        <div className="grid gap-2 border-t border-line pt-4 text-sm">
          <p className="text-ink">{t("account.content.articles.pdf")}</p>
          {article?.pdf ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-ink-muted">{t("account.content.articles.pdfAttached")}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removePdf()}>
                {t("account.content.articles.pdfRemove")}
              </Button>
            </div>
          ) : null}
          <input
            type="file"
            accept="application/pdf"
            aria-label={t("account.content.articles.pdfUpload")}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
            className="text-sm text-ink-muted"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !valid} onClick={() => void save()}>
          {t("account.content.publish")}
        </Button>
        {id && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            {t("account.content.articles.remove")}
          </Button>
        )}
      </div>
      <p role="status" className={cn("min-h-5 text-sm", notice?.tone === "failed" ? "text-danger" : "text-ink-muted")}>
        {notice ? t(notice.key) : ""}
      </p>

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
    </article>
  );
}

/** For editors: the articles each indicator cites, in the order the site lists them. */
export function Citations({ translator, onChanged, changed }: Props) {
  const { t } = translator;
  const published = usePublished(changed);
  const [indicator, setIndicator] = useState<IndicatorId>(indicatorIds[0]);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "done" | "failed"; key: AccountKey } | null>(null);

  useEffect(() => {
    if (published && published !== "failed") setChosen(published.citations[indicator] ?? []);
  }, [published, indicator]);

  if (published === null || chosen === null) return <p className="text-sm text-ink-muted">{t("account.loading")}</p>;
  if (published === "failed") return <p className="text-sm text-danger">{t("account.content.listFailed")}</p>;

  const byId = new Map<string, ArticlePublic>(published.articles.map((a) => [a.id, a]));
  const others = published.articles.filter((a) => !chosen.includes(a.id));
  const saved = published.citations[indicator] ?? [];
  const dirty = JSON.stringify(saved) !== JSON.stringify(chosen);
  const move = (index: number, by: number) => {
    const next = [...chosen];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setChosen(next);
  };
  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await call((client, init) => client.citeArticles(indicator, { articles: chosen }, init));
      setNotice({ tone: "done", key: "account.content.published" });
      onChanged();
    } catch {
      setNotice({ tone: "failed", key: "account.content.saveFailed" });
    } finally {
      setBusy(false);
    }
  };
  const name = (id: IndicatorId) => t(`indicators.items.${id}.name` as AccountKey);

  return (
    <div className={cn(card, "grid max-w-3xl gap-4 p-5 sm:p-6")}>
      <label className="grid gap-1 text-sm text-ink">
        {t("account.content.citations.indicator")}
        <select
          className="h-11 rounded-sm border border-input bg-surface px-3 text-base text-ink"
          value={indicator}
          onChange={(event) => {
            setNotice(null);
            setIndicator(event.target.value as IndicatorId);
          }}
        >
          {indicatorIds.map((id) => (
            <option key={id} value={id}>
              {name(id)}
            </option>
          ))}
        </select>
      </label>
      <ol className="grid gap-2">
        {chosen.length === 0 && <li className="text-sm text-ink-muted">{t("account.content.citations.none")}</li>}
        {chosen.map((articleId, index) => {
          const article = byId.get(articleId);
          return (
            <li
              key={articleId}
              className="flex items-start justify-between gap-3 rounded-sm border border-line p-3 text-sm"
            >
              <span className="text-ink">
                <span lang={article?.lang}>{article?.title ?? articleId}</span>
                <span className="block text-xs text-ink-subtle">
                  {article ? `${article.authors} · ${article.year}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t("account.content.citations.up")}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={index === chosen.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t("account.content.citations.down")}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setChosen(chosen.filter((c) => c !== articleId))}
                  aria-label={t("account.content.citations.remove")}
                >
                  ×
                </Button>
              </span>
            </li>
          );
        })}
      </ol>
      {others.length > 0 && (
        <label className="grid gap-1 text-sm text-ink">
          {t("account.content.citations.add")}
          <select
            className="h-11 rounded-sm border border-input bg-surface px-3 text-base text-ink"
            value=""
            onChange={(event) => event.target.value && setChosen([...chosen, event.target.value])}
          >
            <option value="">{t("account.content.citations.pick")}</option>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.authors} ({a.year}). {a.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <Button disabled={busy || !dirty} onClick={() => void save()}>
          {t("account.content.publish")}
        </Button>
      </div>
      <p role="status" className={cn("min-h-5 text-sm", notice?.tone === "failed" ? "text-danger" : "text-ink-muted")}>
        {notice ? t(notice.key) : ""}
      </p>
    </div>
  );
}
