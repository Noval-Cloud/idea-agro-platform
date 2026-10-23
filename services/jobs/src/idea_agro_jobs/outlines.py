"""The outlines task: the divisions' zones, the map's search index, the country outline and the parcels.

The files keep the shape `scripts/seed_public_data.py` gave the prototype's, which the API documents.
"""

import json
import logging
import math
import re
import unicodedata
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Protocol, cast

from idea_agro_jobs.domain import Division
from idea_agro_jobs.earth import DIVISIONS, PARCELS, zone_id
from idea_agro_jobs.files import Files
from idea_agro_jobs.frame import height, pixel
from idea_agro_jobs.values import CATALOG, encode

log = logging.getLogger(__name__)

type Json = dict[str, Any]
type Box = list[float]

# When each asset changed, as of the last run.
STATE = "jobs/outlines.json"
WRITERS = 16
OUTLINE_WIDTH = 200

SMALL_WORDS = frozenset({"de", "del", "la", "las", "los", "el", "y", "e", "a", "al", "en"})
DEPARTMENTS = {
    "ARTIGAS": "Artigas",
    "CANELONES": "Canelones",
    "CERRO LARGO": "Cerro Largo",
    "COLONIA": "Colonia",
    "DURAZNO": "Durazno",
    "FLORES": "Flores",
    "FLORIDA": "Florida",
    "LAVALLEJA": "Lavalleja",
    "MALDONADO": "Maldonado",
    "MONTEVIDEO": "Montevideo",
    "PAYSANDU": "Paysandú",
    "RIO NEGRO": "Río Negro",
    "RIVERA": "Rivera",
    "ROCHA": "Rocha",
    "SALTO": "Salto",
    "SAN JOSE": "San José",
    "SORIANO": "Soriano",
    "TACUAREMBO": "Tacuarembó",
    "TACUEREMBO": "Tacuarembó",
    "TREINTA Y TRES": "Treinta y Tres",
}
# Police district names whose accents were lost to a wrong encoding in the asset.
MISENCODED = {
    "BARIIO": "BARRIO",
    "CANEL\ufffdN": "CANELÓN",
    "GO\ufffdI": "GOÑI",
    "ORDO\ufffdEZ": "ORDÓÑEZ",
    "ESPA\ufffdA": "ESPAÑA",
    "CA\ufffdITAS": "CAÑITAS",
    "TACUAREMB\ufffd": "TACUAREMBÓ",
    "BATOV\ufffd": "BATOVÍ",
    "L\ufffdPEZ": "LÓPEZ",
    "CARAGUAT\ufffd": "CARAGUATÁ",
    "MART\ufffdNEZ": "MARTÍNEZ",
    "RINC\ufffdN": "RINCÓN",
    "CA\ufffdADA": "CAÑADA",
}


class OutlineSource(Protocol):
    def updated(self, asset: str) -> str:
        """When the asset last changed."""
        ...

    def zones(self, division: Division) -> list[Json]:
        """The division's zones as GeoJSON features, simplified, with their area in km² as `area_km2`."""
        ...

    def departments(self) -> list[str]: ...

    def parcels(self, department: str) -> list[Json]:
        """A department's parcels as GeoJSON features, simplified, with `PADRON` and `area_ha`."""
        ...


def fold(text: str) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", plain.lower()).strip()


def slug(text: str) -> str:
    return fold(text).replace(" ", "-")


def department_name(text: str) -> str:
    return DEPARTMENTS.get(text.strip().upper(), text)


def title_case(text: str) -> str:
    words = text.lower().split()
    return " ".join(w if i > 0 and w in SMALL_WORDS else w[:1].upper() + w[1:] for i, w in enumerate(words))


def basin_name(text: str) -> str:
    """Some grades name their basins in capitals; names read the same way across grades."""

    def word(i: int, w: str) -> str:
        if len(w) > 1 and w == w.upper() and any(c.isalpha() for c in w):
            return w.lower() if i > 0 and w.lower() in SMALL_WORDS else title_case(w)
        return w

    return " ".join(word(i, w) for i, w in enumerate(text.split(" ")))


def district_name(text: str) -> str:
    for wrong, right in MISENCODED.items():
        text = text.replace(wrong, right, 1)
    return title_case(text)


def half_up(value: float, digits: int) -> float:
    """Rounds halves up, as the website's scripts do, so outlines keep their coordinates."""
    scale = 10**digits
    return math.floor(value * scale + 0.5) / scale


