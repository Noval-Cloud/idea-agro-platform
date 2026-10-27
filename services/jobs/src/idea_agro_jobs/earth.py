# earthengine-api leaves some arguments untyped, and google.auth its credentials; this module is their only user.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false
"""Earth Engine as a source of the zones' values, computed from the indicator assets as they are.

PPNA, APAR, ET and RH are each one image with a band per composite, named `b<year>-<day of the year>`, and their
yearly values are the sum over each productive year; the others are one image with a band per year, or a single map.
"""

import logging
import math
import re
import time
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from itertools import batched
from typing import Any, cast

import ee
import ee.data
import google.auth

from idea_agro_jobs.domain import Division, Indicator, Period, ZoneValues
from idea_agro_jobs.frame import BOUNDS

log = logging.getLogger(__name__)

ASSETS = "projects/pastizalesrou/assets/"
MAPBIOMAS = "projects/MapBiomas_Pampa/public/collection2/mapbiomas_pampa_collection2_integration_v1"
COMMUNITIES = "users/bagnato/PronosticoForrajero/ComunidadesDePastizal/ComunidadesPastizal"
SCOPES = ["https://www.googleapis.com/auth/earthengine", "https://www.googleapis.com/auth/cloud-platform"]


@dataclass(frozen=True)
class DivisionAsset:
    asset: str
    # The properties that hold a zone's id and name.
    id: str
    name: str | None
    # How far, in meters, the map's outlines may stray from the zones'.
    max_error: int


DIVISIONS = {
    Division.SECCIONALES: DivisionAsset("Seccionales_Policiales", "CODIGOSECC", None, 60),
    Division.CUENCAS_1: DivisionAsset("cuencas/Cuencas_G1", "codcuenca", "nombrec1", 250),
    Division.CUENCAS_2: DivisionAsset("cuencas/Cuencas_G2", "codcuenca", "nombrec2", 150),
    Division.CUENCAS_3: DivisionAsset("cuencas/Cuencas_G3", "codcuenca", "nombrec3", 100),
    Division.CUENCAS_4: DivisionAsset("cuencas/Cuencas_G4", "codcuenca", "nombrec4", 80),
    Division.CUENCAS_5: DivisionAsset("cuencas/Cuencas_G5", "codcuenca", None, 60),
}
PARCELS = "padrones/padrones_ajustado"
COUNTRY = "general/limite_oficial_rou_km2"
# The images with a band per composite, and their composites per year.
COMPOSITED = {
    Indicator.PPNA: ("ppna/ppna-16", 23),
    Indicator.APAR: ("apar/apar-16", 23),
    Indicator.ET: ("et/et-8", 46),
    Indicator.RH: ("rh/rh-16", 23),
}
IOSE = "iose/iose_Historica"
# Pixel size of each indicator's reductions, in meters.
SCALE = {Indicator.RH: 1000, Indicator.COMPN: 250}
COMPOSITE_SCALE = 1000
# Saved zones are often a few parcels: they are read at the composites' own 250 m pixels.
OUTLINE_SCALE = 250
# Composites reduced at once over a saved zone.
OUTLINE_CHUNK = 100
# About 625 km² of 250 m pixels; a larger zone is read with coarser ones.
OUTLINE_PIXELS = 100_000
ATTEMPTS = 4


def band_start(band: str) -> date:
    """`b2001-17` is the composite that starts on day 17 of 2001."""
    year, day = band.removeprefix("b").split("-")
    return date(int(year), 1, 1) + timedelta(days=int(day) - 1)


def productive_year(band: str, per_year: int) -> int:
    """The year from mid July to mid July a composite belongs to, named after the year it starts in."""
    year, day = (int(part) for part in band.removeprefix("b").split("-"))
    position = math.floor((day - 1) / (365 / per_year) + 0.5)
    return year if position >= math.ceil(per_year / 2) else year - 1


def complete_years(bands: list[str], per_year: int) -> dict[int, list[str]]:
    """The bands of each productive year that has all its composites."""
    years: dict[int, list[str]] = {}
    for band in bands:
        years.setdefault(productive_year(band, per_year), []).append(band)
    return {year: found for year, found in sorted(years.items()) if len(found) == per_year}


def band_years(bands: list[str], prefix: str) -> list[int]:
    """The years of an image with a band per year, named `<prefix><year>`; other bands are not years."""
    return sorted(int(b.removeprefix(prefix)) for b in bands if re.fullmatch(rf"{re.escape(prefix)}\d{{4}}", b))


