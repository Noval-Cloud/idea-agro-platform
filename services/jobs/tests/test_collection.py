import logging
from datetime import date, timedelta

import pytest
from idea_agro_jobs.collection import (
    BUDGET,
    COLLECTIONS,
    FOLDER,
    IN_FLIGHT,
    MAX_FAILURES,
    POLL,
    Collection,
    CollectionError,
    ExportState,
    ExportStatus,
    StoredImage,
    image_asset,
    image_id,
    incomplete,
    is_public,
    missing,
    operation_composite,
    operation_state,
    refresh,
    stored_image,
    task_name,
)
from idea_agro_jobs.domain import Indicator

ET = COLLECTIONS[Indicator.ET]
PROPERTIES = frozenset({"period", "unit"})


def eight_days(first: date, count: int) -> list[date]:
    return [first + timedelta(days=8 * n) for n in range(count)]


class Clock:
    """Time that passes only while the task sleeps."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


class FakeArchive:
    """Each export runs for `polls` looks, then succeeds unless its composite is in `failing`."""

    def __init__(
        self,
        published: list[date],
        held: list[date] | None = None,
        running: list[date] | None = None,
        failing: set[date] | None = None,
        polls: int = 1,
        check: CollectionError | None = None,
    ) -> None:
        self.all_published = published
        self.held = held or []
        self.running = running or []
        self.failing = failing or set()
        self.polls = polls
        self.check = check
        self.started: list[date] = []
        self.looks: dict[str, int] = {}
        self.most_at_once = 0
        self.asked: tuple[date, date] | None = None

    def check_collection(self, collection: Collection) -> None:
        if self.check:
            raise self.check

    def collection_images(self, asset: str) -> list[StoredImage]:
        return [StoredImage(f"{asset}/{image_id(start)}", start, PROPERTIES) for start in self.held]

    def running_exports(self, collection: Collection) -> list[date]:
        return self.running

    def published(self, collection: Collection, since: date, until: date) -> list[date]:
        self.asked = (since, until)
        return [start for start in self.all_published if since <= start <= until]

    def start_export(self, collection: Collection, start: date) -> str:
        self.started.append(start)
        operation = f"operations/{image_id(start)}"
        self.looks[operation] = 0
        self.most_at_once = max(self.most_at_once, sum(1 for n in self.looks.values() if n < self.polls))
        return operation

    def export_state(self, operation: str) -> ExportState:
        self.looks[operation] += 1
        if self.looks[operation] < self.polls:
            return ExportState(ExportStatus.RUNNING)
        start = self.started[[f"operations/{image_id(s)}" for s in self.started].index(operation)]
        if start in self.failing:
            return ExportState(ExportStatus.FAILED, "Asset not found or permission denied", 3.0)
        return ExportState(ExportStatus.SUCCEEDED, eecu_seconds=60.0)


def run(archive: FakeArchive, clock: Clock | None = None, **options: date) -> None:
    clock = clock or Clock()
    refresh(archive, [ET], today=date(2024, 12, 31), clock=clock, sleep=clock.sleep, **options)


def test_the_job_writes_only_in_the_folder_it_is_given() -> None:
    assert all(found.asset.startswith(FOLDER) for found in COLLECTIONS.values())
    assert image_asset(ET, date(2024, 1, 9)) == "projects/pastizalesrou/assets/idea-agro/et/2024_01_09"
    assert task_name(ET, date(2024, 1, 9)) == "idea-agro-et-2024_01_09"
    assert ET.properties == {"period": "8-day", "unit": "mm/day"}


def test_nothing_new_starts_no_export(caplog: pytest.LogCaptureFixture) -> None:
    published = eight_days(date(2024, 1, 1), 46)
    archive = FakeArchive(published, held=published)
    clock = Clock()

    with caplog.at_level(logging.INFO):
        run(archive, clock)

    assert archive.started == []
    assert clock.now == 0
    assert "et: nothing to add" in caplog.text


def test_only_the_composites_the_collection_lacks_are_exported(caplog: pytest.LogCaptureFixture) -> None:
    published = eight_days(date(2024, 1, 1), 6)
    archive = FakeArchive(published, held=published[:2], running=[published[2]])

    with caplog.at_level(logging.INFO):
        run(archive)

    assert archive.started == published[3:]
    assert "et 2024-02-02: added" in caplog.text
    assert "et: 3 composites added (2024-01-25 to 2024-02-10), 0.05 EECU-hours; 0 left" in caplog.text


def test_running_it_again_adds_nothing() -> None:
    published = eight_days(date(2024, 1, 1), 5)
    archive = FakeArchive(published)
    run(archive)

    again = FakeArchive(published, held=archive.started)
    run(again)

    assert again.started == []


def test_a_date_range_limits_the_composites_from_the_first_one() -> None:
    archive = FakeArchive(eight_days(date(2023, 12, 27), 50))

    run(archive, since=date(2024, 1, 1), until=date(2024, 12, 31))

    assert archive.asked == (date(2024, 1, 1), date(2024, 12, 31))
    assert archive.started[0] == date(2024, 1, 4)
    assert all(start.year == 2024 for start in archive.started)

    whole = FakeArchive([])
    run(whole, since=date(1990, 1, 1))
    assert whole.asked == (ET.first, date(2024, 12, 31))


def test_a_few_exports_run_at_once() -> None:
    archive = FakeArchive(eight_days(date(2024, 1, 1), 20), polls=3)

    run(archive)

    assert len(archive.started) == 20
    assert archive.most_at_once == IN_FLIGHT


def test_no_export_starts_once_the_time_is_spent(caplog: pytest.LogCaptureFixture) -> None:
    # The first exports outlast the time a run has to start them.
    archive = FakeArchive(eight_days(date(2024, 1, 1), 20), polls=int(BUDGET.total_seconds() / POLL) + 1)

    with caplog.at_level(logging.INFO):
        run(archive)

    # The first four start, and only those, which the run waits for.
    assert len(archive.started) == IN_FLIGHT
    assert "et: 4 composites added (2024-01-01 to 2024-01-25), 0.07 EECU-hours; 16 left for the next run" in caplog.text


def test_failed_exports_alert_and_stop_the_run(caplog: pytest.LogCaptureFixture) -> None:
    published = eight_days(date(2024, 1, 1), 10)
    archive = FakeArchive(published, failing=set(published[:3]))

    run(archive)

    errors = [record.getMessage() for record in caplog.records if record.levelno == logging.ERROR]
    assert errors[0] == "et 2024-01-01: export failed: Asset not found or permission denied"
    assert errors[-1] == f"et: stopped after {MAX_FAILURES} failed exports"
    # The first four were started together; the fourth succeeds, and none starts after the third failure.
    assert archive.started == published[:IN_FLIGHT]


def test_a_collection_the_job_cannot_write_stops_the_run_before_anything() -> None:
    archive = FakeArchive(eight_days(date(2024, 1, 1), 3), check=CollectionError("must be shared"))

    with pytest.raises(CollectionError, match="must be shared"):
        run(archive)

    assert archive.asked is None
    assert archive.started == []


def test_images_without_their_start_or_properties_alert(caplog: pytest.LogCaptureFixture) -> None:
    images = [
        StoredImage("a", date(2024, 1, 1), PROPERTIES),
        StoredImage("b", None, PROPERTIES),
        StoredImage("c", date(2024, 1, 17), frozenset({"unit"})),
    ]

    assert incomplete(ET, images) == ["b", "c"]


def test_an_operation_tells_its_state() -> None:
    assert operation_state({"metadata": {"state": "RUNNING"}}).status is ExportStatus.RUNNING
    done = operation_state({"done": True, "metadata": {"state": "SUCCEEDED", "batchEecuUsageSeconds": 42.5}})
    assert done == ExportState(ExportStatus.SUCCEEDED, eecu_seconds=42.5)
    failed = {"done": True, "metadata": {"state": "FAILED"}, "error": {"code": 3, "message": "Too many pixels"}}
    assert operation_state(failed) == ExportState(ExportStatus.FAILED, "Too many pixels")
    cancelled = {"done": True, "metadata": {"state": "CANCELLED"}, "error": {"code": 1, "message": "Cancelled"}}
    assert operation_state(cancelled).status is ExportStatus.CANCELLED


def test_only_running_exports_of_the_collection_count_as_written() -> None:
    def operation(description: str, done: bool = False) -> dict[str, object]:
        return {"name": "projects/pastizales-uy/operations/X", "done": done, "metadata": {"description": description}}

    assert operation_composite(operation("idea-agro-et-2024_01_09"), ET) == date(2024, 1, 9)
    assert operation_composite(operation("idea-agro-et-2024_01_09", done=True), ET) is None
    assert operation_composite(operation("idea-agro-ppna-2024_01_09"), ET) is None
    assert operation_composite(operation("ET-8"), ET) is None


def test_images_are_known_by_their_name_not_their_display_id() -> None:
    # As Earth Engine lists them: `id` is `name` without `projects/*/assets/`, for display only.
    listed = {
        "type": "IMAGE",
        "name": "projects/pastizalesrou/assets/idea-agro/et/2024_01_09",
        "id": "idea-agro/et/2024_01_09",
        "updateTime": "2026-11-06T10:41:07.115Z",
        "startTime": "2024-01-09T00:00:00Z",
        "endTime": "2024-01-17T00:00:00Z",
        "sizeBytes": "5320000",
        "properties": {"period": "8-day", "unit": "mm/day"},
    }
    bare = {"type": "IMAGE", "name": "projects/pastizalesrou/assets/idea-agro/et/x", "id": "idea-agro/et/x"}

    image = stored_image(listed)

    assert image == StoredImage(image_asset(ET, date(2024, 1, 9)), date(2024, 1, 9), PROPERTIES)
    assert missing(ET, [date(2024, 1, 9), date(2024, 1, 17)], [image], []) == [date(2024, 1, 17)]
    assert stored_image(bare) == StoredImage(bare["name"], None, frozenset())


def test_a_collection_is_public_when_all_users_read_it() -> None:
    owners = {"role": "roles/owner", "members": ["user:owner@example.org"]}
    writers = {"role": "roles/editor", "members": ["serviceAccount:data-jobs@idea-agro-dev.iam.gserviceaccount.com"]}

    assert is_public({"bindings": [owners, writers, {"role": "roles/viewer", "members": ["allUsers"]}]})
    assert not is_public({"bindings": [owners, writers]})
    assert not is_public({})
