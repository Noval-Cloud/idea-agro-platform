"""The compare task: compares an indicator's multiband asset with its collection, and writes a report to read later.

Both are read on the same composites: the zone means of a division, as the values task computes them, and a fixed
sample of pixels at the multiband asset's own scale. Each run writes a new report, so later runs show what changed.
"""

import logging
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from itertools import batched, chain
from typing import Any, Protocol

from idea_agro_jobs.collection import Collection, StoredImage
from idea_agro_jobs.domain import Division
from idea_agro_jobs.files import Files

log = logging.getLogger(__name__)

DIVISION = Division.SECCIONALES
# The values task's pixel size for composites, in meters.
ZONE_SCALE = 1000
PIXELS = 5000
# The same pixels each run, so that reports compare.
SEED = 0
# Composites read in one request.
CHUNK = 10
REPORTS = "jobs/comparisons/"

# A value of the multiband asset and of the collection, None where one has no value.
type Pair = tuple[float | None, float | None]


@dataclass(frozen=True)
class Composite:
    start: date
    # Its band in the multiband asset, and its image in the collection.
    band: str
    image: str


@dataclass(frozen=True)
class Stats:
    # Zones or pixels with a value in either, and those with a value in only one.
    sampled: int
    only_old: int
    only_new: int
    # Over those with a value in both.
    mean_abs: float | None
    max_abs: float | None
    # The share of `sampled` with a value in both that differ by no more than the tolerance.
    within: float | None


def stats(pairs: Iterable[Pair], tolerance: float) -> Stats:
    differences: list[float] = []
    only_old = only_new = 0
    for old, new in pairs:
        if old is not None and new is not None:
            differences.append(abs(new - old))
        elif old is not None:
            only_old += 1
        elif new is not None:
            only_new += 1
    sampled = len(differences) + only_old + only_new
    if not sampled:
        return Stats(0, 0, 0, None, None, None)
    return Stats(
        sampled=sampled,
        only_old=only_old,
        only_new=only_new,
        mean_abs=sum(differences) / len(differences) if differences else None,
        max_abs=max(differences) if differences else None,
        within=sum(1 for d in differences if d <= tolerance) / sampled,
    )


