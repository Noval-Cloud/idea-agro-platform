import { useEffect, useState } from "react";
import type { SiteTextMatch } from "@idea-agro/api-client";
import { indicatorIds, type IndicatorId } from "@/data/indicators";
import { cn } from "@/lib/utils";
import { IndicatorArticles } from "./ContentArticles";
import type { AccountKey, AccountTranslator } from "./i18n";
import { Badge, card, Editor, preview, run } from "./TextEditor";

type Props = { translator: AccountTranslator; changed: number; onChanged: () => void };

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

const chosenFromAddress = (): IndicatorId => {
  const wanted = new URLSearchParams(location.search).get("id");
  return indicatorIds.find((id) => id === wanted) ?? indicatorIds[0];
};

/**
 * For editors: each indicator in one place, its texts and the articles it cites. The indicator in the address
 * (`?id=ppna`) opens first, so a link leads to it.
 */
export function Indicators({ translator, changed, onChanged }: Props) {
  const { t } = translator;
  // The page only renders in the browser, once the account loads.
  const [indicator, setIndicator] = useState<IndicatorId>(chosenFromAddress);
  const choose = (id: IndicatorId) => {
    setIndicator(id);
    history.replaceState(history.state, "", `${location.pathname}?id=${id}`);
  };
  const name = (id: IndicatorId) => t(`indicators.items.${id}.name` as AccountKey);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
      <nav aria-label={t("account.subpages.indicators")}>
        <ul className="flex flex-wrap gap-1 lg:grid lg:gap-0.5">
          {indicatorIds.map((id) => (
            <li key={id}>
              <a
                href={`?id=${id}`}
                aria-current={indicator === id ? "page" : undefined}
                onClick={(event) => {
                  // A click meant for a new tab or window stays the browser's.
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  choose(id);
                }}
                className={cn(
                  "block rounded-sm px-3 py-2 text-sm transition-colors duration-(--ia-motion-fast)",
                  indicator === id ? "bg-surface-selected font-medium text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {name(id)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div key={indicator} className="grid min-w-0 content-start gap-6">
        <h3 className="font-display text-2xl font-medium text-ink">{name(indicator)}</h3>
        <section className={cn(card, "grid gap-3 p-5 sm:p-6")} aria-labelledby="indicator-texts">
          <h4 id="indicator-texts" className="text-sm font-medium text-ink">
            {t("account.content.indicator.texts")}
          </h4>
          <IndicatorTexts translator={translator} indicator={indicator} changed={changed} onChanged={onChanged} />
        </section>
        <section className={cn(card, "grid gap-3 p-5 sm:p-6")} aria-labelledby="indicator-articles">
          <h4 id="indicator-articles" className="text-sm font-medium text-ink">
            {t("account.content.indicator.articles")}
          </h4>
          <IndicatorArticles translator={translator} indicator={indicator} changed={changed} onChanged={onChanged} />
        </section>
      </div>
    </div>
  );
}

/** The indicator's texts, each opened in the texts' editor right where it is listed. */
function IndicatorTexts({ translator, indicator, changed, onChanged }: Props & { indicator: IndicatorId }) {
  const { t } = translator;
  const [texts, setTexts] = useState<SiteTextMatch[] | null | "failed">(null);
  const [open, setOpen] = useState<string | null>(null);
  const prefix = `indicators.items.${indicator}.`;

  useEffect(() => {
    let live = true;
    run<SiteTextMatch[]>((client, init) => client.listSection("indicators", init))
      .then(
        (found) =>
          live &&
          setTexts(
            found
              .filter((m) => m.key.startsWith(prefix))
              .sort((a, b) => rank(a.key.slice(prefix.length)) - rank(b.key.slice(prefix.length))),
          ),
      )
      .catch(() => live && setTexts("failed"));
    return () => {
      live = false;
    };
  }, [prefix, changed]);

  if (texts === null) return <p className="text-sm text-ink-muted">{t("account.loading")}</p>;
  if (texts === "failed") return <p className="text-sm text-danger">{t("account.content.listFailed")}</p>;

  const label = (key: string) => {
    const field = key.slice(prefix.length);
    const wanted = `account.content.indicatorFields.${field}`;
    return translator.has(wanted) ? t(wanted as AccountKey) : field;
  };

  return (
    <ul className="grid divide-y divide-line">
      {texts.map((match) => (
        <li key={match.key} className="py-2">
          <button
            type="button"
            aria-expanded={open === match.key}
            onClick={() => setOpen(open === match.key ? null : match.key)}
            className="grid w-full gap-1 rounded-sm px-2 py-1 text-left transition-colors duration-(--ia-motion-fast) hover:bg-action-soft"
          >
            <span className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
              {label(match.key)}
              {match.edited && <Badge>{t("account.content.edited")}</Badge>}
              {match.draft && <Badge tone="draft">{t("account.content.draft")}</Badge>}
            </span>
            <span className="line-clamp-2 text-sm text-ink">{preview(match.current.es)}</span>
          </button>
          {open === match.key && (
            <div className="mt-2">
              <Editor textKey={match.key} translator={translator} onChanged={onChanged} Heading="h5" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
