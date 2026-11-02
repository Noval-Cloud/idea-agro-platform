import { useEffect, useRef, useState } from "react";
import type { SiteRebuildOut, SiteTextMatch, TextSection } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Articles } from "./ContentArticles";
import { Indicators } from "./ContentIndicators";
import { accountSubpages, type AccountKey, type AccountTranslator } from "./i18n";
import { api, Badge, card, Editor, field, preview, run, type Run } from "./TextEditor";

type View = "search" | "sections" | "changes";
type ContentPage = (typeof accountSubpages.content)[number];

/**
 * The Content section's pages, for editors and admins: the site's texts, the articles, and each indicator. Every
 * page tells whether the site shows what was published yet.
 */
export default function Content({ translator, page }: { translator: AccountTranslator; page: ContentPage }) {
  const { t } = translator;
  // Grows after every change, so the status and the lists show what changed.
  const [changed, setChanged] = useState(0);
  const onChanged = () => setChanged((n) => n + 1);
  return (
    <section id="content" aria-labelledby="content-title" className="grid gap-6 pt-8">
      <div className="max-w-prose">
        <h2 id="content-title" className="text-lg font-medium text-ink">
          {t(`account.subpages.${page}`)}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t(`account.content.lead.${page}`)}</p>
      </div>
      <SiteStatus translator={translator} changed={changed} />
      {page === "texts" && <Texts translator={translator} changed={changed} onChanged={onChanged} />}
      {page === "articles" && <Articles translator={translator} changed={changed} onChanged={onChanged} />}
      {page === "indicators" && <Indicators translator={translator} changed={changed} onChanged={onChanged} />}
    </section>
  );
}

/** Every text the site shows, found by what it says, by part of the site or among the changes, and edited. */
function Texts({
  translator,
  changed,
  onChanged,
}: {
  translator: AccountTranslator;
  changed: number;
  onChanged: () => void;
}) {
  const { t } = translator;
  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<TextSection[] | null>(null);
  const [section, setSection] = useState<string | null>(null);
  // null: nothing asked yet; "loading" and "failed" while and when a list does not arrive.
  const [list, setList] = useState<SiteTextMatch[] | null | "loading" | "failed">(null);
  const [selected, setSelected] = useState<string | null>(null);

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
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-3">
          <div role="group" aria-label={t("account.content.viewsLabel")} className="flex gap-1">
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
            <Editor key={selected} textKey={selected} translator={translator} onChanged={onChanged} />
          ) : (
            <p className={cn(card, "p-6 text-sm text-ink-muted")}>{t("account.content.pickText")}</p>
          )}
        </div>
      </div>
    </>
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
