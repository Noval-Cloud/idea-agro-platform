from datetime import date

from idea_agro_jobs.domain import Division, Indicator, Period, Table, ZoneValues
from idea_agro_jobs.store import Stored

ZONES = ("1", "2")


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[tuple[Table, Division, Indicator], ZoneValues] = {}

    def stored(self, table: Table) -> Stored:
        return {
            (division, indicator): {period for periods in values.values() for period in periods}
            for (t, division, indicator), values in self.rows.items()
            if t == table
        }

    def add(self, table: Table, division: Division, indicator: Indicator, values: ZoneValues) -> None:
        kept = self.rows.setdefault((table, division, indicator), {})
        for zone, periods in values.items():
            kept.setdefault(zone, {}).update(periods)

    def read(self, table: Table, division: Division, indicator: Indicator) -> ZoneValues:
        return self.rows.get((table, division, indicator), {})


class FakeSource:
    """Every zone's value is the period's position, so tests can tell which periods were computed."""

    def __init__(self, starts: list[date], years: list[int]) -> None:
        self.starts = starts
        self.complete_years = years
        self.computed: list[tuple[str, Division, Indicator, list[Period]]] = []

    def composites(self, indicator: Indicator) -> list[date]:
        return self.starts

    def years(self, indicator: Indicator) -> list[int]:
        return self.complete_years

    def composite_values(self, division: Division, indicator: Indicator, starts: list[date]) -> ZoneValues:
        self.computed.append(("composites", division, indicator, list[Period](starts)))
        return {zone: {start: float(self.starts.index(start)) for start in starts} for zone in ZONES}

    def year_values(self, division: Division, indicator: Indicator, years: list[int]) -> ZoneValues:
        self.computed.append(("years", division, indicator, list[Period](years)))
        return {zone: {year: float(year) for year in years} for zone in ZONES}

    def summary(self, division: Division, indicator: Indicator) -> ZoneValues:
        self.computed.append(("summary", division, indicator, []))
        if indicator == Indicator.COMPN:
            return {zone: {"3": 10.0, "5": 2.0} for zone in ZONES}
        return {zone: {"mean": 1.0, "p25": 0.5, "p75": 1.5} for zone in ZONES}
