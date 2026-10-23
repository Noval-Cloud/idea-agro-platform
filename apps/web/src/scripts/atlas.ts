/**
 * - Links like `#indicator-et` (from the navigation) select that indicator in the atlas.
 * - On small screens the indicators are a scrolling row of chips; the selected one is kept in view.
 */
export function initAtlas() {
  const chips = document.querySelector<HTMLElement>("[data-atlas-chips]");
  const reveal = (behavior: ScrollBehavior) => {
    const checked = chips?.querySelector<HTMLElement>("label:has(input:checked)");
    if (!chips || !checked || chips.scrollWidth <= chips.clientWidth) return;
    const offset = checked.getBoundingClientRect().left - chips.getBoundingClientRect().left;
    chips.scrollTo({ left: chips.scrollLeft + offset - (chips.clientWidth - checked.offsetWidth) / 2, behavior });
  };
  const smooth = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  const select = () => {
    const match = /^#indicator-([a-z]+)$/.exec(location.hash);
    if (!match) return;
    const input = document.getElementById(`indicator-${match[1]}`) as HTMLInputElement | null;
    if (!input) return;
    input.checked = true;
    reveal("auto");
    document.getElementById("indicators")?.scrollIntoView({ block: "start" });
  };
  reveal("auto");
  select();
  addEventListener("hashchange", select);
  chips?.addEventListener("change", () => reveal(smooth()));
}
