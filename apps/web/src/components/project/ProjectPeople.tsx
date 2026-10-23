import { useEffect, useState } from "react";
import type { MemberOut, MemberRole, ProjectOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectTranslator } from "./i18n";
import { card, field, type Change } from "./shared";

const roles: MemberRole[] = ["collaborator", "viewer"];

/** Who the project is shared with. The owner invites, changes roles and removes; a member can leave. */
export function People({
  t,
  project,
  change,
  onLeft,
}: {
  t: ProjectTranslator["t"];
  project: ProjectOut;
  change: Change;
  onLeft: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const owner = project.role === "owner";
  const nameOf = (member: MemberOut) => member.name || member.email;

  /** Collaborators can reshape everyone's zones: the owner confirms it first. */
  const share = (to: string, as: MemberRole) => {
    if (as === "collaborator" && !window.confirm(t("project.members.confirmCollaborator", { email: to }))) return;
    void change(
      async ([{ privately }, client]) => {
        const response = await privately((init) => client.shareProject(project.id, { email: to, role: as }, init));
        if (response.status !== 200) return { status: response.status };
        setEmail("");
        return { status: 200, apply: () => response.data };
      },
      { 409: "project.members.full", 422: "project.members.failed" },
    );
  };

  const remove = (member: MemberOut) => {
    const question = member.you
      ? t("project.confirmLeave", { name: project.name })
      : t("project.members.confirmRemove", { name: nameOf(member) });
    if (!window.confirm(question)) return;
    void change(async ([{ privately }, client]) => {
      // Emails go into the path: encoded, so none can reach another route.
      const gone = await privately((init) =>
        client.removeProjectMember(project.id, encodeURIComponent(member.email), init),
      );
      if (gone.status !== 204) return { status: gone.status };
      if (member.you) {
        onLeft();
        return { status: 204 };
      }
      // Their zones left too: the project comes back as it is now.
      const now = await privately((init) => client.getProject(project.id, init));
      return now.status === 200 ? { status: 200, apply: () => now.data } : { status: 204 };
    });
  };

  return (
    <section aria-labelledby="people-title" className={card}>
      <h2 id="people-title" className="text-lg font-medium text-ink">
        {t("project.members.title")}
      </h2>
      <ul className="mt-4 grid divide-y divide-line">
        <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
          <p className="min-w-0 grow text-sm text-ink">
            {project.role === "owner" ? t("project.members.you") : project.owner_name}
          </p>
          <p className="text-sm text-ink-subtle">{t("project.roles.owner")}</p>
        </li>
        {project.members.map((member) => (
          <li key={member.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 grow">
              <p className="truncate text-sm text-ink">{member.you ? t("project.members.you") : nameOf(member)}</p>
              <p className="truncate text-xs text-ink-subtle">
                {member.pending ? t("project.members.pending") : member.name ? member.email : null}
              </p>
            </div>
            {owner ? (
              <RoleControl
                t={t}
                member={member}
                label={t("project.members.roleOf", { name: nameOf(member) })}
                onChange={(next) => share(member.email, next)}
                onRemove={() => remove(member)}
                removeLabel={t("project.members.removeLabel", { name: nameOf(member) })}
              />
            ) : (
              <p className="text-sm text-ink-subtle">{t(`project.roles.${member.role}`)}</p>
            )}
            {member.you && (
              <Button size="sm" variant="ghost" onClick={() => remove(member)}>
                {t("project.leave")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {owner && (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) share(email.trim(), role);
          }}
        >
          <p className="max-w-prose text-sm text-ink-muted">{t("project.members.intro")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="email"
              value={email}
              maxLength={254}
              placeholder={t("project.members.emailPlaceholder")}
              aria-label={t("project.members.email")}
              onChange={(event) => setEmail(event.currentTarget.value)}
              className="h-9 max-w-xs grow text-sm"
            />
            <select
              className={field}
              value={role}
              aria-label={t("project.members.role")}
              onChange={(event) => setRole(event.currentTarget.value as MemberRole)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {t(`project.roles.${r}`)}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" disabled={!email.trim()}>
              {t("project.members.invite")}
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">{t("project.members.roleHelp")}</p>
        </form>
      )}
    </section>
  );
}

/** A member's role, applied only with its button: moving through the options with the keyboard changes nothing. */
function RoleControl({
  t,
  member,
  label,
  removeLabel,
  onChange,
  onRemove,
}: {
  t: ProjectTranslator["t"];
  member: MemberOut;
  label: string;
  removeLabel: string;
  onChange: (role: MemberRole) => void;
  onRemove: () => void;
}) {
  const [role, setRole] = useState<MemberRole>(member.role);
  useEffect(() => setRole(member.role), [member.role]);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
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
      <Button size="sm" variant="ghost" aria-label={removeLabel} onClick={onRemove}>
        {t("project.members.remove")}
      </Button>
    </div>
  );
}
