import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.activity import Action
from idea_agro_api.deps import Caller, CallerDep, ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.geometries import VersionTaken
from idea_agro_api.models import (
    Geometry,
    OutlineChange,
    OutlineVersionOut,
    SavedZoneFeature,
    SavedZoneFeatures,
    SavedZoneIn,
    SavedZoneOut,
    SavedZoneRename,
    SavedZonesImport,
)
from idea_agro_api.projects import saved_item
from idea_agro_api.routes.activity_log import note
from idea_agro_api.saved_zones import OutlineChanged, OutlineVersion, SavedZone, Source, new_zone_id
from idea_agro_api.services import Services
from idea_agro_api.shapes import InvalidShape, Outline, outline_from

router = APIRouter(tags=["Saved zones"])

ZoneId = Annotated[UUID, PathParam(description="The zone's id.")]


def out(zone: SavedZone) -> SavedZoneOut:
    return SavedZoneOut(
        id=zone.id,
        name=zone.name,
        source=zone.source.value,
        version=zone.version,
        area_ha=zone.area_ha,
        bbox=list(zone.bbox),
        department=zone.department,
        created_at=zone.created_at,
        updated_at=zone.updated_at,
    )


def owned(services: Services, owner: str, id: UUID) -> SavedZone:
    """The zone when it belongs to `owner`; otherwise 404, so another person's zones stay unknown."""
    zone = services.saved_zones.get(str(id))
    if zone is None or zone.owner != owner:
        raise HTTPException(404, "There is no such zone in your library.")
    return zone


def measure(services: Services, geojson: dict[str, Any], label: str = "") -> tuple[Outline, bytes]:
    """Checks and measures an outline, and serializes it as it will be stored."""
    try:
        outline = outline_from(geojson, services.limits.coverage)
    except InvalidShape as error:
        raise HTTPException(422, f"{label}{error}") from error
    content = json.dumps(outline.geometry, separators=(",", ":")).encode()
    if len(content) > services.limits.geometry_bytes:
        raise HTTPException(413, f"{label}The outline is larger than {services.limits.geometry_bytes} bytes.")
    return outline, content


def prepare(services: Services, caller: Caller, zone_in: SavedZoneIn, label: str = "") -> tuple[SavedZone, bytes]:
    """Checks and measures a zone without writing anything."""
    outline, content = measure(services, zone_in.geometry.model_dump(), label)
    now = datetime.now(UTC)
    account = caller.account
    zone = SavedZone(
        id=new_zone_id(),
        owner=account.id,
        name=zone_in.name,
        source=Source(zone_in.source),
        version=1,
        area_ha=outline.area_ha,
        bbox=outline.bbox,
        department=services.departments.of(outline.point),
        size=len(content),
        created_at=now,
        updated_at=now,
        history=(OutlineVersion(1, now, account.id, account.display_name, outline.area_ha),),
    )
    return zone, content


def change_outline(
    services: Services, zone: SavedZone, geojson: dict[str, Any], caller: Caller, restored_from: int | None = None
) -> SavedZone:
    """Writes the outline as a new version, keeping every earlier one, and notes it in the zone's projects."""
    outline, content = measure(services, geojson)
    limit = services.limits.library_bytes
    if services.saved_zones.usage(zone.owner).bytes - zone.size + len(content) > limit:
        raise HTTPException(409, f"A library's outlines take at most {limit} bytes in all.")
    changed_meanwhile = HTTPException(409, "The outline changed meanwhile: load it again and retry.")
    version = zone.version + 1
    try:
        services.geometries.put(zone.id, version, content)
    except VersionTaken as error:
        raise changed_meanwhile from error
    now = datetime.now(UTC)
    account = caller.account
    entry = OutlineVersion(version, now, account.id, account.display_name, outline.area_ha, restored_from)
    try:
        changed = services.saved_zones.replace_outline(
            zone.id,
            zone.version,
            entry,
            area_ha=outline.area_ha,
            bbox=list(outline.bbox),
            department=services.departments.of(outline.point),
            size=len(content),
            updated_at=now,
        )
    except OutlineChanged as error:
        services.geometries.delete(zone.id, version)
        raise changed_meanwhile from error
    if changed is None:
        services.geometries.delete(zone.id, version)
        raise HTTPException(404, "The zone was deleted meanwhile.")
    action = Action.OUTLINE_RESTORED if restored_from else Action.OUTLINE_CHANGED
    projects = [p.id for p in services.projects.containing(saved_item(zone.id))]
    note(services, projects, caller, action, saved_item(zone.id), zone.name)
    return changed


