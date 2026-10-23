/**
 * The account service is not live yet: provider buttons and a valid form point the reader to the
 * preview notice (already on the page, in their language) instead of failing silently.
 */
export function initAuthPreview() {
  const notice = document.querySelector<HTMLElement>("[data-auth-notice]");
  if (!notice) return;
  const message = notice.textContent ?? "";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const point = () => {
    notice.dataset.active = "";
    // Re-set the text so assistive technology announces the status again.
    notice.textContent = "";
    requestAnimationFrame(() => {
      notice.textContent = message;
    });
    notice.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  };

  for (const button of document.querySelectorAll("[data-auth-preview]")) button.addEventListener("click", point);
  // Native validation runs first; the handler only sees a valid form.
  document.querySelector("[data-auth-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    point();
  });
}
