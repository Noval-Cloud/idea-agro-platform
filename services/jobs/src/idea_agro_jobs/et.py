# earthengine-api leaves some arguments untyped; this module only builds Earth Engine graphs.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false
"""ET's 8-day composites, computed as `et-generator.js`, the owner's Code Editor script, computes `et/et-8`.

MOD16A2's ET in mm, each gap filled linearly from the composites of its calendar year up to 72 days away, clipped to
Uruguay and divided by 8: a daily rate. The script defines ET_QC masks but applies none, so neither does this.
"""

from datetime import UTC, date, datetime, timedelta

import ee

SOURCE = "MODIS/061/MOD16A2"
OUTLINE = "users/fgallego/Contorno_Uy"
# Half of MODIS's 463 m pixel, in the source's own sinusoidal projection.
SCALE = 231.65635826395828
FRAME_DAYS = 72
# What the gap filling writes where it cannot fill, then masks.
NODATA = -9999
TIME = "system:time_start"
DAY_MS = 86_400_000


def millis(day: date) -> int:
    """Midnight UTC of `day`, as Earth Engine's times."""
    return int(datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp() * 1000)


def outline() -> ee.FeatureCollection:
    return ee.FeatureCollection(OUTLINE)


def region() -> ee.Geometry:
    return outline().geometry()


def starts(since: date, until: date) -> ee.List:
    """The start, in milliseconds, of each composite MODIS published from `since` to `until`."""
    published = ee.ImageCollection(SOURCE).filterDate(since.isoformat(), (until + timedelta(days=1)).isoformat())
    return published.aggregate_array(TIME)


def _rescale(image: ee.Image) -> ee.Image:
    image = ee.Image(image)
    return ee.Image(image.multiply(0.1).copyProperties(image, image.propertyNames()))


def _add_time_band(image: ee.Image) -> ee.Image:
    image = ee.Image(image)
    mask = image.mask()
    return image.addBands(image.metadata(TIME).rename("time").mask(mask))


def _replace_mask(image: ee.Image, other: ee.Image, nodata: int) -> ee.Image:
    """`image`, with `other` where `image` is masked; masked where neither has a value."""
    mask = image.mask()
    replaced = image.unmask(nodata).where(mask.Not(), other)
    return replaced.updateMask(replaced.neq(nodata))


def linear_interp(collection: ee.ImageCollection, frame: int, nodata: int) -> ee.ImageCollection:
    """`linearInterp` of `InterpoladorDDK` (Dongdong Kong's `pkg_smooth`): each image's gaps filled linearly between
    the closest earlier and later values up to `frame` days away, with a second band `qc`, 1 where it filled."""
    with_time = collection.map(_add_time_band)
    near = ee.Filter.maxDifference(frame * DAY_MS, TIME, None, TIME)
    # Each list includes the image itself, and ends with the closest, which the mosaic puts on top.
    after = ee.Filter.And(near, ee.Filter.lessThanOrEquals(leftField=TIME, rightField=TIME))
    joined = ee.Join.saveAll(matchesKey="after", ordering=TIME, ascending=False).apply(with_time, with_time, after)
    before = ee.Filter.And(near, ee.Filter.greaterThanOrEquals(leftField=TIME, rightField=TIME))
    joined = ee.Join.saveAll(matchesKey="before", ordering=TIME, ascending=True).apply(joined, with_time, before)

    def interpolate(element: ee.Element) -> ee.Image:
        image = ee.Image(element)
        earlier = ee.ImageCollection.fromImages(ee.List(image.get("before"))).mosaic()
        later = ee.ImageCollection.fromImages(ee.List(image.get("after"))).mosaic()
        image = ee.Image(image.set({"before": None, "after": None}))
        earlier = _replace_mask(earlier, later, nodata)
        later = _replace_mask(later, earlier, nodata)
        x1 = earlier.select("time").double()
        x2 = later.select("time").double()
        now = ee.Image.constant(image.date().millis()).double()
        ratio = now.subtract(x1).divide(x2.subtract(x1))
        earlier = earlier.select(0)
        later = later.select(0)
        image = image.select(0)
        filled = later.subtract(earlier).multiply(ratio).add(earlier)
        qc = image.mask().Not().rename("qc")
        filled = _replace_mask(image, filled, nodata)
        return ee.Image(filled.addBands(qc).copyProperties(image, image.propertyNames()))

    return ee.ImageCollection(joined.map(interpolate))


def _year(year: int) -> ee.ImageCollection:
    """The script's composites of a year: those starting before December 31st."""
    published = ee.ImageCollection(SOURCE).filterDate(f"{year}-01-01", f"{year}-12-31")
    return published.filterBounds(outline()).select("ET")


def composite(start: date) -> ee.Image:
    """The composite that starts on `start`, as `et-8` holds it: one band, in mm per day."""
    filled = linear_interp(_year(start.year).map(_rescale), FRAME_DAYS, NODATA).select([0])
    image = ee.Image(filled.filter(ee.Filter.eq(TIME, millis(start))).first())
    return ee.Image(image.clip(outline()).divide(8).copyProperties(image, [TIME, "system:time_end"]))
