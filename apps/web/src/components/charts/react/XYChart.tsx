import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { finite, linear, linePath, niceTicks } from "../scale";
import { cn } from "@/lib/utils";
import RangeBar, { type RangeText } from "./RangeBar";

/*
 * The client twin of the Astro LineChart/BarChart: same classes, same reading rules.
 * Thin marks, recessive grid, a legend whenever two or more things are drawn, a crosshair
 * and tooltip on hover, arrow keys for keyboard readers, and the numbers as a table.
 */

export type ChartSeries = {
  key: string;
  label: string;
  values: (number | null)[];
  color: string;
  /** The series the chart is about; others recede. */
  emphasis?: boolean;
  /** Each value drawn as a dot on the line, for series read value by value. */
  points?: boolean;
};
export type ChartBand = { label: string; lower: (number | null)[]; upper: (number | null)[]; color: string };
export type ChartReference = { label: string; value: number; color: string };

interface Props {
  title: string;
  summary: string;
  instructions: string;
  mode: "line" | "bar";
  xLabels: string[];
  xTicks: { index: number; label: string; minor?: boolean }[];
  series: ChartSeries[];
  band?: ChartBand;
  reference?: ChartReference;
  format: (value: number) => string;
  yFromZero?: boolean;
  /** Fixed y domain (for shares and indices); otherwise nice ticks around the data. */
  domain?: [number, number];
  table: { label: string; caption: string; xHeader: string };
  height?: "md" | "lg";
  /** False when the page draws its own legend, as one that adds and removes series. */
  legend?: boolean;
  /** A bar under the chart to narrow it to a stretch of the x axis. */
  zoom?: RangeText;
}

/** The props narrowed to the indexes from `start` to `end`, ticks renumbered; a short stretch gets its own ticks. */
function windowed(props: Props, start: number, end: number) {
  const cut = <T,>(values: T[]) => values.slice(start, end + 1);
  const inside = props.xTicks.filter((t) => t.index >= start && t.index <= end);
  const length = end - start + 1;
  const every = Math.max(1, Math.ceil(length / 6));
  const xTicks =
    inside.length >= 2
      ? inside.map((t) => ({ ...t, index: t.index - start }))
      : Array.from({ length }, (_, i) => i)
          .filter((i) => i % every === 0)
          .map((i) => ({ index: i, label: props.xLabels[start + i], minor: false }));
  return {
    xLabels: cut(props.xLabels),
    xTicks,
    series: props.series.map((s) => ({ ...s, values: cut(s.values) })),
    band: props.band && { ...props.band, lower: cut(props.band.lower), upper: cut(props.band.upper) },
  };
}

/** The series drawn behind the range bar: the one with the most values, so a year in progress does not stop it short. */
const overview = (series: ChartSeries[]) =>
  series.reduce<ChartSeries | null>(
    (best, s) => (!best || finite(s.values).length > finite(best.values).length ? s : best),
    null,
  )?.values ?? [];

