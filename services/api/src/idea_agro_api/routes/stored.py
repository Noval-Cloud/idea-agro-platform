from fastapi import Response
from starlette.exceptions import HTTPException

from idea_agro_api.errors import IndicatorTemporarilyUnavailable
from idea_agro_api.services import Services

JSON_SECONDS = 3600
IMAGE_SECONDS = 86400
# While an indicator is hidden, the catalog and the series are kept briefly, so it returns soon after it is shown.
LIST_SECONDS = 60


# How a client tells a hidden indicator from what does not exist.
UNAVAILABLE = (
    "Not published, or the indicator is hidden while its data is reviewed: then the problem's type is "
    "`urn:idea-agro:problem:indicator-temporarily-unavailable`, and the answer is not to be kept."
)


def list_seconds(services: Services) -> int:
    return LIST_SECONDS if services.visibility.hidden() else JSON_SECONDS


def available(services: Services, indicator: str) -> None:
    """A hidden indicator's own routes answer that it is temporarily unavailable."""
    if indicator in services.visibility.hidden():
        raise IndicatorTemporarilyUnavailable(indicator)


def stored(services: Services, name: str, media_type: str, missing: str, seconds: int = JSON_SECONDS) -> Response:
    """A public file as it is stored, cacheable for `seconds`."""
    content = services.public_data.read(name)
    if content is None:
        raise HTTPException(404, missing)
    return Response(content, media_type=media_type, headers={"Cache-Control": f"public, max-age={seconds}"})


def documented(
    model: type, description: str, media_type: str = "application/json"
) -> dict[int | str, dict[str, object]]:
    """The 200 answer of a route that serves a stored file, described with the model of what it holds."""
    return {200: {"model": model, "description": description, "content": {media_type: {}}}}
