"""Prints the API's OpenAPI document: `python -m idea_agro_api.openapi > services/api/openapi.json`."""

import json
import sys
from pathlib import Path

from idea_agro_api.app import create_app
from idea_agro_api.series import ZoneStore
from idea_agro_api.services import services_for_tests
from idea_agro_api.zones import LocalFiles


def document() -> str:
    # The document depends on the routes only, never on the data.
    app = create_app(services_for_tests(ZoneStore(LocalFiles(Path("/nonexistent")))))
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    sys.stdout.write(document())
