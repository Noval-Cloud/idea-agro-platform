from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.deps import CallerDep, ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import (
    DivisionItem,
    DivisionItemIn,
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
)
from idea_agro_api.projects import Project, TooManyItems, new_project_id, saved_item
from idea_agro_api.routes.saved_zones import out as saved_zone_out
from idea_agro_api.saved_zones import SavedZone
from idea_agro_api.services import Services
from idea_agro_api.zones import Department, Division

router = APIRouter(tags=["Projects"])

ProjectId = Annotated[UUID, PathParam(description="The project's id.")]
ItemId = Annotated[str, PathParam(description="The item's id, as the project lists it.", max_length=80)]
NO_PROJECT = "There is no such project among yours."


def owned(services: Services, owner: str, id: UUID) -> Project:
    """The project when it belongs to `owner`; otherwise 404, so other people's projects stay unknown."""
    project = services.projects.get(str(id))
    if project is None or project.owner != owner:
        raise HTTPException(404, NO_PROJECT)
    return project


def item_key(item: SavedItemIn | DivisionItemIn | PadronItemIn) -> str:
    match item:
        case SavedItemIn():
            return saved_item(str(item.zone_id))
        case DivisionItemIn():
            return f"{item.division}:{item.zone_id}"
        case PadronItemIn():
            return f"padron:{item.department}:{item.padron}"


def item_out(key: str, zones: dict[str, SavedZone]) -> ProjectItem:
    kind, _, rest = key.partition(":")
    if kind == "saved":
        zone = zones.get(rest)
        return SavedItem(kind="saved", id=key, zone_id=UUID(rest), zone=saved_zone_out(zone) if zone else None)
    if kind == "padron":
        department, _, number = rest.partition(":")
        return PadronItem(kind="padron", id=key, department=Department(department), padron=int(number))
    return DivisionItem(kind="division", id=key, division=Division(kind), zone_id=rest)


def summary(project: Project) -> ProjectSummary:
    return ProjectSummary(
        id=project.id,
        name=project.name,
        description=project.description,
        zone_count=len(project.items),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def detail(services: Services, project: Project) -> ProjectOut:
    saved = [key.removeprefix("saved:") for key in project.items if key.startswith("saved:")]
    zones = services.saved_zones.get_many(saved)
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        items=[item_out(key, zones) for key in project.items],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("/v1/projects", summary="Your projects", responses=problems(401, 403, 429))
def list_projects(caller: CallerDep, services: ServicesDep) -> list[ProjectSummary]:
    projects = sorted(services.projects.owned_by(caller.account.id), key=lambda p: p.updated_at, reverse=True)
    return [summary(p) for p in projects]


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
    return detail(services, created)


@router.get("/v1/projects/{project_id}", summary="One of your projects", responses=problems(401, 403, 404, 422, 429))
def get_project(project_id: ProjectId, caller: CallerDep, services: ServicesDep) -> ProjectOut:
    return detail(services, owned(services, caller.account.id, project_id))


@router.patch(
    "/v1/projects/{project_id}",
    summary="Rename or describe a project",
    responses=problems(401, 403, 404, 422, 429),
)
def change_project(
    project_id: ProjectId, change: ProjectChange, caller: CallerDep, services: ServicesDep
) -> ProjectOut:
    owned(services, caller.account.id, project_id)
    fields = change.model_dump(exclude_none=True)
    project = services.projects.update(str(project_id), **fields, updated_at=datetime.now(UTC))
    if project is None:
        raise HTTPException(404, NO_PROJECT)
    return detail(services, project)


@router.delete(
    "/v1/projects/{project_id}",
    status_code=204,
    summary="Delete a project",
    description="Deletes the project only: its zones stay where they are.",
    responses=problems(401, 403, 404, 422, 429),
)
def delete_project(project_id: ProjectId, caller: CallerDep, services: ServicesDep) -> Response:
    owned(services, caller.account.id, project_id)
    services.projects.delete(str(project_id))
    return Response(status_code=204)


@router.post(
    "/v1/projects/{project_id}/items",
    summary="Add a zone to a project",
    description=(
        "Adds a reference to a zone of your library, of a predefined division or a cadastral parcel, unless the "
        "project holds it already, and answers with the project. The zone itself is not copied."
    ),
    responses=problems(401, 403, 404, 409, 422, 429),
)
def add_project_item(
    project_id: ProjectId, item: ProjectItemIn, caller: CallerDep, services: ServicesDep
) -> ProjectOut:
    owned(services, caller.account.id, project_id)
    match item:
        case SavedItemIn():
            zone = services.saved_zones.get(str(item.zone_id))
            if zone is None or zone.owner != caller.account.id:
                raise HTTPException(422, "There is no such zone in your library.")
        case DivisionItemIn():
            if not services.zones.exists(item.division, item.zone_id):
                raise HTTPException(422, f"There is no zone {item.zone_id} in {item.division}.")
        case PadronItemIn():
            # Only its format is checked: the API holds no cadastral data yet.
            pass
    limit = services.limits.zones_per_project
    try:
        project = services.projects.add_item(str(project_id), item_key(item), limit, datetime.now(UTC))
    except TooManyItems as error:
        raise HTTPException(409, f"A project holds at most {limit} zones.") from error
    if project is None:
        raise HTTPException(404, NO_PROJECT)
    return detail(services, project)


@router.delete(
    "/v1/projects/{project_id}/items/{item_id}",
    status_code=204,
    summary="Remove a zone from a project",
    description="Removes the reference only: the zone itself stays.",
    responses=problems(401, 403, 404, 422, 429),
)
def remove_project_item(project_id: ProjectId, item_id: ItemId, caller: CallerDep, services: ServicesDep) -> Response:
    project = owned(services, caller.account.id, project_id)
    if item_id not in project.items:
        raise HTTPException(404, "The project holds no such zone.")
    services.projects.remove_item(str(project_id), item_id, datetime.now(UTC))
    return Response(status_code=204)