def _number(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def pairs(rows: Sequence[Mapping[str, Any]], composites: Sequence[Composite]) -> dict[date, list[Pair]]:
    """Each composite's pairs, from rows that hold its old value as `o<n>` and its new one as `n<n>`."""
    return {
        composite.start: [(_number(row.get(f"o{n}")), _number(row.get(f"n{n}"))) for row in rows]
        for n, composite in enumerate(composites)
    }


class Comparable(Protocol):
    def asset_composites(self, asset: str) -> dict[date, str]:
        """The composites of a multiband asset, by start, with their band."""
        ...

    def collection_images(self, asset: str) -> list[StoredImage]: ...

    def zone_pairs(
        self, old: str, composites: list[Composite], division: Division, scale: int
    ) -> dict[date, list[Pair]]:
        """The mean of each zone of the division in the old band and the new image of each composite."""
        ...

    def pixel_pairs(self, old: str, composites: list[Composite], count: int, seed: int) -> dict[date, list[Pair]]:
        """The old and new values of the same sample of pixels in the country, at the old asset's scale."""
        ...


@dataclass(frozen=True)
class Row:
    start: date
    # Where the composite is when it is only in one: "old" or "new".
    only: str | None = None
    zones: Stats | None = None
    pixels: Stats | None = None


def _value(value: float | None) -> str:
    return "" if value is None else f"{value:.4f}"


def _share(value: float | None) -> str:
    return "" if value is None else f"{value:.1%}"


def _cells(found: Stats | None) -> list[str]:
    if found is None:
        return [""] * 6
    return [
        str(found.sampled),
        _share(found.within),
        _value(found.mean_abs),
        _value(found.max_abs),
        str(found.only_old),
        str(found.only_new),
    ]


def _summary(label: str, overall: Stats, measured: Iterable[tuple[date, Stats | None]]) -> str:
    """A summary line: the share within the tolerance, the composite with the lowest one, and the largest difference."""
    shares = [(found.within, start) for start, found in measured if found and found.within is not None]
    lowest = ", the lowest {:.1%} on {}".format(*min(shares)) if shares else ""
    within = _share(overall.within) or "none compared"
    return f"- {label} within the tolerance: {within}{lowest}; largest difference {_value(overall.max_abs) or 'none'}."


def report(
    collection: Collection,
    old: str,
    new: str,
    since: date,
    until: date,
    rows: list[Row],
    zones: Stats,
    pixels: Stats,
    now: datetime,
) -> str:
    in_both = sum(1 for row in rows if row.only is None)
    only_old = sum(1 for row in rows if row.only == "old")
    only_new = sum(1 for row in rows if row.only == "new")
    lines = [
        f"# {collection.indicator}: `{old}` against `{new}`",
        "",
        f"Compared on {now:%Y-%m-%d %H:%M} UTC, composites from {since} to {until}, "
        f"with a tolerance of {collection.tolerance} {collection.unit}.",
        f"Zones: the means of the {DIVISION} at {ZONE_SCALE} m. "
        f"Pixels: about {PIXELS} pixels sampled at the old asset's scale, the same ones each run (seed {SEED}).",
        "",
        "## Summary",
        "",
        f"- Composites: {in_both} in both, {only_old} only in the old asset, {only_new} only in the collection.",
        _summary("Zones", zones, ((row.start, row.zones) for row in rows)),
        _summary("Pixels", pixels, ((row.start, row.pixels) for row in rows)),
        "",
        "## Composites",
        "",
        f"Differences in {collection.unit}. Within: the share within the tolerance. "
        "Only old, only new: zones or pixels with a value in only one of them.",
        "",
        "| Composite | Zones | Within | Mean diff. | Max diff. | Only old | Only new "
        "| Pixels | Within | Mean diff. | Max diff. | Only old | Only new |",
        "| :-- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |",
    ]
    for row in rows:
        if row.only:
            where = "the old asset" if row.only == "old" else "the collection"
            cells = [f"Only in {where}", *[""] * 11]
        else:
            cells = [*_cells(row.zones), *_cells(row.pixels)]
        lines.append("| " + " | ".join([str(row.start), *cells]) + " |")
    return "\n".join(lines) + "\n"


def compare(
    comparable: Comparable,
    files: Files,
    collections: Iterable[Collection],
    since: date | None = None,
    until: date | None = None,
    old: str | None = None,
    new: str | None = None,
    now: datetime | None = None,
) -> list[str]:
    """Writes a report for each collection, and returns their names."""
    now = now or datetime.now(UTC)
    names: list[str] = []
    for collection in collections:
        old_asset, new_asset = old or collection.current, new or collection.asset
        first, last = since or collection.first, until or now.date()
        bands = {
            start: band for start, band in comparable.asset_composites(old_asset).items() if first <= start <= last
        }
        images = {
            image.start: image.id
            for image in comparable.collection_images(new_asset)
            if image.start and first <= image.start <= last
        }
        both = [Composite(start, bands[start], images[start]) for start in sorted(bands.keys() & images.keys())]
        zones: dict[date, list[Pair]] = {}
        pixels: dict[date, list[Pair]] = {}
        for chunk in batched(both, CHUNK, strict=False):
            zones |= comparable.zone_pairs(old_asset, list(chunk), DIVISION, ZONE_SCALE)
            pixels |= comparable.pixel_pairs(old_asset, list(chunk), PIXELS, SEED)
            log.info("%s: compared up to %s", collection.indicator, chunk[-1].start)
        tolerance = collection.tolerance
        rows: list[Row] = []
        for start in sorted(bands.keys() | images.keys()):
            if start not in images:
                rows.append(Row(start, only="old"))
            elif start not in bands:
                rows.append(Row(start, only="new"))
            else:
                rows.append(Row(start, zones=stats(zones[start], tolerance), pixels=stats(pixels[start], tolerance)))
        all_zones = stats(chain.from_iterable(zones.values()), tolerance)
        all_pixels = stats(chain.from_iterable(pixels.values()), tolerance)
        name = f"{REPORTS}{collection.indicator}/{first}_{last}_{now:%Y%m%dT%H%M%SZ}.md"
        content = report(collection, old_asset, new_asset, first, last, rows, all_zones, all_pixels, now)
        files.write(name, content.encode())
        names.append(name)
        alike = len(rows) == len(both) and all_zones.within == all_pixels.within == 1
        level = logging.INFO if alike else logging.WARNING
        log.log(
            level,
            "%s: %d composites in both, %d in only one; within %s %s: zones %s, pixels %s; report in %s",
            collection.indicator,
            len(both),
            len(rows) - len(both),
            tolerance,
            collection.unit,
            _share(all_zones.within) or "none",
            _share(all_pixels.within) or "none",
            name,
        )
    return names
