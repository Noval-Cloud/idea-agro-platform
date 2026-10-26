"""The FastAPI application: its documentation, middleware, error format and routes."""

from typing import Any

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.openapi.utils import get_openapi
from starlette.exceptions import HTTPException

from idea_agro_api.errors import http_problem, server_problems, validation_problem
from idea_agro_api.routes import admin, catalog, maps, me, padrones, projects, saved_zones, service, zones
from idea_agro_api.security import BodyLimit, security_headers
from idea_agro_api.services import Services

# The version of the contract, not of the code: see "Versions" in the description.
API_VERSION = "1.10.0"

DESCRIPTION = """
Environmental and productive indicators of Uruguay's agricultural land, measured from satellite imagery
and backed by research from INIA, Udelar and the University of Buenos Aires.

The API is public: any site or app may call it. Its data needs no key; only the routes about your own
account, zones and projects ask you to sign in.

## Signing in

Private routes take a token from the sign-in provider in the `Authorization` header, as `Bearer <token>`.
Tokens last an hour and are renewed by the provider's client. After "log out everywhere", tokens issued
before it are refused.

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
    {"name": "Catalog", "description": "What data exists: indicators, divisions, parcels and the frame of the maps."},
    {"name": "Zones", "description": "The predefined divisions and their zones, with their outlines and values."},
    {"name": "Maps", "description": "Each indicator's map images, by period."},
    {"name": "Parcels", "description": "The rural parcels (padrones) of each department."},
    {"name": "Account", "description": "Your own account. Requires signing in."},
    {"name": "Saved zones", "description": "The zones you keep in your library. Requires signing in."},
    {"name": "Projects", "description": "Your groups of zones, from any source. Requires signing in."},
    {"name": "Admin", "description": "Accounts, their roles and access, and what admins did. For admins."},
    {"name": "Service", "description": "The state of the service itself."},
]


def create_app(services: Services) -> FastAPI:
    app = FastAPI(
        title="IDEA-Agro API",
        version=API_VERSION,
        description=DESCRIPTION,
        license_info={"name": "MIT", "identifier": "MIT"},
        openapi_tags=TAGS,
        # Stable operation ids, so generated clients keep their names: the route's function name.
        generate_unique_id_function=lambda route: route.name,
    )
    app.state.services = services
    # Innermost of all: the route reads the body straight from it, so its 413 is not wrapped by other layers.
    app.add_middleware(BodyLimit, limit_for=services.limits.body_bytes)
    # Next, so the problem response still gets CORS and security headers.
    app.middleware("http")(server_problems)
    # Public: any site or app may call it. Tokens travel in a header, never in cookies.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["*"],
    )
    app.middleware("http")(security_headers)
    # Geometries and indexes are megabytes of text; Cloud Run does not compress by itself.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_exception_handler(HTTPException, http_problem)
    app.add_exception_handler(RequestValidationError, validation_problem)
    for module in (service, catalog, zones, maps, padrones, me, saved_zones, projects, admin):
        app.include_router(module.router)

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


def create_app_from_env() -> FastAPI:
    """The app served in production, configured by environment variables (see `Services.from_env`)."""
    return create_app(Services.from_env())
