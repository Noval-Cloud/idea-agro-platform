from fastapi import APIRouter, Response

from idea_agro_api import public_data
from idea_agro_api.deps import ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import Catalog, ZoneIndexEntry
from idea_agro_api.routes.stored import documented, stored

router = APIRouter(tags=["Catalog"])


@router.get(
    "/v1/catalog",
    summary="What data exists",
    description=(
        "The indicators with their years and ranges, the seasonal calendars, the divisions, the departments with "
        "rural parcels, and the frame of the map images. Cacheable for an hour."
    ),
    response_class=Response,
    responses=documented(Catalog, "The catalog.") | problems(404),
)
def get_catalog(services: ServicesDep) -> Response:
    return stored(services, public_data.CATALOG, "application/json", "The catalog is not published yet.")


@router.get(
    "/v1/zones/index",
    summary="Every zone and department, to search them",
    description="Each zone of the predefined divisions and each department, with a label and its extent.",
    response_class=Response,
    responses=documented(list[ZoneIndexEntry], "The index.") | problems(404),
)
def get_zone_index(services: ServicesDep) -> Response:
    return stored(services, public_data.ZONE_INDEX, "application/json", "The zone index is not published yet.")
