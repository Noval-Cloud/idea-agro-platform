import json
import logging
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query, Response
from fastapi import Path as PathParam
from pydantic import AwareDatetime
from starlette.exceptions import HTTPException

from idea_agro_api.activity import Action
from idea_agro_api.codes import new_code
from idea_agro_api.deps import Caller, CallerDep, ServicesDep
from idea_agro_api.emails.compose import compose, page
from idea_agro_api.emails.templates import Kind, Language, TemplateError
from idea_agro_api.emails.words import SOMEONE
from idea_agro_api.errors import problems
from idea_agro_api.mail import MailFailed
from idea_agro_api.models import (
    ActivityOut,
    DivisionItem,
    DivisionItemIn,
    InvitationAgain,
    MemberIn,
    MemberOut,
    OutlineChange,
    PadronItem,
    PadronItemIn,
    ProjectChange,
    ProjectIn,
    ProjectItem,
    ProjectItemIn,
    ProjectOut,
    ProjectSummary,
    SavedItem,
    SavedItemIn,
    SavedZoneOut,
    SharedOut,
    ZoneGeometry,
)
from idea_agro_api.projects import (
    Member,
    MemberRole,
    NotAllowed,
    Project,
    TooManyItems,
    new_project_id,
    saved_item,
)
from idea_agro_api.routes.activity_log import note
from idea_agro_api.routes.saved_zones import change_outline
from idea_agro_api.routes.saved_zones import out as saved_zone_out
from idea_agro_api.saved_zones import SavedZone
from idea_agro_api.services import Services
from idea_agro_api.zones import Department, Division

router = APIRouter(tags=["Projects"])
log = logging.getLogger("idea_agro_api")

ProjectId = Annotated[UUID, PathParam(description="The project's id.")]
ItemId = Annotated[str, PathParam(description="The item's id, as the project lists it.", max_length=80)]
ZoneId = Annotated[UUID, PathParam(description="The saved zone's id.")]
Email = Annotated[str, PathParam(description="The member's email.", max_length=254)]
NO_PROJECT = "There is no such project among yours."
VIEWERS_READ = "Viewers only read this project."
OWNER_ONLY = "Only the project's owner can do this."
NO_ZONE = "The project holds no such zone."


def reachable(services: Services, caller: Caller, id: UUID, need: Literal["read", "edit", "own"] = "read") -> Project:
    """The project when the caller has the access needed; 404 for anyone outside it, so it stays unknown."""
    project = services.projects.get(str(id))
    role = project.role_of(caller.account.id) if project else None
    if project is None or role is None:
        raise HTTPException(404, NO_PROJECT)
    if need == "edit" and role == "viewer":
        raise HTTPException(403, VIEWERS_READ)
    if need == "own" and role != "owner":
        raise HTTPException(403, OWNER_ONLY)
    return project


def verified_email(caller: Caller) -> str | None:
    email = caller.account.email
    return email.lower() if email and caller.identity.email_verified else None


def accepted(project: Project, account: str, email: str) -> Project:
    """The project with the email's pending invitation accepted by the account, or dropped if it is in already."""
    if not any(m.email == email and m.account is None for m in project.members):
        return project
    inside = project.role_of(account) is not None
    members = tuple(
        replace(m, account=account) if m.email == email and m.account is None else m
        for m in project.members
        if not (inside and m.email == email and m.account is None)
    )
    return replace(project, members=members)


def item_key(item: SavedItemIn | DivisionItemIn | PadronItemIn) -> str:
    match item:
        case SavedItemIn():
            return saved_item(str(item.zone_id))
        case DivisionItemIn():
            return f"{item.division}:{item.zone_id}"
        case PadronItemIn():
            return f"padron:{item.department}:{item.padron}"


def item_out(key: str, zones: dict[str, SavedZone]) -> ProjectItem | None:
    """The item a stored key names, or None for a key this version cannot read, which is logged and skipped."""
    kind, _, rest = key.partition(":")
    try:
        if kind == "saved":
            zone = zones.get(rest)
            return SavedItem(kind="saved", id=key, zone_id=UUID(rest), zone=saved_zone_out(zone) if zone else None)
        if kind == "padron":
            department, _, number = rest.partition(":")
            return PadronItem(kind="padron", id=key, department=Department(department), padron=int(number))
        return DivisionItem(kind="division", id=key, division=Division(kind), zone_id=rest)
    except ValueError:
        log.warning("Skipped the unreadable project item %r", key)
        return None


