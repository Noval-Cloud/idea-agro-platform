/** A link chosen inside a navigation panel closes the panel, so the page it jumps to is visible. */
export function initNavPanels() {
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest("[popover] a");
    const panel = link?.closest<HTMLElement>("[popover]");
    if (panel?.matches(":popover-open")) panel.hidePopover();
  });
}

/** Switching language keeps what the page is showing (the explorer's view, the zone being read). */
export function initLanguageSwitch() {
  document.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[data-keep-state]");
    if (!link) return;
    const url = new URL(link.href);
    url.search = location.search;
    url.hash = location.hash;
    link.href = url.href;
  });
}
