const STORAGE_KEY = "ia-theme";
const SYSTEM_DARK = "(prefers-color-scheme: dark)";
type Theme = "light" | "dark";

const systemTheme = (): Theme => (matchMedia(SYSTEM_DARK).matches ? "dark" : "light");
const chosenTheme = () => document.documentElement.dataset.theme as Theme | undefined;
const currentTheme = (): Theme => chosenTheme() ?? systemTheme();

/** Theme-twin pictures follow the reader's choice instead of the OS preference. */
function syncPictures() {
  const chosen = chosenTheme();
  const media = chosen === "dark" ? "all" : chosen === "light" ? "not all" : SYSTEM_DARK;
  for (const source of document.querySelectorAll<HTMLSourceElement>("source[data-theme-dark]")) source.media = media;
}

function label(button: HTMLElement) {
  const next = currentTheme() === "dark" ? "light" : "dark";
  const text = next === "light" ? button.dataset.labelToLight : button.dataset.labelToDark;
  if (text) button.setAttribute("aria-label", text);
}

/** Flips between light and dark and remembers the choice; the OS preference applies until then. */
export function initThemeToggle() {
  syncPictures();
  for (const button of document.querySelectorAll<HTMLElement>("[data-theme-toggle]")) {
    label(button);
    button.addEventListener("click", () => {
      const next: Theme = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* Storage can be unavailable (private mode); the choice then lasts for this page only. */
      }
      syncPictures();
      label(button);
    });
  }
}
