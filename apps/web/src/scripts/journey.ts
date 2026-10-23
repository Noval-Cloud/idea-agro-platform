import { cssTime } from "@/lib/css-time";

/**
 * The landing's motion story: one chapter at a time, advancing on its own.
 * - The reader can pause it (WCAG 2.2.2), jump to any chapter, and move with the arrow keys.
 * - It holds still while the pointer or focus is inside a chapter, while it is off screen and
 *   while the tab is hidden; with reduced motion it never advances by itself.
 */
export function initJourney() {
  const root = document.querySelector<HTMLElement>("[data-journey]");
  if (!root) return;
  const slides = [...root.querySelectorAll<HTMLElement>("[data-slide]")];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-chapter]")];
  const toggle = root.querySelector<HTMLButtonElement>("[data-journey-toggle]");
  const tabList = root.querySelector<HTMLElement>("[data-journey-tabs]");
  if (!slides.length || !toggle) return;

  const duration = cssTime(getComputedStyle(root).getPropertyValue("--ia-motion-scene")) || 7000;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let chosenPause = reduced;
  /** Reasons the story is holding still besides the reader's pause (pointer, focus, off screen). */
  const holds = new Set<string>();
  let remaining = duration;
  let startedAt = 0;
  let timer: number | undefined;

  const running = () => !chosenPause && holds.size === 0;

  const render = () => {
    root.toggleAttribute("data-paused", chosenPause);
    root.toggleAttribute("data-held", holds.size > 0);
    root.toggleAttribute("data-static", reduced);
    toggle.setAttribute("aria-label", (chosenPause ? toggle.dataset.labelPlay : toggle.dataset.labelPause) ?? "");
  };

  const schedule = () => {
    window.clearTimeout(timer);
    if (!running()) return;
    startedAt = performance.now();
    timer = window.setTimeout(() => show((index + 1) % slides.length), remaining);
  };

  const show = (next: number, focus = false) => {
    slides[index].classList.remove("is-active", "is-settled");
    slides[index].inert = true;
    tabs[index].setAttribute("aria-selected", "false");
    tabs[index].tabIndex = -1;
    index = next;
    // Re-adding the class restarts the slide's entrances.
    void slides[index].offsetWidth;
    slides[index].classList.add("is-active");
    slides[index].inert = false;
    tabs[index].setAttribute("aria-selected", "true");
    tabs[index].tabIndex = 0;
    if (focus) tabs[index].focus();
    if (tabList && tabList.scrollWidth > tabList.clientWidth) {
      const offset = tabs[index].getBoundingClientRect().left - tabList.getBoundingClientRect().left;
      tabList.scrollTo({ left: tabList.scrollLeft + offset - tabList.clientWidth / 3 });
    }
    remaining = duration;
    schedule();
  };

  const hold = (reason: string, on: boolean) => {
    if (holds.has(reason) === on) return;
    if (on && running()) remaining -= performance.now() - startedAt;
    if (on) holds.add(reason);
    else holds.delete(reason);
    render();
    schedule();
  };

  toggle.addEventListener("click", () => {
    if (running()) remaining -= performance.now() - startedAt;
    chosenPause = !chosenPause;
    render();
    schedule();
  });
  tabs.forEach((tab, i) => tab.addEventListener("click", () => show(i)));
  tabList?.addEventListener("keydown", (event) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    show((index + step + slides.length) % slides.length, true);
  });

  // Reading a chapter (pointer or focus inside it) holds the story still.
  const stage = root.querySelector<HTMLElement>(".journey-slides");
  stage?.addEventListener("pointerenter", (event) => event.pointerType === "mouse" && hold("pointer", true));
  stage?.addEventListener("pointerleave", () => hold("pointer", false));
  stage?.addEventListener("focusin", () => hold("focus", true));
  stage?.addEventListener("focusout", (event) => {
    if (!stage.contains(event.relatedTarget as Node | null)) hold("focus", false);
  });
  new IntersectionObserver(([entry]) => hold("offscreen", !entry.isIntersecting)).observe(root);
  document.addEventListener("visibilitychange", () => hold("hidden", document.hidden));

  render();
  schedule();
}
