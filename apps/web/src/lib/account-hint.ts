/** What the site remembers of the signed-in person, to draw the header before the sign-in provider loads. */
export type Role = "client" | "editor" | "admin";
export type SignedIn = { name: string | null; email: string | null; picture: string | null; roles: Role[] };

export const HINT_KEY = "idea-agro.account";

export function readHint(): SignedIn | null {
  try {
    const value = localStorage.getItem(HINT_KEY);
    return value ? (JSON.parse(value) as SignedIn) : null;
  } catch {
    return null;
  }
}

export function writeHint(signedIn: SignedIn | null): void {
  try {
    if (signedIn) localStorage.setItem(HINT_KEY, JSON.stringify(signedIn));
    else localStorage.removeItem(HINT_KEY);
  } catch {
    // Storage may be blocked: the header then shows the sign-in link until the provider answers.
  }
  window.dispatchEvent(new CustomEvent<SignedIn | null>("account-change", { detail: signedIn }));
}