def keep(services: Services, owner: str, prepared: list[tuple[SavedZone, bytes]]) -> list[SavedZone]:
    """Writes every zone or none: the outlines first, then every record in one write."""
    limits = services.limits
    usage = services.saved_zones.usage(owner)
    if usage.zones + len(prepared) > limits.saved_zones_per_account:
        raise HTTPException(409, f"A library holds at most {limits.saved_zones_per_account} zones.")
    if usage.bytes + sum(len(content) for _, content in prepared) > limits.library_bytes:
        raise HTTPException(409, f"A library's outlines take at most {limits.library_bytes} bytes in all.")
    written: list[str] = []
    try:
        for zone, content in prepared:
            services.geometries.put(zone.id, zone.version, content)
            written.append(zone.id)
        services.saved_zones.add([zone for zone, _ in prepared])
    except Exception:
        for id in written:
            with suppress(Exception):
                services.geometries.delete_all(id)
        raise
    return [zone for zone, _ in prepared]


@router.get("/v1/saved-zones", summary="Your saved zones", responses=problems(401, 403, 429))
def list_saved_zones(caller: CallerDep, services: ServicesDep) -> list[SavedZoneOut]:
    zones = sorted(services.saved_zones.owned_by(caller.account.id), key=lambda z: z.updated_at, reverse=True)
    return [out(z) for z in zones]


@router.post(
    "/v1/saved-zones",
    status_code=201,
    summary="Save a zone",
    description="Checks the outline, measures its area and finds its department, then keeps it in your library.",
    responses=problems(401, 403, 409, 413, 422, 429),
)
def create_saved_zone(zone: SavedZoneIn, caller: CallerDep, services: ServicesDep) -> SavedZoneOut:
    return out(keep(services, caller.account.id, [prepare(services, caller, zone)])[0])


@router.post(
    "/v1/saved-zones/import",
    status_code=201,
    summary="Save several zones",
    description="Saves every zone, or none when one of them is not valid.",
    responses=problems(401, 403, 409, 413, 422, 429),
)
def import_saved_zones(batch: SavedZonesImport, caller: CallerDep, services: ServicesDep) -> list[SavedZoneOut]:
    limit = services.limits.zones_per_import
    if len(batch.zones) > limit:
        raise HTTPException(413, f"An import holds at most {limit} zones.")
    prepared = [prepare(services, caller, z, f"Zone {i + 1} ({z.name}): ") for i, z in enumerate(batch.zones)]
    return [out(zone) for zone in keep(services, caller.account.id, prepared)]


@router.get(
    "/v1/saved-zones/features",
    summary="Your saved zones as GeoJSON",
    response_model_exclude_none=True,
    responses=problems(401, 403, 429),
)
def get_saved_zone_features(caller: CallerDep, services: ServicesDep) -> SavedZoneFeatures:
    zones = services.saved_zones.owned_by(caller.account.id)

    def outline(zone: SavedZone) -> bytes | None:
        return services.geometries.get(zone.id, zone.version)

    with ThreadPoolExecutor(max_workers=16) as pool:
        contents = list(pool.map(outline, zones))
    features: list[SavedZoneFeature] = []
    for zone, content in zip(zones, contents, strict=True):
        # A zone deleted meanwhile has no outline left: it is skipped.
        if content is not None:
            geometry: dict[str, Any] = json.loads(content)
            features.append(
                SavedZoneFeature.model_validate({"id": zone.id, "properties": out(zone), "geometry": geometry})
            )
    return SavedZoneFeatures(features=features)


@router.get("/v1/saved-zones/{zone_id}", summary="One of your saved zones", responses=problems(401, 403, 404, 422, 429))
def get_saved_zone(zone_id: ZoneId, caller: CallerDep, services: ServicesDep) -> SavedZoneOut:
    return out(owned(services, caller.account.id, zone_id))


