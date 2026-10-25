import json
from pathlib import Path
from typing import Any, cast

import pytest
from auth_tokens import bearer, make_token
from fastapi import FastAPI
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.geometries import MemoryGeometries
from idea_agro_api.saved_zones import MemorySavedZones
from idea_agro_api.services import Limits, Services, services_for_tests
from idea_agro_api.zones import LocalFiles

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
CY = bearer(make_token("cy"))
DISTRICT = [[-56.1, -32.1], [-55.9, -32.1], [-55.9, -31.9], [-56.1, -31.9], [-56.1, -32.1]]


def square(side: float = 0.01) -> dict[str, Any]:
    ring = [[-56, -32], [-56 + side, -32], [-56 + side, -32 + side], [-56, -32 + side], [-56, -32]]
    return {"type": "Polygon", "coordinates": [ring]}


@pytest.fixture
def client(tmp_path: Path, verifier: OidcVerifier) -> TestClient:
    (tmp_path / "divisions").mkdir()
    district = {
        "type": "Feature",
        "properties": {"department": "Tacuarembó"},
        "geometry": {"type": "Polygon", "coordinates": [DISTRICT]},
    }
    (tmp_path / "divisions" / "seccionales.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": [district]})
    )
    (tmp_path / "divisions" / "seccionales").mkdir(parents=True)
    (tmp_path / "divisions" / "seccionales" / "1406.json").write_text("{}")
    services = services_for_tests(files=LocalFiles(tmp_path), verifier=verifier, limits=Limits())
    return TestClient(create_app(services))


def project(client: TestClient) -> str:
    return client.post("/v1/projects", json={"name": "Campo"}, headers=ANA).json()["id"]


def share(client: TestClient, id: str, email: str, role: str, headers: dict[str, str] = ANA):
    return client.put(f"/v1/projects/{id}/members", json={"email": email, "role": role}, headers=headers)


def saved_zone(client: TestClient, headers: dict[str, str]) -> str:
    zone = {"name": "Potrero", "source": "drawn", "geometry": square()}
    return client.post("/v1/saved-zones", json=zone, headers=headers).json()["id"]


def add(client: TestClient, id: str, item: dict[str, Any], headers: dict[str, str]):
    return client.post(f"/v1/projects/{id}/items", json=item, headers=headers)


def joined(client: TestClient, id: str, email: str, role: str, headers: dict[str, str]) -> None:
    share(client, id, email, role)
    client.get("/v1/projects", headers=headers)


def test_an_invitation_is_accepted_when_the_invitee_opens_their_projects(client: TestClient) -> None:
    id = project(client)

    shared = share(client, id, "Bo@Example.org", "viewer").json()
    pending = client.get("/v1/projects", headers=ANA).json()
    before = client.get(f"/v1/projects/{id}", headers=BO)
    listed = client.get("/v1/projects", headers=BO).json()
    after = client.get(f"/v1/projects/{id}", headers=ANA).json()

    assert shared["members"] == [
        {"email": "bo@example.org", "name": None, "role": "viewer", "pending": True, "you": False}
    ]
    # An invitation counts before it is accepted.
    assert [p["member_count"] for p in pending] == [1]
    # Opening it directly accepts it too.
    assert before.status_code == 200
    assert [(p["id"], p["role"], p["owner_name"], p["member_count"]) for p in listed] == [(id, "viewer", "Ana", 1)]
    assert after["members"] == [
        {"email": "bo@example.org", "name": "Bo", "role": "viewer", "pending": False, "you": False}
    ]
    assert client.get(f"/v1/projects/{id}", headers=BO).json()["members"][0]["you"] is True


def test_an_unverified_email_does_not_accept_an_invitation(client: TestClient) -> None:
    id = project(client)
    share(client, id, "bo@example.org", "collaborator")

    unverified = bearer(make_token("bo", email_verified=False))

    assert client.get("/v1/projects", headers=unverified).json() == []
    assert client.get(f"/v1/projects/{id}", headers=unverified).status_code == 404


def test_roles_decide_what_members_do(client: TestClient) -> None:
    id = project(client)
    joined(client, id, "bo@example.org", "collaborator", BO)
    joined(client, id, "cy@example.org", "viewer", CY)
    seccional = {"kind": "division", "division": "seccionales", "zone_id": "1406"}

    assert add(client, id, seccional, BO).status_code == 200
    assert client.patch(f"/v1/projects/{id}", json={"description": "Tesis"}, headers=BO).status_code == 200
    assert add(client, id, seccional, CY).status_code == 403
    assert client.patch(f"/v1/projects/{id}", json={"name": "Mío"}, headers=CY).status_code == 403
    assert share(client, id, "dee@example.org", "viewer", headers=BO).status_code == 403
    assert client.delete(f"/v1/projects/{id}", headers=BO).status_code == 403
    assert client.get(f"/v1/projects/{id}", headers=CY).json()["role"] == "viewer"


