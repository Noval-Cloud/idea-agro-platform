import json
from dataclasses import replace
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.deps import CallerDep, ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import (
    Geometry,
    SavedZoneFeature,
    SavedZoneFeatures,
    SavedZoneIn,
    SavedZoneOut,
    SavedZoneRename,
    SavedZonesImport,
)
from idea_agro_api.saved_zones import SavedZone, Source, new_zone_id
from idea_agro_api.services import Services
from idea_agro_api.shapes import InvalidShape, outline_from

router = APIRouter(tags=["Saved zones"])

ZoneId = Annotated[UUID, PathParam(description="The zone's id.")]


def body_within(limit: str):
    """Refuses a body larger than the limit named, before reading it."""

    def check(request: Request, services: ServicesDep) -> None:
        size = int(request.headers.get("content-length") or 0)
        if size > getattr(services.limits, limit):
            raise HTTPException(413, f"The request is larger than {getattr(services.limits, limit)} bytes.")

    return Depends(check)


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


def store(services: Services, owner: str, zone_in: SavedZoneIn) -> SavedZone:
    try:
        outline = outline_from(zone_in.geometry.model_dump(), services.limits.coverage)
    except InvalidShape as error:
        raise HTTPException(422, str(error)) from error
    content = json.dumps(outline.geometry, separators=(",", ":")).encode()
    if len(content) > services.limits.geometry_bytes:
        raise HTTPException(413, f"The outline is larger than {services.limits.geometry_bytes} bytes.")
    now = datetime.now(UTC)
    zone = SavedZone(
        id=new_zone_id(),
        owner=owner,
        name=zone_in.name.strip(),
        source=Source(zone_in.source),
        version=1,
        area_ha=outline.area_ha,
        bbox=outline.bbox,
        department=services.departments.of(outline.point),
        created_at=now,
        updated_at=now,
    )
    services.geometries.put(zone.id, zone.version, content)
    services.saved_zones.save(zone)
    return zone


def room_for(services: Services, owner: str, adding: int) -> None:
    limit = services.limits.saved_zones_per_account
    if len(services.saved_zones.owned_by(owner)) + adding > limit:
        raise HTTPException(409, f"A library holds at most {limit} zones.")


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
    dependencies=[body_within("geometry_bytes")],
)
def create_saved_zone(zone: SavedZoneIn, caller: CallerDep, services: ServicesDep) -> SavedZoneOut:
    room_for(services, caller.account.id, 1)
    return out(store(services, caller.account.id, zone))


@router.post(
    "/v1/saved-zones/import",
    status_code=201,
    summary="Save several zones",
    description="Saves every zone, or none when one of them is not valid.",
    responses=problems(401, 403, 409, 413, 422, 429),
    dependencies=[body_within("import_bytes")],
)
def import_saved_zones(batch: SavedZonesImport, caller: CallerDep, services: ServicesDep) -> list[SavedZoneOut]:
    limit = services.limits.zones_per_import
    if len(batch.zones) > limit:
        raise HTTPException(413, f"An import holds at most {limit} zones.")
    room_for(services, caller.account.id, len(batch.zones))
    for index, zone in enumerate(batch.zones):
        try:
            outline_from(zone.geometry.model_dump(), services.limits.coverage)
        except InvalidShape as error:
            raise HTTPException(422, f"Zone {index + 1} ({zone.name}): {error}") from error
    return [out(store(services, caller.account.id, z)) for z in batch.zones]


@router.get(
    "/v1/saved-zones/features",
    summary="Your saved zones as GeoJSON",
    response_model_exclude_none=True,
    responses=problems(401, 403, 429),
)
def get_saved_zone_features(caller: CallerDep, services: ServicesDep) -> SavedZoneFeatures:
    features: list[SavedZoneFeature] = []
    for zone in services.saved_zones.owned_by(caller.account.id):
        content = services.geometries.get(zone.id, zone.version)
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
    zone = replace(owned(services, caller.account.id, zone_id), name=rename.name.strip(), updated_at=datetime.now(UTC))
    services.saved_zones.save(zone)
    return out(zone)


@router.delete(
    "/v1/saved-zones/{zone_id}",
    status_code=204,
    summary="Delete a saved zone",
    description="Deletes the zone and every version of its outline.",
    responses=problems(401, 403, 404, 422, 429),
)
def delete_saved_zone(zone_id: ZoneId, caller: CallerDep, services: ServicesDep) -> Response:
    zone = owned(services, caller.account.id, zone_id)
    services.geometries.delete_all(zone.id)
    services.saved_zones.delete(zone.id)
    return Response(status_code=204)
