"""The maps task: each indicator's map images, full and light, and the layer picker's thumbnails.

The images are grayscale over the frame: the website colors them with its palettes, so one file serves light and dark.
"""

import io
import json
import logging
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Literal, Protocol, cast

from PIL import Image, ImageOps

from idea_agro_jobs.domain import YEARLY, Indicator
from idea_agro_jobs.files import Files
from idea_agro_jobs.frame import BOUNDS, half_up, height
from idea_agro_jobs.values import CATALOG, encode

log = logging.getLogger(__name__)

type Kind = Literal["continuous", "binary", "categorical"]
type Theme = dict[str, Any]
type Color = tuple[int, int, int]

WIDTH = 1600
LITE_WIDTH = 800
THUMBNAIL = (160, 120)
KINDS: dict[Indicator, Kind] = {Indicator.COB: "binary", Indicator.COMPN: "categorical"}
CLASSES = [1, 2, 3, 4, 5]
# The website's palette each indicator's thumbnail is colored with.
FAMILIES = {
    Indicator.APAR: "productivity",
    Indicator.PPNA: "productivity",
    Indicator.COB: "ecosystem",
    Indicator.COMPN: "ecosystem",
    Indicator.RH: "water",
    Indicator.ET: "water",
    Indicator.IOSE: "ecosystem",
    Indicator.DIVTFE: "ecosystem",
    Indicator.CSUE: "soil",
    Indicator.AHPPN: "human",
}
THEMES = ("light", "dark")


class MapSource(Protocol):
    def years(self, indicator: Indicator) -> list[int]: ...

    def value_range(self, indicator: Indicator, years: list[int | None]) -> tuple[float, float]:
        """The range a map's gray spans, the same for all its years."""
        ...

    def picture(
        self, indicator: Indicator, year: int | None, low: float, high: float, width: int, height: int
    ) -> bytes:
        """The map in grayscale, from `low` (black) to `high` (white), transparent where there is no value, as PNG."""
        ...


def kind(indicator: Indicator) -> Kind:
    return KINDS.get(indicator, "continuous")


def map_name(indicator: Indicator, year: int | None, lite: bool) -> str:
    return f"maps/{indicator}/{'lite/' if lite else ''}{year or 'static'}.webp"


def thumbnail_name(indicator: Indicator, theme: str) -> str:
    return f"maps/thumbnails/{indicator}-{theme}.webp"


def webp(image: Image.Image, lossless: bool, quality: int) -> bytes:
    buffer = io.BytesIO()
    if lossless:
        image.save(buffer, "WEBP", lossless=True)
    else:
        image.save(buffer, "WEBP", quality=quality, alpha_quality=100, method=6)
    return buffer.getvalue()


def full_and_lite(png: bytes, map_kind: Kind) -> tuple[bytes, bytes]:
    """Continuous maps are compressed; classes and the no-data mask stay exact in the others."""
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    lossless = map_kind != "continuous"
    size = (LITE_WIDTH, half_up(image.height * LITE_WIDTH / image.width))
    lite = image.resize(size, Image.Resampling.NEAREST if lossless else Image.Resampling.LANCZOS)
    return webp(image, lossless, 70), webp(lite, lossless, 60)


def rgb(color: str) -> Color:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def colors(map_kind: Kind, ramp: list[Color], land: Color, neutral: Color) -> Iterator[Color]:
    """The color of each gray, as the website colors the map."""
    last = len(ramp) - 1
    for gray in range(256):
        if map_kind == "continuous":
            yield ramp[half_up(gray / 255 * last)]
        elif map_kind == "binary":
            yield ramp[half_up(0.72 * last)] if gray >= 128 else neutral
        else:
            found = half_up(gray / 51)
            yield ramp[half_up((0.35 + found * 0.12) * last)] if found > 0 else land


def thumbnail(lite: bytes, indicator: Indicator, theme: Theme) -> bytes:
    image = Image.open(io.BytesIO(lite)).convert("RGBA")
    ramp = [rgb(c) for c in cast(list[str], theme["luts"][FAMILIES[indicator]])]
    land, neutral = rgb(theme["chrome"]["land"]), rgb(theme["chrome"]["line-strong"])
    palette = [channel for color in colors(kind(indicator), ramp, land, neutral) for channel in color]
    gray = image.getchannel("R")
    gray.putpalette(palette)
    colored = Image.new("RGB", image.size, land)
    colored.paste(gray.convert("RGB"), mask=image.getchannel("A").point([255 if a >= 128 else 0 for a in range(256)]))
    return webp(ImageOps.fit(colored, THUMBNAIL, Image.Resampling.LANCZOS), False, 80)


def refresh(source: MapSource, files: Files, themes: dict[str, Theme]) -> None:
    content = files.read(CATALOG)
    known = cast(dict[str, dict[str, Any]], json.loads(content).get("indicators", {}) if content else {})
    indicators: dict[str, dict[str, Any]] = {}
    lite_size = [LITE_WIDTH, half_up(height(WIDTH) * LITE_WIDTH / WIDTH)]
    for indicator in Indicator:
        map_kind = kind(indicator)
        years = source.years(indicator) if indicator in YEARLY else []
        periods: list[int | None] = [*years] or [None]
        entry: dict[str, Any] = {"kind": map_kind, "years": years or None}
        low, high = 0.0, 1.0
        if map_kind == "continuous":
            # The range stays fixed once known, so a time-lapse shows change instead of rescaled images.
            before = known.get(indicator, {})
            if before.get("min") is None or before.get("max") is None:
                found = source.value_range(indicator, periods)
                before = {"min": round(found[0], 4), "max": round(found[1], 4)}
            low, high = before["min"], before["max"]
            entry |= {"min": low, "max": high}
        elif map_kind == "categorical":
            entry["classes"] = CLASSES
            high = 5.0

        drawn: list[int | None] = []
        for period in periods:
            if files.exists(map_name(indicator, period, lite=False)):
                continue
            png = source.picture(indicator, period, low, high, WIDTH, height(WIDTH))
            full, lite = full_and_lite(png, map_kind)
            files.write(map_name(indicator, period, lite=False), full)
            files.write(map_name(indicator, period, lite=True), lite)
            drawn.append(period)
            log.info("maps %s %s: drawn", indicator, period or "static")

        latest = periods[-1]
        if latest in drawn or not all(files.exists(thumbnail_name(indicator, t)) for t in themes):
            lite = files.read(map_name(indicator, latest, lite=True))
            if lite is not None:
                for name, theme in themes.items():
                    files.write(thumbnail_name(indicator, name), thumbnail(lite, indicator, theme))
        indicators[indicator] = entry

    sections = {
        "bounds": list(BOUNDS),
        "size": [WIDTH, height(WIDTH)],
        "lite_size": lite_size,
        "indicators": indicators,
    }

    def with_maps(current: bytes | None) -> bytes:
        catalog = cast(dict[str, Any], json.loads(current)) if current else {}
        return encode(catalog | sections)

    files.update(CATALOG, with_maps)
    log.info("maps: catalog updated")


def themes_from(path: Path) -> dict[str, Theme]:
    """The website's map palettes, light and dark (`pnpm tokens` writes them)."""
    found = cast(dict[str, Theme], json.loads(path.read_text()))
    return {name: found[name] for name in THEMES}