@router.get(
    "/v1/saved-zones/{zone_id}/geometry",
    summary="The outline of a saved zone",
    responses=problems(401, 403, 404, 422, 429),
)
def get_saved_zone_geometry(zone_id: ZoneId, caller: CallerDep, services: ServicesDep) -> Geometry:
    zone = owned(services, caller.account.id, zone_id)
    content = services.geometries.get(zone.id, zone.version)
    if content is None:
        raise HTTPException(404, "The zone's outline is missing.")
    return json.loads(content)


@router.patch("/v1/saved-zones/{zone_id}", summary="Rename a saved zone", responses=problems(401, 403, 404, 422, 429))
def rename_saved_zone(
    zone_id: ZoneId, rename: SavedZoneRename, caller: CallerDep, services: ServicesDep
) -> SavedZoneOut:
    owned(services, caller.account.id, zone_id)
    zone = services.saved_zones.update(str(zone_id), name=rename.name, updated_at=datetime.now(UTC))
    if zone is None:
        raise HTTPException(404, "There is no such zone in your library.")
    return out(zone)


@router.delete(
    "/v1/saved-zones/{zone_id}",
    status_code=204,
    summary="Delete a saved zone",
    description="Deletes the zone and every version of its outline, and takes it out of every project.",
    responses=problems(401, 403, 404, 422, 429),
)
def delete_saved_zone(zone_id: ZoneId, caller: CallerDep, services: ServicesDep) -> Response:
    zone = owned(services, caller.account.id, zone_id)
    # The record goes first: an outline left behind by a failure is unreachable, a record without one is not.
    # References go last: a project left holding one shows the zone as deleted.
    services.saved_zones.delete(zone.id)
    services.geometries.delete_all(zone.id)
    held = services.projects.remove_everywhere(saved_item(zone.id))
    note(services, held, caller, Action.ZONE_REMOVED, saved_item(zone.id), zone.name)
    return Response(status_code=204)


@router.put(
    "/v1/saved-zones/{zone_id}/geometry",
    summary="Change a saved zone's outline",
    description="Keeps the outline as a new version: every earlier version stays, and can be restored.",
    responses=problems(401, 403, 404, 409, 413, 422, 429),
)
def change_saved_zone_geometry(
    zone_id: ZoneId, change: OutlineChange, caller: CallerDep, services: ServicesDep
) -> SavedZoneOut:
    zone = owned(services, caller.account.id, zone_id)
    return out(change_outline(services, zone, change.geometry.model_dump(), caller))


def versions_of(zone: SavedZone) -> list[OutlineVersion]:
    # Zones saved before versions were recorded have only their first one.
    return list(zone.history) or [OutlineVersion(1, zone.created_at, zone.owner, "", zone.area_ha)]


@router.get(
    "/v1/saved-zones/{zone_id}/versions",
    summary="The versions of a saved zone's outline",
    description="Newest first. Members of its projects may have made them; only you can restore one.",
    responses=problems(401, 403, 404, 422, 429),
)
def list_saved_zone_versions(zone_id: ZoneId, caller: CallerDep, services: ServicesDep) -> list[OutlineVersionOut]:
    zone = owned(services, caller.account.id, zone_id)
    return [
        OutlineVersionOut(
            version=v.version,
            created_at=v.at,
            by_name=v.by_name,
            area_ha=v.area_ha,
            restored_from=v.restored_from,
            current=v.version == zone.version,
        )
        for v in reversed(versions_of(zone))
    ]


@router.post(
    "/v1/saved-zones/{zone_id}/versions/{version}/restore",
    summary="Restore an earlier outline",
    description="Brings the version back as a new one, so the history keeps every step.",
    responses=problems(401, 403, 404, 409, 422, 429),
)
def restore_saved_zone_version(
    zone_id: ZoneId,
    version: Annotated[int, PathParam(ge=1, description="The version to bring back.")],
    caller: CallerDep,
    services: ServicesDep,
) -> SavedZoneOut:
    zone = owned(services, caller.account.id, zone_id)
    if version == zone.version:
        raise HTTPException(409, "That version is the current one.")
    content = services.geometries.get(zone.id, version) if version < zone.version else None
    if content is None:
        raise HTTPException(404, "The zone has no such version.")
    return out(change_outline(services, zone, json.loads(content), caller, restored_from=version))
