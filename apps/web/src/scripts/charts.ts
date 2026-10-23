type ChartData = {
  mode: "line" | "band";
  points: number;
  series: { label: string; color: string }[];
  rows: { title: string; values: (string | null)[] }[];
};
type Item = { label: string; value: string; color: string };

/**
 * Hover and keyboard readout for every chart on the page. Values come pre-formatted in the
 * chart's JSON; this only positions the crosshair and writes text nodes.
 */
export function initCharts() {
  for (const chart of document.querySelectorAll<HTMLElement>("[data-chart]")) {
    const dataNode = chart.querySelector("[data-chart-data]");
    const hit = chart.querySelector<HTMLElement>("[data-hit]");
    const tooltip = chart.querySelector<HTMLElement>("[data-tooltip]");
    if (!dataNode || !hit || !tooltip) continue;
    const data = JSON.parse(dataNode.textContent ?? "{}") as ChartData;
    const itemsAt = (index: number): Item[] =>
      (data.rows[index]?.values ?? []).flatMap((value, s) => (value === null ? [] : [{ ...data.series[s], value }]));
    const crosshair = chart.querySelector<HTMLElement>("[data-crosshair]");
    const live = chart.querySelector<HTMLElement>("[data-live]");
    const bars = [...chart.querySelectorAll<HTMLElement>("[data-bar]")];
    let active = -1;

    const position = (index: number) =>
      data.mode === "line"
        ? data.points === 1
          ? 50
          : (index / (data.points - 1)) * 100
        : ((index + 0.5) / data.points) * 100;

    /** Screen readers hear the values only when the reader moves with the keyboard. */
    const announce = (index: number) => {
      const row = data.rows[index];
      if (!live || !row) return;
      live.textContent = [row.title, ...itemsAt(index).map((item) => `${item.label}: ${item.value}`)].join(". ");
    };

    const render = (index: number) => {
      const row = data.rows[index];
      const items = itemsAt(index);
      if (!row || items.length === 0) return hide();
      active = index;
      const left = position(index);
      if (crosshair) {
        crosshair.hidden = false;
        crosshair.style.left = `${left}%`;
      }
      bars.forEach((bar, i) => bar.classList.toggle("is-active", i === index));

      const title = document.createElement("p");
      title.className = "mb-2 font-medium text-ink";
      title.textContent = row.title;
      const list = document.createElement("ul");
      list.className = "grid gap-1";
      for (const item of items) {
        const li = document.createElement("li");
        li.className = "flex items-center gap-2";
        const key = document.createElement("span");
        key.className = "chart-key";
        key.style.setProperty("--series-color", item.color);
        const value = document.createElement("span");
        value.className = "font-medium text-ink";
        value.textContent = item.value;
        const label = document.createElement("span");
        label.className = "text-ink-muted";
        label.textContent = item.label;
        li.append(key, value, label);
        list.append(li);
      }
      tooltip.replaceChildren(title, list);
      tooltip.hidden = false;
      const flip = left > 60;
      tooltip.style.left = flip ? "" : `calc(${left}% + var(--spacing) * 3)`;
      tooltip.style.right = flip ? `calc(${100 - left}% + var(--spacing) * 3)` : "";
    };

    const hide = () => {
      active = -1;
      tooltip.hidden = true;
      if (crosshair) crosshair.hidden = true;
      bars.forEach((bar) => bar.classList.remove("is-active"));
    };

    const indexAt = (clientX: number) => {
      const box = hit.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
      return data.mode === "line"
        ? Math.round(ratio * (data.points - 1))
        : Math.min(Math.floor(ratio * data.points), data.points - 1);
    };

    hit.addEventListener("pointermove", (event) => render(indexAt(event.clientX)));
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("blur", hide);
    hit.addEventListener("focus", () => {
      const last = data.rows.reduce((found, _row, i) => (itemsAt(i).length ? i : found), 0);
      render(active >= 0 ? active : last);
      announce(active);
    });
    hit.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (event.key === "Escape") return hide();
      if (!step) return;
      event.preventDefault();
      let next = (active < 0 ? 0 : active) + step;
      while (next >= 0 && next < data.points && itemsAt(next).length === 0) next += step;
      if (next >= 0 && next < data.points) {
        render(next);
        announce(next);
      }
    });
  }
}
