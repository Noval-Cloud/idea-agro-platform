"""The website's texts: the published edits anyone reads, and what editors do to them."""

from datetime import UTC, datetime
from typing import Annotated, Any, cast

from fastapi import APIRouter, Query, Response
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.audit import AuditAction, AuditEntry
from idea_agro_api.deps import Caller, EditorDep, ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import (
    PublishedTexts,
    SiteTextMatch,
    SiteTextOut,
    TextAuthor,
    TextChange,
    TextRestore,
    TextSection,
    TextVersionOut,
)
from idea_agro_api.services import Services
from idea_agro_api.site_texts import (
    Author,
    InvalidText,
    SiteText,
    Texts,
    TextVersion,
    VersionState,
    checked,
    current,
    definitions,
    edited,
    new_version_id,
    saved,
    search,
)

router = APIRouter(tags=["Texts"])

Key = Annotated[
    str,
    PathParam(pattern=r"^[A-Za-z0-9_.-]{1,200}$", description="The text's key.", examples=["zone.season.title"]),
]
SEARCHED = 100
# The site reads them when it is built; a minute keeps a rebuild from serving what an editor just replaced.
CACHE_CONTROL = "public, max-age=60"


def defined(key: str) -> str:
    if key not in definitions():
        raise HTTPException(404, "The site has no such text.")
    return key


def stored(services: Services, key: str) -> SiteText:
    return services.site_texts.get(key) or SiteText(key=key, published={}, draft=None)


def author(caller: Caller) -> Author:
    return Author(caller.account.id, caller.account.display_name)


def author_out(found: Author | None) -> TextAuthor | None:
    return TextAuthor(id=found.id, name=found.name) if found else None


def out(text: SiteText) -> SiteTextOut:
    definition = definitions()[text.key]
    return SiteTextOut.model_validate(
        {
            "key": text.key,
            "format": definition.format,
            "default": definition.default,
            "current": current(text.key, text),
            "published": text.published,
            "draft": text.draft,
            "updated_at": text.updated_at,
            "updated_by": author_out(text.updated_by),
            "draft_at": text.draft_at,
            "draft_by": author_out(text.draft_by),
        }
    )


def keep(services: Services, caller: Caller, text: SiteText, state: VersionState, action: AuditAction) -> SiteTextOut:
    """Stores the text, its version and the audit entry."""
    at = datetime.now(UTC)
    services.site_texts.put(text)
    left = (text.draft or {}) if state == "draft" else text.published
    services.site_texts.add_version(TextVersion(new_version_id(), text.key, left, state, at, author(caller)))
    actor = caller.account
    services.audit.record(AuditEntry(at, actor.id, actor.display_name, action, text.key, "", ", ".join(sorted(left))))
    return out(text)


@router.get(
    "/v1/texts",
    summary="The site's published texts",
    description=(
        "Every text editors published, by key and language; the website shows them instead of its defaults when it "
        "is built. Cacheable for a minute."
    ),
)
def get_published_texts(services: ServicesDep, response: Response) -> PublishedTexts:
    response.headers["Cache-Control"] = CACHE_CONTROL
    known = definitions()
    texts = {text.key: text.published for text in services.site_texts.all() if text.published and text.key in known}
    return PublishedTexts.model_validate({"texts": texts})


def match(key: str, text: SiteText | None) -> SiteTextMatch:
    return SiteTextMatch.model_validate(
        {
            "key": key,
            "format": definitions()[key].format,
            "current": current(key, text),
            "edited": bool(text and text.published),
            "draft": bool(text and text.draft is not None),
        }
    )


@router.get(
    "/v1/texts/sections",
    summary="The parts of the site's texts",
    description="Each first part of the keys, with how many texts it has, are edited and have a draft. For editors.",
    responses=problems(401, 403),
)
def list_sections(caller: EditorDep, services: ServicesDep) -> list[TextSection]:
    texts = {text.key: text for text in services.site_texts.all()}
    sections: dict[str, dict[str, int]] = {}
    for key in definitions():
        counts = sections.setdefault(key.split(".")[0], {"count": 0, "edited": 0, "drafts": 0})
        text = texts.get(key)
        counts["count"] += 1
        counts["edited"] += bool(text and text.published)
        counts["drafts"] += bool(text and text.draft is not None)
    return [TextSection(name=name, **counts) for name, counts in sorted(sections.items())]


@router.get(
    "/v1/texts/sections/{section}",
    summary="The texts of a part of the site",
    responses=problems(401, 403, 404, 422),
)
def list_section(
    section: Annotated[str, PathParam(pattern=r"^[A-Za-z0-9_-]{1,100}$", description="The keys' first part.")],
    caller: EditorDep,
    services: ServicesDep,
) -> list[SiteTextMatch]:
    keys = [key for key in definitions() if key.split(".")[0] == section]
    if not keys:
        raise HTTPException(404, "The site has no such part.")
    texts = {text.key: text for text in services.site_texts.all()}
    return [match(key, texts.get(key)) for key in keys]


