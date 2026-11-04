import { useEffect, useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { IndicatorVisibilityOut, SiteTextMatch } from "@idea-agro/api-client";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchField } from "@/components/lists/SearchField";
import { matches } from "@/components/lists/filter";
import { earthEngineLink, earthEngineSources } from "@/data/earth-engine";
import { indicatorIds, type IndicatorId } from "@/data/indicators";
import { cn } from "@/lib/utils";
import { IndicatorArticles, usePublished } from "./ContentArticles";
import type { AccountKey, AccountTranslator } from "./i18n";
import { Badge, preview, run, TextPanel } from "./TextEditor";

type Props = { translator: AccountTranslator; changed: number; onChanged: () => void };
const tabs = ["texts", "articles", "gee"] as const;
type Tab = (typeof tabs)[number];

// An indicator's texts in the order its page reads; a field missing here goes last.
const fieldOrder = [
  "name",
  "short",
  "longName",
  "measures",
  "method",
  "unit",
  "cadence",
  "period",
  "resolution",
  "mapShows",
  "chartTitle",
  "chartUnit",
];
const rank = (field: string) => {
  const found = fieldOrder.indexOf(field);
  return found < 0 ? fieldOrder.length : found;
};
const prefix = (id: IndicatorId) => `indicators.items.${id}.`;

/** The indicator and tab in the address (`?id=ppna&tab=articles`), so a link leads to them. */
const fromAddress = () => {
  const params = new URLSearchParams(location.search);
  return {
    indicator: indicatorIds.find((id) => id === params.get("id")) ?? indicatorIds[0],
    tab: tabs.find((tab) => tab === params.get("tab")) ?? "texts",
  };
};

/**
 * For editors: each indicator in one place, with whether the site shows it, and in tabs: its texts, the articles it
 * cites, and the Earth Engine assets it is computed from.
 */
