"""Where the zones' values are kept: BigQuery, one row per zone, indicator and period."""

from datetime import UTC, date, datetime
from typing import Any, Protocol, cast
from uuid import uuid4

from google.cloud import bigquery

from idea_agro_jobs.domain import Division, Indicator, Period, Table, ZoneValues

# The column that names a row's period in each table.
PERIOD = {Table.COMPOSITES: "start", Table.YEARS: "year", Table.SUMMARIES: "statistic"}

type Stored = dict[tuple[Division, Indicator], set[Period]]


class ValueStore(Protocol):
    def stored(self, table: Table) -> Stored:
        """The periods each division and indicator already has."""
        ...

    def add(self, table: Table, division: Division, indicator: Indicator, values: ZoneValues) -> None:
        """Adds the rows, replacing those of the same zone, indicator and period."""
        ...

    def read(self, table: Table, division: Division, indicator: Indicator) -> ZoneValues: ...


def _cell(period: Period) -> str | int:
    return period.isoformat() if isinstance(period, date) else period


class BigQueryStore:
    def __init__(self, project: str, dataset: str) -> None:
        self._client = bigquery.Client(project=project)
        self._dataset = f"{project}.{dataset}"

    def _query(self, sql: str, **parameters: str) -> list[Any]:
        config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter(name, "STRING", value) for name, value in parameters.items()
            ]
        )
        return list(self._client.query(sql, job_config=config).result())

    def stored(self, table: Table) -> Stored:
        rows = self._query(
            f"SELECT division, indicator, ARRAY_AGG(DISTINCT {PERIOD[table]}) AS periods "
            f"FROM `{self._dataset}.{table}` GROUP BY division, indicator"
        )
        return {(Division(row["division"]), Indicator(row["indicator"])): set(row["periods"]) for row in rows}

    def add(self, table: Table, division: Division, indicator: Indicator, values: ZoneValues) -> None:
        period = PERIOD[table]
        computed_at = datetime.now(UTC).isoformat()
        rows = [
            {
                "division": division,
                "zone": zone,
                "indicator": indicator,
                period: _cell(p),
                "value": value,
                "computed_at": computed_at,
            }
            for zone, periods in values.items()
            for p, value in periods.items()
        ]
        if not rows:
            return
        target = f"{self._dataset}.{table}"
        # Loading is free and atomic; the merge then makes a repeated period replace its rows.
        staging = f"{self._dataset}._{table}_{uuid4().hex}"
        schema = cast(list[bigquery.SchemaField], self._client.get_table(target).schema)  # pyright: ignore[reportUnknownMemberType]
        try:
            self._client.load_table_from_json(rows, staging, job_config=bigquery.LoadJobConfig(schema=schema)).result()
            # The division and indicator, as constants, let BigQuery read only their clustered blocks.
            self._query(
                f"MERGE `{target}` t USING `{staging}` s "
                "ON t.division = @division AND t.indicator = @indicator "
                f"AND t.division = s.division AND t.zone = s.zone AND t.indicator = s.indicator "
                f"AND t.{period} = s.{period} "
                "WHEN MATCHED THEN UPDATE SET value = s.value, computed_at = s.computed_at "
                "WHEN NOT MATCHED THEN INSERT ROW",
                division=division,
                indicator=indicator,
            )
        finally:
            self._client.delete_table(staging, not_found_ok=True)

    def read(self, table: Table, division: Division, indicator: Indicator) -> ZoneValues:
        rows = self._query(
            f"SELECT zone, {PERIOD[table]} AS period, value FROM `{self._dataset}.{table}` "
            "WHERE division = @division AND indicator = @indicator",
            division=division,
            indicator=indicator,
        )
        values: ZoneValues = {}
        for row in rows:
            values.setdefault(row["zone"], {})[row["period"]] = row["value"]
        return values


def store_from(target: str) -> ValueStore:
    """`bigquery://<project>/<dataset>`."""
    project, _, dataset = target.removeprefix("bigquery://").partition("/")
    if not target.startswith("bigquery://") or not project or not dataset:
        raise ValueError(f"Not a value store: {target}")
    return BigQueryStore(project, dataset)
