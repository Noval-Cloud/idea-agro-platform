import { useEffect, useRef, useState } from "react";
import type {
  PluralText,
  SiteRebuildOut,
  SiteTextMatch,
  SiteTextOut,
  TextSection,
  TextValue,
  TextVersionOut,
} from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { markdown } from "@/i18n/markdown";
import { cn } from "@/lib/utils";
import { Articles, Citations } from "./ContentArticles";
import type { AccountKey, AccountTranslator } from "./i18n";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
const languages = ["es", "en", "pt"] as const;
type Language = (typeof languages)[number];
type Values = Record<Language, TextValue>;
type View = "search" | "sections" | "changes";
type Mode = "texts" | "articles" | "citations";
const modes: Mode[] = ["texts", "articles", "citations"];

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
  const pairs =
    isPlural(value) && isPlural(fallback)
      ? [value.one, value.other].map((v, i) => [v, words(fallback)[i]])
      : [[preview(value), preview(fallback)]];
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
  // Texts, articles, or which articles each indicator cites.
  const [mode, setMode] = useState<Mode>("texts");
  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<TextSection[] | null>(null);
  const [section, setSection] = useState<string | null>(null);
  // null: nothing asked yet; "loading" and "failed" while and when a list does not arrive.
  const [list, setList] = useState<SiteTextMatch[] | null | "loading" | "failed">(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Grows after every change, so the lists show what changed.
  const [changed, setChanged] = useState(0);

  // A new query or view shows "loading"; a reload after a change keeps the list, and its scroll, until it arrives.
  const asked = useRef("");
  useEffect(() => {
    let live = true;
    const wanted = `${view}|${query}|${section ?? ""}`;
    const fresh = asked.current !== wanted;
    asked.current = wanted;
    const load = (call: Run) => {
      if (fresh) setList("loading");
      void run<SiteTextMatch[]>(call)
        .then((found) => live && setList(found))
        .catch(() => live && setList("failed"));
    };
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
      <SiteStatus translator={translator} changed={changed} />
      <div
        role="group"
        aria-label={t("account.content.modesLabel")}
        className="flex flex-wrap gap-1 border-b border-line pb-3"
      >
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "h-9 rounded-sm px-3 text-sm transition-colors duration-(--ia-motion-fast)",
              mode === m ? "bg-surface-selected font-medium text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {t(`account.content.modes.${m}`)}
          </button>
        ))}
      </div>
      {mode === "articles" && (
        <Articles translator={translator} changed={changed} onChanged={() => setChanged((n) => n + 1)} />
      )}
      {mode === "citations" && (
        <Citations translator={translator} changed={changed} onChanged={() => setChanged((n) => n + 1)} />
      )}
      {mode === "texts" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="grid content-start gap-3">
            <div role="group" aria-label={t("account.content.title")} className="flex gap-1">
              {views.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => {
                    setList(null);
                    setView(v);
                  }}
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
            <ul
              className={cn(card, "grid max-h-128 divide-y divide-line overflow-y-auto")}
              aria-busy={list === "loading"}
            >
              {typeof list === "string" || list === null || list.length === 0 ? (
                <li className="p-4 text-sm text-ink-muted">
                  {list === "loading"
                    ? t("account.loading")
                    : list === "failed"
                      ? t("account.content.listFailed")
                      : list === null
                        ? view === "search"
                          ? t("account.content.searchHint")
                          : t("account.content.pickSection")
                        : t("account.content.nothing")}
                </li>
              ) : null}
              {Array.isArray(list) &&
                list.map((match) => (
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
      )}
    </section>
  );
}

function Badge({ children, tone = "edited" }: { children: string; tone?: "edited" | "draft" }) {
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 text-2xs font-medium",
        tone === "draft" ? "bg-family-soil/20 text-ink" : "bg-action-soft text-ink",
      )}
    >
      {children}
    </span>
  );
}

const STALLED_MS = 20 * 60_000;

/** When the site last built: written by each build, absent where the site is not built (local runs). */
async function builtAt(): Promise<string | null> {
  try {
    const response = await fetch("/build.json", { cache: "no-store" });
    return response.ok ? ((await response.json()) as { built_at: string }).built_at : null;
  } catch {
    return null;
  }
}

/**
 * Whether the site shows what editors published: behind, updating, or up to date. Changes accumulate; the site
 * rebuilds by itself some minutes after the last one, or at once when asked.
 */
