import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { InvitationOut } from "@idea-agro/api-client";
import { CalendarX2, CircleCheck, MailOpen, MailQuestion, UserRoundX } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Locale } from "@/i18n/core";
import { readHint } from "@/lib/account-hint";
import { createInvitationTranslator, type InvitationCatalog } from "./i18n";

type Props = {
  locale: Locale;
  catalog: InvitationCatalog;
  signInPath: string;
  projectPath: string;
  projectsPath: string;
};

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "failed" }
  | { kind: "declined" }
  | { kind: "ready"; invitation: InvitationOut };

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9_-]{16,64}$/;

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** The page an invitation's email links to: what is offered, to whom, and the answer. */
export default function InvitationApp({ locale, catalog, signInPath, projectPath, projectsPath }: Props) {
  const { t, date } = useMemo(() => createInvitationTranslator(locale, catalog), [locale, catalog]);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [code, setCode] = useState<{ project_id: string; code: string } | null>(null);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [problem, setProblem] = useState(false);

  const signIn = () => `${signInPath}?next=${encodeURIComponent(location.pathname + location.search)}`;

  /** Runs a call; an ended session leads to sign-in, back to this page. */
  const call = async <T,>(run: (modules: Awaited<ReturnType<typeof api>>) => Promise<T>): Promise<T | null> => {
    try {
      return await run(await api());
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut) location.assign(signIn());
      else setProblem(true);
      return null;
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const project = params.get("project") ?? "";
    const secret = params.get("code") ?? "";
    // Checked before they reach the API.
    if (!UUID.test(project) || !CODE.test(secret)) return setState({ kind: "missing" });
    const found = { project_id: project, code: secret };
    setCode(found);
    void call(async ([{ privately }, client]) => {
      const response = await privately((init) => client.openInvitation(found, init));
      if (response.status === 200) setState({ kind: "ready", invitation: response.data });
      else setState({ kind: response.status === 404 ? "missing" : "failed" });
    });
    // The address is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = () =>
    code &&
    void (async () => {
      setBusy("accept");
      setProblem(false);
      await call(async ([{ privately }, client]) => {
        const response = await privately((init) => client.acceptInvitation(code, init));
        if (response.status === 200) return location.assign(`${projectPath}?id=${response.data.id}`);
        if (response.status === 404) return setState({ kind: "missing" });
        if (state.kind === "ready" && (response.status === 410 || response.status === 403))
          return setState({
            kind: "ready",
            invitation: {
              ...state.invitation,
              state: response.status === 410 ? "expired" : state.invitation.state,
              yours: response.status === 403 ? false : state.invitation.yours,
            },
          });
        setProblem(true);
      });
      setBusy(null);
    })();

  const decline = () =>
    code &&
    void (async () => {
      setBusy("decline");
      setProblem(false);
      await call(async ([{ privately }, client]) => {
        const response = await privately((init) => client.declineInvitation(code, init));
        if (response.status === 204) return setState({ kind: "declined" });
        if (response.status === 404) return setState({ kind: "missing" });
        setProblem(true);
      });
      setBusy(null);
    })();

  const otherAccount = async () => {
    const { signOut } = await import("@/lib/account");
    await signOut();
    location.assign(signIn());
  };

  if (state.kind === "loading")
    return (
      <p role="status" className="text-center text-ink-muted">
        {t("invitation.loading")}
      </p>
    );

  const toProjects = (
    <a href={projectsPath} className={buttonVariants({ variant: "outline" })}>
      {t("invitation.projects")}
    </a>
  );
  if (state.kind === "missing")
    return (
      <Card icon={<MailQuestion />} title={t("invitation.missingTitle")} body={t("invitation.missingBody")}>
        {toProjects}
      </Card>
    );
  if (state.kind === "failed") return <Card icon={<MailQuestion />} title={t("invitation.failed")} />;
  if (state.kind === "declined")
    return (
      <Card icon={<UserRoundX />} title={t("invitation.declinedTitle")} body={t("invitation.declinedBody")}>
        {toProjects}
      </Card>
    );

  const { invitation } = state;
  const inviter = invitation.inviter_name ?? t("invitation.someone");
  if (invitation.state === "joined")
    return (
      <Card icon={<CircleCheck />} title={t("invitation.joinedTitle", { project: invitation.project_name })}>
        <a href={`${projectPath}?id=${invitation.project_id}`} className={buttonVariants()}>
          {t("invitation.open")}
        </a>
      </Card>
    );
  if (invitation.state === "expired")
    return (
      <Card
        icon={<CalendarX2 />}
        title={t("invitation.expiredTitle")}
        body={t("invitation.expiredBody", {
          date: invitation.invited_until ? date(invitation.invited_until) : "",
          inviter,
        })}
      >
        {toProjects}
      </Card>
    );
  const me = readHint()?.email;
  if (!invitation.yours)
    return (
      <Card
        icon={<UserRoundX />}
        title={t("invitation.otherTitle")}
        body={
          me
            ? t("invitation.otherBody", { email: invitation.email, me })
            : t("invitation.otherBodyUnknown", { email: invitation.email })
        }
      >
        <Button onClick={() => void otherAccount()}>{t("invitation.otherAction")}</Button>
      </Card>
    );

  const role = invitation.role === "collaborator" ? "collaborator" : "viewer";
  return (
    <Card
      icon={<MailOpen />}
      title={t("invitation.invited", { inviter, project: invitation.project_name })}
      body={`${t("invitation.as", { role: t(`invitation.roles.${role}`) })} ${t(`invitation.roleBodies.${role}`)}`}
      note={invitation.invited_until ? t("invitation.until", { date: date(invitation.invited_until) }) : undefined}
    >
      <Button onClick={accept} disabled={busy !== null}>
        {busy === "accept" ? t("invitation.accepting") : t("invitation.accept")}
      </Button>
      <Button variant="ghost" onClick={decline} disabled={busy !== null}>
        {t("invitation.decline")}
      </Button>
      <p role="alert" className="basis-full text-sm text-danger">
        {problem ? t("invitation.failed") : ""}
      </p>
    </Card>
  );
}

/** The invitation's answer in one card: what happened, and what one can do next. */
function Card({
  icon,
  title,
  body,
  note,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto grid max-w-lg gap-4 rounded-lg border border-line bg-surface p-8 shadow-raised">
      <span className="flex size-11 items-center justify-center rounded-full bg-action-soft text-ink [&_svg]:size-5">
        {icon}
      </span>
      <h1 className="font-display text-2xl font-medium tracking-tight text-balance text-ink">{title}</h1>
      {body && <p className="text-ink-muted">{body}</p>}
      {note && <p className="text-sm text-ink-subtle">{note}</p>}
      {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
    </section>
  );
}
