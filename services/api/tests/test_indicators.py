import json
from pathlib import Path

import pytest
from auth_tokens import bearer, make_token
from fastapi.testclient import TestClient
from idea_agro_api.accounts import Role
from idea_agro_api.app import create_app
from idea_agro_api.audit import AuditAction
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.indicator_visibility import IndicatorVisibility, MemoryVisibility, Visibility
from idea_agro_api.services import Services, services_for_tests
from idea_agro_api.zones import LocalFiles

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
EVERY = ["apar", "cob", "ppna", "compn", "rh", "et", "iose", "divtfe", "csue", "ahppn"]
DAYS = ["2025-01-01", "2025-01-17"]
FILES = {
    "catalog.json": {
        "indicators": {"ppna": {"kind": "continuous", "years": [2024]}, "rh": {"kind": "continuous", "years": [2024]}},
        "seasonal": {"ppna": DAYS, "rh": DAYS},
        "divisions": {"seccionales": 1},
    },
    "series/seccionales/1406.json": {"ppna": [1.0, 2.0], "rh": [3.0, 4.0]},
}


@pytest.fixture
def services(tmp_path: Path, verifier: OidcVerifier) -> Services:
    for name, content in FILES.items():
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_text(json.dumps(content))
    return services_for_tests(files=LocalFiles(tmp_path), verifier=verifier)


@pytest.fixture
def client(services: Services) -> TestClient:
    found = TestClient(create_app(services))
    ana = found.get("/v1/me", headers=ANA).json()["id"]
    found.get("/v1/me", headers=BO)
    services.accounts.update(ana, roles=frozenset({Role.EDITOR}))
    return found


def test_every_indicator_is_shown_until_an_editor_hides_it(client: TestClient) -> None:
    shown = client.get("/v1/indicators")

    assert shown.json() == {"indicators": EVERY}
    assert shown.headers["cache-control"] == "public, max-age=60"
    assert all(
        v["shown"] and v["updated_by"] is None for v in client.get("/v1/indicators/visibility", headers=ANA).json()
    )


def test_a_hidden_indicator_leaves_the_shown_ones(client: TestClient, services: Services) -> None:
    hidden = client.put("/v1/indicators/rh/visibility", headers=ANA, json={"shown": False}).json()

    assert hidden["shown"] is False
    assert hidden["updated_by"]["name"] == "Ana"
    assert "rh" not in client.get("/v1/indicators").json()["indicators"]
    listed = {v["indicator"]: v["shown"] for v in client.get("/v1/indicators/visibility", headers=ANA).json()}
    assert listed["rh"] is False
    assert listed["ppna"] is True


def test_every_switch_is_audited_and_marks_the_site_behind(client: TestClient, services: Services) -> None:
    client.put("/v1/indicators/apar/visibility", headers=ANA, json={"shown": False})
    behind = services.site_rebuild.read().published_at
    client.put("/v1/indicators/apar/visibility", headers=ANA, json={"shown": True})

    actions = [(e.action, e.target) for e in services.audit.latest(10)]
    assert actions == [(AuditAction.INDICATOR_SHOWN, "apar"), (AuditAction.INDICATOR_HIDDEN, "apar")]
    assert behind is not None
    assert client.get("/v1/indicators").json()["indicators"] == EVERY


def test_switching_to_the_same_state_changes_nothing(client: TestClient, services: Services) -> None:
    same = client.put("/v1/indicators/ppna/visibility", headers=ANA, json={"shown": True})

    assert same.status_code == 200
    assert services.audit.latest(10) == []
    assert services.site_rebuild.read().published_at is None


def test_only_editors_see_and_switch_indicators(client: TestClient) -> None:
    assert client.get("/v1/indicators/visibility").status_code == 401
    assert client.get("/v1/indicators/visibility", headers=BO).status_code == 403
    assert client.put("/v1/indicators/rh/visibility", headers=BO, json={"shown": False}).status_code == 403
    assert client.put("/v1/indicators/nothing/visibility", headers=ANA, json={"shown": False}).status_code == 422
    assert "rh" in client.get("/v1/indicators").json()["indicators"]


def test_the_catalog_leaves_a_hidden_indicator_out(client: TestClient, services: Services) -> None:
    services.visibility.put(Visibility("rh", False))

    response = client.get("/v1/catalog")
    catalog = response.json()

    assert list(catalog["indicators"]) == ["ppna"]
    assert list(catalog["seasonal"]) == ["ppna"]
    assert catalog["divisions"] == {"seccionales": 1}
    assert response.headers["cache-control"] == "public, max-age=60"


def test_a_zone_s_series_leave_a_hidden_indicator_out(client: TestClient, services: Services) -> None:
    assert set(client.get("/v1/zones/seccionales/1406/seasonal").json()) >= {"ppna", "rh"}

    services.visibility.put(Visibility("rh", False))
    response = client.get("/v1/zones/seccionales/1406/seasonal")

    assert "rh" not in response.json()
    assert response.json()["ppna"]["values"] == [1.0, 2.0]
    assert response.headers["cache-control"] == "public, max-age=60"


def test_the_published_citations_leave_a_hidden_indicator_out(client: TestClient, services: Services) -> None:
    client.post("/v1/articles/seed", headers=ANA)
    client.put("/v1/indicators/rh/visibility", headers=ANA, json={"shown": False})

    assert "rh" not in client.get("/v1/articles").json()["citations"]
    every = client.get("/v1/indicators/articles", headers=ANA).json()["citations"]
    assert every["rh"] == services.articles.citations()["rh"]
    cited = client.put("/v1/indicators/rh/articles", headers=ANA, json={"articles": every["rh"][:1]})
    assert cited.status_code == 200
    assert client.get("/v1/indicators/articles", headers=BO).status_code == 403


def test_the_hidden_ones_are_kept_for_a_few_seconds() -> None:
    store = MemoryVisibility()
    kept = IndicatorVisibility(store, keep_seconds=300)
    assert kept.hidden() == frozenset()

    store.put(Visibility("rh", False))
    assert kept.hidden() == frozenset()

    kept.put(Visibility("et", False))
    assert kept.hidden() == {"rh", "et"}
