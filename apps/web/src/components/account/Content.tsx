import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, RefreshCw, SearchX } from "lucide-react";
import type { SiteRebuildOut, SiteTextMatch, TextSection } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/lists/EmptyState";
import { FilterSelect } from "@/components/lists/FilterSelect";
import { ListCount, ListToolbar, underToolbar } from "@/components/lists/ListToolbar";
import { SearchField } from "@/components/lists/SearchField";
import { useQueryState } from "@/components/lists/state";
import { cn } from "@/lib/utils";
import { Articles } from "./ContentArticles";
import { Indicators } from "./ContentIndicators";
import { type AccountKey, type AccountTranslator } from "./i18n";
import { PageHeader } from "./PageHeader";
import { accountSubpages } from "./paths";
import { api, Badge, preview, run, TextPanel, type Run } from "./TextEditor";

type ContentPage = (typeof accountSubpages.content)[number];
const statuses = ["all", "edited", "draft"] as const;
type Status = (typeof statuses)[number];

/**
 * The Content section's pages, for editors and admins: the site's texts, the articles, and each indicator. Each
 * page's title says whether the site shows what was published yet.
 */
export default function Content({ translator, page }: { translator: AccountTranslator; page: ContentPage }) {
  const { t } = translator;
  // Grows after every change, so the status and the lists show what changed.
  const [changed, setChanged] = useState(0);
  const onChanged = () => setChanged((n) => n + 1);
  return (
    <section id="content" aria-labelledby="content-title" className="grid gap-6">
      <PageHeader id="content-title" title={t(`account.subpages.${page}`)}>
        <SiteStatus translator={translator} changed={changed} />
      </PageHeader>
      {page === "texts" && <Texts translator={translator} changed={changed} onChanged={onChanged} />}
      {page === "articles" && <Articles translator={translator} changed={changed} onChanged={onChanged} />}
      {page === "indicators" && <Indicators translator={translator} changed={changed} onChanged={onChanged} />}
    </section>
  );
}

