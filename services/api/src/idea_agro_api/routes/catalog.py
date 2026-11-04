import json
from typing import Any, cast

from fastapi import APIRouter, Response
from starlette.exceptions import HTTPException

from idea_agro_api import public_data
from idea_agro_api.deps import ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import Catalog, ZoneIndexEntry
from idea_agro_api.routes.stored import LIST_SECONDS, documented, stored

router = APIRouter(tags=["Catalog"])


@router.get(
    "/v1/catalog",
    summary="What data exists",
    description=(
        "The indicators with their years and ranges, the seasonal calendars, the divisions, the departments with "
        "rural parcels, and the frame of the map images. An indicator editors hide while its data is reviewed is "
        "marked `unavailable`. Cacheable for an hour, or a minute while an indicator is hidden."
    ),
    response_class=Response,
    responses=documented(Catalog, "The catalog.") | problems(404),
)
def get_catalog(services: ServicesDep) -> Response:
    missing = "The catalog is not published yet."
    hidden = services.visibility.hidden()
    if not hidden:
        return stored(services, public_data.CATALOG, "application/json", missing)
    content = services.public_data.read(public_data.CATALOG)
    if content is None:
        raise HTTPException(404, missing)
    catalog = cast(dict[str, Any], json.loads(content))
    for indicator, info in cast(dict[str, dict[str, Any]], catalog.get("indicators", {})).items():
        if indicator in hidden:
            info["unavailable"] = True
    return Response(
        json.dumps(catalog, separators=(",", ":")),
        media_type="application/json",
        headers={"Cache-Control": f"public, max-age={LIST_SECONDS}"},
    )


@router.get(
    "/v1/zones/index",
    summary="Every zone and department, to search them",
    description="Each zone of the predefined divisions and each department, with a label and its extent.",
    response_class=Response,
    responses=documented(list[ZoneIndexEntry], "The index.") | problems(404),
)
def get_zone_index(services: ServicesDep) -> Response:
    return stored(services, public_data.ZONE_INDEX, "application/json", "The zone index is not published yet.")