def zone_id(value: object) -> str:
    """Ids are numbers or text in the assets; 1406.0 is zone "1406"."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def zone_values(
    features: list[dict[str, Any]], id_property: str, outputs: Mapping[str, Period], digits: int
) -> ZoneValues:
    """Each zone's reduced values, from the properties Earth Engine named after `outputs`."""
    values: ZoneValues = {}
    for feature in features:
        properties = cast(dict[str, Any], feature["properties"])
        values[zone_id(properties[id_property])] = {
            period: None if properties.get(output) is None else round(float(properties[output]), digits)
            for output, period in outputs.items()
        }
    return values


def retry[T](label: str, compute: Callable[[], T]) -> T:
    for attempt in range(1, ATTEMPTS + 1):
        try:
            return compute()
        # Earth Engine's own errors, and downloads that fail.
        except (ee.EEException, OSError) as error:
            if attempt == ATTEMPTS:
                raise
            log.warning("%s failed (attempt %d), retrying: %s", label, attempt, str(error)[:200])
            time.sleep(4 * attempt)
    raise AssertionError("unreachable")


class EarthEngine:
    """Computes what the prototype computed: zone means of each composite and year, and summaries of the maps."""

    def __init__(self, project: str) -> None:
        credentials, _ = google.auth.default(scopes=SCOPES)
        ee.Initialize(credentials, project=project)
        self._bands: dict[str, list[str]] = {}

    def _band_names(self, asset: str) -> list[str]:
        if asset not in self._bands:
            image = ee.Image(asset)
            self._bands[asset] = cast(list[str], retry(f"bands of {asset}", image.bandNames().getInfo))
        return self._bands[asset]

    def _zones(self, division: Division) -> tuple[ee.FeatureCollection, str]:
        found = DIVISIONS[division]
        return ee.FeatureCollection(ASSETS + found.asset).select([found.id]), found.id

    def _reduce(
        self,
        division: Division,
        image: ee.Image,
        reducer: ee.Reducer,
        scale: int,
        outputs: dict[str, Period],
        digits: int,
    ) -> ZoneValues:
        zones, id_property = self._zones(division)
        reduced = image.reduceRegions(collection=zones, reducer=reducer, scale=scale, tileScale=4)
        # Only the values travel back, not the outlines. Empty zones lack some outputs, so none is named.
        found = reduced.select([".*"], retainGeometry=False)
        result = cast(dict[str, Any], retry(f"{division} {list(outputs.values())[:3]}", found.getInfo))
        return zone_values(cast(list[dict[str, Any]], result["features"]), id_property, outputs, digits)

    def composites(self, indicator: Indicator) -> list[date]:
        return sorted(band_start(band) for band in self._band_names(ASSETS + COMPOSITED[indicator][0]))

    def years(self, indicator: Indicator) -> list[int]:
        if indicator in COMPOSITED:
            asset, per_year = COMPOSITED[indicator]
            return list(complete_years(self._band_names(ASSETS + asset), per_year))
        if indicator == Indicator.COB:
            return band_years(self._band_names(MAPBIOMAS), "classification_")
        return band_years(self._band_names(ASSETS + IOSE), "b")

    def composite_values(self, division: Division, indicator: Indicator, starts: list[date]) -> ZoneValues:
        bands = {band_start(band): band for band in self._band_names(ASSETS + COMPOSITED[indicator][0])}
        chosen = [bands[start] for start in starts]
        # A reduction of a single band names its output after the reducer.
        outputs: dict[str, Period] = {band if len(chosen) > 1 else "mean": band_start(band) for band in chosen}
        image = ee.Image(ASSETS + COMPOSITED[indicator][0]).select(chosen)
        return self._reduce(division, image, ee.Reducer.mean(), COMPOSITE_SCALE, outputs, 2)

    def outline_values(
        self, indicator: Indicator, outline: dict[str, Any], starts: list[date]
    ) -> dict[date, float | None]:
        """The mean of each composite in the outline; one too small to hold a pixel takes the pixel at its center."""
        asset = ASSETS + COMPOSITED[indicator][0]
        bands = {band_start(band): band for band in self._band_names(asset)}
        chosen = [bands[start] for start in starts]
        region = ee.Geometry(outline)

        def reduce(geometry: ee.Geometry) -> dict[str, Any]:
            found: dict[str, Any] = {}
            # Every composite at once exceeds Earth Engine's memory on large zones.
            for chunk in batched(chosen, OUTLINE_CHUNK, strict=False):
                reduced = (
                    ee.Image(asset)
                    .select(list(chunk))
                    .reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=geometry,
                        scale=OUTLINE_SCALE,
                        # Past this many pixels, Earth Engine reads coarser ones instead of failing.
                        maxPixels=OUTLINE_PIXELS,
                        bestEffort=True,
                        tileScale=4,
                    )
                )
                found |= cast(dict[str, Any], retry(f"outline {indicator} {chunk[0]}", reduced.getInfo))
            return found

        found = reduce(region)
        if outline["type"] != "Point" and all(found.get(band) is None for band in chosen):
            # Without data there, a zone keeps its nulls; only one that holds no pixel at all takes its center's.
            pixels = ee.Image.constant(1).reduceRegion(ee.Reducer.count(), region, OUTLINE_SCALE, maxPixels=10**9)
            if not cast(dict[str, Any], retry(f"outline {indicator} pixels", pixels.getInfo)).get("constant"):
                found = reduce(region.centroid(1))
        return {band_start(band): None if found.get(band) is None else round(float(found[band]), 2) for band in chosen}

    def _year_image(self, indicator: Indicator, year: int) -> ee.Image:
        if indicator in COMPOSITED:
            asset, per_year = COMPOSITED[indicator]
            bands = complete_years(self._band_names(ASSETS + asset), per_year)[year]
            total = ee.Image(ASSETS + asset).select(bands).reduce(ee.Reducer.sum())
            # Evapotranspiration is a daily rate over each 8-day composite.
            return total.multiply(8) if indicator == Indicator.ET else total
        if indicator == Indicator.IOSE:
            return ee.Image(ASSETS + IOSE).select(f"b{year}")
        # Grassland cover: the share of the zone's mapped land that is natural grassland.
        classes = ee.Image(MAPBIOMAS).select(f"classification_{year}")
        return classes.eq(12).unmask(0).updateMask(classes.gt(0))

    def year_values(self, division: Division, indicator: Indicator, years: list[int]) -> ZoneValues:
        image = ee.Image.cat([self._year_image(indicator, year).rename(f"y{year}") for year in years])
        outputs: dict[str, Period] = {f"y{year}" if len(years) > 1 else "mean": year for year in years}
        return self._reduce(division, image, ee.Reducer.mean(), SCALE.get(indicator, 500), outputs, 4)

    @staticmethod
    def _summarized_image(indicator: Indicator) -> ee.Image:
        if indicator == Indicator.DIVTFE:
            # Functional diversity: the entropy, in bits, of the ecosystem functional types around each pixel.
            return ee.Image(ASSETS + "EFT/TFE_17-19").toInt().entropy(ee.Kernel.square(4))
        if indicator == Indicator.CSUE:
            return ee.Image(ASSETS + "Soil/RUSLE_agricola_17-19")
        return ee.Image(ASSETS + "AHPPN/AHPPN_17-19_sin0").multiply(100)

    def summary(self, division: Division, indicator: Indicator) -> ZoneValues:
        if indicator == Indicator.COMPN:
            communities = ee.Image(COMMUNITIES)
            image = communities.updateMask(communities.gt(0))
            zones, id_property = self._zones(division)
            reduced = image.reduceRegions(
                collection=zones, reducer=ee.Reducer.frequencyHistogram(), scale=SCALE[indicator], tileScale=4
            ).select([".*"], retainGeometry=False)
            result = cast(dict[str, Any], retry(f"{division} {indicator}", reduced.getInfo))
            values: ZoneValues = {}
            for feature in cast(list[dict[str, Any]], result["features"]):
                properties = cast(dict[str, Any], feature["properties"])
                histogram = cast(dict[str, float] | None, properties.get("histogram"))
                if histogram:
                    values[zone_id(properties[id_property])] = {c: float(n) for c, n in histogram.items()}
            return values
        image = self._summarized_image(indicator)
        reducer = ee.Reducer.mean().combine(ee.Reducer.percentile([25, 75]), sharedInputs=True)
        outputs: dict[str, Period] = {"mean": "mean", "p25": "p25", "p75": "p75"}
        return self._reduce(division, image.rename("v"), reducer, 500, outputs, 4)

    def updated(self, asset: str) -> str:
        """When the asset last changed."""
        found = retry(f"asset {asset}", lambda: ee.data.getAsset(ASSETS + asset))
        return str(found["updateTime"])

    def _pages(self, label: str, collection: ee.FeatureCollection, size: int) -> list[dict[str, Any]]:
        count = cast(int, retry(f"{label} size", collection.size().getInfo))
        features: list[dict[str, Any]] = []
        for offset in range(0, count, size):
            page = ee.FeatureCollection(collection.toList(size, offset))
            result = cast(dict[str, Any], retry(f"{label} {offset}", page.getInfo))
            features.extend(cast(list[dict[str, Any]], result["features"]))
        log.info("%s: %d features", label, len(features))
        return features

    def zones(self, division: Division) -> list[dict[str, Any]]:
        """The division's zones as GeoJSON features, simplified, with their area in km² as `area_km2`."""
        found = DIVISIONS[division]

        def simplified(element: ee.Element) -> ee.Feature:
            feature = ee.Feature(element)
            area = feature.geometry().area(100).divide(1e6)
            return ee.Feature(feature.simplify(found.max_error).set("area_km2", area))

        return self._pages(str(division), ee.FeatureCollection(ASSETS + found.asset).map(simplified), 400)

    def departments(self) -> list[str]:
        """The departments the parcels are filed by, as the asset names them."""
        names = ee.FeatureCollection(ASSETS + PARCELS).aggregate_array("NOMDEPTO").distinct()
        return cast(list[str], retry("departments", names.getInfo))

    def parcels(self, department: str) -> list[dict[str, Any]]:
        """A department's parcels as GeoJSON features, simplified, with `PADRON` and `area_ha`."""

        def simplified(element: ee.Element) -> ee.Feature:
            return ee.Feature(element).simplify(12)

        parcels = ee.FeatureCollection(ASSETS + PARCELS).filter(ee.Filter.eq("NOMDEPTO", department))
        return self._pages(department, parcels.map(simplified).select(["PADRON", "area_ha"]), 1500)

    def _map_image(self, indicator: Indicator, year: int | None) -> ee.Image:
        """The image an indicator's map shows: one year's, or its only one."""
        if indicator == Indicator.COB:
            image = ee.Image(MAPBIOMAS).select(f"classification_{year}").eq(12)
        elif year is not None:
            image = self._year_image(indicator, year)
        elif indicator == Indicator.COMPN:
            communities = ee.Image(COMMUNITIES)
            image = communities.updateMask(communities.gt(0))
        else:
            image = self._summarized_image(indicator)
        country = ee.FeatureCollection(ASSETS + COUNTRY).geometry()
        return image.rename("v").clip(country)

    def value_range(self, indicator: Indicator, years: list[int | None]) -> tuple[float, float]:
        """The 2nd percentile of the lowest year and the 98th of the highest, in the whole country."""
        country = ee.FeatureCollection(ASSETS + COUNTRY).geometry()
        percentiles = ee.List(
            [
                self._map_image(indicator, year).reduceRegion(
                    reducer=ee.Reducer.percentile([2, 98]),
                    geometry=country,
                    scale=3000,
                    maxPixels=10_000_000_000,
                    bestEffort=True,
                )
                for year in years
            ]
        )
        found = cast(list[dict[str, float | None]], retry(f"range of {indicator}", percentiles.getInfo))
        # A year without pixels has no percentiles.
        lows = [low for p in found if (low := p.get("v_p2")) is not None]
        highs = [high for p in found if (high := p.get("v_p98")) is not None]
        return min(lows), max(highs)

    def picture(
        self, indicator: Indicator, year: int | None, low: float, high: float, width: int, height: int
    ) -> bytes:
        """The map in grayscale, from `low` (black) to `high` (white), transparent where there is no value, as PNG."""
        image = self._map_image(indicator, year).visualize(min=low, max=high, palette=["000000", "ffffff"])
        west, south, east, north = BOUNDS
        url = image.getThumbURL(
            {
                "region": ee.Geometry.Rectangle([west, south, east, north], "EPSG:4326", False),
                "dimensions": f"{width}x{height}",
                "crs": "EPSG:3857",
                "format": "png",
            }
        )

        def download() -> bytes:
            with urllib.request.urlopen(url, timeout=300) as response:
                return cast(bytes, response.read())

        return retry(f"map of {indicator} {year}", download)
