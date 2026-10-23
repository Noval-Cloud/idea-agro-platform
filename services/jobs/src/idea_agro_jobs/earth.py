# earthengine-api leaves some arguments untyped, and google.auth its credentials; this module is their only user.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false
"""Earth Engine as a source of the zones' values, computed from the indicator assets as they are.

Each seasonal indicator is one image with a band per composite, named `b<year>-<day of the year>`; the others are
one image with a band per year, or a single map.
"""

import logging
import math
import time
from collections.abc import Callable, Mapping
from datetime import date, timedelta
from typing import Any, cast

import ee
import google.auth

from idea_agro_jobs.domain import Division, Indicator, Period, ZoneValues

log = logging.getLogger(__name__)

ASSETS = "projects/pastizalesrou/assets/"
MAPBIOMAS = "projects/MapBiomas_Pampa/public/collection2/mapbiomas_pampa_collection2_integration_v1"
COMMUNITIES = "users/bagnato/PronosticoForrajero/ComunidadesDePastizal/ComunidadesPastizal"
SCOPES = ["https://www.googleapis.com/auth/earthengine", "https://www.googleapis.com/auth/cloud-platform"]

# Each division's zones, and the property that holds a zone's id.
DIVISIONS = {
    Division.SECCIONALES: ("Seccionales_Policiales", "CODIGOSECC"),
    Division.CUENCAS_1: ("cuencas/Cuencas_G1", "codcuenca"),
    Division.CUENCAS_2: ("cuencas/Cuencas_G2", "codcuenca"),
    Division.CUENCAS_3: ("cuencas/Cuencas_G3", "codcuenca"),
    Division.CUENCAS_4: ("cuencas/Cuencas_G4", "codcuenca"),
    Division.CUENCAS_5: ("cuencas/Cuencas_G5", "codcuenca"),
}
# The seasonal images and their composites per year.
SEASONAL = {Indicator.PPNA: ("ppna/ppna-16", 23), Indicator.APAR: ("apar/apar-16", 23), Indicator.ET: ("et/et-8", 46)}
# Pixel size of each indicator's reductions, in meters.
SCALE = {Indicator.RH: 1000, Indicator.COMPN: 250}
COMPOSITE_SCALE = 1000
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
        except ee.EEException as error:
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
        asset, id_property = DIVISIONS[division]
        return ee.FeatureCollection(ASSETS + asset).select([id_property]), id_property

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
        # Only the values travel back, not the outlines.
        found = reduced.select([id_property, *outputs], retainGeometry=False)
        result = cast(dict[str, Any], retry(f"{division} {list(outputs.values())[:3]}", found.getInfo))
        return zone_values(cast(list[dict[str, Any]], result["features"]), id_property, outputs, digits)

    def composites(self, indicator: Indicator) -> list[date]:
        return sorted(band_start(band) for band in self._band_names(ASSETS + SEASONAL[indicator][0]))

    def years(self, indicator: Indicator) -> list[int]:
        if indicator in SEASONAL:
            asset, per_year = SEASONAL[indicator]
            return list(complete_years(self._band_names(ASSETS + asset), per_year))
        if indicator == Indicator.COB:
            return sorted(int(b.removeprefix("classification_")) for b in self._band_names(MAPBIOMAS))
        return sorted(int(b.removeprefix("b")) for b in self._band_names(ASSETS + self._yearly_asset(indicator)))

    @staticmethod
    def _yearly_asset(indicator: Indicator) -> str:
        return {Indicator.RH: "rh/rh_PromedioAnual", Indicator.IOSE: "iose/iose_Historica"}[indicator]

    def composite_values(self, division: Division, indicator: Indicator, starts: list[date]) -> ZoneValues:
        bands = {band_start(band): band for band in self._band_names(ASSETS + SEASONAL[indicator][0])}
        chosen = [bands[start] for start in starts]
        # A reduction of a single band names its output after the reducer.
        outputs: dict[str, Period] = {band if len(chosen) > 1 else "mean": band_start(band) for band in chosen}
        image = ee.Image(ASSETS + SEASONAL[indicator][0]).select(chosen)
        return self._reduce(division, image, ee.Reducer.mean(), COMPOSITE_SCALE, outputs, 2)

    def _year_image(self, indicator: Indicator, year: int) -> ee.Image:
        if indicator in SEASONAL:
            asset, per_year = SEASONAL[indicator]
            bands = complete_years(self._band_names(ASSETS + asset), per_year)[year]
            total = ee.Image(ASSETS + asset).select(bands).reduce(ee.Reducer.sum())
            # Evapotranspiration is a daily rate over each 8-day composite.
            return total.multiply(8) if indicator == Indicator.ET else total
        if indicator == Indicator.RH:
            return ee.Image(ASSETS + "rh/rh_PromedioAnual").select(f"b{year}").multiply(12)
        if indicator == Indicator.IOSE:
            return ee.Image(ASSETS + "iose/iose_Historica").select(f"b{year}")
        # Grassland cover: the share of the zone's mapped land that is natural grassland.
        classes = ee.Image(MAPBIOMAS).select(f"classification_{year}")
        return classes.eq(12).unmask(0).updateMask(classes.gt(0))

    def year_values(self, division: Division, indicator: Indicator, years: list[int]) -> ZoneValues:
        image = ee.Image.cat([self._year_image(indicator, year).rename(f"y{year}") for year in years])
        outputs: dict[str, Period] = {f"y{year}" if len(years) > 1 else "mean": year for year in years}
        return self._reduce(division, image, ee.Reducer.mean(), SCALE.get(indicator, 500), outputs, 4)

    def summary(self, division: Division, indicator: Indicator) -> ZoneValues:
        if indicator == Indicator.COMPN:
            communities = ee.Image(COMMUNITIES)
            image = communities.updateMask(communities.gt(0))
            zones, id_property = self._zones(division)
            reduced = image.reduceRegions(
                collection=zones, reducer=ee.Reducer.frequencyHistogram(), scale=SCALE[indicator], tileScale=4
            ).select([id_property, "histogram"], retainGeometry=False)
            result = cast(dict[str, Any], retry(f"{division} {indicator}", reduced.getInfo))
            values: ZoneValues = {}
            for feature in cast(list[dict[str, Any]], result["features"]):
                properties = cast(dict[str, Any], feature["properties"])
                histogram = cast(dict[str, float] | None, properties.get("histogram"))
                if histogram:
                    values[zone_id(properties[id_property])] = {c: float(n) for c, n in histogram.items()}
            return values
        image = {
            # Functional diversity: the entropy, in bits, of the ecosystem functional types around each pixel.
            Indicator.DIVTFE: lambda: ee.Image(ASSETS + "EFT/TFE_17-19").toInt().entropy(ee.Kernel.square(4)),
            Indicator.CSUE: lambda: ee.Image(ASSETS + "Soil/RUSLE_agricola_17-19"),
            Indicator.AHPPN: lambda: ee.Image(ASSETS + "AHPPN/AHPPN_17-19_sin0").multiply(100),
        }[indicator]()
        reducer = ee.Reducer.mean().combine(ee.Reducer.percentile([25, 75]), sharedInputs=True)
        outputs: dict[str, Period] = {"mean": "mean", "p25": "p25", "p75": "p75"}
        return self._reduce(division, image.rename("v"), reducer, 500, outputs, 4)
