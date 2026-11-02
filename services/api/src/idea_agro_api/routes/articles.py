"""The scientific articles behind the indicators: published for anyone, kept by editors."""

from dataclasses import replace
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, File, Response, UploadFile
from fastapi import Path as PathParam
from starlette.exceptions import HTTPException

from idea_agro_api.articles import Article, new_article_id, pdf_name, seed
from idea_agro_api.audit import AuditAction, AuditEntry
from idea_agro_api.deps import Caller, EditorDep, ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.models import ArticleIn, ArticleOut, ArticlePublic, Citations, PublishedArticles, TextAuthor
from idea_agro_api.public_data import Indicator
from idea_agro_api.routes.texts import author
from idea_agro_api.services import Services

router = APIRouter(tags=["Articles"])

ArticleId = Annotated[str, PathParam(pattern=r"^[a-z0-9]{1,60}$", description="The article's id.")]
IndicatorParam = Annotated[Indicator, PathParam(description="The indicator.")]
# The site reads them when it is built; a minute keeps a rebuild from serving what an editor just replaced.
CACHE_CONTROL = "public, max-age=60"
PDF: dict[int | str, dict[str, object]] = {200: {"description": "The PDF.", "content": {"application/pdf": {}}}}


def public(article: Article) -> ArticlePublic:
    return ArticlePublic(
        id=article.id,
        authors=article.authors,
        year=article.year,
        title=article.title,
        lang=article.lang,
        source=article.source,
        doi=article.doi,
        url=article.url,
        pdf=article.pdf,
        framework=article.framework,
    )


def out(article: Article) -> ArticleOut:
    by = article.updated_by
    return ArticleOut(
        **public(article).model_dump(),
        updated_at=article.updated_at,
        updated_by=TextAuthor(id=by.id, name=by.name) if by else None,
    )


def found(services: Services, id: str) -> Article:
    article = services.articles.get(id)
    if article is None:
        raise HTTPException(404, "There is no such article.")
    return article


def changed(services: Services, caller: Caller, action: AuditAction, target: str, detail: str = "") -> None:
    """The audit entry, and the site behind until it rebuilds."""
    at = datetime.now(UTC)
    actor = caller.account
    services.audit.record(AuditEntry(at, actor.id, actor.display_name, action, target, "", detail))
    services.site_rebuild.published(at)


def published(services: Services) -> PublishedArticles:
    articles = sorted(services.articles.all(), key=lambda a: (-a.year, a.authors))
    return PublishedArticles(articles=[public(a) for a in articles], citations=services.articles.citations())


@router.get(
    "/v1/articles",
    summary="The articles behind the indicators",
    description="Every article, newest first, and which each indicator cites. Cacheable for a minute.",
)
def list_articles(services: ServicesDep, response: Response) -> PublishedArticles:
    response.headers["Cache-Control"] = CACHE_CONTROL
    return published(services)


@router.post(
    "/v1/articles/seed",
    summary="Load the articles the site had",
    description="Loads, once, the articles and citations the website's code had; refused once there are any.",
    responses=problems(401, 403, 409),
)
def seed_articles(caller: EditorDep, services: ServicesDep) -> PublishedArticles:
    if services.articles.all() or services.articles.citations():
        raise HTTPException(409, "There are articles already.")
    articles, citations = seed()
    now, by = datetime.now(UTC), author(caller)
    for article in articles:
        services.articles.put(replace(article, updated_at=now, updated_by=by))
    for indicator, ids in citations.items():
        services.articles.cite(indicator, ids)
    changed(services, caller, AuditAction.ARTICLES_SEEDED, "articles", str(len(articles)))
    return published(services)


@router.post(
    "/v1/articles",
    status_code=201,
    summary="Add an article",
    description="Its id comes from the first author's surname and the year. For editors.",
    responses=problems(401, 403, 422),
)
def add_article(article: ArticleIn, caller: EditorDep, services: ServicesDep) -> ArticleOut:
    taken = {a.id for a in services.articles.all()}
    new = Article(
        id=new_article_id(article.authors, article.year, taken),
        **article.model_dump(),
        updated_at=datetime.now(UTC),
        updated_by=author(caller),
    )
    services.articles.put(new)
    changed(services, caller, AuditAction.ARTICLE_SAVED, new.id)
    return out(new)


