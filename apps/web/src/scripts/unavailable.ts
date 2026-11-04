/** Opens and closes the dialogs that say why a hidden indicator is unavailable; the browser returns the focus. */
export function initUnavailable() {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const opener = target.closest<HTMLElement>("[data-unavailable-open]");
    if (opener?.dataset.unavailableOpen) {
      document.querySelector<HTMLDialogElement>(`#${opener.dataset.unavailableOpen}`)?.showModal();
      return;
    }
    if (target.closest("[data-unavailable-close]")) target.closest("dialog")?.close();
    // The dialog's content fills it, so a click on the dialog itself is on its backdrop.
    else if (target instanceof HTMLDialogElement && target.classList.contains("unavailable-dialog")) target.close();
  });
}
