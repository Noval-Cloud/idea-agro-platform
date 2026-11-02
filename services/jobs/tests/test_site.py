from datetime import UTC, datetime, timedelta

from idea_agro_jobs import site
from idea_agro_jobs.site import Rebuild

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)


class State:
    def __init__(self, published_at: datetime | None, started_at: datetime | None = None) -> None:
        self.found = Rebuild(published_at, started_at)
        self.starts: list[datetime] = []

    def read(self) -> Rebuild:
        return self.found

    def started(self, at: datetime) -> None:
        self.starts.append(at)


class Builds:
    def __init__(self) -> None:
        self.asked = 0

    def start(self) -> None:
        self.asked += 1


def run(state: State) -> Builds:
    builds = Builds()
    site.refresh(state, builds, NOW)
    return builds


def test_a_build_waits_until_texts_settle() -> None:
    assert run(State(NOW - timedelta(minutes=2))).asked == 0
    state = State(NOW - timedelta(minutes=6))
    assert run(state).asked == 1
    assert state.starts == [NOW]


def test_a_build_already_asked_for_is_not_asked_again() -> None:
    assert run(State(NOW - timedelta(minutes=20), started_at=NOW - timedelta(minutes=10))).asked == 0
    assert run(State(NOW - timedelta(minutes=10), started_at=NOW - timedelta(minutes=20))).asked == 1


def test_nothing_published_builds_nothing() -> None:
    assert run(State(None)).asked == 0
