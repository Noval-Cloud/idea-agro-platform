"""Invitations to the platform: a person invites an email, and follows whether it joined."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.deps import Caller, CallerDep, ServicesDep
from idea_agro_api.emails.compose import compose, page
from idea_agro_api.emails.templates import Kind, Language, TemplateError
from idea_agro_api.emails.words import SOMEONE
from idea_agro_api.errors import problems
from idea_agro_api.mail import MailFailed
from idea_agro_api.models import InvitationAgain, PlatformInvitationIn, PlatformInvitationOut, PlatformInvitationSent
from idea_agro_api.platform_invitations import PlatformInvitation, new_invitation_id
from idea_agro_api.services import Services

router = APIRouter(tags=["Account"])
log = logging.getLogger(__name__)

InvitationId = Annotated[UUID, PathParam(description="The invitation's id.")]
NO_INVITATION = "You sent no such invitation."


def out(invitation: PlatformInvitation, now: datetime) -> PlatformInvitationOut:
    return PlatformInvitationOut(
        id=invitation.id,
        email=invitation.email,
        state=invitation.state(now),
        invited_at=invitation.invited_at,
        invited_until=invitation.invited_until,
        accepted_at=invitation.accepted_at,
    )


def sent(invitation: PlatformInvitation, now: datetime, left: bool) -> PlatformInvitationSent:
    return PlatformInvitationSent(**out(invitation, now).model_dump(), invitation_sent=left)


def tell(services: Services, caller: Caller, invitation: PlatformInvitation, language: Language) -> bool:
    """Emails the invitation; it stands whether or not the email leaves."""
    account = caller.account
    try:
        services.mailer.send(
            compose(
                services.templates,
                Kind.PLATFORM_INVITATION,
                language=language,
                to=invitation.email,
                values={
                    "inviter": account.name or account.email or SOMEONE[language],
                    "email": invitation.email,
                    "until": invitation.invited_until,
                },
                link=page(services.site_url, language, "/login/"),
                site=services.site_url,
            )
        )
    except MailFailed, TemplateError:
        log.warning("An invitation to the platform did not leave", exc_info=True)
        return False
    return True


def mine(services: Services, caller: Caller, id: UUID) -> PlatformInvitation:
    invitation = services.platform_invitations.get(str(id))
    if invitation is None or invitation.inviter != caller.account.id:
        raise HTTPException(404, NO_INVITATION)
    return invitation


@router.get(
    "/v1/me/invitations",
    summary="Your invitations to the platform",
    description="Newest first, with their state.",
    responses=problems(401, 403, 429),
)
def list_platform_invitations(caller: CallerDep, services: ServicesDep) -> list[PlatformInvitationOut]:
    now = datetime.now(UTC)
    return [out(i, now) for i in services.platform_invitations.of_inviter(caller.account.id)]


@router.post(
    "/v1/me/invitations",
    status_code=201,
    summary="Invite someone to the platform",
    description=(
        "Emails them, in `language`, who invites them and a link to sign in. The invitation is accepted when an "
        "account with that verified email is created within `INVITATION_DAYS` (7). A person starts at most "
        "`PLATFORM_INVITATIONS_PER_DAY` (10) a day and keeps at most `PLATFORM_INVITATIONS_PENDING` (50) pending."
    ),
    responses=problems(401, 403, 409, 422, 429),
)
def invite_to_platform(
    invitation_in: PlatformInvitationIn, caller: CallerDep, services: ServicesDep
) -> PlatformInvitationSent:
    now = datetime.now(UTC)
    email = invitation_in.email.lower()
    limits = services.limits
    if email == (caller.account.email or "").lower():
        raise HTTPException(422, "You are already on the platform.")
    yours = services.platform_invitations.of_inviter(caller.account.id)
    if any(i.email == email and i.state(now) == "pending" for i in yours):
        raise HTTPException(409, "You already invited that email: resend the invitation instead.")
    if sum(i.created_at > now - timedelta(days=1) for i in yours) >= limits.platform_invitations_per_day:
        raise HTTPException(409, f"You can invite at most {limits.platform_invitations_per_day} people a day.")
    if sum(i.state(now) == "pending" for i in yours) >= limits.platform_invitations_pending:
        raise HTTPException(409, f"You can keep at most {limits.platform_invitations_pending} invitations pending.")
    invitation = PlatformInvitation(
        id=new_invitation_id(),
        inviter=caller.account.id,
        email=email,
        language=invitation_in.language,
        created_at=now,
        invited_at=now,
        invited_until=now + timedelta(days=limits.invitation_days),
    )
    services.platform_invitations.add(invitation)
    return sent(invitation, now, tell(services, caller, invitation, invitation_in.language))


@router.post(
    "/v1/me/invitations/{invitation_id}/resend",
    summary="Send an invitation to the platform again",
    description="With a new term. Not before `INVITATION_RESEND_MINUTES` (10) after the last email.",
    responses=problems(401, 403, 404, 409, 422, 429),
)
def resend_platform_invitation(
    invitation_id: InvitationId, again: InvitationAgain, caller: CallerDep, services: ServicesDep
) -> PlatformInvitationSent:
    now = datetime.now(UTC)
    invitation = mine(services, caller, invitation_id)
    if invitation.accepted_at:
        raise HTTPException(409, "That invitation was already accepted.")
    pause = timedelta(minutes=services.limits.invitation_resend_minutes)
    if invitation.invited_at + pause > now:
        seconds = int((invitation.invited_at + pause - now).total_seconds()) + 1
        raise HTTPException(429, "It was emailed a moment ago.", headers={"Retry-After": str(seconds)})
    until = now + timedelta(days=services.limits.invitation_days)
    updated = services.platform_invitations.update(invitation.id, invited_at=now, invited_until=until)
    if updated is None:
        raise HTTPException(404, NO_INVITATION)
    return sent(updated, now, tell(services, caller, updated, again.language))


@router.delete(
    "/v1/me/invitations/{invitation_id}",
    status_code=204,
    summary="Delete an invitation to the platform",
    description="An accepted one only leaves your list.",
    responses=problems(401, 403, 404, 422, 429),
)
def delete_platform_invitation(invitation_id: InvitationId, caller: CallerDep, services: ServicesDep) -> Response:
    services.platform_invitations.delete(mine(services, caller, invitation_id).id)
    return Response(status_code=204)
