"""The FastAPI application: its documentation, middleware, error format and routes."""

from typing import Any

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from starlette.exceptions import HTTPException

from idea_agro_api.errors import http_problem, server_problem, validation_problem
from idea_agro_api.routes import me, service, zones
from idea_agro_api.security import security_headers
from idea_agro_api.services import Services

# The version of the contract, not of the code: see "Versions" in the description.
API_VERSION = "1.1.0"

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
    {"name": "Zones", "description": "Indicator values of the predefined zones of each division."},
    {"name": "Account", "description": "Your own account. Requires signing in."},
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
    # Public: any site or app may call it. Tokens travel in a header, never in cookies.
    app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["*"]
    )
    app.middleware("http")(security_headers)
    app.add_exception_handler(HTTPException, http_problem)
    app.add_exception_handler(RequestValidationError, validation_problem)
    app.add_exception_handler(Exception, server_problem)
    for module in (service, zones, me):
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
