import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.series import ZoneStore
from idea_agro_api.services import services_for_tests
from idea_agro_api.zones import LocalFiles


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    seasonal = {
        "ppna": ["2001-01-01", "2001-01-17"],
        "apar": ["2001-01-01", "2001-01-17"],
        "et": ["2001-01-01", "2001-01-09"],
    }
    (tmp_path / "catalog.json").write_text(json.dumps({"seasonal": seasonal}))
    zones = tmp_path / "series" / "seccionales"
    zones.mkdir(parents=True)
    (zones / "1806.json").write_text(json.dumps({"ppna": [330.3, None], "et": [1.2, 1.4]}))
    return TestClient(create_app(services_for_tests(ZoneStore(LocalFiles(tmp_path)))))


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_seasonal_series_carry_their_unit_dates_and_values(client: TestClient) -> None:
    response = client.get("/v1/zones/seccionales/1806/seasonal")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=3600"
    assert response.json() == {
        "division": "seccionales",
        "zone": "1806",
        "ppna": {
            "unit": "kg DM/ha per 16 days",
            "cadence_days": 16,
            "dates": ["2001-01-01", "2001-01-17"],
            "values": [330.3, None],
        },
        "et": {"unit": "mm per day", "cadence_days": 8, "dates": ["2001-01-01", "2001-01-09"], "values": [1.2, 1.4]},
    }


def test_a_missing_zone_is_a_problem(client: TestClient) -> None:
    response = client.get("/v1/zones/seccionales/9999/seasonal")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json() == {
        "type": "about:blank",
        "title": "Not Found",
        "status": 404,
        "detail": "Zone 9999 does not exist in seccionales.",
        "instance": "/v1/zones/seccionales/9999/seasonal",
    }


@pytest.mark.parametrize("path", ["/v1/zones/departments/1806/seasonal", "/v1/zones/seccionales/..%2F..%2Fx/seasonal"])
def test_an_invalid_parameter_is_a_problem(client: TestClient, path: str) -> None:
    response = client.get(path)

    assert response.status_code in (404, 422)
    assert response.headers["content-type"] == "application/problem+json"


def test_any_origin_may_call_it(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://example.org"})
    assert response.headers["access-control-allow-origin"] == "*"


def test_the_document_publishes_problems_and_the_version() -> None:
    from idea_agro_api.openapi import document

    published = json.loads(document())
    responses = published["paths"]["/v1/zones/{division}/{zone}/seasonal"]["get"]["responses"]
    assert published["info"]["version"] == "1.13.0"
    assert list(responses["404"]["content"]) == ["application/problem+json"]
    assert list(responses["422"]["content"]) == ["application/problem+json"]
