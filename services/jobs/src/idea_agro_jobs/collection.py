"""The collections task: keeps each indicator's public ImageCollection current, one image per composite.

The job writes only the collections named here, each image as an Earth Engine export of a composite the collection
lacks. Images are never rewritten: a run only adds what is missing.
"""

import logging
import re
import time
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Any, Protocol, cast

from idea_agro_jobs.domain import Indicator

log = logging.getLogger(__name__)

# The folder the owner of `pastizalesrou` shares with the job; it writes nothing outside it.
FOLDER = "projects/pastizalesrou/assets/idea-agro/"


@dataclass(frozen=True)
class Collection:
    indicator: Indicator
    # The ImageCollection the job writes, and the multiband image it replaces.
    asset: str
    current: str
    band: str
    period: str
    unit: str
    # The current asset's first composite.
    first: date
    # Differences within it count as equal when comparing.
    tolerance: float

    @property
    def properties(self) -> dict[str, str]:
        """What the collection and each of its images say about their values."""
        return {"period": self.period, "unit": self.unit}


COLLECTIONS = {
    Indicator.ET: Collection(
        Indicator.ET,
        asset=FOLDER + "et",
        current="projects/pastizalesrou/assets/et/et-8",
        band="et",
        period="8-day",
        unit="mm/day",
        first=date(2001, 1, 1),
        tolerance=0.01,
    ),
}

# Exports running at once, so that the project's other tasks keep their turn.
IN_FLIGHT = 4
# No export starts after this long into the task; the next run goes on.
BUDGET = timedelta(hours=3)
# Failed exports after which a run starts no more.
MAX_FAILURES = 3
# Seconds between two looks at the running exports.
POLL = 30


class CollectionError(Exception):
    """The collection cannot be written as it is: missing, private, or not shared with the job."""


def image_id(start: date) -> str:
    """The composite that starts on 2024-01-09 is the image `2024_01_09`, as MODIS names its own."""
    return start.strftime("%Y_%m_%d")


def image_asset(collection: Collection, start: date) -> str:
    return f"{collection.asset}/{image_id(start)}"


def task_name(collection: Collection, start: date) -> str:
    """The export's name in Earth Engine's tasks: `idea-agro-et-2024_01_09`."""
    return f"idea-agro-{collection.indicator}-{image_id(start)}"


class ExportStatus(StrEnum):
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class ExportState:
    status: ExportStatus
    error: str | None = None
    # The Earth Engine compute the export used.
    eecu_seconds: float = 0.0


def operation_state(operation: Mapping[str, Any]) -> ExportState:
    """An export's state, from its Earth Engine operation."""
    metadata = cast(dict[str, Any], operation.get("metadata") or {})
    eecu = float(metadata.get("batchEecuUsageSeconds") or 0.0)
    if not operation.get("done"):
        return ExportState(ExportStatus.RUNNING, eecu_seconds=eecu)
    if metadata.get("state") == "CANCELLED":
        return ExportState(ExportStatus.CANCELLED, eecu_seconds=eecu)
    if "error" in operation:
        error = cast(dict[str, Any], operation["error"])
        return ExportState(ExportStatus.FAILED, str(error.get("message") or error), eecu)
    return ExportState(ExportStatus.SUCCEEDED, eecu_seconds=eecu)


def operation_composite(operation: Mapping[str, Any], collection: Collection) -> date | None:
    """The composite an export of the collection is still writing, or None for any other operation."""
    metadata = cast(dict[str, Any], operation.get("metadata") or {})
    pattern = rf"idea-agro-{collection.indicator}-(\d{{4}}_\d{{2}}_\d{{2}})"
    found = re.fullmatch(pattern, str(metadata.get("description", "")))
    if found is None or operation.get("done"):
        return None
    return datetime.strptime(found[1], "%Y_%m_%d").date()


@dataclass(frozen=True)
class StoredImage:
    # The asset's full name, `projects/<project>/assets/<path>`, which Earth Engine takes as its identity.
    name: str
    start: date | None
    properties: frozenset[str]


def stored_image(asset: Mapping[str, Any]) -> StoredImage:
    """An image of a collection, from Earth Engine's listing, whose `id` is only for display."""
    start = cast(str | None, asset.get("startTime"))
    properties = cast(dict[str, Any], asset.get("properties") or {})
    return StoredImage(
        name=str(asset["name"]),
        start=date.fromisoformat(start[:10]) if start else None,
        properties=frozenset(properties),
    )


