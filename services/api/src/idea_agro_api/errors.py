"""Every error as Problem Details (RFC 9457)."""

from collections.abc import Mapping
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from idea_agro_api.models import Problem

TITLES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    413: "Content Too Large",
    422: "Unprocessable Content",
    429: "Too Many Requests",
    503: "Service Unavailable",
}

DESCRIPTIONS = {
    401: "No valid token: sign in again.",
    403: "The account may not do this.",
    404: "It does not exist, or it is not yours to see.",
    409: "It conflicts with what already exists.",
    413: "It is larger than allowed.",
    422: "A parameter is not valid.",
    429: "Too many requests: wait the seconds in `Retry-After`.",
}


def problems(*statuses: int, **descriptions: str) -> dict[int | str, dict[str, Any]]:
    """The documented error responses of a route; `descriptions` override the defaults by status, as `s404=...`."""
    return {
        status: {"model": Problem, "description": descriptions.get(f"s{status}", DESCRIPTIONS[status])}
        for status in statuses
    }


def problem_response(
    status: int, request: Request, headers: Mapping[str, str] | None = None, **extra: Any
) -> JSONResponse:
    body = Problem(title=TITLES.get(status, "Error"), status=status, instance=request.url.path, **extra)
    return JSONResponse(
        jsonable_encoder(body, exclude_none=True),
        status_code=status,
        media_type="application/problem+json",
        headers=dict(headers) if headers else None,
    )


async def http_problem(request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, HTTPException)
    return problem_response(error.status_code, request, headers=error.headers, detail=str(error.detail))


async def validation_problem(request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    errors = [{key: value for key, value in e.items() if key in ("loc", "msg", "type")} for e in error.errors()]
    return problem_response(422, request, detail="A parameter is not valid.", errors=errors)
