import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.geometries import MemoryGeometries
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
        "properties": {"department": "Tacuarembó"},
        "geometry": {"type": "Polygon", "coordinates": [DISTRICT]},
    }
    (tmp_path / "divisions").mkdir()
    (tmp_path / "divisions" / "seccionales.geojson").write_text(
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


def test_a_zone_too_small_to_measure_is_refused(client: TestClient) -> None:
    response = client.post("/v1/saved-zones", json=zone(geometry=square(side=0.0000001)), headers=ANA)

    assert response.status_code == 422
    assert client.get("/v1/saved-zones/features", headers=ANA).json()["features"] == []


@pytest.mark.parametrize(
    "ring",
    [
        [[-56, -32], [-55.99, -32], [-55.99, 200], [-56, -32]],
        [[-56, -32], [1000, -32], [1000, -31], [-56, -32]],
    ],
    ids=["latitude", "longitude"],
)
def test_coordinates_must_be_degrees(client: TestClient, ring: list[list[float]]) -> None:
    response = client.post(
        "/v1/saved-zones", json=zone(geometry={"type": "Polygon", "coordinates": [ring]}), headers=ANA
    )
    assert response.status_code == 422


def test_holes_are_subtracted_whatever_their_winding(client: TestClient) -> None:
    outer = square()["coordinates"][0]
    # Wound the same way as the outer ring, as some tools write it.
    hole = square(-55.998, -31.998, 0.006)["coordinates"][0]

    saved = client.post(
        "/v1/saved-zones", json=zone(geometry={"type": "Polygon", "coordinates": [outer, hole]}), headers=ANA
    )

    assert 60 < saved.json()["area_ha"] < 70


def test_a_name_of_spaces_is_refused(client: TestClient) -> None:
    assert client.post("/v1/saved-zones", json=zone(name="   "), headers=ANA).status_code == 422


def test_an_import_with_an_outline_too_large_saves_nothing(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = client_with(tmp_path, verifier, geometry_bytes=2_000, import_bytes=50_000)
    many = [[-56 + i / 10_000, -32] for i in range(200)] + [[-56, -31.99], [-56, -32]]
    large = zone("Grande", {"type": "Polygon", "coordinates": [many]})

    response = client.post("/v1/saved-zones/import", json={"zones": [zone("Chica"), large]}, headers=ANA)

    assert response.status_code == 413
    assert client.get("/v1/saved-zones", headers=ANA).json() == []


def test_a_body_is_measured_as_it_arrives(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = client_with(tmp_path, verifier, import_bytes=5_000)
    body = json.dumps({"zones": [zone(f"Z{i}") for i in range(40)]}).encode()

    def chunks() -> Iterator[bytes]:
        yield from (body[i : i + 1_000] for i in range(0, len(body), 1_000))

    chunked = client.post(
        "/v1/saved-zones/import", content=chunks(), headers=ANA | {"Content-Type": "application/json"}
    )
    unsigned = client.post("/v1/saved-zones/import", content=body, headers={"Content-Type": "application/json"})

    assert chunked.status_code == 413
    assert unsigned.status_code == 413
    assert client.get("/v1/saved-zones", headers=ANA).json() == []


def test_a_library_has_a_total_size(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = client_with(tmp_path, verifier, library_bytes=200)

    assert client.post("/v1/saved-zones", json=zone(), headers=ANA).status_code == 201
    assert client.post("/v1/saved-zones", json=zone(), headers=ANA).status_code == 409


class FailingGeometries(MemoryGeometries):
    """Fails on the second outline written."""

    def put(self, name: str, content: bytes) -> None:
        if self._files:
            raise ConnectionError("storage down")
        super().put(name, content)


def test_a_failed_import_leaves_nothing_behind(tmp_path: Path, verifier: OidcVerifier) -> None:
    (tmp_path / "divisions").mkdir()
    geometries = FailingGeometries()
    services = services_for_tests(files=LocalFiles(tmp_path), verifier=verifier, geometries=geometries)
    client = TestClient(create_app(services), raise_server_exceptions=False)

    response = client.post("/v1/saved-zones/import", json={"zones": [zone("A"), zone("B")]}, headers=ANA)

    assert response.status_code == 500
    assert client.get("/v1/saved-zones", headers=ANA).json() == []
    assert geometries._files == {}  # pyright: ignore[reportPrivateUsage]
