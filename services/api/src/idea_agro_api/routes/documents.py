"""Documents kept with a saved zone: its owner attaches and deletes them, and the members of its projects read them."""

from datetime import UTC, datetime
from pathlib import PurePath
from typing import Annotated, Any
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, File, Response, UploadFile
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.deps import CallerDep, ServicesDep
from idea_agro_api.documents import Document, file_name, media_type, new_document_id
from idea_agro_api.errors import problems
from idea_agro_api.models import DocumentOut
from idea_agro_api.routes.projects import ProjectId, project_zone
from idea_agro_api.routes.saved_zones import ZoneId, owned
from idea_agro_api.saved_zones import SavedZone
from idea_agro_api.services import Services

router = APIRouter(tags=["Saved zones"])

DocumentId = Annotated[UUID, PathParam(description="The document's id.")]
NO_DOCUMENT = "The zone keeps no such document."
FILE: dict[int | str, dict[str, Any]] = {
    200: {"content": {"application/octet-stream": {}}, "description": "The file, to save."}
}


def out(document: Document) -> DocumentOut:
    return DocumentOut(
        id=document.id,
        name=document.name,
        media_type=document.media_type,
        size=document.size,
        uploaded_at=document.uploaded_at,
        uploaded_by=document.uploaded_by,
    )


def attachment(name: str) -> str:
    """Saved under its own name, accents included where the browser can; plain ASCII elsewhere."""
    plain = name.encode("ascii", "replace").decode().replace("?", "_").replace('"', "_")
    return f"attachment; filename=\"{plain}\"; filename*=UTF-8''{quote(name)}"


def download(services: Services, zone: SavedZone, document_id: UUID) -> Response:
    document = services.documents.get(str(document_id))
    content = services.document_files.get(file_name(zone.id, document.id)) if document else None
    if document is None or document.zone != zone.id or content is None:
        raise HTTPException(404, NO_DOCUMENT)
    return Response(
        content,
        media_type=document.media_type,
        headers={"Content-Disposition": attachment(document.name), "Cache-Control": "private, no-store"},
    )


@router.get(
    "/v1/saved-zones/{zone_id}/documents",
    summary="The documents of a saved zone",
    description="Oldest first.",
    responses=problems(401, 403, 404, 422, 429),
)
def list_saved_zone_documents(zone_id: ZoneId, caller: CallerDep, services: ServicesDep) -> list[DocumentOut]:
    zone = owned(services, caller.account.id, zone_id)
    return [out(d) for d in services.documents.of_zone(zone.id)]


@router.post(
    "/v1/saved-zones/{zone_id}/documents",
    status_code=201,
    summary="Attach a document to a saved zone",
    description=(
        "For the zone's owner. PDF, images (PNG, JPEG, WebP), text, CSV, spreadsheets (XLSX, XLS, ODS) and text "
        "documents (DOCX, ODT), each up to `DOCUMENT_MAX_BYTES` (10 MB). The members of the zone's projects can "
        "read them."
    ),
    responses=problems(401, 403, 404, 409, 413, 415, 422, 429),
)
def attach_saved_zone_document(
    zone_id: ZoneId,
    file: Annotated[UploadFile, File(description="The document.")],
    caller: CallerDep,
    services: ServicesDep,
) -> DocumentOut:
    zone = owned(services, caller.account.id, zone_id)
    limits = services.limits
    # Only the name itself: a path the browser sent along is dropped.
    name = PurePath((file.filename or "").replace("\\", "/")).name.strip()
    if not name or len(name) > 200:
        raise HTTPException(422, "The file needs a name of at most 200 characters.")
    kind = media_type(name)
    if kind is None:
        raise HTTPException(415, "Attach a PDF, an image, a text, a spreadsheet or a text document.")
    content = file.file.read(limits.document_bytes + 1)
    if len(content) > limits.document_bytes:
        raise HTTPException(413, f"A document takes at most {limits.document_bytes} bytes.")
    if not content:
        raise HTTPException(422, "The file is empty.")
    if len(services.documents.of_zone(zone.id)) >= limits.documents_per_zone:
        raise HTTPException(409, f"A zone keeps at most {limits.documents_per_zone} documents.")
    if services.documents.bytes_of(zone.owner) + len(content) > limits.documents_bytes_per_account:
        raise HTTPException(409, f"Your documents take at most {limits.documents_bytes_per_account} bytes in all.")
    document = Document(
        id=new_document_id(),
        zone=zone.id,
        owner=zone.owner,
        name=name,
        media_type=kind,
        size=len(content),
        uploaded_at=datetime.now(UTC),
        uploaded_by=caller.account.display_name or None,
    )
    # The file first: a record never points at nothing, and a file left by a failure is unreachable.
    services.document_files.put(file_name(zone.id, document.id), content, kind)
    try:
        services.documents.add(document)
    except Exception:
        services.document_files.delete(file_name(zone.id, document.id))
        raise
    return out(document)


@router.get(
    "/v1/saved-zones/{zone_id}/documents/{document_id}",
    summary="Download a document of a saved zone",
    response_class=Response,
    responses=FILE | problems(401, 403, 404, 422, 429),
)
def get_saved_zone_document(
    zone_id: ZoneId, document_id: DocumentId, caller: CallerDep, services: ServicesDep
) -> Response:
    return download(services, owned(services, caller.account.id, zone_id), document_id)


@router.delete(
    "/v1/saved-zones/{zone_id}/documents/{document_id}",
    status_code=204,
    summary="Delete a document of a saved zone",
    responses=problems(401, 403, 404, 422, 429),
)
def delete_saved_zone_document(
    zone_id: ZoneId, document_id: DocumentId, caller: CallerDep, services: ServicesDep
) -> Response:
    zone = owned(services, caller.account.id, zone_id)
    document = services.documents.get(str(document_id))
    if document is None or document.zone != zone.id:
        raise HTTPException(404, NO_DOCUMENT)
    # The record goes first: a file left behind by a failure is unreachable, a record without one is not.
    services.documents.delete(document.id)
    services.document_files.delete(file_name(zone.id, document.id))
    return Response(status_code=204)


@router.get(
    "/v1/projects/{project_id}/zones/{zone_id}/documents",
    summary="The documents of a saved zone of a project",
    description="For every member. Oldest first.",
    responses=problems(401, 403, 404, 422, 429),
)
def list_project_zone_documents(
    project_id: ProjectId, zone_id: ZoneId, caller: CallerDep, services: ServicesDep
) -> list[DocumentOut]:
    zone = project_zone(services, caller, project_id, zone_id)
    return [out(d) for d in services.documents.of_zone(zone.id)]


@router.get(
    "/v1/projects/{project_id}/zones/{zone_id}/documents/{document_id}",
    summary="Download a document of a saved zone of a project",
    description="For every member.",
    response_class=Response,
    responses=FILE | problems(401, 403, 404, 422, 429),
)
def get_project_zone_document(
    project_id: ProjectId, zone_id: ZoneId, document_id: DocumentId, caller: CallerDep, services: ServicesDep
) -> Response:
    return download(services, project_zone(services, caller, project_id, zone_id), document_id)
