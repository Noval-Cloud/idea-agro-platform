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

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
SQUARE = {"type": "Polygon", "coordinates": [[[-56, -32], [-55.99, -32], [-55.99, -31.99], [-56, -31.99], [-56, -32]]]}
SECCIONAL = {"kind": "division", "division": "seccionales", "zone_id": "1406"}
PADRON = {"kind": "padron", "department": "rocha", "padron": 1234}


def client_with(tmp_path: Path, verifier: OidcVerifier, **limits: Any) -> TestClient:
    (tmp_path / "series" / "seccionales").mkdir(parents=True)
    (tmp_path / "series" / "seccionales" / "1406.json").write_text(json.dumps({"ppna": []}))
    services = services_for_tests(files=LocalFiles(tmp_path), verifier=verifier, limits=Limits(**limits))
    return TestClient(create_app(services))


@pytest.fixture
def client(tmp_path: Path, verifier: OidcVerifier) -> TestClient:
    return client_with(tmp_path, verifier)


def project(client: TestClient, name: str = "Campo Las Rosas", headers: dict[str, str] = ANA) -> dict[str, Any]:
    return client.post("/v1/projects", json={"name": name}, headers=headers).json()


def saved_zone(client: TestClient, headers: dict[str, str] = ANA) -> str:
    zone = {"name": "Potrero 3", "source": "drawn", "geometry": SQUARE}
    return client.post("/v1/saved-zones", json=zone, headers=headers).json()["id"]


def add(client: TestClient, id: str, item: dict[str, Any], headers: dict[str, str] = ANA):
    return client.post(f"/v1/projects/{id}/items", json=item, headers=headers)


def test_a_project_is_created_described_and_listed(client: TestClient) -> None:
    created = client.post("/v1/projects", json={"name": "  Campo  ", "description": "Tesis"}, headers=ANA)
    id = created.json()["id"]

    changed = client.patch(f"/v1/projects/{id}", json={"description": "Tesis de maestría"}, headers=ANA)

    assert created.status_code == 201
    assert created.json()["name"] == "Campo"
    assert changed.json()["name"] == "Campo"
    assert changed.json()["description"] == "Tesis de maestría"
    listed = client.get("/v1/projects", headers=ANA).json()
    assert [(p["id"], p["zone_count"]) for p in listed] == [(id, 0)]


def test_projects_are_private(client: TestClient) -> None:
    id = project(client)["id"]

    assert client.get("/v1/projects", headers=BO).json() == []
    assert client.get(f"/v1/projects/{id}", headers=BO).status_code == 404
    assert client.patch(f"/v1/projects/{id}", json={"name": "Mío"}, headers=BO).status_code == 404
    assert add(client, id, SECCIONAL, headers=BO).status_code == 404
    assert client.delete(f"/v1/projects/{id}", headers=BO).status_code == 404
    assert client.get("/v1/projects").status_code == 401


def test_items_reference_every_kind_of_zone_once(client: TestClient) -> None:
    id = project(client)["id"]
    zone = saved_zone(client)

    add(client, id, {"kind": "saved", "zone_id": zone})
    add(client, id, SECCIONAL)
    add(client, id, PADRON)
    again = add(client, id, SECCIONAL)

    assert again.status_code == 200
    items = again.json()["items"]
    assert [i["id"] for i in items] == [f"saved:{zone}", "seccionales:1406", "padron:rocha:1234"]
    assert items[0]["zone"]["name"] == "Potrero 3"
    assert items[2] == PADRON | {"id": "padron:rocha:1234"}


@pytest.mark.parametrize(
    "item",
    [
        {"kind": "division", "division": "seccionales", "zone_id": "9999"},
        {"kind": "division", "division": "somewhere", "zone_id": "1406"},
        {"kind": "padron", "department": "atlantis", "padron": 1},
        {"kind": "saved", "zone_id": "00000000-0000-4000-8000-000000000000"},
    ],
    ids=["unknown-zone", "unknown-division", "unknown-department", "unknown-saved-zone"],
)
def test_an_item_must_name_a_zone(client: TestClient, item: dict[str, Any]) -> None:
    id = project(client)["id"]
    assert add(client, id, item).status_code == 422


def test_another_persons_zone_cannot_be_added(client: TestClient) -> None:
    id = project(client)["id"]
    theirs = saved_zone(client, headers=BO)

    assert add(client, id, {"kind": "saved", "zone_id": theirs}).status_code == 422


def test_removing_an_item_or_a_project_keeps_the_zone(client: TestClient) -> None:
    id = project(client)["id"]
    zone = saved_zone(client)
    add(client, id, {"kind": "saved", "zone_id": zone})
    add(client, id, SECCIONAL)

    removed = client.delete(f"/v1/projects/{id}/items/saved:{zone}", headers=ANA)
    missing = client.delete(f"/v1/projects/{id}/items/saved:{zone}", headers=ANA)

    assert removed.status_code == 204
    assert missing.status_code == 404
    assert [i["id"] for i in client.get(f"/v1/projects/{id}", headers=ANA).json()["items"]] == ["seccionales:1406"]
    assert client.delete(f"/v1/projects/{id}", headers=ANA).status_code == 204
    assert client.get(f"/v1/saved-zones/{zone}", headers=ANA).status_code == 200


def test_a_deleted_zone_leaves_every_project(client: TestClient) -> None:
    first, second = project(client, "A")["id"], project(client, "B")["id"]
    zone = saved_zone(client)
    for id in (first, second):
        add(client, id, {"kind": "saved", "zone_id": zone})

    client.delete(f"/v1/saved-zones/{zone}", headers=ANA)

    for id in (first, second):
        assert client.get(f"/v1/projects/{id}", headers=ANA).json()["items"] == []


def test_limits_are_kept(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = client_with(tmp_path, verifier, projects_per_account=1, zones_per_project=1)
    id = project(client)["id"]

    assert client.post("/v1/projects", json={"name": "Otro"}, headers=ANA).status_code == 409
    assert add(client, id, SECCIONAL).status_code == 200
    assert add(client, id, PADRON).status_code == 409


def test_a_name_of_spaces_is_refused(client: TestClient) -> None:
    assert client.post("/v1/projects", json={"name": "   "}, headers=ANA).status_code == 422