def rounded(coordinates: Any, digits: int) -> Any:
    if isinstance(coordinates[0], int | float):
        return [half_up(coordinates[0], digits), half_up(coordinates[1], digits)]
    return [rounded(c, digits) for c in coordinates]


def polygons(geometry: Json, digits: int) -> Json:
    """The geometry with rounded coordinates; the polygons of a collection become one multipolygon."""
    if geometry["type"] == "GeometryCollection":
        parts: list[Any] = []
        for part in cast(list[Json], geometry["geometries"]):
            if part["type"] == "Polygon":
                parts.append(part["coordinates"])
            elif part["type"] == "MultiPolygon":
                parts.extend(part["coordinates"])
        return {"type": "MultiPolygon", "coordinates": rounded(parts, digits)}
    return {"type": geometry["type"], "coordinates": rounded(geometry["coordinates"], digits)}


def clean(geometry: Json) -> Json | None:
    """Drops points that rounding repeated; a ring needs four points, and a polygon its outer ring."""

    def ring(points: list[list[float]]) -> list[list[float]] | None:
        kept = [p for i, p in enumerate(points) if i == 0 or p != points[i - 1]]
        return kept if len(kept) >= 4 else None

    def polygon(rings: list[list[list[float]]]) -> list[list[list[float]]] | None:
        found = [ring(r) for r in rings]
        return [r for r in found if r] if found and found[0] else None

    if geometry["type"] == "Polygon":
        found = polygon(geometry["coordinates"])
        return {"type": "Polygon", "coordinates": found} if found else None
    if geometry["type"] == "MultiPolygon":
        parts = [p for p in (polygon(rings) for rings in geometry["coordinates"]) if p]
        return {"type": "MultiPolygon", "coordinates": parts} if parts else None
    return None


def rings(geometry: Json) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    return [r for polygon in geometry["coordinates"] for r in polygon]


def bbox(geometry: Json) -> Box:
    points = [p for r in rings(geometry) for p in r]
    return [
        half_up(min(p[0] for p in points), 4),
        half_up(min(p[1] for p in points), 4),
        half_up(max(p[0] for p in points), 4),
        half_up(max(p[1] for p in points), 4),
    ]


def union(boxes: Iterable[Box]) -> Box:
    found = list(boxes)
    return [min(b[0] for b in found), min(b[1] for b in found), max(b[2] for b in found), max(b[3] for b in found)]


