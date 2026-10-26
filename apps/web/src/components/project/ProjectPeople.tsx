import { useEffect, useId, useState, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import type { MemberOut, MemberRole, ProjectOut } from "@idea-agro/api-client";
import { Trash2, TriangleAlert, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Question } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { RowMenu } from "@/components/lists/RowMenu";
import { iconSize } from "@/design/tokens";
import { readHint } from "@/lib/account-hint";
import { cn } from "@/lib/utils";
import type { ProjectTranslator } from "./i18n";
import { field, type Change } from "./shared";

const roles: MemberRole[] = ["collaborator", "viewer"];

type Ask = (question: Question) => Promise<boolean>;

/** Who the project is shared with. The owner invites, changes roles and removes people. */
export function PeopleTab({
  translator: { t },
  project,
  change,
  ask,
}: {
  translator: ProjectTranslator;
  project: ProjectOut;
  change: Change;
  ask: Ask;
}) {
  const [notice, setNotice] = useState("");
  const owner = project.role === "owner";
  const nameOf = (member: MemberOut) => member.name || member.email;

  /** Collaborators can reshape everyone's zones: the owner confirms it first. */
  const share = async (to: string, as: MemberRole) => {
    if (
      as === "collaborator" &&
      !(await ask({
        title: t("project.members.confirmCollaborator.title", { email: to }),
        body: t("project.members.confirmCollaborator.body"),
        confirm: t("project.members.confirmCollaborator.action"),
        tone: "primary",
      }))
    )
      return;
    await change(
      async ([{ privately }, client]) => {
        const response = await privately((init) => client.shareProject(project.id, { email: to, role: as }, init));
        if (response.status !== 200) return { status: response.status };
        return { status: 200, apply: () => response.data };
      },
      { 409: "project.members.full", 422: "project.members.failed" },
    );
  };

  const remove = async (member: MemberOut) => {
    const sure = await ask({
      title: t("project.members.confirmRemove.title", { name: nameOf(member) }),
      body: t("project.members.confirmRemove.body"),
      confirm: t("project.members.confirmRemove.action"),
      returnFocus: () => document.getElementById(`member-${member.email}`),
    });
    if (!sure) return;
    setNotice("");
    await change(async ([{ privately }, client]) => {
      // Emails go into the path: encoded, so none can reach another route.
      const gone = await privately((init) =>
        client.removeProjectMember(project.id, encodeURIComponent(member.email), init),
      );
      if (gone.status !== 204) return { status: gone.status };
      // Their row went away with its menu: focus waits on the invite button.
      requestAnimationFrame(() => document.getElementById("invite")?.focus());
      // Their zones left too: the project comes back as it is now.
      const now = await privately((init) => client.getProject(project.id, init));
      return now.status === 200 ? { status: 200, apply: () => now.data } : { status: 204 };
    });
  };

  return (
    <div className="grid gap-6 pt-6">
      {owner && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-sm text-ink-muted">{t("project.members.lead")}</p>
            <InviteDialog
              t={t}
              members={project.members}
              onInvite={(to, as) =>
                change(
                  async ([{ privately }, client]) => {
                    const response = await privately((init) =>
                      client.shareProject(project.id, { email: to, role: as }, init),
                    );
                    if (response.status !== 200) return { status: response.status };
                    setNotice(t("project.members.invited", { email: to }));
                    return { status: 200, apply: () => response.data };
                  },
                  {},
                  true,
                )
              }
            />
          </div>
          {/* Always there, so the confirmation is announced when it appears. */}
          <p role="status" className="text-sm text-ink-muted">
            {notice}
          </p>
        </div>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        <Person
          initial={(project.role === "owner" ? t("project.members.you") : (project.owner_name ?? "?")).slice(0, 1)}
          name={project.role === "owner" ? t("project.members.you") : (project.owner_name ?? "")}
          role={<RoleLabel label={t("project.roles.owner")} strong />}
        />
        {project.members.map((member) => (
          <Person
            key={member.email}
            initial={nameOf(member).slice(0, 1)}
            name={member.you ? t("project.members.you") : nameOf(member)}
            detail={member.name ? member.email : undefined}
            pending={member.pending ? t("project.members.pending") : undefined}
            role={
              owner ? (
                <RoleControl
                  t={t}
                  member={member}
                  label={t("project.members.roleOf", { name: nameOf(member) })}
                  onChange={(next) => void share(member.email, next)}
                />
              ) : (
                <RoleLabel label={t(`project.roles.${member.role}`)} />
              )
            }
            menu={
              owner ? (
                <RowMenu
                  id={`member-${member.email}`}
                  label={t("lists.more", { name: nameOf(member) })}
                  actions={[
                    {
                      label: t("project.members.remove"),
                      icon: <Trash2 />,
                      onSelect: () => void remove(member),
                      danger: true,
                    },
                  ]}
                />
              ) : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}

function Person({
  initial,
  name,
  detail,
  pending,
  role,
  menu,
}: {
  initial: string;
  name: string;
  detail?: string;
  pending?: string;
  role: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-medium text-ink uppercase"
      >
        {initial}
      </span>
      <div className="min-w-40 grow basis-0">
        <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
          <span className="truncate font-medium">{name}</span>
          {pending && (
            <span className="shrink-0 rounded-pill bg-action-soft px-2 py-0.5 text-xs text-ink-muted">{pending}</span>
          )}
        </p>
        {detail && <p className="truncate text-xs text-ink-subtle">{detail}</p>}
      </div>
      <div className="shrink-0">{role}</div>
      <div className="w-9 shrink-0">{menu}</div>
    </li>
  );
}

function RoleLabel({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-pill border px-2 py-0.5 text-xs font-medium",
        strong ? "border-line text-ink-muted" : "border-transparent bg-surface-muted text-ink-muted",
      )}
    >
      {label}
    </span>
  );
}

/** A member's role, applied only with its button: moving through the options with the keyboard changes nothing. */
function RoleControl({
  t,
  member,
  label,
  onChange,
}: {
  t: ProjectTranslator["t"];
  member: MemberOut;
  label: string;
  onChange: (role: MemberRole) => void;
}) {
  const [role, setRole] = useState<MemberRole>(member.role);
  useEffect(() => setRole(member.role), [member.role]);
  return (
    <div className="flex items-center gap-2">
      <select
        className={field}
        value={role}
        aria-label={label}
        onChange={(event) => setRole(event.currentTarget.value as MemberRole)}
      >
        {roles.map((r) => (
          <option key={r} value={r}>
            {t(`project.roles.${r}`)}
          </option>
        ))}
      </select>
      {role !== member.role && (
        <Button size="sm" variant="outline" onClick={() => onChange(role)}>
          {t("project.members.changeRole")}
        </Button>
      )}
    </div>
  );
}

/** The same check the API makes: an address with no characters that would change a path's meaning. */
const EMAIL = /^[^@\s/?#%]+@[^@\s/?#%]+\.[^@\s/?#%]+$/;

/**
 * Invites someone by email: what each role may do, and what a collaborator can reach, are said before inviting.
 * The email is checked when sent and, after that, as one types.
 */
function InviteDialog({
  t,
  members,
  onInvite,
}: {
  t: ProjectTranslator["t"];
  members: MemberOut[];
  onInvite: (email: string, role: MemberRole) => Promise<number>;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [checked, setChecked] = useState(false);
  const [refused, setRefused] = useState<"full" | "failed" | null>(null);
  const [sending, setSending] = useState(false);
  const ids = useId();

  const address = email.trim().toLowerCase();
  const problem = !EMAIL.test(address)
    ? t("project.members.emailInvalid")
    : address === readHint()?.email?.toLowerCase()
      ? t("project.members.emailOwn")
      : members.some((m) => m.email === address)
        ? t("project.members.emailTaken", { email: address })
        : null;

  /** Opens clean; while an invitation is on its way the dialog stays open, so its answer has a place. */
  const reset = (next: boolean) => {
    if (!next && sending) return;
    setOpen(next);
    setEmail("");
    setRole("viewer");
    setChecked(false);
    setRefused(null);
  };

  const send = async () => {
    setChecked(true);
    setRefused(null);
    if (problem) return document.getElementById(`${ids}-email`)?.focus();
    setSending(true);
    const status = await onInvite(address, role);
    setSending(false);
    if (status === 200) {
      setOpen(false);
      return;
    }
    setRefused(status === 409 ? "full" : "failed");
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Trigger asChild>
        <Button id="invite" size="sm">
          <UserPlus aria-hidden="true" />
          {t("project.members.invite")}
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
              <Dialog.Title className="text-lg font-medium">{t("project.members.inviteTitle")}</Dialog.Title>
              <Dialog.Description className="text-sm text-ink-muted">{t("project.members.intro")}</Dialog.Description>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor={`${ids}-email`} className="text-sm font-medium text-ink">
                {t("project.members.email")}
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
                placeholder={t("project.members.emailPlaceholder")}
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

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium text-ink">{t("project.members.role")}</legend>
              {roles.map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-start gap-3 rounded-sm border border-line p-3 transition-colors duration-(--ia-motion-fast) hover:border-ink-subtle has-checked:border-ink-subtle has-checked:bg-surface-selected has-focus-visible:outline-(length:--ia-focus-width) has-focus-visible:outline-offset-(--ia-focus-offset) has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    aria-describedby={r === "collaborator" ? `${ids}-${r} ${ids}-warning` : `${ids}-${r}`}
                    className="mt-0.5 size-4 shrink-0 focus-visible:outline-none"
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium text-ink">{t(`project.roles.${r}`)}</span>
                    <span id={`${ids}-${r}`} className="text-sm text-ink-muted">
                      {t(`project.members.roleBodies.${r}`)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {role === "collaborator" && (
              <p
                id={`${ids}-warning`}
                className="flex items-start gap-2 rounded-sm bg-action-soft p-3 text-sm text-ink"
              >
                <TriangleAlert size={iconSize.sm} aria-hidden="true" className="mt-0.5 shrink-0" />
                {t("project.members.confirmCollaborator.body")}
              </p>
            )}

            <p role="alert" className="text-sm text-danger">
              {refused ? t(`project.members.${refused}`) : ""}
            </p>

            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" size="sm" variant="ghost" disabled={sending}>
                  {t("project.cancel")}
                </Button>
              </Dialog.Close>
              <Button type="submit" size="sm" disabled={sending}>
                {sending ? t("project.members.inviting") : t("project.members.invite")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
