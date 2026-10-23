"""Protections every response gets, and the request limit of private routes."""

import time
from collections.abc import Awaitable, Callable
from threading import Lock

from fastapi import Request, Response

# The interactive documentation loads its own scripts and styles.
DOCS_PATHS = ("/docs", "/redoc")

HEADERS = {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}
API_CSP = "default-src 'none'; frame-ancestors 'none'"


async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    response = await call_next(request)
    response.headers.update(HEADERS)
    if not request.url.path.startswith(DOCS_PATHS):
        response.headers["Content-Security-Policy"] = API_CSP
    return response


def client_key(request: Request) -> str:
    """The caller's address: the last entry of X-Forwarded-For, which Google's front end appends.

    Earlier entries come from the caller and can say anything.
    """
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    return forwarded[-1] if forwarded else (request.client.host if request.client else "unknown")


class RateLimit:
    """At most `per_minute` requests per client in each minute. Per instance: a soft limit."""

    def __init__(self, per_minute: int) -> None:
        self._per_minute = per_minute
        self._window = 0
        self._counts: dict[str, int] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        window = int(time.time() // 60)
        with self._lock:
            if window != self._window:
                self._window, self._counts = window, {}
            self._counts[key] = self._counts.get(key, 0) + 1
            return self._counts[key] <= self._per_minute

    def seconds_to_reset(self) -> int:
        return 60 - int(time.time() % 60)