def shaped_zones(division: Division, features: list[Json], parents: dict[str, str]) -> list[Json]:
    """The division's zones as the API publishes them; grade 5 basins borrow their grade 4 parent's name."""
    asset = DIVISIONS[division]
    zones: list[Json] = []
    for feature in features:
        source = cast(Json, feature["properties"])
        id = zone_id(source[asset.id])
        properties: Json = {"id": id, "name": None, "area_km2": half_up(float(source["area_km2"]), 1)}
        if division == Division.SECCIONALES:
            properties["name"] = district_name(str(source.get("NOMBRE_1") or source.get("NOMBRE") or "")) or None
            properties["department"] = department_name(str(source["DEPARTAMEN"]))
            properties["section"] = int(source["SECCION"])
        else:
            properties["name"] = basin_name(str(source.get(asset.name) or "")) if asset.name else None
            properties["name"] = properties["name"] or None
            if division == Division.CUENCAS_5 and (parent := parents.get(str(int(id) // 10))):
                properties["parent"] = parent
        exact = polygons(feature["geometry"], 5)
        geometry = clean(polygons(exact, 4)) or exact
        zones.append({"type": "Feature", "id": int(id), "properties": properties, "geometry": geometry})
    return zones


def index_entries(division: Division, zones: list[Json]) -> list[Json]:
    entries: list[Json] = []
    for zone in zones:
        p = cast(Json, zone["properties"])
        if division == Division.SECCIONALES:
            label, detail = f"{p['department']}, {p['section']}", p["name"] or ""
        else:
            label = p["name"] or p.get("parent") or p["id"]
            detail = p["id"] if division == Division.CUENCAS_5 else None
        entry: Json = {"division": division, "id": p["id"], "label": label}
        if detail is not None:
            entry["detail"] = detail
        entries.append(entry | {"bbox": bbox(zone["geometry"])})
    return entries


def department_entries(seccionales: list[Json]) -> list[Json]:
    boxes: dict[str, list[Box]] = {}
    for zone in seccionales:
        boxes.setdefault(zone["properties"]["department"], []).append(bbox(zone["geometry"]))
    return [{"division": "department", "id": slug(n), "label": n, "bbox": union(b)} for n, b in boxes.items()]


def douglas_peucker(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        length = math.hypot(x2 - x1, y2 - y1) or 1
        farthest, index = 0.0, -1
        for i in range(a + 1, b):
            x, y = points[i]
            distance = abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / length
            if distance > farthest:
                farthest, index = distance, i
        if farthest > tolerance:
            keep[index] = True
            stack.extend([(a, index), (index, b)])
    return [p for p, kept in zip(points, keep, strict=True) if kept]


def simplified_ring(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """A closed ring starts and ends on the same point, so it is simplified as two halves."""
    start = points[0]
    far = max(range(len(points)), key=lambda i: math.hypot(points[i][0] - start[0], points[i][1] - start[1]))
    first = douglas_peucker(points[: far + 1], tolerance)
    return first + douglas_peucker(points[far:], tolerance)[1:]


def country_outline(basins: list[Json]) -> Json:
    """The country's silhouette in the frame, 200 units wide: the grade 1 basins tile the whole country."""
    paths: list[str] = []
    for basin in basins:
        for ring in rings(basin["geometry"]):
            points = simplified_ring([pixel(x, y, OUTLINE_WIDTH) for x, y in ring], 0.9)
            if len(points) > 3:
                paths.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points) + "Z")
    return {"width": OUTLINE_WIDTH, "height": height(OUTLINE_WIDTH), "d": "".join(paths)}


def shaped_parcels(features: list[Json]) -> list[Json]:
    """A department's parcels; the few that simplify to points or lines are dropped."""
    parcels: list[Json] = []
    for feature in features:
        geometry = clean(polygons(feature["geometry"], 5))
        if geometry is None:
            continue
        source = cast(Json, feature["properties"])
        properties = {"padron": int(source["PADRON"]), "area_ha": half_up(float(source["area_ha"]), 1)}
        parcels.append({"type": "Feature", "id": len(parcels), "properties": properties, "geometry": geometry})
    return parcels


def collection(features: list[Json]) -> Json:
    return {"type": "FeatureCollection", "features": features}


def refresh(source: OutlineSource, files: Files, force: bool = False) -> None:
    assets = [DIVISIONS[division].asset for division in Division] + [PARCELS]
    updated = {asset: source.updated(asset) for asset in assets}
    state = files.read(STATE)
    if not force and state and json.loads(state) == updated:
        log.info("outlines: no asset changed")
        return

    written: list[tuple[str, Json | list[Json]]] = []
    zones: dict[Division, list[Json]] = {}
    index: list[Json] = []
    for division in Division:
        parents = {}
        if division == Division.CUENCAS_5:
            parents = {z["properties"]["id"]: z["properties"]["name"] or "" for z in zones[Division.CUENCAS_4]}
        zones[division] = shaped_zones(division, source.zones(division), parents)
        index += index_entries(division, zones[division])
        written.append((f"divisions/{division}.geojson", collection(zones[division])))
        for zone in zones[division]:
            detail = {"properties": zone["properties"], "geometry": zone["geometry"], "bbox": bbox(zone["geometry"])}
            written.append((f"divisions/{division}/{zone['properties']['id']}.json", detail))
    index += department_entries(zones[Division.SECCIONALES])
    written.append(("zone-index.json", index))

    parcel_numbers: dict[str, list[int]] = {}
    parcel_catalog: Json = {}
    for department in source.departments():
        parcels = shaped_parcels(source.parcels(department))
        # Named after the department as the API lists them, whatever the asset's spelling.
        key = slug(department_name(department))
        written.append((f"padrones/{key}.geojson", collection(parcels)))
        parcel_numbers[key] = sorted(p["properties"]["padron"] for p in parcels)
        parcel_catalog[key] = {
            "name": department_name(department),
            "count": len(parcels),
            "bbox": union(bbox(p["geometry"]) for p in parcels),
        }
    written.append(("padrones/index.json", parcel_numbers))

    def write(item: tuple[str, Json | list[Json]]) -> None:
        files.write(item[0], encode(item[1]))

    with ThreadPoolExecutor(WRITERS) as pool:
        list(pool.map(write, written))

    sections = {
        "divisions": {division.value: len(zones[division]) for division in Division},
        "padrones": parcel_catalog,
        "outline": country_outline(zones[Division.CUENCAS_1]),
    }

    def with_outlines(content: bytes | None) -> bytes:
        catalog = cast(Json, json.loads(content)) if content else {}
        return encode(catalog | sections)

    files.update(CATALOG, with_outlines)
    files.write(STATE, encode(updated))
    log.info("outlines: %d files written", len(written))