def test_members_read_and_collaborators_reshape_zones_of_other_libraries(client: TestClient) -> None:
    id = project(client)
    joined(client, id, "bo@example.org", "collaborator", BO)
    joined(client, id, "cy@example.org", "viewer", CY)
    zone = saved_zone(client, ANA)
    add(client, id, {"kind": "saved", "zone_id": zone}, ANA)

    read = client.get(f"/v1/projects/{id}/zones/{zone}/geometry", headers=CY)
    viewer = client.put(
        f"/v1/projects/{id}/zones/{zone}/geometry", json={"version": 1, "geometry": square(0.02)}, headers=CY
    )
    changed = client.put(
        f"/v1/projects/{id}/zones/{zone}/geometry", json={"version": 1, "geometry": square(0.02)}, headers=BO
    )

    assert read.status_code == 200
    assert viewer.status_code == 403
    assert changed.json()["version"] == 2
    assert changed.json()["area_ha"] > 400
    # The library route stays the owner's own.
    assert client.get(f"/v1/saved-zones/{zone}", headers=BO).status_code == 404


def test_the_zones_owner_restores_any_version(client: TestClient) -> None:
    id = project(client)
    joined(client, id, "bo@example.org", "collaborator", BO)
    zone = saved_zone(client, ANA)
    add(client, id, {"kind": "saved", "zone_id": zone}, ANA)
    client.put(f"/v1/projects/{id}/zones/{zone}/geometry", json={"version": 1, "geometry": square(0.02)}, headers=BO)

    versions = client.get(f"/v1/saved-zones/{zone}/versions", headers=ANA).json()
    restored = client.post(f"/v1/saved-zones/{zone}/versions/1/restore", headers=ANA)
    again = client.get(f"/v1/saved-zones/{zone}/versions", headers=ANA).json()

    assert [(v["version"], v["by_name"], v["current"]) for v in versions] == [(2, "Bo", True), (1, "Ana", False)]
    assert restored.json()["version"] == 3
    assert restored.json()["area_ha"] < 110
    assert (again[0]["version"], again[0]["restored_from"]) == (3, 1)
    assert client.post(f"/v1/saved-zones/{zone}/versions/1/restore", headers=BO).status_code == 404


def test_a_member_who_leaves_takes_their_zones(client: TestClient) -> None:
    id = project(client)
    joined(client, id, "bo@example.org", "collaborator", BO)
    theirs = saved_zone(client, BO)
    mine = saved_zone(client, ANA)
    add(client, id, {"kind": "saved", "zone_id": theirs}, BO)
    add(client, id, {"kind": "saved", "zone_id": mine}, ANA)

    left = client.delete(f"/v1/projects/{id}/members/bo@example.org", headers=BO)

    assert left.status_code == 204
    assert [i["zone_id"] for i in client.get(f"/v1/projects/{id}", headers=ANA).json()["items"]] == [mine]
    assert client.get(f"/v1/projects/{id}", headers=BO).status_code == 404
    assert client.get(f"/v1/projects/{id}/zones/{theirs}", headers=ANA).status_code == 404


def test_only_the_owner_removes_others(client: TestClient) -> None:
    id = project(client)
    joined(client, id, "bo@example.org", "collaborator", BO)
    joined(client, id, "cy@example.org", "viewer", CY)

    assert client.delete(f"/v1/projects/{id}/members/cy@example.org", headers=BO).status_code == 403
    assert client.delete(f"/v1/projects/{id}/members/cy@example.org", headers=ANA).status_code == 204


def test_the_owner_cannot_invite_themself(client: TestClient) -> None:
    id = project(client)
    assert share(client, id, "ANA@example.org", "viewer").status_code == 422


def test_sharing_warns_who_adds_zones(client: TestClient) -> None:
    id = project(client)

    alone = client.get(f"/v1/projects/{id}", headers=ANA).json()["others_can_edit"]
    joined(client, id, "bo@example.org", "viewer", BO)
    viewers = client.get(f"/v1/projects/{id}", headers=ANA).json()["others_can_edit"]
    share(client, id, "bo@example.org", "collaborator")
    collaborators = client.get(f"/v1/projects/{id}", headers=ANA).json()["others_can_edit"]

    assert (alone, viewers, collaborators) == (False, False, True)
    assert client.get(f"/v1/projects/{id}", headers=BO).json()["others_can_edit"] is True


