from typing import Annotated

from fastapi import APIRouter, Response
from fastapi import Path as PathParam

from idea_agro_api import public_data
from idea_agro_api.deps import ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import PadronCollection, PadronIndex
from idea_agro_api.routes.stored import documented, stored
from idea_agro_api.zones import Department

router = APIRouter(tags=["Parcels"])


@router.get(
    "/v1/padrones",
    summary="The parcel numbers of each department",
    response_class=Response,
    responses=documented(PadronIndex, "The parcel numbers of each department, sorted.") | problems(404),
)
def get_padron_index(services: ServicesDep) -> Response:
    return stored(services, public_data.PADRON_INDEX, "application/json", "The parcel index is not published yet.")


@router.get(
    "/v1/padrones/{department}",
    summary="A department's rural parcels",
    description="Their outlines as GeoJSON, with each parcel's number and area. Cacheable for an hour.",
    response_class=Response,
    responses=documented(PadronCollection, "The parcels.", "application/geo+json") | problems(404, 422),
)
def get_padrones(
    department: Annotated[Department, PathParam(description="The department.")], services: ServicesDep
) -> Response:
    return stored(
        services, public_data.padrones(department), "application/geo+json", f"{department} has no published parcels."
    )