def holds(project: Project, zone: SavedZone) -> bool:
    """Whether the zone's owner is still in the project: zones of people who left are not shared any more."""
    return zone.owner == project.owner or any(m.account == zone.owner for m in project.members)


def saved_zones_of(services: Services, project: Project) -> dict[str, SavedZone]:
    """The project's saved zones whose owners are still in it, by id."""
    ids = [key.removeprefix("saved:") for key in project.items if key.startswith("saved:")]
    return {id: zone for id, zone in services.saved_zones.get_many(ids).items() if holds(project, zone)}


class Names:
    """Account names, each read once per request."""

    def __init__(self, services: Services) -> None:
        self._services = services
        self._names: dict[str, str | None] = {}

    def of(self, account: str | None) -> str | None:
        if account is None:
            return None
        if account not in self._names:
            found = self._services.accounts.get(account)
            self._names[account] = found.display_name if found else None
        return self._names[account]


def summary(project: Project, caller: Caller, names: Names) -> ProjectSummary:
    me = caller.account.id
    return ProjectSummary(
        id=project.id,
        name=project.name,
        description=project.description,
        zone_count=len(project.items),
        member_count=len(project.members),
        role=project.role_of(me) or "viewer",
        owner_name=names.of(project.owner),
        others_can_edit=project.others_can_edit(me),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def detail(services: Services, project: Project, caller: Caller) -> ProjectOut:
    zones = saved_zones_of(services, project)
    names = Names(services)
    me = caller.account.id
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        items=[item for key in project.items if (item := item_out(key, zones))],
        role=project.role_of(me) or "viewer",
        owner_name=names.of(project.owner),
        members=[
            MemberOut(
                email=m.email,
                name=names.of(m.account),
                role=m.role,
                pending=m.account is None,
                invited_until=m.invited_until if m.account is None else None,
                you=m.account == me,
            )
            for m in project.members
        ],
        others_can_edit=project.others_can_edit(me),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get(
    "/v1/projects",
    summary="Your projects",
    description="Yours and those shared with you.",
    responses=problems(401, 403, 429),
)
def list_projects(caller: CallerDep, services: ServicesDep) -> list[ProjectSummary]:
    me = caller.account.id
    found = {p.id: p for p in [*services.projects.owned_by(me), *services.projects.shared_with(me)]}
    names = Names(services)
    projects = sorted(found.values(), key=lambda p: p.updated_at, reverse=True)
    return [summary(p, caller, names) for p in projects]


@router.post(
    "/v1/projects",
    status_code=201,
    summary="Create a project",
    responses=problems(401, 403, 409, 422, 429),
)
def create_project(project: ProjectIn, caller: CallerDep, services: ServicesDep) -> ProjectOut:
    limit = services.limits.projects_per_account
    if services.projects.count_owned(caller.account.id) >= limit:
        raise HTTPException(409, f"An account holds at most {limit} projects.")
    now = datetime.now(UTC)
    created = Project(
        id=new_project_id(),
        owner=caller.account.id,
        name=project.name,
        description=project.description,
        items=(),
        created_at=now,
        updated_at=now,
    )
    services.projects.add(created)
    note(services, [created.id], caller, Action.CREATED, detail=created.name)
    return detail(services, created, caller)


@router.get(
    "/v1/projects/{project_id}",
    summary="One of your projects",
    responses=problems(401, 403, 404, 422, 429),
)
def get_project(project_id: ProjectId, caller: CallerDep, services: ServicesDep) -> ProjectOut:
    return detail(services, reachable(services, caller, project_id), caller)


@router.patch(
    "/v1/projects/{project_id}",
    summary="Rename or describe a project",
    description="For the owner and collaborators.",
    responses=problems(401, 403, 404, 422, 429),
)
def change_project(
    project_id: ProjectId, change: ProjectChange, caller: CallerDep, services: ServicesDep
) -> ProjectOut:
    before = reachable(services, caller, project_id, "edit")
    fields = change.model_dump(exclude_none=True)
    project = services.projects.update(str(project_id), **fields, updated_at=datetime.now(UTC))
    if project is None:
        raise HTTPException(404, NO_PROJECT)
    if change.name is not None and change.name != before.name:
        note(services, [project.id], caller, Action.RENAMED, detail=change.name)
    if change.description is not None and change.description != before.description:
        note(services, [project.id], caller, Action.DESCRIBED)
    return detail(services, project, caller)


@router.delete(
    "/v1/projects/{project_id}",
    status_code=204,
    summary="Delete a project",
    description="For the owner. Deletes the project and its activity only: its zones stay where they are.",
    responses=problems(401, 403, 404, 422, 429),
)
def delete_project(project_id: ProjectId, caller: CallerDep, services: ServicesDep) -> Response:
    reachable(services, caller, project_id, "own")
    services.projects.delete(str(project_id))
    services.activity.forget_project(str(project_id))
    return Response(status_code=204)


@router.post(
    "/v1/projects/{project_id}/items",
    summary="Add a zone to a project",
    description=(
        "For the owner and collaborators. Adds a reference to a zone of your library, of a predefined division or "
        "a cadastral parcel, unless the project holds it already, and answers with the project. The zone itself is "
        "not copied; members can read it, and collaborators can change its outline."
    ),
    responses=problems(401, 403, 404, 409, 422, 429),
)
def add_project_item(
    project_id: ProjectId, item: ProjectItemIn, caller: CallerDep, services: ServicesDep
) -> ProjectOut:
    me = caller.account.id
    reachable(services, caller, project_id, "edit")
    name = ""
    match item:
        case SavedItemIn():
            zone = services.saved_zones.get(str(item.zone_id))
            if zone is None or zone.owner != me:
                raise HTTPException(422, "There is no such zone in your library.")
            name = zone.name
        case DivisionItemIn():
            if not services.zones.exists(item.division, item.zone_id):
                raise HTTPException(422, f"There is no zone {item.zone_id} in {item.division}.")
        case PadronItemIn():
            # Only its format is checked: the API holds no cadastral data yet.
            pass
    key = item_key(item)
    limit = services.limits.zones_per_project
    added = False

    def adding(project: Project) -> Project:
        nonlocal added
        added = False
        # Checked again here: the caller's role may have changed meanwhile.
        if not project.can_edit(me):
            raise NotAllowed
        if key in project.items:
            return project
        if len(project.items) >= limit:
            raise TooManyItems
        added = True
        return replace(project, items=(*project.items, key), updated_at=datetime.now(UTC))

    try:
        project = services.projects.change(str(project_id), adding)
    except TooManyItems as error:
        raise HTTPException(409, f"A project holds at most {limit} zones.") from error
    except NotAllowed as error:
        raise HTTPException(403, VIEWERS_READ) from error
    if project is None:
        raise HTTPException(404, NO_PROJECT)
    if added:
        note(services, [project.id], caller, Action.ZONE_ADDED, key, name)
    return detail(services, project, caller)


@router.delete(
    "/v1/projects/{project_id}/items/{item_id}",
    status_code=204,
    summary="Remove a zone from a project",
    description="For the owner and collaborators. Removes the reference only: the zone itself stays.",
    responses=problems(401, 403, 404, 422, 429),
)
def remove_project_item(project_id: ProjectId, item_id: ItemId, caller: CallerDep, services: ServicesDep) -> Response:
    project = reachable(services, caller, project_id, "edit")
    if item_id not in project.items:
        raise HTTPException(404, NO_ZONE)
    if services.projects.remove_item(str(project_id), item_id, datetime.now(UTC)) is None:
        raise HTTPException(404, NO_PROJECT)
    zone = services.saved_zones.get(item_id.removeprefix("saved:")) if item_id.startswith("saved:") else None
    note(services, [project.id], caller, Action.ZONE_REMOVED, item_id, zone.name if zone else "")
    return Response(status_code=204)


@router.put(
    "/v1/projects/{project_id}/members",
    summary="Share a project, or change a member's role",
    description=(
        "For the owner. Invites the email as `collaborator` (changes the project's zones, their outlines included) "
        "or `viewer` (only reads). A new member is emailed, in `language`, a link with a code that expires; "
        "they accept it signed in with that verified email."
    ),
    responses=problems(401, 403, 404, 409, 422, 429),
)
def share_project(project_id: ProjectId, member: MemberIn, caller: CallerDep, services: ServicesDep) -> SharedOut:
    me = caller.account.id
    reachable(services, caller, project_id, "own")
    email = member.email.lower()
    if email == (caller.account.email or "").lower():
        raise HTTPException(422, "You own this project.")
    limit = services.limits.members_per_project
    invited = False
    # Made once, outside the change, which may run more than once.
    code, kept = new_code()
    now = datetime.now(UTC)
    until = now + timedelta(days=services.limits.invitation_days)

    def sharing(project: Project) -> Project:
        nonlocal invited
        invited = False
        if project.owner != me:
            raise NotAllowed
        if any(m.email == email for m in project.members):
            members = tuple(replace(m, role=member.role) if m.email == email else m for m in project.members)
        elif len(project.members) >= limit:
            raise TooManyItems
        else:
            invited = True
            members = (
                *project.members,
                Member(email, member.role, invitation=kept, invited_until=until, invited_at=now),
            )
        return replace(project, members=members, updated_at=datetime.now(UTC))

    try:
        project = services.projects.change(str(project_id), sharing)
    except TooManyItems as error:
        raise HTTPException(409, f"A project is shared with at most {limit} people.") from error
    except NotAllowed as error:
        raise HTTPException(403, OWNER_ONLY) from error
    if project is None:
        raise HTTPException(404, NO_PROJECT)
    action = Action.MEMBER_INVITED if invited else Action.MEMBER_ROLE_CHANGED
    note(services, [project.id], caller, action, email, member.role.value)
    sent = tell(services, caller, project, email, member.role, member.language, code, until) if invited else None
    return SharedOut(**detail(services, project, caller).model_dump(), invitation_sent=sent)


@router.post(
    "/v1/projects/{project_id}/members/{email}/invitation",
    summary="Send a pending invitation again",
    description="For the owner. The invitation gets a new code and a new term, and is emailed again in `language`.",
    responses=problems(401, 403, 404, 409, 422, 429),
)
def resend_invitation(
    project_id: ProjectId, email: Email, again: InvitationAgain, caller: CallerDep, services: ServicesDep
) -> SharedOut:
    me = caller.account.id
    reachable(services, caller, project_id, "own")
    email = email.lower()
    code, kept = new_code()
    now = datetime.now(UTC)
    until = now + timedelta(days=services.limits.invitation_days)
    pause = timedelta(minutes=services.limits.invitation_resend_minutes)
    role: MemberRole | None = None

    def renewing(project: Project) -> Project:
        nonlocal role
        if project.owner != me:
            raise NotAllowed
        member = next((m for m in project.members if m.email == email), None)
        if member is None or member.account is not None:
            raise MissingInvitation
        # Against flooding someone's inbox: one email per invitation every few minutes.
        if member.invited_at and now - member.invited_at < pause:
            raise TooSoon(int((member.invited_at + pause - now).total_seconds()) + 1)
        role = member.role
        members = tuple(
            replace(m, invitation=kept, invited_until=until, invited_at=now) if m.email == email else m
            for m in project.members
        )
        return replace(project, members=members)

    try:
        project = services.projects.change(str(project_id), renewing)
    except NotAllowed as error:
        raise HTTPException(403, OWNER_ONLY) from error
    except MissingInvitation as error:
        raise HTTPException(409, "There is no pending invitation for that email.") from error
    except TooSoon as error:
        raise HTTPException(
            429, "The invitation was emailed a moment ago: try again later.", {"Retry-After": str(error.seconds)}
        ) from error
    if project is None or role is None:
        raise HTTPException(404, NO_PROJECT)
    note(services, [project.id], caller, Action.MEMBER_INVITED, email, role.value)
    sent = tell(services, caller, project, email, role, again.language, code, until)
    return SharedOut(**detail(services, project, caller).model_dump(), invitation_sent=sent)


class MissingInvitation(Exception):
    pass


class TooSoon(Exception):
    def __init__(self, seconds: int) -> None:
        self.seconds = seconds


def tell(
    services: Services,
    caller: Caller,
    project: Project,
    email: str,
    role: MemberRole,
    language: Language,
    code: str,
    until: datetime,
) -> bool:
    """Emails the invitation; the invitation stands whether or not the email leaves."""
    try:
        services.mailer.send(
            compose(
                services.templates,
                Kind.INVITATION_TO_COLLABORATE if role == MemberRole.COLLABORATOR else Kind.INVITATION_TO_VIEW,
                language=language,
                to=email,
                values={
                    "inviter": caller.account.name or caller.account.email or SOMEONE[language],
                    "project": project.name,
                    "email": email,
                    "until": until,
                },
                # The code rides in the fragment, which browsers never send to a server.
                link=page(services.site_url, language, f"/invitation/#project={project.id}&code={code}"),
                site=services.site_url,
            )
        )
    except MailFailed, TemplateError:
        log.warning("The invitation email to a new member of project %s did not leave", project.id, exc_info=True)
        return False
    return True


@router.delete(
    "/v1/projects/{project_id}/members/{email}",
    status_code=204,
    summary="Remove a member, or leave a project",
    description=(
        "The owner removes anyone; a member removes only themself. The zones of the member's library leave the "
        "project with them."
    ),
    responses=problems(401, 403, 404, 422, 429),
)
def remove_project_member(project_id: ProjectId, email: Email, caller: CallerDep, services: ServicesDep) -> Response:
    me = caller.account.id
    project = reachable(services, caller, project_id)
    email = email.lower()
    member = next((m for m in project.members if m.email == email), None)
    if member is None:
        raise HTTPException(404, "The project has no such member.")
    leaving = member.account == me
    if not leaving and project.owner != me:
        raise HTTPException(403, OWNER_ONLY)
    theirs = {saved_item(z.id) for z in saved_zones_of(services, project).values() if z.owner == member.account}

    def removing(current: Project) -> Project:
        return replace(
            current,
            members=tuple(m for m in current.members if m.email != email),
            items=tuple(i for i in current.items if i not in theirs),
            updated_at=datetime.now(UTC),
        )

    if services.projects.change(str(project_id), removing) is None:
        raise HTTPException(404, NO_PROJECT)
    note(services, [project.id], caller, Action.MEMBER_LEFT if leaving else Action.MEMBER_REMOVED, email)
    return Response(status_code=204)


@router.get(
    "/v1/projects/{project_id}/activity",
    summary="What happened in a project",
    description=(
        "The latest changes, newest first. To load more, ask again with `before` set to the `at` of the last"
        " change received; `since` keeps only the changes from a moment on. Both moments carry their offset."
    ),
    responses=problems(401, 403, 404, 422, 429),
)
def get_project_activity(
    project_id: ProjectId,
    caller: CallerDep,
    services: ServicesDep,
    before: Annotated[AwareDatetime | None, Query(description="Only changes before this moment.")] = None,
    since: Annotated[AwareDatetime | None, Query(description="Only changes from this moment on.")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="How many changes at most.")] = 100,
) -> list[ActivityOut]:
    project = reachable(services, caller, project_id)
    return [
        ActivityOut(at=e.at, actor_name=e.actor_name, action=e.action, subject=e.subject, detail=e.detail)
        for e in services.activity.of_project(project.id, limit, before=before, since=since)
    ]


