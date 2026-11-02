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
    SiteRebuildOut,
    SiteTextMatch,
    SiteTextOut,
    TextAuthor,
    TextChange,
    TextRestore,
    TextVersionOut,
)
from idea_agro_api.services import Services
from idea_agro_api.site_rebuild import RebuildUnavailable
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
SEARCHED = 50
# Minutes without a publish after which the data job asks for the website's build (its `site` task's `QUIET`).
QUIET_MINUTES = 5
# The site reads them when it is built; a minute keeps a rebuild from serving what an editor just replaced.
CACHE_CONTROL = "public, max-age=60"


def defined(key: str) -> str:
    if key not in definitions():
        raise HTTPException(404, "The site has no such text.")
    return key


def valid(key: str, texts: Texts) -> Texts:
    """Texts saved earlier, checked again: the code's default may have changed its placeholders since."""
    try:
        return checked(key, dict(texts))
    except InvalidText as error:
        raise HTTPException(422, str(error)) from None


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
    if state in ("published", "default"):
        services.site_rebuild.published(at)
    left = (text.draft or {}) if state in ("draft", "discarded") else text.published
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


def rebuild_out(services: Services) -> SiteRebuildOut:
    found = services.site_rebuild.read()
    return SiteRebuildOut(published_at=found.published_at, started_at=found.started_at, quiet_minutes=QUIET_MINUTES)


@router.get(
    "/v1/texts/rebuild",
    summary="Whether the site shows the published texts",
    description=(
        "When a text was last published and when the website's latest build was asked for. The build is asked for "
        "by itself once no text has been published for `quiet_minutes`. For editors."
    ),
    responses=problems(401, 403),
)
def get_rebuild(caller: EditorDep, services: ServicesDep) -> SiteRebuildOut:
    return rebuild_out(services)


@router.post(
    "/v1/texts/rebuild",
    summary="Update the site now",
    description="Asks for the website's build at once, with every text published so far. For editors.",
    responses=problems(401, 403, 503),
)
def start_rebuild(caller: EditorDep, services: ServicesDep) -> SiteRebuildOut:
    try:
        services.site_rebuild.start(datetime.now(UTC))
    except RebuildUnavailable as error:
        raise HTTPException(503, str(error)) from None
    return rebuild_out(services)


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
    matches: list[SiteTextMatch] = []
    for key in search(services.site_texts, q, SEARCHED):
        text = texts.get(key)
        matches.append(
            SiteTextMatch.model_validate(
                {
                    "key": key,
                    "format": definitions()[key].format,
                    "current": current(key, text),
                    "edited": bool(text and text.published),
                    "draft": bool(text and text.draft is not None),
                }
            )
        )
    return matches


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
    published = saved(text, valid(key, text.draft), True, datetime.now(UTC), author(caller))
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
    return keep(services, caller, cleared, "discarded", AuditAction.TEXT_DRAFT_DISCARDED)


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
    description=(
        "Publishes what a published version left, or goes back to the code's defaults; a draft stays as it is. A "
        "draft's version does not come back: it was never what the site showed."
    ),
    responses=problems(401, 403, 404, 409, 422),
)
def restore_text(key: Key, restore: TextRestore, caller: EditorDep, services: ServicesDep) -> SiteTextOut:
    text = stored(services, defined(key))
    if restore.version is None:
        texts: Texts = {}
    else:
        version = next((v for v in services.site_texts.versions(key) if v.id == restore.version), None)
        if version is None:
            raise HTTPException(404, "The text has no such version.")
        if version.state in ("draft", "discarded"):
            raise HTTPException(409, "Only a published version, or the defaults, comes back.")
        texts = valid(key, version.texts)
    back = SiteText(
        key, edited(key, texts), text.draft, datetime.now(UTC), author(caller), text.draft_at, text.draft_by
    )
    return keep(services, caller, back, "published" if back.published else "default", AuditAction.TEXT_RESTORED)
