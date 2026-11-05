"""Earth Engine's client with its algorithms but no server: graphs build and serialize, and nothing is computed."""

from collections.abc import Generator
from contextlib import contextmanager

from ee.apitestcase import ApiTestCase


@contextmanager
def offline() -> Generator[None]:
    case = ApiTestCase()
    case.setUp()
    try:
        yield
    finally:
        case.tearDown()