@router.get(
    "/v1/articles/{article_id}",
    summary="An article",
    description="With who changed it last. For editors.",
    responses=problems(401, 403, 404, 422),
)
def get_article(article_id: ArticleId, caller: EditorDep, services: ServicesDep) -> ArticleOut:
    return out(found(services, article_id))


@router.put(
    "/v1/articles/{article_id}",
    summary="Change an article",
    responses=problems(401, 403, 404, 422),
)
def put_article(article_id: ArticleId, article: ArticleIn, caller: EditorDep, services: ServicesDep) -> ArticleOut:
    current = found(services, article_id)
    updated = replace(current, **article.model_dump(), updated_at=datetime.now(UTC), updated_by=author(caller))
    services.articles.put(updated)
    changed(services, caller, AuditAction.ARTICLE_SAVED, article_id)
    return out(updated)


@router.delete(
    "/v1/articles/{article_id}",
    status_code=204,
    summary="Remove an article",
    description="Also from every indicator that cites it, with its PDF. For editors.",
    responses=problems(401, 403, 404, 422),
)
def delete_article(article_id: ArticleId, caller: EditorDep, services: ServicesDep) -> Response:
    article = found(services, article_id)
    for indicator, ids in services.articles.citations().items():
        if article_id in ids:
            services.articles.cite(indicator, [i for i in ids if i != article_id])
    services.articles.delete(article_id)
    if article.pdf:
        services.document_files.delete(pdf_name(article_id))
    changed(services, caller, AuditAction.ARTICLE_DELETED, article_id)
    return Response(status_code=204)


@router.get(
    "/v1/articles/{article_id}/pdf",
    summary="An article's PDF",
    response_class=Response,
    responses=PDF | problems(404, 422),
)
def get_article_pdf(article_id: ArticleId, services: ServicesDep) -> Response:
    article = found(services, article_id)
    content = services.document_files.get(pdf_name(article_id)) if article.pdf else None
    if content is None:
        raise HTTPException(404, "The article has no PDF.")
    return Response(
        content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{article_id}.pdf"', "Cache-Control": CACHE_CONTROL},
    )


@router.put(
    "/v1/articles/{article_id}/pdf",
    summary="Attach an article's PDF",
    description="Replaces any PDF it had; up to `DOCUMENT_MAX_BYTES` (10 MB). For editors.",
    responses=problems(401, 403, 404, 413, 415, 422),
)
def put_article_pdf(
    article_id: ArticleId,
    file: Annotated[UploadFile, File(description="The PDF.")],
    caller: EditorDep,
    services: ServicesDep,
) -> ArticleOut:
    article = found(services, article_id)
    limit = services.limits.document_bytes
    content = file.file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, f"A PDF takes at most {limit} bytes.")
    if not content.startswith(b"%PDF"):
        raise HTTPException(415, "Attach a PDF.")
    services.document_files.put(pdf_name(article_id), content, "application/pdf")
    updated = replace(article, pdf=True, updated_at=datetime.now(UTC), updated_by=author(caller))
    services.articles.put(updated)
    changed(services, caller, AuditAction.ARTICLE_SAVED, article_id, "pdf")
    return out(updated)


@router.delete(
    "/v1/articles/{article_id}/pdf",
    summary="Remove an article's PDF",
    responses=problems(401, 403, 404, 422),
)
def delete_article_pdf(article_id: ArticleId, caller: EditorDep, services: ServicesDep) -> ArticleOut:
    article = found(services, article_id)
    services.document_files.delete(pdf_name(article_id))
    updated = replace(article, pdf=False, updated_at=datetime.now(UTC), updated_by=author(caller))
    services.articles.put(updated)
    changed(services, caller, AuditAction.ARTICLE_SAVED, article_id, "pdf")
    return out(updated)


@router.put(
    "/v1/indicators/{indicator}/articles",
    summary="Choose the articles an indicator cites",
    description="In the order the site lists them. For editors.",
    responses=problems(401, 403, 422),
)
def cite_articles(
    indicator: IndicatorParam, citations: Citations, caller: EditorDep, services: ServicesDep
) -> Citations:
    known = {a.id for a in services.articles.all()}
    unknown = [i for i in citations.articles if i not in known]
    if unknown:
        raise HTTPException(422, f"There are no such articles: {', '.join(unknown)}.")
    ids = list(dict.fromkeys(citations.articles))
    services.articles.cite(indicator, ids)
    changed(services, caller, AuditAction.CITATIONS_CHANGED, indicator, ", ".join(ids))
    return Citations(articles=ids)
