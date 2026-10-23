import json
from pathlib import Path
from typing import Any

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.services import Limits, services_for_tests
from idea_agro_api.zones import LocalFiles

# A police district covering the test zones, in Tacuarembó.
DISTRICT = [[-56.1, -32.1], [-55.9, -32.1], [-55.9, -31.9], [-56.1, -31.9], [-56.1, -32.1]]


def square(west: float = -56.0, south: float = -32.0, side: float = 0.01) -> dict[str, Any]:
    ring = [[west, south], [west + side, south], [west + side, south + side], [west, south + side], [west, south]]
    return {"type": "Polygon", "coordinates": [ring]}


def zone(name: str = "Potrero 3", geometry: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"name": name, "source": "drawn", "geometry": geometry or square()}


def client_with(tmp_path: Path, verifier: OidcVerifier, **limits: Any) -> TestClient:
    district = {
        "type": "Feature",
        "properties": {"dept": "Tacuarembó"},
        "geometry": {"type": "Polygon", "coordinates": [DISTRICT]},
    }
    (tmp_path / "zones").mkdir()
    (tmp_path / "zones" / "seccionales.json").write_text(
        json.dumps({"type": "FeatureCollection", "features": [district]})
    )
    services = services_for_tests(files=LocalFiles(tmp_path), verifier=verifier, limits=Limits(**limits))
    return TestClient(create_app(services))


@pytest.fixture
def client(tmp_path: Path, verifier: OidcVerifier) -> TestClient:
    return client_with(tmp_path, verifier)


ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))


def test_saving_a_zone_measures_it(client: TestClient) -> None:
    response = client.post("/v1/saved-zones", json=zone(), headers=ANA)

    assert response.status_code == 201
    saved = response.json()
    assert saved["name"] == "Potrero 3"
    assert saved["version"] == 1
    assert saved["department"] == "Tacuarembó"
    # 0.01° by 0.01° at 32° south is about 1.11 km by 0.94 km.
    assert 100 < saved["area_ha"] < 108
    assert saved["bbox"] == [-56.0, -32.0, -55.99, -31.99]
    geometry = client.get(f"/v1/saved-zones/{saved['id']}/geometry", headers=ANA).json()
    assert geometry["type"] == "Polygon"


def test_a_library_is_private(client: TestClient) -> None:
    saved = client.post("/v1/saved-zones", json=zone(), headers=ANA).json()

    assert [z["id"] for z in client.get("/v1/saved-zones", headers=ANA).json()] == [saved["id"]]
    assert client.get("/v1/saved-zones", headers=BO).json() == []
    assert client.get(f"/v1/saved-zones/{saved['id']}", headers=BO).status_code == 404
    assert client.get(f"/v1/saved-zones/{saved['id']}/geometry", headers=BO).status_code == 404
    assert client.delete(f"/v1/saved-zones/{saved['id']}", headers=BO).status_code == 404
    assert client.get("/v1/saved-zones").status_code == 401


@pytest.mark.parametrize(
    ("geometry", "detail"),
    [
        (
            {
                "type": "Polygon",
                "coordinates": [[[-56, -32], [-55.99, -31.99], [-55.99, -32], [-56, -31.99], [-56, -32]]],
            },
            "not valid",
        ),
        (square(west=10, south=10), "outside the area"),
    ],
    ids=["self-intersecting", "outside-uruguay"],
)
def test_an_outline_that_is_not_valid_is_refused(client: TestClient, geometry: dict[str, Any], detail: str) -> None:
    response = client.post("/v1/saved-zones", json=zone(geometry=geometry), headers=ANA)

    assert response.status_code == 422
    assert detail in response.json()["detail"]
    assert client.get("/v1/saved-zones", headers=ANA).json() == []


def test_only_polygons_are_accepted(client: TestClient) -> None:
    point = {"type": "Point", "coordinates": [-56, -32]}
    assert client.post("/v1/saved-zones", json=zone(geometry=point), headers=ANA).status_code == 422


def test_limits_are_kept(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = client_with(tmp_path, verifier, saved_zones_per_account=1, geometry_bytes=2_000)

    assert client.post("/v1/saved-zones", json=zone(), headers=ANA).status_code == 201
    assert client.post("/v1/saved-zones", json=zone(), headers=ANA).status_code == 409
    many = [[-56 + i / 10_000, -32] for i in range(200)] + [[-56, -31.99], [-56, -32]]
    assert (
        client.post(
            "/v1/saved-zones", json=zone(geometry={"type": "Polygon", "coordinates": [many]}), headers=BO
        ).status_code
        == 413
    )


def test_an_import_saves_every_zone_or_none(client: TestClient) -> None:
    good = [zone("A", square(-56.0)), zone("B", square(-56.05))]
    bad = [zone("A", square(-56.0)), zone("C", square(west=10, south=10))]

    refused = client.post("/v1/saved-zones/import", json={"zones": bad}, headers=ANA)
    saved = client.post("/v1/saved-zones/import", json={"zones": good}, headers=ANA)

    assert refused.status_code == 422
    assert "Zone 2 (C)" in refused.json()["detail"]
    assert saved.status_code == 201
    assert sorted(z["name"] for z in client.get("/v1/saved-zones", headers=ANA).json()) == ["A", "B"]


def test_renaming_and_deleting(client: TestClient) -> None:
    saved = client.post("/v1/saved-zones", json=zone(), headers=ANA).json()

    renamed = client.patch(f"/v1/saved-zones/{saved['id']}", json={"name": "  Monte  "}, headers=ANA)
    deleted = client.delete(f"/v1/saved-zones/{saved['id']}", headers=ANA)

    assert renamed.json()["name"] == "Monte"
    assert deleted.status_code == 204
    assert client.get(f"/v1/saved-zones/{saved['id']}", headers=ANA).status_code == 404


def test_the_library_as_geojson(client: TestClient) -> None:
    saved = client.post("/v1/saved-zones", json=zone(), headers=ANA).json()

    features = client.get("/v1/saved-zones/features", headers=ANA).json()

    assert features["type"] == "FeatureCollection"
    assert [f["id"] for f in features["features"]] == [saved["id"]]
    assert features["features"][0]["properties"]["name"] == "Potrero 3"
