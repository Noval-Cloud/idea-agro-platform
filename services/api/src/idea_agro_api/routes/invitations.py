from dataclasses import replace
from datetime import UTC, datetime

from fastapi import APIRouter, Response
from starlette.exceptions import HTTPException

from idea_agro_api.activity import Action
from idea_agro_api.codes import matches
from idea_agro_api.deps import Caller, CallerDep, ServicesDep
from idea_agro_api.errors import InvitationForAnotherEmail, problems
from idea_agro_api.models import InvitationCode, InvitationOut, ProjectOut
from idea_agro_api.projects import Member, Project
from idea_agro_api.routes.activity_log import note
from idea_agro_api.routes.projects import Names, accepted, detail, verified_email
from idea_agro_api.services import Services

router = APIRouter(tags=["invitations"])

NO_INVITATION = "There is no such invitation: it may have been resent, accepted or deleted."
EXPIRED = "The invitation expired: ask the project's owner to send it again."


def pending(project: Project, code: str) -> Member | None:
    """The pending member whose invitation the code opens."""
    return next((m for m in project.members if m.account is None and matches(code, m.invitation)), None)


def expired(member: Member) -> bool:
    return member.invited_until is None or member.invited_until <= datetime.now(UTC)


def find(services: Services, invite: InvitationCode) -> tuple[Project, Member | None]:
    project = services.projects.get(str(invite.project_id))
    if project is None:
        raise HTTPException(404, NO_INVITATION)
    return project, pending(project, invite.code)


def mine(caller: Caller, member: Member) -> None:
    """Only the invited email accepts or declines: a forwarded link does nothing for anyone else."""
    if verified_email(caller) != member.email:
        raise InvitationForAnotherEmail(f"This invitation is for {member.email}: sign in with that email.")


@router.post(
    "/v1/invitations/open",
    summary="What an invitation offers",
    description="The code comes from the invitation's email. A code already used answers `joined` to who used it.",
    responses=problems(401, 403, 404, 422, 429),
)
def open_invitation(invite: InvitationCode, caller: CallerDep, services: ServicesDep) -> InvitationOut:
    project, member = find(services, invite)
    if member is None:
        if project.role_of(caller.account.id) is None:
            raise HTTPException(404, NO_INVITATION)
        # Accepted already, as when the page is opened again after accepting.
        return InvitationOut(
            project_id=project.id,
            project_name=project.name,
            inviter_name=Names(services).of(project.owner),
            role=project.role_of(caller.account.id) or "viewer",
            email=caller.account.email or "",
            invited_until=None,
            state="joined",
            yours=True,
        )
    return InvitationOut(
        project_id=project.id,
        project_name=project.name,
        inviter_name=Names(services).of(project.owner),
        role=member.role.value,
        email=member.email,
        invited_until=member.invited_until,
        state="expired" if expired(member) else "pending",
        yours=verified_email(caller) == member.email,
    )


@router.post(
    "/v1/invitations/accept",
    summary="Accept an invitation",
    description="Signed in with the invited email, before the invitation expires. Answers the project.",
    responses=problems(401, 403, 404, 410, 422, 429),
)
def accept_invitation(invite: InvitationCode, caller: CallerDep, services: ServicesDep) -> ProjectOut:
    project, member = find(services, invite)
    if member is None:
        if project.role_of(caller.account.id) is not None:
            return detail(services, project, caller)
        raise HTTPException(404, NO_INVITATION)
    mine(caller, member)
    if expired(member):
        raise HTTPException(410, EXPIRED)
    me = caller.account.id

    def joining(current: Project) -> Project:
        still = pending(current, invite.code)
        if still is None:
            return current
        joined = accepted(current, me, still.email)
        members = tuple(replace(m, invitation="", invited_until=None) if m.account == me else m for m in joined.members)
        return replace(joined, members=members, updated_at=datetime.now(UTC))

    changed = services.projects.change(project.id, joining)
    if changed is None:
        raise HTTPException(404, NO_INVITATION)
    note(services, [project.id], caller, Action.MEMBER_JOINED, member.email)
    return detail(services, changed, caller)


@router.post(
    "/v1/invitations/decline",
    status_code=204,
    summary="Decline an invitation",
    description="Signed in with the invited email. The invitation is deleted.",
    responses=problems(401, 403, 404, 422, 429),
)
def decline_invitation(invite: InvitationCode, caller: CallerDep, services: ServicesDep) -> Response:
    project, member = find(services, invite)
    if member is None:
        raise HTTPException(404, NO_INVITATION)
    mine(caller, member)

    def declining(current: Project) -> Project:
        members = tuple(m for m in current.members if not (m.account is None and matches(invite.code, m.invitation)))
        return replace(current, members=members, updated_at=datetime.now(UTC))

    if services.projects.change(project.id, declining) is None:
        raise HTTPException(404, NO_INVITATION)
    note(services, [project.id], caller, Action.MEMBER_DECLINED, member.email)
    return Response(status_code=204)
