from typing import Annotated

from fastapi import APIRouter, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api import public_data
from idea_agro_api.deps import ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import DivisionValues, SeasonalSeries, ZoneCollection, ZoneDetail, ZoneSeasonal
from idea_agro_api.public_data import Indicator
from idea_agro_api.routes.stored import documented, stored
from idea_agro_api.zones import Division, SeasonalIndicator

router = APIRouter(tags=["Zones"])

# Unit and cadence of each seasonal series, as the satellite products deliver them.
SEASONAL_UNITS: dict[SeasonalIndicator, tuple[str, int]] = {
    SeasonalIndicator.PPNA: ("kg DM/ha per 16 days", 16),
    SeasonalIndicator.APAR: ("MJ/m² per 16 days", 16),
    SeasonalIndicator.ET: ("mm per day", 8),
    SeasonalIndicator.RH: ("mm per 16 days", 16),
}

CACHE_CONTROL = "public, max-age=3600"

DivisionParam = Annotated[Division, PathParam(description="The division.")]
ZoneParam = Annotated[
    str, PathParam(pattern=r"^[0-9]{1,8}$", description="The zone's id within its division.", examples=["1806"])
]


@router.get(
    "/v1/divisions/{division}/zones",
    summary="A division's zones",
    description="Every zone of the division as GeoJSON, with outlines simplified for the map. Cacheable for an hour.",
    response_class=Response,
    responses=documented(ZoneCollection, "The zones.", "application/geo+json") | problems(404, 422),
)
def get_division_zones(division: DivisionParam, services: ServicesDep) -> Response:
    name = public_data.division_zones(division)
    return stored(services, name, "application/geo+json", f"{division} has no published zones.")


@router.get(
    "/v1/divisions/{division}/values/{indicator}",
    summary="An indicator's values in every zone of a division",
    description=(
        "For an indicator with years, each zone's yearly values; for one measured once, each zone's mean and "
        "quartiles; for a categorical one, each class's share of the zone. Cacheable for an hour."
    ),
    response_class=Response,
    responses=documented(DivisionValues, "The values, by zone id.") | problems(404, 422),
)
def get_division_values(
    division: DivisionParam,
    indicator: Annotated[Indicator, PathParam(description="The indicator.")],
    services: ServicesDep,
) -> Response:
    name = public_data.values(division, indicator)
    return stored(services, name, "application/json", f"{division} has no published values of {indicator}.")


@router.get(
    "/v1/zones/{division}/{zone}",
    summary="A zone and its outline",
    response_class=Response,
    responses=documented(ZoneDetail, "The zone.")
    | problems(404, 422, s404="The zone does not exist in that division."),
)
def get_zone(division: DivisionParam, zone: ZoneParam, services: ServicesDep) -> Response:
    name = public_data.zone(division, zone)
    return stored(services, name, "application/json", f"Zone {zone} does not exist in {division}.")


@router.get(
    "/v1/zones/{division}/{zone}/seasonal",
    summary="Seasonal series of a zone",
    description=(
        "Every composite of the satellite record for the zone, for each indicator with a seasonal series: "
        "productivity (`ppna`), absorbed radiation (`apar`), evapotranspiration (`et`) and water yield (`rh`). "
        "The response can be cached for an hour."
    ),
    response_model_exclude_none=True,
    responses=problems(404, 422, s404="The zone does not exist in that division."),
)
def get_zone_seasonal(
    division: DivisionParam,
    zone: ZoneParam,
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
