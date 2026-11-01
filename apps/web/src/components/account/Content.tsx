import { useEffect, useState } from "react";
import type { PluralText, SiteTextMatch, SiteTextOut, TextSection, TextValue, TextVersionOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { markdown } from "@/i18n/markdown";
import { cn } from "@/lib/utils";
import type { AccountKey, AccountTranslator } from "./i18n";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
const languages = ["es", "en", "pt"] as const;
type Language = (typeof languages)[number];
type Values = Record<Language, TextValue>;
type View = "search" | "sections" | "changes";

const card = "rounded-lg border border-line bg-surface";
const field =
  "w-full min-w-0 rounded-sm border border-input bg-surface px-3 py-2 text-base text-ink transition-colors duration-(--ia-motion-fast) hover:border-ink-subtle focus-visible:border-focus aria-invalid:border-danger";

const isPlural = (value: TextValue | undefined): value is PluralText => typeof value === "object" && value !== null;
const same = (a: TextValue | undefined, b: TextValue | undefined) => JSON.stringify(a) === JSON.stringify(b);
const placeholders = (text: string) => new Set(text.match(/\{\w+\}/g) ?? []);
const words = (value: TextValue) => (isPlural(value) ? [value.one, value.other] : [value]);
const preview = (value: TextValue | undefined) => (value === undefined ? "" : isPlural(value) ? value.other : value);

/** What is wrong with a text against its default: empty, or placeholders added or missing. */
function problem(value: TextValue, fallback: TextValue): { kind: "empty" | "missing" | "extra"; names: string } | null {
  const pairs = isPlural(value) && isPlural(fallback) ? [value.one, value.other].map((v, i) => [v, words(fallback)[i]]) : [[preview(value), preview(fallback)]];
  for (const [given, expected] of pairs) {
    if (!given.trim()) return { kind: "empty", names: "" };
    const have = placeholders(given);
    const want = placeholders(expected);
    const missing = [...want].filter((p) => !have.has(p));
    if (missing.length) return { kind: "missing", names: missing.join(" ") };
    const extra = [...have].filter((p) => !want.has(p));
    if (extra.length) return { kind: "extra", names: extra.join(" ") };
  }
  return null;
}

/**
 * For editors: every text the site shows, found by what it says, by part of the site or among the changes, and
 * edited in its three languages. A change is published at once or kept as a draft; every change can be undone.
 */
export default function Content({ translator }: { translator: AccountTranslator }) {
  const { t } = translator;
  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<TextSection[] | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [list, setList] = useState<SiteTextMatch[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Grows after every change, so the lists show what changed.
  const [changed, setChanged] = useState(0);

  useEffect(() => {
    let live = true;
    const load = (call: Parameters<typeof run>[0]) =>
      void run(call)
        .then((found) => live && setList(found))
        .catch(() => live && setList([]));
    const timer = setTimeout(() => {
      if (view === "search") {
        if (query.trim()) load((client, init) => client.searchTexts({ q: query.trim() }, init));
        else setList(null);
      } else if (view === "changes") load((client, init) => client.listChanges(init));
      else if (section) load((client, init) => client.listSection(section, init));
      else setList(null);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [view, query, section, changed]);

  useEffect(() => {
    if (view !== "sections") return;
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSections(init)))
      .then((response) => setSections(response.status === 200 ? response.data : []))
      .catch(() => setSections([]));
  }, [view, changed]);

  const sectionName = (name: string) => {
    const key = `account.content.sections.${name}`;
    return translator.has(key) ? t(key as AccountKey) : name;
  };
  const views: View[] = ["search", "sections", "changes"];

  return (
    <section id="content" aria-labelledby="content-title" className="grid gap-6 pt-8">
      <div className="max-w-prose">
        <h2 id="content-title" className="text-lg font-medium text-ink">
          {t("account.content.title")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("account.content.body")}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-3">
          <div role="tablist" aria-label={t("account.content.title")} className="flex gap-1">
            {views.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "h-9 rounded-pill px-3 text-sm transition-colors duration-(--ia-motion-fast)",
                  view === v ? "bg-surface-selected font-medium text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {t(`account.content.views.${v}`)}
              </button>
            ))}
          </div>
          {view === "search" && (
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("account.content.searchPlaceholder")}
              aria-label={t("account.content.searchPlaceholder")}
            />
          )}
          {view === "sections" && (
            <select
              className={cn(field, "h-11")}
              value={section ?? ""}
              onChange={(event) => setSection(event.target.value || null)}
              aria-label={t("account.content.views.sections")}
            >
              <option value="">{t("account.content.pickSection")}</option>
              {sections?.map((s) => (
                <option key={s.name} value={s.name}>
                  {sectionName(s.name)} ({s.count}
                  {s.edited ? ` · ${t("account.content.editedCount", { count: s.edited })}` : ""}
                  {s.drafts ? ` · ${t("account.content.draftCount", { count: s.drafts })}` : ""})
                </option>
              ))}
            </select>
          )}
          <ul className={cn(card, "grid max-h-[32rem] divide-y divide-line overflow-y-auto")}>
            {list === null && (
              <li className="p-4 text-sm text-ink-muted">
                {view === "search" ? t("account.content.searchHint") : t("account.content.pickSection")}
              </li>
            )}
            {list?.length === 0 && <li className="p-4 text-sm text-ink-muted">{t("account.content.nothing")}</li>}
            {list?.map((match) => (
              <li key={match.key}>
                <button
                  type="button"
                  onClick={() => setSelected(match.key)}
                  aria-current={selected === match.key ? "true" : undefined}
                  className={cn(
                    "grid w-full gap-1 p-3 text-left transition-colors duration-(--ia-motion-fast) hover:bg-action-soft",
                    selected === match.key && "bg-surface-selected",
                  )}
                >
                  <span className="line-clamp-2 text-sm text-ink">{preview(match.current.es)}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                    <code className="break-all">{match.key}</code>
                    {match.edited && <Badge>{t("account.content.edited")}</Badge>}
                    {match.draft && <Badge tone="draft">{t("account.content.draft")}</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          {selected ? (
            <Editor
              key={selected}
              textKey={selected}
              translator={translator}
              onChanged={() => setChanged((n) => n + 1)}
            />
          ) : (
            <p className={cn(card, "p-6 text-sm text-ink-muted")}>{t("account.content.pickText")}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Badge({ children, tone = "edited" }: { children: string; tone?: "edited" | "draft" }) {
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 text-2xs font-medium",
        tone === "draft" ? "bg-warning-soft text-ink" : "bg-action-soft text-ink",
      )}
    >
      {children}
    </span>
  );
}

type Run<T> = (
  client: Awaited<ReturnType<typeof api>>[1],
  init: RequestInit,
) => Promise<{ status: number; data: unknown }>;

/** One private call; an answer other than 200 is an error, with the API's words when it gives them. */
async function run<T = SiteTextMatch[]>(call: Run<T>): Promise<T> {
  const [{ privately }, client] = await api();
  const response = await privately((init) => call(client, init));
  if (response.status !== 200) {
    const detail = (response.data as { detail?: string } | null)?.detail;
    throw new Error(detail ?? String(response.status));
  }
  return response.data as T;
}

type Notice = { tone: "done" | "failed"; text: string } | null;

function Editor({
  textKey,
  translator,
  onChanged,
}: {
  textKey: string;
  translator: AccountTranslator;
  onChanged: () => void;
}) {
  const { t, moment } = translator;
  const [text, setText] = useState<SiteTextOut | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [versions, setVersions] = useState<TextVersionOut[] | null>(null);
  const [confirming, setConfirming] = useState(false);

  const show = (found: SiteTextOut) => {
    setText(found);
    // A waiting draft is where the editor goes on from.
    setValues(Object.fromEntries(languages.map((l) => [l, found.draft?.[l] ?? found.current[l]])) as Values);
  };

  useEffect(() => {
    run<SiteTextOut>((client, init) => client.getText(textKey, init))
      .then(show)
      .catch(() => setFailed(true));
  }, [textKey]);

  if (failed) return <p className={cn(card, "p-6 text-sm text-ink-muted")}>{t("account.content.failed")}</p>;
  if (!text || !values) return <p className={cn(card, "p-6 text-sm text-ink-muted")}>{t("account.loading")}</p>;

  const problems = Object.fromEntries(
    languages.map((l) => [l, problem(values[l], text.default[l] as TextValue)]),
  ) as Record<Language, ReturnType<typeof problem>>;
  const changes = Object.fromEntries(
    languages.filter((l) => !same(values[l], text.current[l])).map((l) => [l, values[l]]),
  ) as Partial<Values>;
  const valid = languages.every((l) => !problems[l]);
  const dirty = Object.keys(changes).length > 0;

  const act = async (call: Run<SiteTextOut>, done: AccountKey) => {
    setBusy(true);
    setNotice(null);
    try {
      show(await run<SiteTextOut>(call));
      setVersions(null);
      setNotice({ tone: "done", text: t(done) });
      onChanged();
    } catch (error) {
      setNotice({ tone: "failed", text: error instanceof Error ? error.message : t("account.content.failed") });
    } finally {
      setBusy(false);
    }
  };
  const save = (publish: boolean) =>
    act(
      (client, init) => client.putText(textKey, { texts: changes, publish }, init),
      publish ? "account.content.published" : "account.content.drafted",
    );
  const loadVersions = () =>
    void run<TextVersionOut[]>((client, init) => client.listVersions(textKey, init))
      .then(setVersions)
      .catch(() => setVersions([]));

  const status = text.draft
    ? t("account.content.draftBy", { name: text.draft_by?.name ?? "", at: text.draft_at ? moment(text.draft_at) : "" })
    : text.updated_by
      ? t("account.content.publishedBy", {
          name: text.updated_by.name,
          at: text.updated_at ? moment(text.updated_at) : "",
        })
      : t("account.content.unchanged");

  return (
    <article className={cn(card, "grid gap-5 p-5 sm:p-6")} aria-labelledby="text-key">
      <header className="grid gap-1">
        <h3 id="text-key" className="font-mono text-sm break-all text-ink">
          {text.key}
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Badge>{t(`account.content.formats.${text.format}`)}</Badge>
          <span>{status}</span>
        </p>
      </header>

      {languages.map((language) => {
        const value = values[language];
        const fallback = text.default[language] as TextValue;
        const issue = problems[language];
        const id = `text-${language}`;
        const set = (next: TextValue) => setValues({ ...values, [language]: next });
        return (
          <div key={language} className="grid gap-2">
            <label htmlFor={id} className="text-sm font-medium text-ink">
              {t(`account.content.languages.${language}`)}
            </label>
            {isPlural(value) && isPlural(fallback) ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(["one", "other"] as const).map((form) => (
                  <label key={form} className="grid gap-1 text-xs text-ink-muted">
                    {t(`account.content.plural.${form}`)}
                    <Input
                      id={form === "one" ? id : undefined}
                      value={value[form]}
                      aria-invalid={issue ? true : undefined}
                      onChange={(event) => set({ ...value, [form]: event.target.value })}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                id={id}
                className={field}
                rows={text.format === "markdown" ? 5 : Math.min(4, Math.ceil(preview(value).length / 70) || 1)}
                value={preview(value)}
                aria-invalid={issue ? true : undefined}
                aria-describedby={`${id}-help`}
                onChange={(event) => set(event.target.value)}
              />
            )}
            <div id={`${id}-help`} className="grid gap-1 text-xs">
              {issue && (
                <p className="text-danger">
                  {t(`account.content.problems.${issue.kind}`, { names: issue.names })}
                </p>
              )}
              {!same(value, fallback) && (
                <p className="text-ink-subtle">
                  {t("account.content.default")}: {words(fallback).join(" / ")}
                </p>
              )}
            </div>
            {text.format === "markdown" && (
              <div
                className="rich-text rounded-sm bg-surface-muted p-3 text-sm text-ink-muted"
                aria-label={t("account.content.preview")}
                dangerouslySetInnerHTML={{ __html: markdown(preview(value)) }}
              />
            )}
          </div>
        );
      })}

      {text.format === "markdown" && <p className="text-xs text-ink-subtle">{t("account.content.markdownHelp")}</p>}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !valid || (!dirty && !text.draft)} onClick={() => void (dirty ? save(true) : act((client, init) => client.publishText(textKey, init), "account.content.published"))}>
          {t("account.content.publish")}
        </Button>
        <Button variant="outline" disabled={busy || !valid || !dirty} onClick={() => void save(false)}>
          {t("account.content.saveDraft")}
        </Button>
        {text.draft && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void act((client, init) => client.discardDraft(textKey, init), "account.content.discarded")}
          >
            {t("account.content.discardDraft")}
          </Button>
        )}
        {Object.keys(text.published).length > 0 && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            {t("account.content.toDefault")}
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className={cn("text-sm", notice.tone === "failed" ? "text-danger" : "text-ink-muted")}>
          {notice.text}
        </p>
      )}

      <details
        className="text-sm"
        onToggle={(event) => (event.currentTarget as HTMLDetailsElement).open && versions === null && loadVersions()}
      >
        <summary className="cursor-pointer text-ink">{t("account.content.history")}</summary>
        {versions?.length === 0 && <p className="mt-2 text-ink-muted">{t("account.content.noHistory")}</p>}
        <ol className="mt-3 grid gap-3">
          {versions?.map((version) => (
            <li key={version.id} className="grid gap-1 border-l-2 border-line pl-3">
              <p className="text-xs text-ink-muted">
                {t(`account.content.states.${version.state}`)} · {version.by.name} · {moment(version.at)}
              </p>
              {languages
                .filter((l) => version.texts[l] !== undefined)
                .map((l) => (
                  <p key={l} className="line-clamp-2 text-ink">
                    <span className="text-ink-subtle">{l} </span>
                    {words(version.texts[l] as TextValue).join(" / ")}
                  </p>
                ))}
              {version.state !== "draft" && Object.keys(version.texts).length > 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="justify-self-start px-0"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      (client, init) => client.restoreText(textKey, { version: version.id }, init),
                      "account.content.restored",
                    )
                  }
                >
                  {t("account.content.restore")}
                </Button>
              )}
            </li>
          ))}
        </ol>
      </details>

      <ConfirmDialog
        open={confirming}
        tone="primary"
        title={t("account.content.toDefaultTitle")}
        body={t("account.content.toDefaultBody")}
        confirm={t("account.content.toDefault")}
        cancel={t("account.content.cancel")}
        onConfirm={() => {
          setConfirming(false);
          void act(
            (client, init) => client.restoreText(textKey, { version: null }, init),
            "account.content.restored",
          );
        }}
        onCancel={() => setConfirming(false)}
      />
    </article>
  );
}
