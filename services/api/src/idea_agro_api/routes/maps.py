from typing import Annotated

from fastapi import APIRouter, Query, Response
from fastapi import Path as PathParam

from idea_agro_api import public_data
from idea_agro_api.deps import ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.public_data import Indicator, MapSize, Theme
from idea_agro_api.routes.stored import IMAGE_SECONDS, stored

router = APIRouter(tags=["Maps"])

IndicatorParam = Annotated[Indicator, PathParam(description="The indicator.")]
IMAGE: dict[int | str, dict[str, object]] = {200: {"description": "A WebP image.", "content": {"image/webp": {}}}}


@router.get(
    "/v1/maps/{indicator}/thumbnail",
    summary="A small picture of an indicator's map",
    response_class=Response,
    responses=IMAGE | problems(404, 422),
)
def get_map_thumbnail(
    indicator: IndicatorParam,
    services: ServicesDep,
    theme: Annotated[Theme, Query(description="For a light or a dark page.")] = Theme.LIGHT,
) -> Response:
    name = public_data.thumbnail(indicator, theme)
    return stored(services, name, "image/webp", f"{indicator} has no thumbnail.", IMAGE_SECONDS)


@router.get(
    "/v1/maps/{indicator}/{period}",
    summary="An indicator's map of a period",
    description=(
        "A grayscale image of the indicator over the catalog's `bounds`, in Web Mercator: gray levels stand for "
        "values between the indicator's `min` and `max`, and transparency for no data. `full` is the catalog's "
        "`size`, `lite` its `lite_size`. Cacheable for a day."
    ),
    response_class=Response,
    responses=IMAGE | problems(404, 422),
)
def get_map(
    indicator: IndicatorParam,
    period: Annotated[
        str,
        PathParam(
            pattern=r"^([0-9]{4}|static)$",
            description="A year of the indicator, or `static` for one measured once.",
            examples=["2024"],
        ),
    ],
    services: ServicesDep,
    size: Annotated[MapSize, Query(description="Full or light.")] = MapSize.FULL,
) -> Response:
    name = public_data.map_image(indicator, period, size)
    return stored(services, name, "image/webp", f"{indicator} has no map for {period}.", IMAGE_SECONDS)
