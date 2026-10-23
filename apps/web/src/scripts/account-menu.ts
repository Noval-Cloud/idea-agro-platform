import { HINT_KEY, readHint, type SignedIn } from "@/lib/account-hint";

/** Shows the sign-in link or the account menu, from what the site remembers; the provider loads only to confirm it. */
export function initAccountMenu() {
  const signIn = document.querySelector<HTMLElement>("[data-account-signin]");
  const menu = document.querySelector<HTMLElement>("[data-account-menu]");
  if (!signIn || !menu) return;

  // Elsewhere (the mobile panel), one link leads to sign-in or, once signed in, to the account.
  const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-account-link]")].map((link) => ({
    link,
    signedOut: { href: link.href, label: link.textContent ?? "" },
  }));

  const render = (account: SignedIn | null) => {
    for (const { link, signedOut } of links) {
      link.href = account ? (link.dataset.accountHref ?? signedOut.href) : signedOut.href;
      link.textContent = account ? (link.dataset.accountLabel ?? signedOut.label) : signedOut.label;
    }
    signIn.hidden = account !== null;
    menu.hidden = account === null;
    if (!account) return;
    const label = account.name ?? account.email ?? "";
    menu.querySelector("[data-account-name]")!.textContent = account.name ?? "";
    menu.querySelector("[data-account-email]")!.textContent = account.email ?? "";
    menu.querySelector("[data-account-initial]")!.textContent = label.slice(0, 1).toUpperCase();
    const picture = menu.querySelector<HTMLImageElement>("[data-account-picture]")!;
    picture.hidden = !account.picture;
    if (account.picture) picture.src = account.picture;
    for (const item of menu.querySelectorAll<HTMLElement>("[data-role]")) {
      item.hidden = !account.roles.includes(item.dataset.role as SignedIn["roles"][number]);
    }
  };

  render(readHint());
  window.addEventListener("account-change", (event) => render((event as CustomEvent<SignedIn | null>).detail));
  window.addEventListener("storage", (event) => {
    if (event.key === HINT_KEY) render(readHint());
  });

  menu.querySelector("[data-account-signout]")?.addEventListener("click", async () => {
    const { signOut } = await import("@/lib/account");
    await signOut();
    location.assign(menu.dataset.home ?? "/");
  });

  // Browsers without CSS anchor positioning get the menu placed under its button by script.
  const popover = menu.querySelector<HTMLElement>("[popover]");
  if (popover && !CSS.supports("anchor-name", "--a")) {
    popover.addEventListener("beforetoggle", (event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const box = menu.querySelector("[popovertarget]")!.getBoundingClientRect();
      popover.style.insetBlockStart = `${box.bottom}px`;
      popover.style.insetInlineEnd = `${document.documentElement.clientWidth - box.right}px`;
    });
  }

  if (readHint()) {
    const confirm = () => void import("@/lib/account").then(({ confirmSession }) => confirmSession());
    if ("requestIdleCallback" in window) requestIdleCallback(confirm);
    else setTimeout(confirm, 2000);
  }
}
