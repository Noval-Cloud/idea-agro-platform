from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from idea_agro_api.models import Health

router = APIRouter()


@router.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse("/docs")


@router.get("/health", tags=["Service"], summary="Whether the service answers")
def get_health() -> Health:
    return Health(status="ok")