def test_the_activity_tells_who_changed_what(client: TestClient) -> None:
    id = project(client)
    joined(client, id, "bo@example.org", "collaborator", BO)
    add(client, id, {"kind": "division", "division": "seccionales", "zone_id": "1406"}, BO)
    client.delete(f"/v1/projects/{id}/items/seccionales:1406", headers=ANA)

    activity = client.get(f"/v1/projects/{id}/activity", headers=BO).json()

    assert [(a["actor_name"], a["action"], a["subject"]) for a in activity] == [
        ("Ana", "zone_removed", "seccionales:1406"),
        ("Bo", "zone_added", "seccionales:1406"),
        ("Bo", "member_joined", "bo@example.org"),
        ("Ana", "member_invited", "bo@example.org"),
        ("Ana", "created", ""),
    ]


def test_deleting_a_project_forgets_its_activity(client: TestClient) -> None:
    id = project(client)
    client.delete(f"/v1/projects/{id}", headers=ANA)
    assert client.get(f"/v1/projects/{id}/activity", headers=ANA).status_code == 404


def test_a_change_made_on_an_older_version_is_refused(client: TestClient) -> None:
    zone = saved_zone(client, ANA)
    first = client.put(f"/v1/saved-zones/{zone}/geometry", json={"version": 1, "geometry": square(0.02)}, headers=ANA)
    stale = client.put(f"/v1/saved-zones/{zone}/geometry", json={"version": 1, "geometry": square(0.03)}, headers=ANA)

    assert first.json()["version"] == 2
    assert stale.status_code == 409
    assert client.get(f"/v1/saved-zones/{zone}", headers=ANA).json()["version"] == 2


def test_only_the_latest_versions_are_kept(tmp_path: Path, verifier: OidcVerifier) -> None:
    services = services_for_tests(verifier=verifier, limits=Limits(outline_versions=3))
    client = TestClient(create_app(services))
    zone = saved_zone(client, ANA)
    for version in range(1, 5):
        body = {"version": version, "geometry": square(0.01 + version / 1000)}
        client.put(f"/v1/saved-zones/{zone}/geometry", json=body, headers=ANA)

    versions = client.get(f"/v1/saved-zones/{zone}/versions", headers=ANA).json()

    assert [v["version"] for v in versions] == [5, 4, 3]
    assert client.post(f"/v1/saved-zones/{zone}/versions/1/restore", headers=ANA).status_code == 404
    assert len(cast(MemoryGeometries, services.geometries)._files) == 3  # pyright: ignore[reportPrivateUsage]


class FailingRecords(MemorySavedZones):
    """Fails the first outline change, as a database outage would."""

    failed = False

    def replace_outline(self, *args: Any, **kwargs: Any) -> Any:
        if not self.failed:
            self.failed = True
            raise ConnectionError("database down")
        return super().replace_outline(*args, **kwargs)


def test_a_failed_change_leaves_the_outline_free(verifier: OidcVerifier) -> None:
    services = services_for_tests(verifier=verifier, saved_zones=FailingRecords())
    client = TestClient(create_app(services), raise_server_exceptions=False)
    zone = saved_zone(client, ANA)
    body = {"version": 1, "geometry": square(0.02)}

    failed = client.put(f"/v1/saved-zones/{zone}/geometry", json=body, headers=ANA)
    retried = client.put(f"/v1/saved-zones/{zone}/geometry", json=body, headers=ANA)

    assert failed.status_code == 500
    assert retried.status_code == 200
    assert len(cast(MemoryGeometries, services.geometries)._files) == 2  # pyright: ignore[reportPrivateUsage]


def test_the_zones_of_someone_who_left_are_not_shared(client: TestClient) -> None:
    id = project(client)
    joined(client, id, "bo@example.org", "collaborator", BO)
    theirs = saved_zone(client, BO)
    add(client, id, {"kind": "saved", "zone_id": theirs}, BO)
    services = cast(Services, cast(FastAPI, client.app).state.services)
    # As if Bo left while the zone was being added: the project still names it.
    services.projects.update(id, members=())

    assert client.get(f"/v1/projects/{id}/zones/{theirs}", headers=ANA).status_code == 404
    assert client.get(f"/v1/projects/{id}", headers=ANA).json()["items"][0]["zone"] is None


def test_an_email_that_would_change_a_path_is_refused(client: TestClient) -> None:
    id = project(client)
    assert share(client, id, "a/b@example.org", "viewer").status_code == 422
