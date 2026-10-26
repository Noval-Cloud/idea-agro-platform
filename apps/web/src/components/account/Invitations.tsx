import { useEffect, useId, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import type { PlatformInvitationOut } from "@idea-agro/api-client";
import { Send, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { iconSize } from "@/design/tokens";
import { readHint } from "@/lib/account-hint";
import type { Locale } from "@/i18n/core";
import type { AccountTranslator } from "./i18n";

type Props = { translator: AccountTranslator; locale: Locale; signInPath: string };

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);
const EMAIL = /^[^@\s/?#%]+@[^@\s/?#%]+\.[^@\s/?#%]+$/;

/** Invitations to the platform: who was invited, whether they joined, and sending one again or dropping it. */
export default function Invitations({ translator, locale, signInPath }: Props) {
  const { t, date, ago } = translator;
  const [invitations, setInvitations] = useState<PlatformInvitationOut[] | null | undefined>(undefined);
  const [problem, setProblem] = useState("");
  const [news, setNews] = useState("");
  const inviteButton = useRef<HTMLButtonElement>(null);
  const { ask, dialog } = useConfirm(t("account.invitations.cancel"));

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listPlatformInvitations(init)))
      .then((response) => setInvitations(response.status === 200 ? response.data : null))
      .catch(() => setInvitations(null));
  }, []);

  /** Runs a call; an ended session leads to sign-in, back to this page. */
  const call = async <T,>(run: (modules: Awaited<ReturnType<typeof api>>) => Promise<T>): Promise<T | null> => {
    setProblem("");
    setNews("");
    try {
      return await run(await api());
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut)
        location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname)}`);
      else setProblem(t("account.invitations.failed"));
      return null;
    }
  };

  const invite = (email: string) =>
    call(async ([{ privately }, client]) => {
      const response = await privately((init) => client.inviteToPlatform({ email, language: locale }, init));
      if (response.status === 201) {
        const { invitation_sent, ...invitation } = response.data;
        setInvitations((now) => [invitation, ...(now ?? [])]);
        setNews(t(invitation_sent ? "account.invitations.sent" : "account.invitations.unsent", { email }));
      }
      return response.status;
    });

  const resend = (invitation: PlatformInvitationOut) =>
    void call(async ([{ privately }, client]) => {
      const response = await privately((init) =>
        client.resendPlatformInvitation(invitation.id, { language: locale }, init),
      );
      if (response.status === 200) {
        const { invitation_sent, ...renewed } = response.data;
        setInvitations((now) => (now ?? []).map((i) => (i.id === renewed.id ? renewed : i)));
        setNews(
          t(invitation_sent ? "account.invitations.resent" : "account.invitations.unsent", { email: renewed.email }),
        );
      } else setProblem(t(response.status === 429 ? "account.invitations.soon" : "account.invitations.failed"));
    });

  const remove = async (invitation: PlatformInvitationOut) => {
    const yes = await ask({
      title: t("account.invitations.confirmTitle"),
      body: t("account.invitations.confirmBody", { email: invitation.email }),
      confirm: t("account.invitations.delete"),
      tone: "danger",
    });
    if (!yes) return;
    await call(async ([{ privately }, client]) => {
      const response = await privately((init) => client.deletePlatformInvitation(invitation.id, init));
      if (response.status !== 204) return setProblem(t("account.invitations.failed"));
      setInvitations((now) => (now ?? []).filter((i) => i.id !== invitation.id));
      // Its row is gone: focus waits on the button that invites, once the list has changed.
      requestAnimationFrame(() => inviteButton.current?.focus());
    });
  };

  const state = (invitation: PlatformInvitationOut) =>
    invitation.state === "accepted" && invitation.accepted_at
      ? t("account.invitations.accepted", { date: date(invitation.accepted_at) })
      : invitation.state === "pending"
        ? t("account.invitations.pending", { when: ago(invitation.invited_until) })
        : t("account.invitations.expired");

  return (
    <div className="grid max-w-3xl gap-6 pt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-ink-muted">{t("account.invitations.intro")}</p>
        <InviteDialog
          t={t}
          trigger={inviteButton}
          taken={(invitations ?? []).filter((i) => i.state === "pending").map((i) => i.email)}
          onInvite={invite}
        />
      </div>
      {invitations === undefined ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("account.invitations.loading")}
        </p>
      ) : invitations === null ? (
        <p className="text-sm text-danger">{t("account.invitations.failed")}</p>
      ) : invitations.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("account.invitations.empty")}</p>
      ) : (
        <ul className="grid divide-y divide-line border-y border-line">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 grow">
                <p className="truncate text-sm text-ink">{invitation.email}</p>
                <p className="text-xs text-ink-subtle">{state(invitation)}</p>
              </div>
              {invitation.state !== "accepted" && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("account.invitations.resend", { email: invitation.email })}
                  onClick={() => resend(invitation)}
                >
                  <Send size={iconSize.sm} aria-hidden="true" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("account.invitations.deleteNamed", { email: invitation.email })}
                onClick={() => void remove(invitation)}
              >
                <Trash2 size={iconSize.sm} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p role="alert" className="text-sm text-danger empty:hidden">
        {problem}
      </p>
      <p role="status" className="text-sm text-ink-muted empty:hidden">
        {news}
      </p>
      {dialog}
    </div>
  );
}

function InviteDialog({
  t,
  trigger,
  taken,
  onInvite,
}: {
  t: AccountTranslator["t"];
  trigger: React.RefObject<HTMLButtonElement | null>;
  taken: string[];
  onInvite: (email: string) => Promise<number | null>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [checked, setChecked] = useState(false);
  const [refused, setRefused] = useState<"taken" | "limit" | "unverified" | "failed" | null>(null);
  const [sending, setSending] = useState(false);
  const ids = useId();

  const address = email.trim().toLowerCase();
  const problem = !EMAIL.test(address)
    ? t("account.invitations.emailInvalid")
    : address === readHint()?.email?.toLowerCase()
      ? t("account.invitations.emailOwn")
      : taken.includes(address)
        ? t("account.invitations.emailTaken", { email: address })
        : null;

  /** Opens clean; while an invitation is on its way the dialog stays open, so its answer has a place. */
  const reset = (next: boolean) => {
    if (!next && sending) return;
    setOpen(next);
    setEmail("");
    setChecked(false);
    setRefused(null);
  };

  const send = async () => {
    setChecked(true);
    setRefused(null);
    if (problem) return document.getElementById(`${ids}-email`)?.focus();
    setSending(true);
    const status = await onInvite(address);
    setSending(false);
    if (status === 201) return setOpen(false);
    setRefused(status === 409 ? "taken" : status === 429 ? "limit" : status === 403 ? "unverified" : "failed");
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Trigger asChild>
        <Button ref={trigger} size="sm">
          <UserPlus aria-hidden="true" />
          {t("account.invitations.invite")}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-md border border-line bg-surface p-6 text-ink shadow-overlay">
          <form
            noValidate
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="grid gap-1">
              <Dialog.Title className="text-lg font-medium">{t("account.invitations.inviteTitle")}</Dialog.Title>
              <Dialog.Description className="text-sm text-ink-muted">
                {t("account.invitations.inviteBody")}
              </Dialog.Description>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={`${ids}-email`} className="text-sm font-medium text-ink">
                {t("account.invitations.email")}
              </label>
              <Input
                id={`${ids}-email`}
                type="email"
                name="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                maxLength={254}
                value={email}
                placeholder={t("account.invitations.emailPlaceholder")}
                aria-invalid={checked && problem !== null}
                aria-describedby={`${ids}-error`}
                onChange={(event) => setEmail(event.currentTarget.value)}
                className="h-10 text-sm"
                autoFocus
              />
              {/* Always there, so a problem found on sending is announced even with focus in the field. */}
              <p id={`${ids}-error`} aria-live="polite" className="text-sm text-danger">
                {checked ? problem : null}
              </p>
            </div>
            <p role="alert" className="text-sm text-danger empty:hidden">
              {refused ? t(`account.invitations.${refused}`) : ""}
            </p>
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" size="sm" variant="ghost" disabled={sending}>
                  {t("account.invitations.cancel")}
                </Button>
              </Dialog.Close>
              <Button type="submit" size="sm" disabled={sending}>
                {sending ? t("account.invitations.inviting") : t("account.invitations.invite")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
