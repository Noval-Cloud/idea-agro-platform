/*
 * The only module that knows the sign-in provider (Firebase Authentication). The rest of the site signs in,
 * signs out and makes private API calls through it, so swapping providers rewrites this file alone. The
 * provider's SDK loads on first use, never with the page.
 */
import type { Auth } from "firebase/auth";
import { getMe, revokeMySessions, setApiBaseUrl, type Me } from "@idea-agro/api-client";
import { readHint, writeHint, type SignedIn } from "./account-hint";
import type { SignInProvider } from "./sign-in-providers";

export type { Role, SignedIn } from "./account-hint";

export type SignInError = "notConfigured" | "notEnabled" | "popupBlocked" | "cancelled" | "network" | "unknown";

/** No session, or one the provider no longer honours: the person has to sign in again. */
export class SignedOut extends Error {}

const config = { apiKey: import.meta.env.PUBLIC_AUTH_KEY, authDomain: import.meta.env.PUBLIC_AUTH_DOMAIN };

let loading: Promise<Auth> | undefined;

function provider(): Promise<Auth> {
  loading ??= (async () => {
    const [{ initializeApp }, { getAuth }] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
    return getAuth(initializeApp(config));
  })();
  return loading;
}

setApiBaseUrl(import.meta.env.PUBLIC_API_URL ?? "http://localhost:8080");

export const configured = (): boolean => Boolean(config.apiKey && config.authDomain);

async function authorization(renew = false): Promise<RequestInit> {
  if (!configured()) throw new SignedOut();
  const auth = await provider();
  await auth.authStateReady();
  if (!auth.currentUser) throw new SignedOut();
  return { headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken(renew)}` } };
}

// Provider answers that mean the session itself has ended, as opposed to a network failure.
const ENDED = new Set([
  "auth/user-token-expired",
  "auth/user-disabled",
  "auth/invalid-user-token",
  "auth/user-not-found",
]);
const ended = (error: unknown) => ENDED.has((error as { code?: string }).code ?? "");

/**
 * Runs a private API call with the person's token. A refused token is renewed once; the session ends here only
 * when the provider refuses to renew it, or the API refuses the renewed one. Network failures do not end it.
 */
export async function privately<R extends { status: number }>(call: (init: RequestInit) => Promise<R>): Promise<R> {
  const response = await call(await authorization());
  if (response.status !== 401) return response;
  let renewed: RequestInit;
  try {
    renewed = await authorization(true);
  } catch (error) {
    if (!ended(error) && !(error instanceof SignedOut)) throw error;
    await signOut();
    throw new SignedOut();
  }
  const retried = await call(renewed);
  if (retried.status !== 401) return retried;
  await signOut();
  throw new SignedOut();
}

/** The account from the API, remembered for the header; null when signed out. */
export async function loadMe(): Promise<Me | null> {
  try {
    const response = await privately((init) => getMe(init));
    if (response.status !== 200) throw new Error(`${response.status} /v1/me`);
    const me = response.data;
    writeHint({ name: me.name ?? null, email: me.email ?? null, picture: me.picture ?? null, roles: me.roles });
    return me;
  } catch (error) {
    if (!(error instanceof SignedOut)) throw error;
    writeHint(null);
    return null;
  }
}

export async function loadAccount(): Promise<SignedIn | null> {
  await loadMe();
  return readHint();
}

/** Ends every session of the account, on every device, this one included. */
export async function signOutEverywhere(): Promise<void> {
  const response = await privately((init) => revokeMySessions(init));
  // This 503 means our own record ended the sessions, though the provider did not answer.
  const endedLocally = response.status === 503 && response.data.type === "urn:idea-agro:problem:sessions-ended-locally";
  if (response.status !== 204 && !endedLocally) throw new Error(`${response.status} revoke`);
  await signOut();
}

const errorOf = (code: string): SignInError =>
  ({
    "auth/operation-not-allowed": "notEnabled",
    "auth/configuration-not-found": "notEnabled",
    "auth/popup-blocked": "popupBlocked",
    "auth/popup-closed-by-user": "cancelled",
    "auth/cancelled-popup-request": "cancelled",
    "auth/network-request-failed": "network",
  }[code] as SignInError | undefined) ?? "unknown";

/**
 * Loads the provider ahead of the click, and answers with the sign-in itself: browsers only let a window open
 * right inside a click, so nothing may load between the click and the provider's call.
 */
export async function prepareSignIn(way: SignInProvider): Promise<() => Promise<SignedIn>> {
  if (!configured()) {
    return () => Promise.reject("notConfigured" satisfies SignInError);
  }
  const auth = await provider();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const providers = { google: () => new GoogleAuthProvider() } satisfies Record<SignInProvider, unknown>;
  const chosen = providers[way]();
  return async () => {
    try {
      await signInWithPopup(auth, chosen);
    } catch (error) {
      throw errorOf((error as { code?: string }).code ?? "");
    }
    const account = await loadAccount();
    if (!account) throw "unknown" satisfies SignInError;
    return account;
  };
}

export async function signOut(): Promise<void> {
  writeHint(null);
  confirmedAt(0);
  if (configured()) await (await provider()).signOut();
}

const CONFIRMED_KEY = "idea-agro.account-confirmed";
const CONFIRM_EVERY_MS = 10 * 60 * 1000;

/** Session storage can be blocked: then the session is confirmed on every page. */
function confirmedAt(value?: number): number {
  try {
    if (value === undefined) return Number(sessionStorage.getItem(CONFIRMED_KEY) ?? 0);
    if (value === 0) sessionStorage.removeItem(CONFIRMED_KEY);
    else sessionStorage.setItem(CONFIRMED_KEY, String(value));
  } catch {
    // Nothing to remember.
  }
  return 0;
}

/**
 * Checks the remembered session against the provider, at most every ten minutes, and forgets it when the
 * provider says it ended, for example after a log-out everywhere from another device.
 */
export async function confirmSession(): Promise<void> {
  if (!configured() || !readHint()) return;
  const last = confirmedAt();
  if (Date.now() - last < CONFIRM_EVERY_MS) return;
  const auth = await provider();
  await auth.authStateReady();
  if (!auth.currentUser) return writeHint(null);
  try {
    await auth.currentUser.getIdToken(true);
    confirmedAt(Date.now());
  } catch (error) {
    if (ended(error)) await signOut();
  }
}
