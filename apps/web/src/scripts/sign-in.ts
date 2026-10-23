import type { SignInError, SignedIn } from "@/lib/account";
import { nextPath } from "@/lib/next-path";
import type { SignInProvider } from "@/lib/sign-in-providers";

const next = (fallback: string) =>
  nextPath(new URLSearchParams(location.search).get("next"), location.origin, fallback);

export function initSignIn() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-sign-in]")];
  const status = document.querySelector<HTMLElement>("[data-sign-in-status]");
  if (!buttons.length || !status) return;
  const messages = JSON.parse(status.dataset.messages ?? "{}") as Record<SignInError | "working", string>;
  const show = (key: SignInError | "working") => {
    status.textContent = messages[key];
    status.dataset.state = key === "working" ? "working" : "error";
  };

  // Loaded before the click: the provider's window must open right inside it.
  const prepared = new Map<SignInProvider, () => Promise<SignedIn>>();
  void import("@/lib/account")
    .then(({ prepareSignIn }) =>
      Promise.all(
        buttons.map(async (button) => {
          const provider = button.dataset.signIn as SignInProvider;
          prepared.set(provider, await prepareSignIn(provider));
        }),
      ),
    )
    .catch(() => show("network"));

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const signIn = prepared.get(button.dataset.signIn as SignInProvider);
      if (!signIn) return show("network");
      for (const b of buttons) b.disabled = true;
      show("working");
      signIn()
        .then(() => location.assign(next(button.dataset.defaultNext ?? "/")))
        .catch((error: unknown) => {
          show(typeof error === "string" && error in messages ? (error as SignInError) : "unknown");
          for (const b of buttons) b.disabled = false;
        });
    });
  }
}