function SiteStatus({ translator, changed }: { translator: AccountTranslator; changed: number }) {
  const { t, moment, ago } = translator;
  const [state, setState] = useState<{ rebuild: SiteRebuildOut; built: string | null } | null>(null);
  const [asking, setAsking] = useState<"idle" | "busy" | "unavailable" | "failed">("idle");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.all([run<SiteRebuildOut>((client, init) => client.getRebuild(init)), builtAt()])
      .then(([rebuild, built]) => live && setState({ rebuild, built }))
      .catch(() => live && setState(null));
    return () => {
      live = false;
    };
  }, [changed, tick]);

  const published = state?.rebuild.published_at ?? null;
  const started = state?.rebuild.started_at ?? null;
  const built = state?.built ?? null;
  const time = (value: string | null) => (value ? new Date(value).getTime() : 0);
  const behind = Boolean(published && time(published) > time(built));
  const updating = behind && time(started) >= time(published);
  // A build takes minutes; one asked for long ago that the site does not show may have failed.
  const stalled = updating && Date.now() - time(started) > STALLED_MS;

  // While the site is behind, look again every half minute.
  useEffect(() => {
    if (!behind) return;
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [behind]);

  if (!state) return null;
  const updateNow = async () => {
    setAsking("busy");
    try {
      const [{ privately }, client] = await api();
      const response = await privately((init) => client.startRebuild(init));
      if (response.status === 503) return setAsking("unavailable");
      if (response.status !== 200) return setAsking("failed");
      setState({ ...state, rebuild: response.data });
      setAsking("idle");
    } catch {
      setAsking("failed");
    }
  };

  return (
    <div role="status" className={cn(card, "flex flex-wrap items-center justify-between gap-3 p-4 text-sm")}>
      <p className="text-ink-muted">
        {!behind
          ? built
            ? t("account.content.site.upToDate", { at: moment(built) })
            : t("account.content.site.noBuild")
          : stalled
            ? t("account.content.site.stalled")
            : updating
              ? t("account.content.site.updating", { ago: started ? ago(started) : "" })
              : t("account.content.site.behind", { minutes: state.rebuild.quiet_minutes })}
        {asking === "unavailable" && <span className="block text-danger">{t("account.content.site.unavailable")}</span>}
        {asking === "failed" && <span className="block text-danger">{t("account.content.site.failed")}</span>}
      </p>
      {behind && (!updating || stalled) && (
        <Button size="sm" variant="outline" disabled={asking === "busy"} onClick={() => void updateNow()}>
          {t("account.content.site.updateNow")}
        </Button>
      )}
    </div>
  );
}

type Run = (
  client: Awaited<ReturnType<typeof api>>[1],
  init: RequestInit,
) => Promise<{ status: number; data: unknown }>;

/** One private call; an answer other than 200 is an error. */
async function run<T>(call: Run): Promise<T> {
  const [{ privately }, client] = await api();
  const response = await privately((init) => call(client, init));
  if (response.status !== 200) throw new Error(String(response.status));
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

  // A waiting draft is where the editor goes on from: the form starts from it, else from what the site shows.
  const base = (found: SiteTextOut) =>
    Object.fromEntries(languages.map((l) => [l, found.draft?.[l] ?? found.current[l]])) as Values;
  const show = (found: SiteTextOut) => {
    setText(found);
    setValues(base(found));
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
  const differing = (from: Partial<Values>) =>
    Object.fromEntries(
      languages.filter((l) => !same(values[l], from[l])).map((l) => [l, values[l]]),
    ) as Partial<Values>;
  // What the site would change, and what the editor changed since opening the text (or its draft).
  const toPublish = differing(text.current as Partial<Values>);
  const edited = differing(base(text));
  const valid = languages.every((l) => !problems[l]);
  const untouched = Object.keys(edited).length === 0;
  // An untouched draft is published as it is; otherwise the form is what gets published.
  const canPublish = valid && (untouched && text.draft ? true : Object.keys(toPublish).length > 0);

  const act = async (call: Run, done: AccountKey) => {
    setBusy(true);
    setNotice(null);
    try {
      show(await run<SiteTextOut>(call));
      // An open history shows the change just made.
      if (versions !== null) loadVersions();
      setNotice({ tone: "done", text: t(done) });
      onChanged();
    } catch {
      setNotice({ tone: "failed", text: t("account.content.saveFailed") });
    } finally {
      setBusy(false);
    }
  };
  const publish = () =>
    untouched && text.draft
      ? act((client, init) => client.publishText(textKey, init), "account.content.published")
      : act(
          (client, init) => client.putText(textKey, { texts: toPublish, publish: true }, init),
          "account.content.published",
        );
  const saveDraft = () =>
    act((client, init) => client.putText(textKey, { texts: edited, publish: false }, init), "account.content.drafted");
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
                    {t(form === "one" ? "account.content.forms.singular" : "account.content.forms.plural")}
                    <Input
                      id={form === "one" ? id : undefined}
                      aria-label={`${t(`account.content.languages.${language}`)}: ${t(form === "one" ? "account.content.forms.singular" : "account.content.forms.plural")}`}
                      value={value[form]}
                      aria-invalid={issue ? true : undefined}
                      aria-describedby={`${id}-help`}
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
                <p className="text-danger">{t(`account.content.problems.${issue.kind}`, { names: issue.names })}</p>
              )}
              {!same(value, fallback) && (
                <p className="text-ink-subtle">
                  {t("account.content.default")}: {words(fallback).join(" / ")}
                </p>
              )}
            </div>
            {text.format === "markdown" && (
              <div className="grid gap-1">
                <p className="text-xs text-ink-subtle">{t("account.content.preview")}</p>
                <div
                  className="rich-text rounded-sm bg-surface-muted p-3 text-sm text-ink-muted"
                  dangerouslySetInnerHTML={{ __html: markdown(preview(value)) }}
                />
              </div>
            )}
          </div>
        );
      })}

      {text.format === "markdown" && <p className="text-xs text-ink-subtle">{t("account.content.markdownHelp")}</p>}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !canPublish} onClick={() => void publish()}>
          {t("account.content.publish")}
        </Button>
        <Button variant="outline" disabled={busy || !valid || untouched} onClick={() => void saveDraft()}>
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
      <p role="status" className={cn("min-h-5 text-sm", notice?.tone === "failed" ? "text-danger" : "text-ink-muted")}>
        {notice?.text}
      </p>

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
          void act((client, init) => client.restoreText(textKey, { version: null }, init), "account.content.restored");
        }}
        onCancel={() => setConfirming(false)}
      />
    </article>
  );
}