export default function XYChart(props: Props) {
  const full = props.xLabels.length;
  const [range, setRange] = useState<[number, number]>([0, Math.max(0, full - 1)]);
  // A new axis (another year, another indicator) shows whole again.
  useEffect(() => setRange([0, Math.max(0, full - 1)]), [full]);
  const [start, end] = props.zoom ? [Math.min(range[0], full - 1), Math.min(range[1], full - 1)] : [0, full - 1];
  const view = useMemo(() => windowed(props, start, end), [props, start, end]);
  const { mode, reference, format, yFromZero = true } = props;
  const { xLabels, series, band } = view;
  const id = useId();
  const n = xLabels.length;
  const [active, setActive] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const hit = useRef<HTMLDivElement>(null);

  const ticks = useMemo(() => {
    if (props.domain)
      return niceTicks(props.domain[0], props.domain[1], 4).filter(
        (t) => t >= props.domain![0] && t <= props.domain![1],
      );
    const all = [
      ...series.flatMap((s) => finite(s.values)),
      ...(band ? [...finite(band.lower), ...finite(band.upper)] : []),
      ...(reference ? [reference.value] : []),
    ];
    if (!all.length) return [0, 1];
    return niceTicks(yFromZero ? Math.min(0, ...all) : Math.min(...all), Math.max(...all), 4);
  }, [series, band, reference, yFromZero, props.domain]);
  const domain: [number, number] = props.domain ?? [ticks[0], ticks[ticks.length - 1]];
  const y = linear(domain, [100, 0]);
  const x = (i: number) => (mode === "bar" ? ((i + 0.5) / n) * 100 : n === 1 ? 50 : (i / (n - 1)) * 100);

  const bandPath = useMemo(() => {
    if (!band) return null;
    const upper = band.upper
      .map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`))
      .filter(Boolean);
    const lower = band.lower
      .map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`))
      .filter(Boolean)
      .reverse();
    return upper.length ? `M${upper.join("L")}L${lower.join("L")}Z` : null;
    // x and y are pure functions of the props listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, n, domain[0], domain[1], mode]);

  const describe = (i: number) =>
    [
      xLabels[i],
      ...series.map((s) => (s.values[i] === null ? null : `${s.label} ${format(s.values[i] as number)}`)),
      band && band.lower[i] !== null && band.upper[i] !== null
        ? `${band.label} ${format(band.lower[i] as number)}–${format(band.upper[i] as number)}`
        : null,
    ]
      .filter(Boolean)
      .join(". ");

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    return mode === "bar" ? Math.min(n - 1, Math.floor(t * n)) : Math.round(t * (n - 1));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = active ?? -1;
    const next =
      event.key === "ArrowRight"
        ? Math.min(n - 1, current + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, current < 0 ? n - 1 : current - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? n - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    setAnnounce(describe(next));
  };

  const legend = [
    ...series.map((s) => ({ key: s.key, label: s.label, color: s.color, kind: mode === "bar" ? "swatch" : "line" })),
    ...(band ? [{ key: "band", label: band.label, color: band.color, kind: "band" }] : []),
    ...(reference ? [{ key: "reference", label: reference.label, color: reference.color, kind: "line" }] : []),
  ];
  const heightClass = props.height === "lg" ? "h-72" : "h-60";
  const flip = active !== null && x(active) > 60;

  return (
    <figure className="chart">
      <figcaption className="sr-only">
        {props.title}. {props.summary}
      </figcaption>
      {props.legend !== false && legend.length > 1 && (
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted" aria-hidden="true">
          {legend.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span
                className={
                  item.kind === "line" ? "chart-key" : item.kind === "band" ? "chart-swatch opacity-40" : "chart-swatch"
                }
                style={{ ["--series-color" as string]: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <div className={cn("relative pb-7 pl-12", heightClass)}>
        <div className="absolute inset-y-0 right-0 bottom-7 left-12">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden="true"
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2="100"
                y1={y(tick)}
                y2={y(tick)}
                className="chart-grid"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {bandPath && band && (
              <path
                d={bandPath}
                className="chart-area opacity-25"
                style={{ ["--series-color" as string]: band.color }}
              />
            )}
            {mode === "line" &&
              series.map((s) => (
                <path
                  key={s.key}
                  d={linePath(s.values, x, y)}
                  className="chart-line"
                  style={{ ["--series-color" as string]: s.color }}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            {reference && (
              <line
                x1="0"
                x2="100"
                y1={y(reference.value)}
                y2={y(reference.value)}
                className="chart-line"
                style={{
                  ["--series-color" as string]: reference.color,
                  strokeDasharray: "var(--ia-viz-mark-reference-dash)",
                }}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {mode === "bar" && (
            <div className="absolute inset-0 flex items-end gap-0.5" aria-hidden="true">
              {xLabels.map((label, i) => {
                const s = series[0];
                const v = s?.values[i];
                return (
                  <div key={label} className="flex h-full grow items-end justify-center">
                    {v !== null && v !== undefined && (
                      <div
                        className="chart-bar"
                        style={{
                          height: `${100 - y(v)}%`,
                          ["--series-color" as string]: s.color,
                          opacity: active !== null && active !== i ? "var(--ia-viz-mark-dim-opacity)" : undefined,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-full -translate-y-1/2 pr-2 text-2xs whitespace-nowrap text-ink-subtle"
              style={{ top: `${y(tick)}%` }}
              aria-hidden="true"
            >
              {format(tick)}
            </span>
          ))}
          {view.xTicks.map((tick) => (
            <span
              key={`${tick.index}-${tick.label}`}
              className={cn(
                "absolute top-full -translate-x-1/2 pt-2 text-2xs whitespace-nowrap text-ink-subtle",
                tick.minor && "max-sm:hidden",
              )}
              style={{ left: `${x(tick.index)}%` }}
              aria-hidden="true"
            >
              {tick.label}
            </span>
          ))}

          {mode === "line" &&
            series.map(
              (s) =>
                s.points &&
                s.values.map((v, i) =>
                  v === null ? null : (
                    <span
                      key={`${s.key}-${i}`}
                      className="chart-dot"
                      style={{ left: `${x(i)}%`, top: `${y(v)}%`, ["--series-color" as string]: s.color }}
                      aria-hidden="true"
                    />
                  ),
                ),
            )}

          {active !== null && (
            <>
              <div className="chart-crosshair" style={{ left: `${x(active)}%` }} />
              {mode === "line" &&
                series.map((s) =>
                  s.values[active] === null || s.values[active] === undefined ? null : (
                    <span
                      key={s.key}
                      className="chart-dot"
                      style={{
                        left: `${x(active)}%`,
                        top: `${y(s.values[active] as number)}%`,
                        ["--series-color" as string]: s.color,
                      }}
                    />
                  ),
                )}
              <div
                className="chart-tooltip"
                style={
                  flip
                    ? { right: `${100 - x(active)}%`, marginRight: "calc(var(--spacing) * 3)" }
                    : { left: `${x(active)}%`, marginLeft: "calc(var(--spacing) * 3)" }
                }
              >
                <p className="mb-2 font-medium text-ink">{xLabels[active]}</p>
                <ul className="grid gap-1">
                  {series.map((s) =>
                    s.values[active] === null || s.values[active] === undefined ? null : (
                      <li key={s.key} className="flex items-center gap-2">
                        <span className="chart-key" style={{ ["--series-color" as string]: s.color }} />
                        <span className="font-medium text-ink">{format(s.values[active] as number)}</span>
                        <span className="text-ink-muted">{s.label}</span>
                      </li>
                    ),
                  )}
                  {band && band.lower[active] !== null && band.upper[active] !== null && (
                    <li className="flex items-center gap-2">
                      <span className="chart-swatch opacity-40" style={{ ["--series-color" as string]: band.color }} />
                      <span className="font-medium text-ink">
                        {format(band.lower[active] as number)}–{format(band.upper[active] as number)}
                      </span>
                      <span className="text-ink-muted">{band.label}</span>
                    </li>
                  )}
                  {reference && (
                    <li className="flex items-center gap-2">
                      <span className="chart-key" style={{ ["--series-color" as string]: reference.color }} />
                      <span className="font-medium text-ink">{format(reference.value)}</span>
                      <span className="text-ink-muted">{reference.label}</span>
                    </li>
                  )}
                </ul>
              </div>
            </>
          )}
          <div
            ref={hit}
            className="absolute inset-0 cursor-crosshair rounded-xs"
            tabIndex={0}
            role="group"
            aria-label={props.title}
            aria-describedby={`${id}-keys`}
            onPointerMove={(e) => setActive(indexAt(e))}
            onPointerLeave={() => setActive(null)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          />
        </div>
      </div>
      {props.zoom && full > 2 && (
        <RangeBar
          values={overview(props.series)}
          labels={props.xLabels}
          range={[start, end]}
          onRange={(next) => {
            setRange(next);
            setActive(null);
          }}
          text={props.zoom}
        />
      )}
      <p id={`${id}-keys`} className="sr-only">
        {props.instructions}
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-link underline-offset-(--ia-link-underline-offset) hover:underline">
          {props.table.label}
        </summary>
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="data-table">
            <caption className="sr-only">{props.table.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{props.table.xHeader}</th>
                {series.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label}
                  </th>
                ))}
                {band && <th scope="col">{band.label}</th>}
              </tr>
            </thead>
            <tbody>
              {xLabels.map((label, i) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {series.map((s) => (
                    <td key={s.key}>
                      {s.values[i] === null || s.values[i] === undefined ? "" : format(s.values[i] as number)}
                    </td>
                  ))}
                  {band && (
                    <td>
                      {band.lower[i] === null || band.upper[i] === null
                        ? ""
                        : `${format(band.lower[i] as number)}–${format(band.upper[i] as number)}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
