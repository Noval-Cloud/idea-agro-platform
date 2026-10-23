"""Zone outlines: checking them, and measuring what is stored with them."""

import json
from dataclasses import dataclass
from functools import cached_property
from typing import Any, cast

import shapely
import shapely.validation
from pyproj import Geod
from shapely.geometry import mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.strtree import STRtree

from idea_agro_api.zones import Files

GEOD = Geod(ellps="WGS84")
# About 10 cm: enough for a paddock, and it keeps stored files small.
DECIMALS = 6
# Areas are shown in hectares with two decimals: anything smaller would read as zero.
MIN_AREA_M2 = 100


class InvalidShape(ValueError):
    pass


@dataclass(frozen=True)
class Outline:
    """A checked outline and what is measured from it."""

    geometry: dict[str, Any]
    area_ha: float
    bbox: tuple[float, float, float, float]
    point: tuple[float, float]


def outline_from(geojson: dict[str, Any], within: tuple[float, float, float, float]) -> Outline:
    """Checks a GeoJSON Polygon or MultiPolygon in longitude and latitude, and measures it."""
    try:
        geometry = shape(geojson)
    except (ValueError, TypeError, KeyError, AttributeError) as error:
        raise InvalidShape("The geometry is not a valid GeoJSON polygon.") from error
    if geometry.geom_type not in ("Polygon", "MultiPolygon") or geometry.is_empty:
        raise InvalidShape("The geometry must be a Polygon or a MultiPolygon.")
    west, south, east, north = geometry.bounds
    if not (-180 <= west <= east <= 180 and -90 <= south <= north <= 90):
        raise InvalidShape("The coordinates must be longitude and latitude in degrees.")
    if not geometry.is_valid:
        raise InvalidShape(f"The outline is not valid: {shapely.validation.explain_validity(geometry)}.")
    if not geometry.intersects(shapely.box(*within)):
        raise InvalidShape("The zone is outside the area the platform covers.")
    # Outer rings counterclockwise and holes clockwise, as the area below needs; files often mix them.
    rounded = shapely.orient_polygons(shapely.set_precision(geometry, 10**-DECIMALS))  # pyright: ignore[reportUnknownMemberType]
    area, _ = GEOD.geometry_area_perimeter(rounded)  # pyright: ignore[reportUnknownMemberType]
    if rounded.is_empty or not rounded.is_valid or area < MIN_AREA_M2:
        raise InvalidShape(f"The zone is smaller than {MIN_AREA_M2} m².")
    point = geometry.representative_point()
    return Outline(
        geometry=mapping(rounded),
        area_ha=round(area / 10_000, 2),
        bbox=(round(west, DECIMALS), round(south, DECIMALS), round(east, DECIMALS), round(north, DECIMALS)),
        point=(point.x, point.y),
    )


class Departments:
    """Which department a point falls in, from the police districts in `zones/seccionales.json`."""

    def __init__(self, files: Files) -> None:
        self._files = files

    @cached_property
    def _index(self) -> tuple[STRtree, list[str]]:
        content = self._files.read("zones/seccionales.json")
        if content is None:
            return STRtree([]), []
        features = cast(list[dict[str, Any]], json.loads(content)["features"])
        shapes: list[BaseGeometry] = [shape(f["geometry"]) for f in features]
        names = [str(f["properties"]["dept"]) for f in features]
        return STRtree(shapes), names

    def of(self, point: tuple[float, float]) -> str | None:
        tree, names = self._index
        found = tree.query(shapely.Point(point), predicate="within")
        return names[int(found[0])] if len(found) else None