def project_zone(
    services: Services, caller: Caller, project_id: UUID, zone_id: UUID, need: Literal["read", "edit"] = "read"
) -> SavedZone:
    """A saved zone reached through a project that holds it, whoever's library it is in."""
    project = reachable(services, caller, project_id, need)
    zone = services.saved_zones.get(str(zone_id))
    if saved_item(str(zone_id)) not in project.items or zone is None or not holds(project, zone):
        raise HTTPException(404, NO_ZONE)
    return zone


@router.get(
    "/v1/projects/{project_id}/zones/{zone_id}",
    summary="A saved zone of a project",
    description="For every member, whoever's library the zone is in.",
    responses=problems(401, 403, 404, 422, 429),
)
def get_project_zone(project_id: ProjectId, zone_id: ZoneId, caller: CallerDep, services: ServicesDep) -> SavedZoneOut:
    return saved_zone_out(project_zone(services, caller, project_id, zone_id))


@router.get(
    "/v1/projects/{project_id}/zones/{zone_id}/geometry",
    summary="The outline of a saved zone of a project",
    responses=problems(401, 403, 404, 422, 429),
)
def get_project_zone_geometry(
    project_id: ProjectId, zone_id: ZoneId, caller: CallerDep, services: ServicesDep
) -> ZoneGeometry:
    zone = project_zone(services, caller, project_id, zone_id)
    content = services.geometries.get(zone.file)
    if content is None:
        raise HTTPException(404, "The zone's outline is missing.")
    return json.loads(content)


@router.put(
    "/v1/projects/{project_id}/zones/{zone_id}/geometry",
    summary="Change the outline of a saved zone of a project",
    description=(
        "For the owner and collaborators. Keeps the outline as a new version: the zone's owner sees every version "
        "and can restore any of them."
    ),
    responses=problems(401, 403, 404, 409, 413, 422, 429),
)
def change_project_zone_geometry(
    project_id: ProjectId, zone_id: ZoneId, change: OutlineChange, caller: CallerDep, services: ServicesDep
) -> SavedZoneOut:
    zone = project_zone(services, caller, project_id, zone_id, "edit")
    return saved_zone_out(change_outline(services, zone, change.version, change.geometry.model_dump(), caller))
