"""Earth Engine's client with its algorithms but no server: graphs build and serialize, and nothing is computed."""

from collections.abc import Callable, Generator
from contextlib import contextmanager
from typing import Any

import ee
import ee.data as ee_data
import google.auth
import pytest
from ee.apitestcase import ApiTestCase
from idea_agro_jobs import earth
from idea_agro_jobs.earth import EarthEngine


@contextmanager
def offline() -> Generator[None]:
    case = ApiTestCase()
    case.setUp()
    try:
        yield
    finally:
        case.tearDown()


@contextmanager
def offline_earth(**server: Callable[..., Any]) -> Generator[EarthEngine]:
    """An `EarthEngine` on the offline client, with these `ee.data` functions answering for the server, tried once."""

    def credentials(scopes: list[str]) -> tuple[None, None]:
        return None, None

    def initialize(*args: object, **kwargs: object) -> None:
        pass

    # Undone before the offline client is, which restores what it replaced.
    with offline(), pytest.MonkeyPatch.context() as patch:
        patch.setattr(google.auth, "default", credentials)
        patch.setattr(ee, "Initialize", initialize)
        patch.setattr(earth, "ATTEMPTS", 1)
        for name, function in server.items():
            patch.setattr(ee_data, name, function)
        yield EarthEngine("project")
