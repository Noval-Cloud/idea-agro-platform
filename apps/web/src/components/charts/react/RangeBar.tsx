import { useRef, type PointerEvent } from "react";
import { Slider } from "radix-ui";
import { finite, linear, linePath } from "../scale";

export type RangeText = { label: string; from: string; to: string; reset: string };

/**
 * A bar under a chart that narrows it to a stretch of its x axis, as the previous system's zoom did. Either end
 * moves by dragging or with the arrow keys; dragging the shaded window moves both. The chart's main series
 * runs faintly behind it, so one sees where the stretch is.
 */
export default function RangeBar({
  values,
  labels,
  range,
  onRange,
  text,
}: {
  values: (number | null)[];
  labels: string[];
  range: [number, number];
  onRange: (range: [number, number]) => void;
  text: RangeText;
}) {
  const n = labels.length;
  const track = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const width = range[1] - range[0];
  const whole = range[0] === 0 && range[1] === n - 1;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const vs = finite(values);
  const y = linear(vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 1], [85, 15]);

  const grab = (event: PointerEvent<HTMLSpanElement>) => {
    // The window itself moves; a press elsewhere on the track moves the nearest end, as Radix does.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: range[0] };
  };
  const move = (event: PointerEvent<HTMLSpanElement>) => {
    const from = drag.current;
    const box = track.current?.getBoundingClientRect();
    if (!from || !box) return;
    const steps = Math.round(((event.clientX - from.x) / box.width) * (n - 1));
    const start = Math.min(Math.max(from.start + steps, 0), n - 1 - width);
    if (start !== range[0]) onRange([start, start + width]);
  };

  return (
    <div className="mt-2 grid gap-1">
      <Slider.Root
        min={0}
        max={n - 1}
        step={1}
        minStepsBetweenThumbs={1}
        value={range}
        onValueChange={(next) => onRange([next[0], next[1]])}
        aria-label={text.label}
        className="relative flex h-8 touch-none items-center select-none"
      >
        <Slider.Track
          ref={track}
          className="relative h-7 grow overflow-hidden rounded-sm border border-line bg-surface-sunken"
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
            aria-hidden="true"
          >
            <path
              d={linePath(values, x, y)}
              className="chart-line"
              style={{ ["--series-color" as string]: "var(--ia-viz-axis)" }}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <Slider.Range
            onPointerDown={grab}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            className="absolute h-full cursor-grab border-x border-ink-subtle bg-action-soft/60 active:cursor-grabbing"
          />
        </Slider.Track>
        {(["from", "to"] as const).map((end, i) => (
          <Slider.Thumb
            key={end}
            aria-label={text[end]}
            aria-valuetext={labels[range[i]]}
            className="block h-7 w-3 cursor-ew-resize rounded-xs border border-ink-subtle bg-surface shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        ))}
      </Slider.Root>
      <div className="flex items-center justify-between gap-3 text-2xs text-ink-subtle tabular-nums">
        <span>{labels[range[0]]}</span>
        {!whole && (
          <button
            type="button"
            onClick={() => onRange([0, n - 1])}
            className="text-link underline-offset-(--ia-link-underline-offset) hover:underline"
          >
            {text.reset}
          </button>
        )}
        <span>{labels[range[1]]}</span>
      </div>
    </div>
  );
}
