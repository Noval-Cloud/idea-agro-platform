import type { SignInError, SignedIn } from "@/lib/account";

/** Where to go once signed in: a path of this site from `?next=`, never another site. */
function next(fallback: string): string {
  const wanted = new URLSearchParams(location.search).get("next") ?? "";
  return wanted.startsWith("/") && !wanted.startsWith("//") && !wanted.startsWith("/\\") ? wanted : fallback;
}

export function initSignIn() {
  const button = document.querySelector<HTMLButtonElement>("[data-sign-in]");
  const status = document.querySelector<HTMLElement>("[data-sign-in-status]");
  if (!button || !status) return;
  const messages = JSON.parse(status.dataset.messages ?? "{}") as Record<SignInError | "working", string>;
  const show = (key: SignInError | "working") => {
    status.textContent = messages[key];
    status.dataset.state = key === "working" ? "working" : "error";
  };

  // Loaded before the click: the provider's window must open right inside it.
  let signIn: (() => Promise<SignedIn>) | undefined;
  const ready = import("@/lib/account").then(({ prepareSignIn }) => prepareSignIn());
  ready.then((prepared) => (signIn = prepared)).catch(() => show("network"));

  button.addEventListener("click", () => {
    if (!signIn) return show("network");
    button.disabled = true;
    show("working");
    signIn()
      .then(() => location.assign(next(button.dataset.defaultNext ?? "/")))
      .catch((error: unknown) => {
        show(typeof error === "string" && error in messages ? (error as SignInError) : "unknown");
        button.disabled = false;
      });
  });
}
