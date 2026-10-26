"""Starts computing saved zones' series when an outline changes, through a job the rest of the code never names."""

import logging
from typing import Protocol

import google.auth
from google.auth.transport.requests import AuthorizedSession

log = logging.getLogger(__name__)


class ZoneJobs(Protocol):
    def compute(self) -> None:
        """Asks for the saved zones' series to be computed. Never raises: the nightly run catches up."""
        ...


class NoZoneJobs:
    """For local runs and tests: nothing is started."""

    def compute(self) -> None:
        return None


class MemoryZoneJobs:
    """For tests: counts what would have been started."""

    def __init__(self) -> None:
        self.started = 0

    def compute(self) -> None:
        self.started += 1


class CloudRunZoneJobs:
    """Runs the data job with only its `saved` task."""

    def __init__(self, job: str) -> None:
        self._url = f"https://run.googleapis.com/v2/{job}:run"
        # google-auth is only partly typed; this class is its only user here.
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        self._session = AuthorizedSession(credentials)  # pyright: ignore[reportUnknownArgumentType]

    def compute(self) -> None:
        try:
            response = self._session.post(  # pyright: ignore[reportUnknownMemberType]
                self._url, json={"overrides": {"containerOverrides": [{"args": ["saved"]}]}}, timeout=10
            )
            response.raise_for_status()
        except Exception:
            log.warning("The saved zones' series could not be started", exc_info=True)


def zone_jobs_from(source: str) -> ZoneJobs:
    """`run://projects/<project>/locations/<region>/jobs/<job>`, or `none`."""
    if source.startswith("run://projects/"):
        return CloudRunZoneJobs(source.removeprefix("run://"))
    if source == "none":
        return NoZoneJobs()
    raise ValueError(f"Unknown zone job: {source}")
