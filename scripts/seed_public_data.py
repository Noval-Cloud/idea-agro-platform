"""Turns the prototype's data files into the layout of the API's public data bucket.

Usage: uv run python scripts/seed_public_data.py <prototype folder> <output folder>
The output is then copied to the bucket, as services/api/README.md shows.
"""

import json
import shutil
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any, cast

type Json = dict[str, Any]


def read(path: Path) -> Any:
    return json.loads(path.read_text())


def write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(",", ":"), ensure_ascii=False))


def copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def composite_date(band: str) -> str:
    """`b2001-17` is the composite that starts on day 17 of 2001."""
    year, day = band.removeprefix("b").split("-")
    return (date(int(year), 1, 1) + timedelta(days=int(day) - 1)).isoformat()


def zone_properties(properties: Json) -> Json:
    out: Json = {"id": str(properties["id"]), "name": properties.get("name") or None, "area_km2": properties["areaKm2"]}
    for old, new in (("dept", "department"), ("section", "section"), ("parent", "parent")):
        if properties.get(old) not in (None, ""):
            out[new] = properties[old]
    return out


def catalog(manifest: Json) -> Json:
    indicators = cast(dict[str, Json], manifest["indicators"])
    return {
        "bounds": manifest["bounds"],
        "size": manifest["size"],
        "lite_size": manifest["liteSize"],
        "indicators": {
            key: {name: value for name, value in info.items() if name in ("kind", "years", "min", "max", "classes")}
            for key, info in indicators.items()
        },
        "seasonal": {key: [composite_date(band) for band in bands] for key, bands in manifest["seasonal"].items()},
        "divisions": manifest["divisions"],
        "padrones": manifest["padrones"],
        "outline": manifest["outline"],
    }


def seed(source: Path, out: Path) -> None:
    manifest = cast(Json, read(source / "manifest.json"))
    write(out / "catalog.json", catalog(manifest))

    for division in manifest["divisions"]:
        collection = cast(Json, read(source / "zones" / f"{division}.json"))
        for feature in collection["features"]:
            feature["properties"] = zone_properties(feature["properties"])
        write(out / "divisions" / f"{division}.geojson", collection)
        for path in sorted((source / "zones" / division).glob("*.json")):
            detail = cast(Json, read(path))
            detail["properties"] = zone_properties(detail["properties"])
            write(out / "divisions" / division / path.name, detail)
        for path in sorted((source / "stats" / division).glob("*.json")):
            copy(path, out / "values" / division / path.name)
        shutil.copytree(source / "series" / division, out / "series" / division, dirs_exist_ok=True)

    index = cast(list[Json], read(source / "search.json"))
    write(out / "zone-index.json", [{"division": e["d"], **{k: v for k, v in e.items() if k != "d"}} for e in index])

    copy(source / "padrones" / "index.json", out / "padrones" / "index.json")
    for department in manifest["padrones"]:
        collection = cast(Json, read(source / "padrones" / f"{department}.json"))
        for feature in collection["features"]:
            properties = feature["properties"]
            feature["properties"] = {"padron": properties["padron"], "area_ha": properties["areaHa"]}
        write(out / "padrones" / f"{department}.geojson", collection)

    shutil.copytree(source / "rasters", out / "maps", dirs_exist_ok=True)
    shutil.copytree(source / "thumbs", out / "maps" / "thumbnails", dirs_exist_ok=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    seed(Path(sys.argv[1]), Path(sys.argv[2]))
