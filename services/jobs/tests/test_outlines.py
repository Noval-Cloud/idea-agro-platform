import json
from pathlib import Path
from typing import Any

import pytest
from idea_agro_jobs import outlines
from idea_agro_jobs.domain import Division
from idea_agro_jobs.files import LocalFiles
from idea_agro_jobs.frame import height

type Json = dict[str, Any]


def square(west: float, south: float, size: float = 0.1) -> Json:
    ring = [[west, south], [west + size, south], [west + size, south + size], [west, south + size], [west, south]]
    return {"type": "Polygon", "coordinates": [ring]}


def zone(geometry: Json, **properties: Any) -> Json:
    return {"type": "Feature", "geometry": geometry, "properties": properties}


class FakeOutlines:
    def __init__(self) -> None:
        self.version = "2026-01-01T00:00:00Z"
        self.read = 0

    def updated(self, asset: str) -> str:
        return self.version

    def zones(self, division: Division) -> list[Json]:
        self.read += 1
        if division == Division.SECCIONALES:
            return [
                zone(square(-54, -33), CODIGOSECC="1406", NOMBRE_1="CEBOLLATI", DEPARTAMEN="ROCHA", SECCION=6.0,
                     area_km2=1649.94),
                zone(square(-55, -34), CODIGOSECC="1501", NOMBRE="", DEPARTAMEN="SALTO", SECCION=1, area_km2=2.0),
            ]  # fmt: skip
        if division == Division.CUENCAS_4:
            return [zone(square(-54, -34), codcuenca=4451.0, nombrec4="Ao. De La Coronilla", area_km2=300.0)]
        if division == Division.CUENCAS_5:
            return [zone(square(-54, -34, 0.05), codcuenca=44510.0, area_km2=115.24)]
        return [zone(square(-56, -33, 1), codcuenca=1.0, nombrec1="RIO URUGUAY", nombrec2="", area_km2=9.0)]

    def departments(self) -> list[str]:
        return ["ROCHA", "TACUEREMBO"]

    def parcels(self, department: str) -> list[Json]:
        point = {"type": "Point", "coordinates": [-54, -33]}
        return [
            zone(square(-54.123456, -33.5), PADRON=50049.0, area_ha=551.34),
            zone(point, PADRON=1.0, area_ha=0.1),
        ]


@pytest.fixture
def files(tmp_path: Path) -> LocalFiles:
    (tmp_path / "catalog.json").write_text(json.dumps({"seasonal": {"ppna": []}}))
    return LocalFiles(tmp_path)


def read(files: LocalFiles, name: str) -> Any:
    content = files.read(name)
    assert content is not None
    return json.loads(content)


def test_names_read_as_people_write_them() -> None:
    assert outlines.district_name("BARIIO 18 DE JULIO") == "Barrio 18 de Julio"
    assert outlines.district_name("TACUAREMB\ufffd") == "Tacuarembó"
    assert outlines.basin_name("RIO DE LA PLATA") == "Rio de la Plata"
    assert outlines.basin_name("Ao. De La Coronilla") == "Ao. De La Coronilla"
    assert outlines.department_name("PAYSANDU ") == "Paysandú"
    assert outlines.slug("Treinta y Tres") == "treinta-y-tres"


def test_rounding_drops_repeated_points_and_rings_too_small() -> None:
    sliver = [[-54.00001, -33], [-54.00002, -33], [-54, -33.00001], [-54.00001, -33]]
    geometry = {"type": "MultiPolygon", "coordinates": [square(-54, -33)["coordinates"], [sliver]]}

    cleaned = outlines.clean(outlines.polygons(geometry, 4))

    assert cleaned == {"type": "MultiPolygon", "coordinates": [square(-54, -33)["coordinates"]]}
    assert outlines.clean(outlines.polygons({"type": "Polygon", "coordinates": [sliver]}, 4)) is None


def test_a_collection_becomes_a_multipolygon_of_its_polygons() -> None:
    collection = {
        "type": "GeometryCollection",
        "geometries": [square(-54, -33), {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}],
    }

    assert outlines.polygons(collection, 4) == {
        "type": "MultiPolygon",
        "coordinates": [square(-54, -33)["coordinates"]],
    }


def test_the_frame_matches_the_published_images() -> None:
    assert height(1600) == 1763
    assert height(200) == 220


def test_a_run_publishes_zones_index_parcels_and_the_catalog(files: LocalFiles) -> None:
    outlines.refresh(FakeOutlines(), files)

    seccionales = read(files, "divisions/seccionales.geojson")["features"]
    assert seccionales[0]["id"] == 1406
    assert seccionales[0]["properties"] == {
        "id": "1406",
        "name": "Cebollati",
        "area_km2": 1649.9,
        "department": "Rocha",
        "section": 6,
    }
    assert seccionales[1]["properties"]["name"] is None
    basin = read(files, "divisions/cuencas-5/44510.json")
    assert basin["properties"] == {"id": "44510", "name": None, "area_km2": 115.2, "parent": "Ao. De La Coronilla"}
    assert basin["bbox"] == [-54, -34, -53.95, -33.95]
    index = read(files, "zone-index.json")
    assert index[0] == {
        "division": "seccionales",
        "id": "1406",
        "label": "Rocha, 6",
        "detail": "Cebollati",
        "bbox": [-54, -33, -53.9, -32.9],
    }
    assert {"division": "cuencas-5", "id": "44510", "label": "Ao. De La Coronilla", "detail": "44510"}.items() <= next(
        e for e in index if e["division"] == "cuencas-5"
    ).items()
    assert [e["id"] for e in index if e["division"] == "department"] == ["rocha", "salto"]
    parcels = read(files, "padrones/tacuarembo.geojson")["features"]
    assert [p["properties"] for p in parcels] == [{"padron": 50049, "area_ha": 551.3}]
    assert parcels[0]["geometry"]["coordinates"][0][0] == [-54.12346, -33.5]
    assert read(files, "padrones/index.json") == {"rocha": [50049], "tacuarembo": [50049]}
    catalog = read(files, "catalog.json")
    assert catalog["seasonal"] == {"ppna": []}
    assert catalog["divisions"]["cuencas-5"] == 1
    assert catalog["padrones"]["tacuarembo"] == {
        "name": "Tacuarembó",
        "count": 1,
        "bbox": [-54.1235, -33.5, -54.0235, -33.4],
    }
    assert catalog["outline"]["width"] == 200
    assert catalog["outline"]["d"].startswith("M")


def test_a_run_does_nothing_until_an_asset_changes(files: LocalFiles) -> None:
    source = FakeOutlines()
    outlines.refresh(source, files)
    first = source.read

    outlines.refresh(source, files)
    assert source.read == first

    source.version = "2026-02-01T00:00:00Z"
    outlines.refresh(source, files)
    assert source.read == 2 * first
