"""Which indicators the site and the public API show: read by anyone, switched by editors."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Response
from fastapi import Path as PathParam

from idea_agro_api.audit import AuditAction
from idea_agro_api.deps import EditorDep, ServicesDep
from idea_agro_api.errors import problems
from idea_agro_api.indicator_visibility import Visibility
from idea_agro_api.models import IndicatorVisibilityOut, ShownIndicators, TextAuthor, VisibilityChange
from idea_agro_api.public_data import Indicator
from idea_agro_api.routes.articles import changed
from idea_agro_api.routes.texts import author
from idea_agro_api.services import Services

router = APIRouter(tags=["Indicators"])

IndicatorParam = Annotated[Indicator, PathParam(description="The indicator.")]
# The site reads them when it is built; a minute keeps a rebuild from serving what an editor just switched.
CACHE_CONTROL = "public, max-age=60"


def out(services: Services, indicator: Indicator) -> IndicatorVisibilityOut:
    found = services.visibility.all().get(indicator) or Visibility(indicator, True)
    by = found.updated_by
    return IndicatorVisibilityOut(
        indicator=indicator,
        shown=found.shown,
        updated_at=found.updated_at,
        updated_by=TextAuthor(id=by.id, name=by.name) if by else None,
    )


@router.get(
    "/v1/indicators",
    summary="The indicators shown",
    description=(
        "The indicators the site and the public API show, in the site's order. An indicator editors hide while its "
        "data is reviewed is left out. The website reads it when it is built. Cacheable for a minute."
    ),
)
def list_shown_indicators(services: ServicesDep, response: Response) -> ShownIndicators:
    response.headers["Cache-Control"] = CACHE_CONTROL
    hidden = services.visibility.hidden()
    return ShownIndicators(indicators=[i for i in Indicator if i not in hidden])


@router.get(
    "/v1/indicators/visibility",
    summary="Whether each indicator is shown",
    description="Every indicator, hidden ones too, with who last showed or hid it. For editors.",
    responses=problems(401, 403),
)
def list_visibility(caller: EditorDep, services: ServicesDep) -> list[IndicatorVisibilityOut]:
    return [out(services, indicator) for indicator in Indicator]


@router.put(
    "/v1/indicators/{indicator}/visibility",
    summary="Show or hide an indicator",
    description=(
        "A hidden indicator is left out of the site once it is rebuilt, and of every list of the public API; its "
        "own routes answer 404 as temporarily unavailable. Its data keeps being computed. For editors."
    ),
    responses=problems(401, 403, 422),
)
def put_visibility(
    indicator: IndicatorParam, change: VisibilityChange, caller: EditorDep, services: ServicesDep
) -> IndicatorVisibilityOut:
    if out(services, indicator).shown == change.shown:
        return out(services, indicator)
    services.visibility.put(Visibility(indicator, change.shown, datetime.now(UTC), author(caller)))
    changed(services, caller, AuditAction.INDICATOR_SHOWN if change.shown else AuditAction.INDICATOR_HIDDEN, indicator)
    return out(services, indicator)