export function Indicators({ translator, changed, onChanged }: Props) {
  const { t } = translator;
  // The page only renders in the browser, once the account loads.
  const [{ indicator, tab }, setPlace] = useState(fromAddress);
  const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<SiteTextMatch[] | null | "failed">(null);
  const published = usePublished(changed);
  // Indicators editors hid; null until known.
  const [hidden, setHidden] = useState<Set<IndicatorId> | null>(null);

  const go = (next: { indicator: IndicatorId; tab: Tab }) => {
    setPlace(next);
    const search = `?id=${next.indicator}${next.tab === "texts" ? "" : `&tab=${next.tab}`}`;
    history.replaceState(history.state, "", `${location.pathname}${search}`);
  };

  useEffect(() => {
    let live = true;
    run<SiteTextMatch[]>((client, init) => client.listSection("indicators", init))
      .then((found) => live && setTexts(found.filter((m) => m.key.startsWith("indicators.items."))))
      .catch(() => live && setTexts("failed"));
    return () => {
      live = false;
    };
  }, [changed]);

  useEffect(() => {
    let live = true;
    run<IndicatorVisibilityOut[]>((client, init) => client.listVisibility(init))
      .then((found) => live && setHidden(new Set(found.filter((v) => !v.shown).map((v) => v.indicator))))
      .catch(() => live && setHidden(null));
    return () => {
      live = false;
    };
  }, [changed]);

  const name = (id: IndicatorId) => t(`indicators.items.${id}.name` as AccountKey);
  const isHidden = (id: IndicatorId) => hidden?.has(id) ?? false;
  const short = (id: IndicatorId) => t(`indicators.items.${id}.short` as AccountKey);
  const own = (id: IndicatorId) => (Array.isArray(texts) ? texts.filter((m) => m.key.startsWith(prefix(id))) : []);
  const cited = (id: IndicatorId) =>
    published && published !== "failed" ? (published.citations[id] ?? []).length : null;
  const listed = indicatorIds.filter((id) => matches(query, name(id), short(id)));
  const meta = (id: IndicatorId) => {
    const mine = own(id);
    const edited = mine.filter((m) => m.edited).length;
    const drafts = mine.filter((m) => m.draft).length;
    const articles = cited(id);
    return [
      articles === null ? null : t("account.content.indicator.articleCount", { count: articles }),
      edited ? t("account.content.editedCount", { count: edited }) : null,
      drafts ? t("account.content.draftCount", { count: drafts }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div className="grid content-start gap-3">
        <label className="grid gap-1 text-sm text-ink lg:hidden">
          {t("account.content.indicator.pick")}
          <select
            className="h-11 rounded-sm border border-input bg-surface px-3 text-base text-ink"
            value={indicator}
            onChange={(event) => go({ indicator: event.target.value as IndicatorId, tab })}
          >
            {indicatorIds.map((id) => (
              <option key={id} value={id}>
                {isHidden(id) ? `${name(id)} · ${t("account.content.indicator.hidden")}` : name(id)}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden lg:block">
          <SearchField
            id="indicator-search"
            collapsible={false}
            t={t}
            value={query}
            onChange={setQuery}
            label={t("account.content.indicator.search")}
            className="sm:w-full"
          />
        </div>
        <nav aria-label={t("account.subpages.indicators")} className="hidden lg:block">
          <ul className="grid gap-0.5">
            {listed.map((id) => (
              <li key={id}>
                <a
                  href={`?id=${id}`}
                  aria-current={indicator === id ? "page" : undefined}
                  onClick={(event) => {
                    // A click meant for a new tab or window stays the browser's.
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    go({ indicator: id, tab });
                  }}
                  className={cn(
                    "grid gap-0.5 rounded-sm px-3 py-2 transition-colors duration-(--ia-motion-fast)",
                    indicator === id ? "bg-surface-selected" : "hover:bg-action-soft",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      indicator === id ? "font-medium text-ink" : isHidden(id) ? "text-ink-muted" : "text-ink",
                    )}
                  >
                    {name(id)}
                    {isHidden(id) && <Badge tone="off">{t("account.content.indicator.hidden")}</Badge>}
                  </span>
                  <span className="text-xs text-ink-subtle">{meta(id) || short(id)}</span>
                </a>
              </li>
            ))}
            {listed.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">{t("lists.noResults.title")}</li>}
          </ul>
        </nav>
      </div>

      <div key={indicator} className="grid min-w-0 content-start gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="grid gap-0.5">
            <h3 className="text-lg font-medium text-ink">{name(indicator)}</h3>
            <p className="text-sm text-ink-muted">
              {short(indicator)} · {t(`indicators.items.${indicator}.longName` as AccountKey)}
            </p>
          </div>
          <ShownSwitch
            translator={translator}
            indicator={indicator}
            shown={hidden === null ? null : !hidden.has(indicator)}
            onSwitched={(shown) => {
              setHidden((before) => {
                const next = new Set(before);
                if (shown) next.delete(indicator);
                else next.add(indicator);
                return next;
              });
              onChanged();
            }}
          />
        </div>
        <Tabs value={tab} onValueChange={(value) => go({ indicator, tab: value as Tab })}>
          <div className="border-b border-line">
            <TabsList aria-label={t("account.content.indicator.tabsLabel")}>
              <TabsTrigger value="texts" count={Array.isArray(texts) ? String(own(indicator).length) : undefined}>
                {t("account.content.indicator.texts")}
              </TabsTrigger>
              <TabsTrigger value="articles" count={cited(indicator) === null ? undefined : String(cited(indicator))}>
                {t("account.content.indicator.articles")}
              </TabsTrigger>
              <TabsTrigger value="gee">{t("account.content.indicator.gee")}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="texts" className="pt-4">
            <IndicatorTexts
              translator={translator}
              indicator={indicator}
              texts={texts === "failed" ? "failed" : texts === null ? null : own(indicator)}
              onChanged={onChanged}
            />
          </TabsContent>
          <TabsContent value="articles" className="pt-4">
            <IndicatorArticles
              translator={translator}
              indicator={indicator}
              published={published}
              onChanged={onChanged}
            />
          </TabsContent>
          <TabsContent value="gee" className="pt-4">
            <IndicatorEarthEngine translator={translator} indicator={indicator} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Whether the site and the public API show the indicator. A change is saved at once, and reaches the site when it is
 * rebuilt, as a published text does.
 */
function ShownSwitch({
  translator,
  indicator,
  shown,
  onSwitched,
}: {
  translator: AccountTranslator;
  indicator: IndicatorId;
  /** null until known. */
  shown: boolean | null;
  onSwitched: (shown: boolean) => void;
}) {
  const { t } = translator;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = `shown-${indicator}`;
  const change = async (next: boolean) => {
    setBusy(true);
    setFailed(false);
    try {
      await run<IndicatorVisibilityOut>((client, init) => client.putVisibility(indicator, { shown: next }, init));
      onSwitched(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid max-w-sm gap-1.5">
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          checked={shown ?? true}
          disabled={shown === null || busy}
          onCheckedChange={(next) => void change(next)}
          aria-describedby={`${id}-hint`}
        />
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {t("account.content.indicator.shown")}
        </label>
      </div>
      <p id={`${id}-hint`} className="text-xs text-ink-subtle">
        {t("account.content.indicator.shownHint")}
      </p>
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t("account.content.indicator.switchFailed")}
        </p>
      )}
    </div>
  );
}

/** The indicator's texts as the site shows them; each opens in the texts' side panel. */
function IndicatorTexts({
  translator,
  indicator,
  texts,
  onChanged,
}: {
  translator: AccountTranslator;
  indicator: IndicatorId;
  texts: SiteTextMatch[] | null | "failed";
  onChanged: () => void;
}) {
  const { t } = translator;
  const [open, setOpen] = useState<string | null>(null);

  if (texts === null) return <p className="text-sm text-ink-muted">{t("account.loading")}</p>;
  if (texts === "failed") return <p className="text-sm text-danger">{t("account.content.listFailed")}</p>;

  const field = (key: string) => key.slice(prefix(indicator).length);
  const label = (key: string) => {
    const wanted = `account.content.indicatorFields.${field(key)}`;
    return translator.has(wanted) ? t(wanted as AccountKey) : field(key);
  };
  const sorted = [...texts].sort((a, b) => rank(field(a.key)) - rank(field(b.key)));

  return (
    <>
      <ul className="grid divide-y divide-line rounded-lg border border-line bg-surface">
        {sorted.map((match) => (
          <li key={match.key}>
            <button
              type="button"
              onClick={() => setOpen(match.key)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors duration-(--ia-motion-fast) hover:bg-action-soft sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
            >
              <span className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle sm:text-sm">
                {label(match.key)}
                {match.edited && <Badge>{t("account.content.edited")}</Badge>}
                {match.draft && <Badge tone="draft">{t("account.content.draft")}</Badge>}
              </span>
              <span lang="es" className="col-start-1 line-clamp-3 text-sm text-ink sm:col-start-2 sm:row-start-1">
                {preview(match.current.es)}
              </span>
              <ChevronRight
                aria-hidden="true"
                className="col-start-2 row-span-2 row-start-1 size-4 text-ink-subtle sm:col-start-3 sm:row-span-1"
              />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <TextPanel
          key={open}
          textKey={open}
          label={`${label(open)} · ${t(`indicators.items.${indicator}.name` as AccountKey)}`}
          translator={translator}
          onChanged={onChanged}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/** The Earth Engine assets the indicator is computed from, and the scripts that keep them up to date. */
function IndicatorEarthEngine({ translator, indicator }: { translator: AccountTranslator; indicator: IndicatorId }) {
  const { t } = translator;
  return (
    <div className="grid gap-6">
      <section aria-labelledby="gee-assets" className="grid gap-3">
        <h4 id="gee-assets" className="text-sm font-medium text-ink">
          {t("account.content.gee.assets")}
        </h4>
        <ul className="grid divide-y divide-line rounded-lg border border-line bg-surface">
          {earthEngineSources[indicator].map((source) => (
            <li key={source.asset} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="grid min-w-0 grow gap-1">
                <code className="text-sm break-all text-ink">{source.asset}</code>
                <p className="text-xs text-ink-subtle">
                  {t(`account.content.gee.cadences.${source.cadence}`)}
                  {source.bands && (
                    <>
                      {" · "}
                      {t("account.content.gee.bands")} <code>{source.bands}</code>
                    </>
                  )}
                </p>
              </div>
              <a
                href={earthEngineLink(source.asset)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-link hover:underline"
              >
                {t("account.content.gee.open")}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="gee-scripts" className="grid gap-3">
        <h4 id="gee-scripts" className="text-sm font-medium text-ink">
          {t("account.content.gee.scripts")}
        </h4>
        <p className="rounded-lg border border-dashed border-line p-6 text-sm text-ink-muted">
          {t("account.content.gee.scriptsEmpty")}
        </p>
      </section>
    </div>
  );
}