@router.get(
    "/v1/texts/changes",
    summary="The texts editors changed",
    description="Every text with a published edit or a draft, most recently changed first. For editors.",
    responses=problems(401, 403),
)
def list_changes(caller: EditorDep, services: ServicesDep) -> list[SiteTextMatch]:
    known = definitions()
    texts = [text for text in services.site_texts.all() if text.key in known]
    latest = {
        text.key: max((at for at in (text.updated_at, text.draft_at) if at), default=datetime.min.replace(tzinfo=UTC))
        for text in texts
    }
    return [match(text.key, text) for text in sorted(texts, key=lambda t: latest[t.key], reverse=True)]


@router.get(
    "/v1/texts/search",
    summary="Find the site's texts",
    description="Texts whose key or words, in any language, hold the query; exact words first. For editors.",
    responses=problems(401, 403, 422),
)
def search_texts(
    caller: EditorDep,
    services: ServicesDep,
    q: Annotated[str, Query(min_length=1, max_length=200, description="Words the text says, or part of its key.")],
) -> list[SiteTextMatch]:
    texts = {text.key: text for text in services.site_texts.all()}
    return [match(key, texts.get(key)) for key in search(services.site_texts, q, SEARCHED)]


@router.get(
    "/v1/texts/{key}",
    summary="A text of the site",
    description="Its default, what is published and any draft. For editors.",
    responses=problems(401, 403, 404, 422),
)
def get_text(key: Key, caller: EditorDep, services: ServicesDep) -> SiteTextOut:
    return out(stored(services, defined(key)))


@router.put(
    "/v1/texts/{key}",
    summary="Change a text of the site",
    description=(
        "Saves the given languages: published at once, which drops the text's draft, or kept as a draft. A text must "
        "keep its default's placeholders, and a plural one both forms. The site shows a published text once rebuilt."
    ),
    responses=problems(401, 403, 404, 422),
)
def put_text(key: Key, change: TextChange, caller: EditorDep, services: ServicesDep) -> SiteTextOut:
    defined(key)
    raw = cast(dict[str, Any], change.model_dump(mode="json")["texts"])
    try:
        texts = checked(key, raw)
    except InvalidText as error:
        raise HTTPException(422, str(error)) from None
    text = saved(stored(services, key), texts, change.publish, datetime.now(UTC), author(caller))
    if change.publish:
        return keep(services, caller, text, "published", AuditAction.TEXT_PUBLISHED)
    return keep(services, caller, text, "draft", AuditAction.TEXT_DRAFTED)


@router.post(
    "/v1/texts/{key}/publish",
    summary="Publish a text's draft",
    responses=problems(401, 403, 404, 409, 422),
)
def publish_text(key: Key, caller: EditorDep, services: ServicesDep) -> SiteTextOut:
    text = stored(services, defined(key))
    if text.draft is None:
        raise HTTPException(409, "The text has no draft to publish.")
    published = saved(text, text.draft, True, datetime.now(UTC), author(caller))
    return keep(services, caller, published, "published", AuditAction.TEXT_PUBLISHED)


@router.delete(
    "/v1/texts/{key}/draft",
    summary="Discard a text's draft",
    responses=problems(401, 403, 404, 409, 422),
)
def discard_draft(key: Key, caller: EditorDep, services: ServicesDep) -> SiteTextOut:
    text = stored(services, defined(key))
    if text.draft is None:
        raise HTTPException(409, "The text has no draft to discard.")
    cleared = SiteText(text.key, text.published, None, text.updated_at, text.updated_by)
    return keep(services, caller, cleared, "draft", AuditAction.TEXT_DRAFT_DISCARDED)


@router.get(
    "/v1/texts/{key}/versions",
    summary="A text's changes",
    description="Newest first: each publish, draft and return to the defaults.",
    responses=problems(401, 403, 404, 422),
)
def list_versions(key: Key, caller: EditorDep, services: ServicesDep) -> list[TextVersionOut]:
    return [
        TextVersionOut.model_validate(
            {"id": v.id, "state": v.state, "texts": v.texts, "at": v.at, "by": author_out(v.by)}
        )
        for v in services.site_texts.versions(defined(key))
    ]


@router.post(
    "/v1/texts/{key}/restore",
    summary="Bring back a text's earlier version, or its defaults",
    description="Publishes what a version left, or goes back to the code's defaults; a draft stays as it is.",
    responses=problems(401, 403, 404, 422),
)
def restore_text(key: Key, restore: TextRestore, caller: EditorDep, services: ServicesDep) -> SiteTextOut:
    text = stored(services, defined(key))
    if restore.version is None:
        texts: Texts = {}
    else:
        version = next((v for v in services.site_texts.versions(key) if v.id == restore.version), None)
        if version is None:
            raise HTTPException(404, "The text has no such version.")
        texts = version.texts
    back = SiteText(
        key, edited(key, texts), text.draft, datetime.now(UTC), author(caller), text.draft_at, text.draft_by
    )
    return keep(services, caller, back, "published" if back.published else "default", AuditAction.TEXT_RESTORED)
