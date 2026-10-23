"""The FastAPI application: routes, their documentation and the error format."""

import os
from typing import Annotated, Any

from fastapi import FastAPI, Request, Response
from fastapi import Path as PathParam
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.exceptions import HTTPException

from idea_agro_api.models import Health, Problem, SeasonalSeries, ZoneSeasonal
from idea_agro_api.zones import Division, SeasonalIndicator, ZoneStore, files_from

# The version of the contract, not of the code: see "Versions" in the description.
API_VERSION = "1.0.0"

DESCRIPTION = """
Environmental and productive indicators of Uruguay's agricultural land, measured from satellite imagery
and backed by research from INIA, Udelar and the University of Buenos Aires.

The API is public and read-only: any site or app may call it, with no key.

## Versions

- The major version is part of the path: `/v1/...`.
- Within a major version every change is backward compatible: new endpoints, new optional fields,
  new values in a response. Clients ignore the fields they do not know.
- A breaking change ships as a new major version, such as `/v2/...`. The previous one keeps answering
  through a deprecation period, announced in the `Deprecation` and `Sunset` response headers.
- `info.version` of this document follows semantic versioning.

## Errors

Every error is a Problem Details object (RFC 9457), served as `application/problem+json`.
"""

TAGS = [
    {"name": "Zones", "description": "Indicator values of the predefined zones of each division."},
    {"name": "Service", "description": "The state of the service itself."},
]

# Unit and cadence of each seasonal series, as the satellite products deliver them.
SEASONAL_UNITS: dict[SeasonalIndicator, tuple[str, int]] = {
    SeasonalIndicator.PPNA: ("kg DM/ha per 16 days", 16),
    SeasonalIndicator.APAR: ("MJ/m² per 16 days", 16),
    SeasonalIndicator.ET: ("mm per day", 8),
}

CACHE_CONTROL = "public, max-age=3600"


def problems(*statuses: int) -> dict[int | str, dict[str, Any]]:
    descriptions = {404: "The zone does not exist in that division.", 422: "A parameter is not valid."}
    return {status: {"model": Problem, "description": descriptions[status]} for status in statuses}


def problem_response(status: int, title: str, request: Request, **extra: Any) -> JSONResponse:
    body = Problem(title=title, status=status, instance=request.url.path, **extra)
    return JSONResponse(
        jsonable_encoder(body, exclude_none=True), status_code=status, media_type="application/problem+json"
    )


def create_app(store: ZoneStore) -> FastAPI:
    app = FastAPI(
        title="IDEA-Agro API",
        version=API_VERSION,
        description=DESCRIPTION,
        license_info={"name": "MIT", "identifier": "MIT"},
        openapi_tags=TAGS,
        # Stable operation ids, so generated clients keep their names: the route's function name.
        generate_unique_id_function=lambda route: route.name,
    )
    # Public: any site or app may call it, and it uses no cookies.
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

    @app.exception_handler(HTTPException)
    async def http_problem(request: Request, error: HTTPException) -> JSONResponse:
        return problem_response(error.status_code, title_of(error.status_code), request, detail=str(error.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_problem(request: Request, error: RequestValidationError) -> JSONResponse:
        errors = [{key: value for key, value in e.items() if key in ("loc", "msg", "type")} for e in error.errors()]
        return problem_response(
            422, "Unprocessable Content", request, detail="A parameter is not valid.", errors=errors
        )

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/docs")

    @app.get("/health", tags=["Service"], summary="Whether the service answers")
    def get_health() -> Health:
        return Health(status="ok")

    @app.get(
        "/v1/zones/{division}/{zone}/seasonal",
        tags=["Zones"],
        summary="Seasonal series of a zone",
        description=(
            "Every composite of the satellite record for the zone, for each indicator with a seasonal series: "
            "productivity (`ppna`), absorbed radiation (`apar`) and evapotranspiration (`et`). "
            "The response can be cached for an hour."
        ),
        response_model_exclude_none=True,
        responses=problems(404, 422),
    )
    def get_zone_seasonal(
        division: Annotated[Division, PathParam(description="The division the zone belongs to.")],
        zone: Annotated[
            str,
            PathParam(pattern=r"^[0-9]{1,8}$", description="The zone's id within its division.", examples=["1806"]),
        ],
        response: Response,
    ) -> ZoneSeasonal:
        found = store.seasonal(division, zone)
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

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is None:
            document = get_openapi(
                title=app.title,
                version=app.version,
                description=app.description,
                routes=app.routes,
                tags=app.openapi_tags,
                license_info=app.license_info,
            )
            for operation in (op for path in document["paths"].values() for op in path.values()):
                for status, answer in operation.get("responses", {}).items():
                    if int(status) >= 400 and "application/json" in answer.get("content", {}):
                        answer["content"] = {"application/problem+json": answer["content"]["application/json"]}
            app.openapi_schema = document
        return app.openapi_schema

    app.openapi = openapi
    return app


def title_of(status: int) -> str:
    return {404: "Not Found", 405: "Method Not Allowed"}.get(status, "Error")


def create_app_from_env() -> FastAPI:
    """The app served in production: `ZONES_SOURCE` is `gs://<bucket>` or a local folder."""
    return create_app(ZoneStore(files_from(os.environ["ZONES_SOURCE"])))
