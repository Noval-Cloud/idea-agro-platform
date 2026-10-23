import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.public_data import CATALOG, PublicData
from idea_agro_api.services import services_for_tests
from idea_agro_api.zones import LocalFiles

FILES: dict[str, Any] = {
    "catalog.json": {"seasonal": {"ppna": ["2001-01-01"]}, "divisions": {"seccionales": 1}},
    "zone-index.json": [{"division": "seccionales", "id": "1406", "label": "Rocha, 6", "bbox": [-54, -34, -53, -33]}],
    "divisions/seccionales.geojson": {"type": "FeatureCollection", "features": []},
    "divisions/seccionales/1406.json": {"properties": {"id": "1406", "area_km2": 1649.9}},
    "values/seccionales/ppna.json": {"years": [2024], "values": {"1406": [5120.5]}},
    "padrones/index.json": {"rocha": [1, 2, 3]},
    "padrones/rocha.geojson": {"type": "FeatureCollection", "features": []},
}
IMAGES = ["maps/ppna/2024.webp", "maps/ppna/lite/2024.webp", "maps/thumbnails/ppna-dark.webp"]


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    for name, content in FILES.items():
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_text(json.dumps(content))
    for name in IMAGES:
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_bytes(f"webp:{name}".encode())
    return tmp_path


@pytest.fixture
def client(folder: Path) -> TestClient:
    return TestClient(create_app(services_for_tests(files=LocalFiles(folder))))


@pytest.mark.parametrize(
    ("path", "name", "media_type"),
    [
        ("/v1/catalog", "catalog.json", "application/json"),
        ("/v1/zones/index", "zone-index.json", "application/json"),
        ("/v1/divisions/seccionales/zones", "divisions/seccionales.geojson", "application/geo+json"),
        ("/v1/zones/seccionales/1406", "divisions/seccionales/1406.json", "application/json"),
        ("/v1/divisions/seccionales/values/ppna", "values/seccionales/ppna.json", "application/json"),
        ("/v1/padrones", "padrones/index.json", "application/json"),
        ("/v1/padrones/rocha", "padrones/rocha.geojson", "application/geo+json"),
    ],
)
def test_public_data_is_served_as_stored(client: TestClient, path: str, name: str, media_type: str) -> None:
    response = client.get(path)

    assert response.status_code == 200
    assert response.json() == FILES[name]
    assert response.headers["content-type"] == media_type
    assert response.headers["cache-control"] == "public, max-age=3600"


@pytest.mark.parametrize(
    ("path", "name"),
    [
        ("/v1/maps/ppna/2024", "maps/ppna/2024.webp"),
        ("/v1/maps/ppna/2024?size=lite", "maps/ppna/lite/2024.webp"),
        ("/v1/maps/ppna/thumbnail?theme=dark", "maps/thumbnails/ppna-dark.webp"),
    ],
)
def test_map_images_are_served_for_a_day(client: TestClient, path: str, name: str) -> None:
    response = client.get(path)

    assert response.content == f"webp:{name}".encode()
    assert response.headers["content-type"] == "image/webp"
    assert response.headers["cache-control"] == "public, max-age=86400"


@pytest.mark.parametrize(
    ("path", "status"),
    [
        ("/v1/zones/seccionales/9999", 404),
        ("/v1/divisions/cuencas-1/zones", 404),
        ("/v1/maps/ppna/1999", 404),
        ("/v1/maps/ppna/latest", 422),
        ("/v1/maps/nothing/2024", 422),
        ("/v1/padrones/atlantis", 422),
    ],
)
def test_what_is_not_published_is_a_problem(client: TestClient, path: str, status: int) -> None:
    response = client.get(path)

    assert response.status_code == status
    assert response.headers["content-type"] == "application/problem+json"


def test_small_files_are_kept_for_a_while(folder: Path) -> None:
    kept = PublicData(LocalFiles(folder), keep_seconds=300)
    fresh = PublicData(LocalFiles(folder), keep_seconds=0)
    before = kept.read(CATALOG)
    fresh.read(CATALOG)

    (folder / CATALOG).write_text("{}")

    assert kept.read(CATALOG) == before
    assert fresh.read(CATALOG) == b"{}"
