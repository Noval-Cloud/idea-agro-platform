import json
from pathlib import Path
from typing import Any

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.geometries import MemoryGeometries
from idea_agro_api.saved_series import series_file
from idea_agro_api.services import services_for_tests
from idea_agro_api.zone_jobs import MemoryZoneJobs
from idea_agro_api.zones import LocalFiles

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
DISTRICT = [[-56.1, -32.1], [-55.9, -32.1], [-55.9, -31.9], [-56.1, -31.9], [-56.1, -32.1]]
SQUARE = {"type": "Polygon", "coordinates": [[[-56.0, -32.0], [-55.99, -32.0], [-55.99, -31.99], [-56.0, -32.0]]]}
CALENDAR = {"ppna": ["2025-01-01", "2025-01-17"], "apar": ["2025-01-01", "2025-01-17"], "et": ["2025-01-01"]}


class Setup:
    def __init__(self, tmp_path: Path, verifier: OidcVerifier) -> None:
        district = {
            "type": "Feature",
            "properties": {"department": "Tacuarembó"},
            "geometry": {"type": "Polygon", "coordinates": [DISTRICT]},
        }
        (tmp_path / "divisions").mkdir()
        (tmp_path / "divisions" / "seccionales.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": [district]})
        )
        (tmp_path / "catalog.json").write_text(json.dumps({"seasonal": CALENDAR}))
        self.geometries = MemoryGeometries()
        self.jobs = MemoryZoneJobs()
        services = services_for_tests(
            files=LocalFiles(tmp_path), verifier=verifier, geometries=self.geometries, zone_jobs=self.jobs
        )
        self.client = TestClient(create_app(services))

    def save(self) -> dict[str, Any]:
        body = {"name": "Potrero", "source": "drawn", "geometry": SQUARE}
        return self.client.post("/v1/saved-zones", json=body, headers=ANA).json()

    def computed(self, zone: dict[str, Any], series: dict[str, dict[str, float | None]]) -> None:
        """What the data job writes next to the zone's current outline."""
        file = next(name for name in self.geometries._files if name.startswith(f"zones/{zone['id']}/"))  # pyright: ignore[reportPrivateUsage]
        self.geometries.put(series_file(file), json.dumps(series).encode())


@pytest.fixture
def setup(tmp_path: Path, verifier: OidcVerifier) -> Setup:
    return Setup(tmp_path, verifier)


def test_a_new_zone_starts_its_computing(setup: Setup) -> None:
    zone = setup.save()

    response = setup.client.get(f"/v1/saved-zones/{zone['id']}/seasonal", headers=ANA)

    assert setup.jobs.started == 1
    assert response.json() == {"computing": True}


def test_a_computed_zone_answers_on_the_catalogs_dates(setup: Setup) -> None:
    zone = setup.save()
    setup.computed(zone, {"ppna": {"2025-01-01": 120.5, "2024-12-16": 99.0}, "et": {"2025-01-01": 1.2}})

    found = setup.client.get(f"/v1/saved-zones/{zone['id']}/seasonal", headers=ANA).json()

    assert found["computing"] is False
    assert found["ppna"]["dates"] == ["2025-01-01", "2025-01-17"]
    # A composite the job has not reached yet is null, and one the catalog lacks is left out.
    assert found["ppna"]["values"] == [120.5, None]
    assert found["ppna"]["cadence_days"] == 16
    assert found["et"]["values"] == [1.2]
    assert "apar" not in found


def test_a_new_outline_is_computed_again(setup: Setup) -> None:
    zone = setup.save()
    setup.computed(zone, {"ppna": {"2025-01-01": 120.5}})

    changed = setup.client.put(
        f"/v1/saved-zones/{zone['id']}/geometry", json={"version": 1, "geometry": SQUARE}, headers=ANA
    )

    assert changed.status_code == 200
    assert setup.jobs.started == 2
    assert setup.client.get(f"/v1/saved-zones/{zone['id']}/seasonal", headers=ANA).json() == {"computing": True}


def test_a_zones_series_is_its_owners_and_its_projects(setup: Setup) -> None:
    zone = setup.save()
    setup.computed(zone, {"ppna": {"2025-01-01": 120.5}})
    project = setup.client.post("/v1/projects", json={"name": "Campo"}, headers=ANA).json()["id"]
    setup.client.post(f"/v1/projects/{project}/items", json={"kind": "saved", "zone_id": zone["id"]}, headers=ANA)

    through = setup.client.get(f"/v1/projects/{project}/zones/{zone['id']}/seasonal", headers=ANA)

    assert through.json()["ppna"]["values"] == [120.5, None]
    assert setup.client.get(f"/v1/saved-zones/{zone['id']}/seasonal", headers=BO).status_code == 404
    assert setup.client.get(f"/v1/projects/{project}/zones/{zone['id']}/seasonal", headers=BO).status_code == 404
