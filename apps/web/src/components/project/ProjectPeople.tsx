import { useEffect, useState, type ReactNode } from "react";
import type { MemberOut, MemberRole, ProjectOut } from "@idea-agro/api-client";
import { Info, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Question } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import { RowMenu } from "@/components/lists/RowMenu";
import { iconSize } from "@/design/tokens";
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
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
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
        setEmail("");
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
    await change(async ([{ privately }, client]) => {
      // Emails go into the path: encoded, so none can reach another route.
      const gone = await privately((init) =>
        client.removeProjectMember(project.id, encodeURIComponent(member.email), init),
      );
      if (gone.status !== 204) return { status: gone.status };
      // Their zones left too: the project comes back as it is now.
      const now = await privately((init) => client.getProject(project.id, init));
      return now.status === 200 ? { status: 200, apply: () => now.data } : { status: 204 };
    });
  };

  return (
    <div className="grid gap-6 pt-6">
      {owner && (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) void share(email.trim(), role);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="email"
              name="email"
              autoComplete="off"
              spellCheck={false}
              value={email}
              maxLength={254}
              placeholder={t("project.members.emailPlaceholder")}
              aria-label={t("project.members.email")}
              onChange={(event) => setEmail(event.currentTarget.value)}
              className="h-9 w-full text-sm sm:w-72"
            />
            <Segmented
              value={role}
              onValueChange={(value) => setRole(value as MemberRole)}
              aria-label={t("project.members.role")}
            >
              {roles.map((r) => (
                <SegmentedItem key={r} value={r}>
                  {t(`project.roles.${r}`)}
                </SegmentedItem>
              ))}
            </Segmented>
            <Button type="submit" size="sm" disabled={!email.trim()}>
              <UserPlus aria-hidden="true" />
              {t("project.members.invite")}
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-ink-subtle">
            <Info size={iconSize.xs} aria-hidden="true" className="mt-px shrink-0" />
            <span>
              {t("project.members.roleHelp")} {t("project.members.intro")}
            </span>
          </p>
        </form>
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
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-medium text-ink uppercase"
      >
        {initial}
      </span>
      <div className="min-w-0 grow">
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
      {role !== member.role && (
        <Button size="sm" variant="outline" onClick={() => onChange(role)}>
          {t("project.members.changeRole")}
        </Button>
      )}
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
    </div>
  );
}