/**
 * Every text the site shows. It opens on the site's sections; a search, a section or a state lists texts, and
 * each opens in a side panel. The filters live in the address.
 */
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
  const [query, setQuery] = useQueryState("q", "");
  const [section, setSection] = useQueryState("section", "all");
  const [statusValue, setStatus] = useQueryState("status", "all");
  const status: Status = statuses.find((s) => s === statusValue) ?? "all";
  const [sections, setSections] = useState<TextSection[] | null>(null);
  // null: no filter, the sections show; "loading" and "failed" while and when a list does not arrive.
  const [list, setList] = useState<SiteTextMatch[] | null | "loading" | "failed">(null);
  const [open, setOpen] = useState<string | null>(null);

  // A new filter shows "loading"; a reload after a change keeps the list, and its scroll, until it arrives.
  const asked = useRef("");
  useEffect(() => {
    let live = true;
    const wanted = `${query}|${section}|${status}`;
    const fresh = asked.current !== wanted;
    asked.current = wanted;
    const q = query.trim();
    const call: Run | null = q
      ? (client, init) => client.searchTexts({ q }, init)
      : section !== "all"
        ? (client, init) => client.listSection(section, init)
        : status !== "all"
          ? (client, init) => client.listChanges(init)
          : null;
    const timer = setTimeout(() => {
      if (!call) return setList(null);
      if (fresh) setList("loading");
      void run<SiteTextMatch[]>(call)
        .then((found) => live && setList(found))
        .catch(() => live && setList("failed"));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, section, status, changed]);

  useEffect(() => {
    let live = true;
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSections(init)))
      .then((response) => live && setSections(response.status === 200 ? response.data : []))
      .catch(() => live && setSections([]));
    return () => {
      live = false;
    };
  }, [changed]);

  const sectionName = (name: string) => {
    const key = `account.content.sections.${name}`;
    return translator.has(key) ? t(key as AccountKey) : name;
  };
  const shown = Array.isArray(list)
    ? list.filter(
        (m) =>
          (section === "all" || m.key.startsWith(`${section}.`)) &&
          (status === "all" || (status === "draft" ? m.draft : m.edited)),
      )
    : list;
  const totals = (sections ?? []).reduce((sum, s) => ({ edited: sum.edited + s.edited, draft: sum.draft + s.drafts }), {
    edited: 0,
    draft: 0,
  });
  const clear = () => {
    setQuery("");
    setSection("all");
    setStatus("all");
  };

  return (
    <div className="grid gap-4">
      <ListToolbar
        end={
          <Segmented value={status} onValueChange={setStatus} aria-label={t("account.content.statusLabel")}>
            {statuses.map((s) => (
              <SegmentedItem key={s} value={s}>
                {t(`account.content.statuses.${s}`)}
                {s !== "all" && totals[s] > 0 && <span className="text-xs text-ink-subtle">{totals[s]}</span>}
              </SegmentedItem>
            ))}
          </Segmented>
        }
      >
        <SearchField
          t={t}
          value={query}
          label={t("account.content.searchLabel")}
          onChange={setQuery}
          className="sm:w-80"
        />
        <FilterSelect
          label={t("account.content.sectionLabel")}
          value={section}
          all={t("account.content.allSections")}
          options={(sections ?? []).map((s) => s.name)}
          labelOf={sectionName}
          onChange={setSection}
        />
        {Array.isArray(shown) && <ListCount>{t("account.content.textCount", { count: shown.length })}</ListCount>}
      </ListToolbar>

      <div className={cn("grid gap-2", underToolbar)}>
        {shown === null ? (
          <SectionGrid sections={sections} name={sectionName} translator={translator} onPick={setSection} />
        ) : (
          <>
            {section !== "all" && !query && (
              <Button variant="ghost" size="sm" className="-ml-3 justify-self-start" onClick={() => setSection("all")}>
                <ChevronLeft aria-hidden="true" />
                {t("account.content.allSections")}
              </Button>
            )}
            {shown === "loading" && (
              <p role="status" className="text-sm text-ink-muted">
                {t("account.loading")}
              </p>
            )}
            {shown === "failed" && (
              <p role="alert" className="text-sm text-danger">
                {t("account.content.listFailed")}
              </p>
            )}
            {Array.isArray(shown) && shown.length === 0 && (
              <EmptyState icon={<SearchX />} title={t("lists.noResults.title")} body={t("lists.noResults.body")}>
                <Button size="sm" variant="outline" onClick={clear}>
                  {t("lists.clearFilters")}
                </Button>
              </EmptyState>
            )}
            {Array.isArray(shown) && shown.length > 0 && (
              <ul className="grid divide-y divide-line rounded-lg border border-line bg-surface">
                {shown.map((match) => (
                  <li key={match.key}>
                    <button
                      type="button"
                      onClick={() => setOpen(match.key)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--ia-motion-fast) hover:bg-action-soft"
                    >
                      <span className="grid min-w-0 grow gap-1">
                        <span lang="es" className="line-clamp-2 text-sm text-ink">
                          {preview(match.current.es)}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                          <code className="break-all">{match.key}</code>
                          {match.edited && <Badge>{t("account.content.edited")}</Badge>}
                          {match.draft && <Badge tone="draft">{t("account.content.draft")}</Badge>}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {open && (
        <TextPanel
          key={open}
          textKey={open}
          translator={translator}
          onChanged={onChanged}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** The site's sections, as the way in when nothing is searched: what each holds and what changed in it. */
function SectionGrid({
  sections,
  name,
  translator,
  onPick,
}: {
  sections: TextSection[] | null;
  name: (section: string) => string;
  translator: AccountTranslator;
  onPick: (section: string) => void;
}) {
  const { t } = translator;
  if (sections === null)
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("account.loading")}
      </p>
    );
  const sorted = [...sections].sort((a, b) => translator.collator.compare(name(a.name), name(b.name)));
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((s) => (
        <li key={s.name}>
          <button
            type="button"
            onClick={() => onPick(s.name)}
            className="grid h-full w-full content-start gap-1.5 rounded-lg border border-line bg-surface p-4 text-left transition-colors duration-(--ia-motion-fast) hover:border-line-strong hover:bg-action-soft"
          >
            <span className="text-sm font-medium text-ink">{name(s.name)}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
              {t("account.content.textCount", { count: s.count })}
              {s.edited > 0 && <Badge>{t("account.content.editedCount", { count: s.edited })}</Badge>}
              {s.drafts > 0 && <Badge tone="draft">{t("account.content.draftCount", { count: s.drafts })}</Badge>}
            </span>
          </button>
        </li>
      ))}
    </ul>
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
 * Whether the site shows what editors published: behind, updating, or up to date, in one line. Changes
 * accumulate; the site rebuilds by itself some minutes after the last one, or at once when asked.
 */
function SiteStatus({ translator, changed }: { translator: AccountTranslator; changed: number }) {
  const { t, ago } = translator;
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
      // The button goes once the update starts; focus moves to the page's title, which the state sits beside.
      requestAnimationFrame(() => document.getElementById("content-title")?.focus());
    } catch {
      setAsking("failed");
    }
  };
  const Icon = !behind ? Check : stalled ? AlertTriangle : updating ? RefreshCw : Clock;
  const words = !behind
    ? built
      ? t("account.content.site.upToDate", { ago: ago(built) })
      : t("account.content.site.noBuild")
    : stalled
      ? t("account.content.site.stalled")
      : updating
        ? t("account.content.site.updating")
        : t("account.content.site.behind");
  const hint = t("account.content.site.behindHint", { minutes: state.rebuild.quiet_minutes });

  return (
    <TooltipProvider delayDuration={300}>
      <div role="status" className="inline-flex items-center gap-1.5 text-sm text-ink-subtle">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0",
            stalled && "text-danger",
            updating && !stalled && "animate-spin motion-reduce:animate-none",
          )}
        />
        {/* The rule behind the wait goes in a tooltip; the state itself is a few words. */}
        {behind && !updating ? (
          <Tooltip label={hint}>
            {/* Focusable, so the hint opens from the keyboard too. */}
            <span tabIndex={0} className="rounded-xs">
              {words}
            </span>
          </Tooltip>
        ) : (
          <span>{words}</span>
        )}
        {behind && (!updating || stalled) && (
          <span id="site-hint" className="sr-only">
            {hint}
          </span>
        )}
        {behind && (!updating || stalled) && (
          <Tooltip label={t("account.content.site.updateNow")}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("account.content.site.updateNow")}
              aria-describedby="site-hint"
              busy={asking === "busy"}
              onClick={() => void updateNow()}
              className="size-7 text-ink-muted hover:text-ink"
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
        {asking === "unavailable" && <span className="text-danger">{t("account.content.site.unavailable")}</span>}
        {asking === "failed" && <span className="text-danger">{t("account.content.site.failed")}</span>}
      </div>
    </TooltipProvider>
  );
}
