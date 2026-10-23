from typing import Annotated

from fastapi import APIRouter, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.deps import ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import SeasonalSeries, ZoneSeasonal
from idea_agro_api.zones import Division, SeasonalIndicator

router = APIRouter(tags=["Zones"])

# Unit and cadence of each seasonal series, as the satellite products deliver them.
SEASONAL_UNITS: dict[SeasonalIndicator, tuple[str, int]] = {
    SeasonalIndicator.PPNA: ("kg DM/ha per 16 days", 16),
    SeasonalIndicator.APAR: ("MJ/m² per 16 days", 16),
    SeasonalIndicator.ET: ("mm per day", 8),
}

CACHE_CONTROL = "public, max-age=3600"


@router.get(
    "/v1/zones/{division}/{zone}/seasonal",
    summary="Seasonal series of a zone",
    description=(
        "Every composite of the satellite record for the zone, for each indicator with a seasonal series: "
        "productivity (`ppna`), absorbed radiation (`apar`) and evapotranspiration (`et`). "
        "The response can be cached for an hour."
    ),
    response_model_exclude_none=True,
    responses=problems(404, 422, s404="The zone does not exist in that division."),
)
def get_zone_seasonal(
    division: Annotated[Division, PathParam(description="The division the zone belongs to.")],
    zone: Annotated[
        str,
        PathParam(pattern=r"^[0-9]{1,8}$", description="The zone's id within its division.", examples=["1806"]),
    ],
    response: Response,
    services: ServicesDep,
) -> ZoneSeasonal:
    found = services.zones.seasonal(division, zone)
    if found is None:
        raise HTTPException(404, f"Zone {zone} does not exist in {division}.")
    response.headers["Cache-Control"] = CACHE_CONTROL
    series = {
        indicator.value: SeasonalSeries(
            unit=SEASONAL_UNITS[indicator][0], cadence_days=SEASONAL_UNITS[indicator][1], dates=dates, values=values
        )
        for indicator, (dates, values) in found.items()
    }
    return ZoneSeasonal(division=division, zone=zone, **series)
