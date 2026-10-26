import json
from pathlib import Path
from typing import Any, cast
from urllib.parse import parse_qs, urlsplit

import pytest
from auth_tokens import bearer, make_token
from fastapi import FastAPI
from fastapi.testclient import TestClient
from idea_agro_api.app import create_app
from idea_agro_api.auth import OidcVerifier
from idea_agro_api.documents import MemoryDocumentFiles
from idea_agro_api.mail import MemoryMailer
from idea_agro_api.services import Limits, services_for_tests
from idea_agro_api.zones import LocalFiles

ANA = bearer(make_token("ana"))
BO = bearer(make_token("bo"))
CY = bearer(make_token("cy"))
DISTRICT = [[-56.1, -32.1], [-55.9, -32.1], [-55.9, -31.9], [-56.1, -31.9], [-56.1, -32.1]]
SQUARE = {"type": "Polygon", "coordinates": [[[-56.0, -32.0], [-55.99, -32.0], [-55.99, -31.99], [-56.0, -32.0]]]}
PDF = b"%PDF-1.7 a soil study"


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
    services = services_for_tests(
        files=LocalFiles(tmp_path),
        verifier=verifier,
        limits=Limits(**limits),
        mailer=MemoryMailer(),
        site_url="https://s.example",
    )
    return TestClient(create_app(services))


@pytest.fixture
def client(tmp_path: Path, verifier: OidcVerifier) -> TestClient:
    return client_with(tmp_path, verifier)


def zone(client: TestClient) -> str:
    body = {"name": "Potrero", "source": "drawn", "geometry": SQUARE}
    return client.post("/v1/saved-zones", json=body, headers=ANA).json()["id"]


def attach(client: TestClient, id: str, name: str = "suelo.pdf", content: bytes = PDF, headers: Any = ANA) -> Any:
    return client.post(f"/v1/saved-zones/{id}/documents", files={"file": (name, content)}, headers=headers)


def files_of(client: TestClient) -> dict[str, bytes]:
    return cast(MemoryDocumentFiles, cast(FastAPI, client.app).state.services.document_files).files


def test_an_owner_attaches_lists_downloads_and_deletes_a_document(client: TestClient) -> None:
    id = zone(client)

    attached = attach(client, id, "Análisis de suelo.pdf")

    assert attached.status_code == 201
    document = attached.json()
    assert document["name"] == "Análisis de suelo.pdf"
    assert document["media_type"] == "application/pdf"
    assert document["size"] == len(PDF)
    assert document["uploaded_by"] == "Ana"
    assert client.get(f"/v1/saved-zones/{id}/documents", headers=ANA).json() == [document]
    file = client.get(f"/v1/saved-zones/{id}/documents/{document['id']}", headers=ANA)
    assert file.content == PDF
    assert file.headers["content-type"] == "application/pdf"
    assert file.headers["content-disposition"] == (
        "attachment; filename=\"An_lisis de suelo.pdf\"; filename*=UTF-8''An%C3%A1lisis%20de%20suelo.pdf"
    )
    assert client.delete(f"/v1/saved-zones/{id}/documents/{document['id']}", headers=ANA).status_code == 204
    assert client.get(f"/v1/saved-zones/{id}/documents", headers=ANA).json() == []
    assert files_of(client) == {}


def test_only_the_name_of_the_file_is_kept(client: TestClient) -> None:
    assert attach(client, zone(client), "C:\\fakepath\\informe.PDF").json()["name"] == "informe.PDF"


@pytest.mark.parametrize(
    ("name", "content", "status"),
    [("programa.exe", PDF, 415), ("suelo", PDF, 415), ("vacío.pdf", b"", 422), ("", PDF, 422)],
)
def test_a_document_must_be_a_kind_people_share(client: TestClient, name: str, content: bytes, status: int) -> None:
    assert attach(client, zone(client), name, content).status_code == status


def test_documents_are_capped(tmp_path: Path, verifier: OidcVerifier) -> None:
    client = client_with(tmp_path, verifier, document_bytes=30, documents_per_zone=2, documents_bytes_per_account=50)
    id = zone(client)

    assert attach(client, id, content=b"x" * 31).status_code == 413
    assert attach(client, id, content=b"x" * 30).status_code == 201
    assert attach(client, id, content=b"x" * 21).status_code == 409
    assert attach(client, id, content=b"x" * 20).status_code == 201
    assert attach(client, id, content=b"x").status_code == 409


def test_another_persons_zone_takes_no_documents(client: TestClient) -> None:
    id = zone(client)

    assert attach(client, id, headers=BO).status_code == 404
    assert client.get(f"/v1/saved-zones/{id}/documents", headers=BO).status_code == 404


def test_the_members_of_a_project_read_its_zones_documents(client: TestClient) -> None:
    id = zone(client)
    document = attach(client, id).json()
    project = client.post("/v1/projects", json={"name": "Campo"}, headers=ANA).json()["id"]
    client.post(f"/v1/projects/{project}/items", json={"kind": "saved", "zone_id": id}, headers=ANA)
    client.put(f"/v1/projects/{project}/members", json={"email": "bo@example.org", "role": "viewer"}, headers=ANA)
    mailer = cast(MemoryMailer, cast(FastAPI, client.app).state.services.mailer)
    link = urlsplit(mailer.sent[-1].text.split("https://")[1].split()[0])
    code = {"project_id": project, "code": parse_qs(link.fragment)["code"][0]}
    client.post("/v1/invitations/accept", json=code, headers=BO)
    base = f"/v1/projects/{project}/zones/{id}/documents"

    assert client.get(base, headers=BO).json() == [document]
    assert client.get(f"{base}/{document['id']}", headers=BO).content == PDF
    assert client.get(base, headers=CY).status_code == 404
    assert client.get(f"{base}/{document['id']}", headers=CY).status_code == 404


def test_a_document_belongs_to_its_zone(client: TestClient) -> None:
    first, second = zone(client), zone(client)
    document = attach(client, first).json()

    assert client.get(f"/v1/saved-zones/{second}/documents/{document['id']}", headers=ANA).status_code == 404
    assert client.delete(f"/v1/saved-zones/{second}/documents/{document['id']}", headers=ANA).status_code == 404


def test_a_deleted_zone_takes_its_documents_along(client: TestClient) -> None:
    id = zone(client)
    attach(client, id)

    client.delete(f"/v1/saved-zones/{id}", headers=ANA)

    assert files_of(client) == {}