def is_public(policy: Mapping[str, Any]) -> bool:
    """Whether an asset's IAM policy lets anyone read it."""
    bindings = cast(list[dict[str, Any]], policy.get("bindings") or [])
    return any("allUsers" in binding.get("members", []) for binding in bindings)


class Archive(Protocol):
    def check_collection(self, collection: Collection) -> None:
        """Raises `CollectionError`, saying why, unless the collection exists, anyone reads it and the job writes it."""
        ...

    def collection_images(self, asset: str) -> list[StoredImage]: ...

    def running_exports(self, collection: Collection) -> list[date]:
        """The composites that exports to the collection are still writing."""
        ...

    def published(self, collection: Collection, since: date, until: date) -> list[date]:
        """The starts of the composites the collection's source published from `since` to `until`, in order."""
        ...

    def start_export(self, collection: Collection, start: date) -> str:
        """Starts the export of a composite to the collection, and returns its operation's name."""
        ...

    def export_state(self, operation: str) -> ExportState: ...


def missing(
    collection: Collection, published: Iterable[date], images: Iterable[StoredImage], running: Iterable[date]
) -> list[date]:
    """The published composites that the collection lacks and no export is writing."""
    held = {image.name for image in images}
    writing = set(running)
    return [start for start in published if image_asset(collection, start) not in held and start not in writing]


def incomplete(collection: Collection, images: Iterable[StoredImage]) -> list[str]:
    """The images that lack their start or the collection's properties."""
    expected = set(collection.properties)
    return [image.name for image in images if image.start is None or not expected <= image.properties]


def refresh(
    archive: Archive,
    collections: Iterable[Collection],
    since: date | None = None,
    until: date | None = None,
    today: date | None = None,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Adds to each collection the composites it lacks, from `since` to `until` (by default, all of them)."""
    deadline = clock() + BUDGET.total_seconds()
    for collection in collections:
        archive.check_collection(collection)
        first = max(since or collection.first, collection.first)
        last = until or today or date.today()
        images = archive.collection_images(collection.asset)
        # An error alerts by email (the jobs README says how).
        if found := incomplete(collection, images):
            log.error("%s: %d images lack their start or properties: %s", collection.indicator, len(found), found[:5])
        running = archive.running_exports(collection)
        if running:
            log.info("%s: %d exports of an earlier run still running", collection.indicator, len(running))
        lacking = missing(collection, archive.published(collection, first, last), images, running)
        if not lacking:
            log.info("%s: nothing to add from %s to %s", collection.indicator, first, last)
            continue
        log.info("%s: %d composites to add, from %s to %s", collection.indicator, len(lacking), lacking[0], lacking[-1])
        _export(archive, collection, lacking, deadline, clock, sleep)


def _export(
    archive: Archive,
    collection: Collection,
    lacking: list[date],
    deadline: float,
    clock: Callable[[], float],
    sleep: Callable[[float], None],
) -> None:
    waiting = list(lacking)
    running: dict[str, date] = {}
    added: list[date] = []
    failures = 0
    eecu_seconds = 0.0
    while waiting or running:
        while waiting and len(running) < IN_FLIGHT and failures < MAX_FAILURES and clock() < deadline:
            start = waiting.pop(0)
            running[archive.start_export(collection, start)] = start
        if not running:
            break
        sleep(POLL)
        for operation, start in list(running.items()):
            state = archive.export_state(operation)
            if state.status is ExportStatus.RUNNING:
                continue
            del running[operation]
            eecu_seconds += state.eecu_seconds
            if state.status is ExportStatus.SUCCEEDED:
                added.append(start)
                log.info("%s %s: added, %.0f EECU-seconds", collection.indicator, start, state.eecu_seconds)
            elif state.status is ExportStatus.CANCELLED:
                log.warning("%s %s: export cancelled; the next run adds it", collection.indicator, start)
            else:
                failures += 1
                log.error("%s %s: export failed: %s", collection.indicator, start, state.error)
    if waiting and failures >= MAX_FAILURES:
        log.error("%s: stopped after %d failed exports", collection.indicator, failures)
    log.info(
        "%s: %d composites added%s, %.2f EECU-hours; %d left for the next run",
        collection.indicator,
        len(added),
        f" ({added[0]} to {added[-1]})" if added else "",
        eecu_seconds / 3600,
        len(waiting),
    )
