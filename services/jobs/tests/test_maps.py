import io
import json
from pathlib import Path
from typing import Any

import pytest
from idea_agro_jobs import maps
from idea_agro_jobs.domain import Indicator
from idea_agro_jobs.files import LocalFiles
from PIL import Image

THEME = {
    "luts": {family: ["#000010", "#808080", "#ffffff"] for family in set(maps.FAMILIES.values())},
    "chrome": {"land": "#eceff5", "line-strong": "#c6cbd4"},
}


def png(width: int, height: int) -> bytes:
    """Half the map has a value, white; the other half has none."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    image.paste((255, 255, 255, 255), (0, 0, width // 2, height))
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


class FakeMaps:
    def __init__(self, years: list[int]) -> None:
        self.complete_years = years
        self.drawn: list[tuple[Indicator, int | None, float, float]] = []
        self.ranged: list[Indicator] = []

    def years(self, indicator: Indicator) -> list[int]:
        return self.complete_years

    def value_range(self, indicator: Indicator, years: list[int | None]) -> tuple[float, float]:
        self.ranged.append(indicator)
        return 1.23456, 9.87654

    def picture(
        self, indicator: Indicator, year: int | None, low: float, high: float, width: int, height: int
    ) -> bytes:
        self.drawn.append((indicator, year, low, high))
        return png(width, height)


@pytest.fixture(autouse=True)
def small(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(maps, "WIDTH", 160)
    monkeypatch.setattr(maps, "LITE_WIDTH", 80)


@pytest.fixture
def files(tmp_path: Path) -> LocalFiles:
    catalog: dict[str, Any] = {
        "seasonal": {"ppna": []},
        "indicators": {"ppna": {"kind": "continuous", "min": 100.0, "max": 900.0}},
    }
    (tmp_path / "catalog.json").write_text(json.dumps(catalog))
    return LocalFiles(tmp_path)


def read(files: LocalFiles, name: str) -> Any:
    content = files.read(name)
    assert content is not None
    return json.loads(content)


def size(files: LocalFiles, name: str) -> tuple[int, int]:
    content = files.read(name)
    assert content is not None
    return Image.open(io.BytesIO(content)).size


def test_a_run_draws_every_map_once_with_its_light_copy_and_thumbnails(files: LocalFiles) -> None:
    source = FakeMaps([2023, 2024])

    maps.refresh(source, files, {"light": THEME, "dark": THEME})

    assert (Indicator.PPNA, 2024, 100.0, 900.0) in source.drawn
    assert (Indicator.COB, 2023, 0.0, 1.0) in source.drawn
    assert (Indicator.COMPN, None, 0.0, 5.0) in source.drawn
    assert size(files, "maps/ppna/2024.webp") == (160, 176)
    assert size(files, "maps/ppna/lite/2024.webp") == (80, 88)
    assert size(files, "maps/csue/static.webp") == (160, 176)
    assert size(files, "maps/thumbnails/rh-dark.webp") == (160, 120)
    catalog = read(files, "catalog.json")
    assert catalog["seasonal"] == {"ppna": []}
    assert catalog["size"] == [160, 176]
    assert catalog["lite_size"] == [80, 88]
    assert catalog["indicators"]["ppna"] == {"kind": "continuous", "years": [2023, 2024], "min": 100.0, "max": 900.0}
    assert catalog["indicators"]["rh"]["min"] == 1.2346
    assert catalog["indicators"]["compn"] == {"kind": "categorical", "years": None, "classes": [1, 2, 3, 4, 5]}
    assert catalog["indicators"]["cob"] == {"kind": "binary", "years": [2023, 2024]}
    # A known range stays as it is.
    assert Indicator.PPNA not in source.ranged


def test_a_run_draws_only_new_years(files: LocalFiles) -> None:
    maps.refresh(FakeMaps([2023]), files, {"light": THEME, "dark": THEME})
    source = FakeMaps([2023, 2024])

    maps.refresh(source, files, {"light": THEME, "dark": THEME})

    assert {year for _, year, _, _ in source.drawn} == {2024}


def test_an_indicator_to_recompute_is_drawn_again_with_a_new_range(files: LocalFiles) -> None:
    maps.refresh(FakeMaps([2023]), files, {"light": THEME, "dark": THEME})
    source = FakeMaps([2023])

    maps.refresh(source, files, {"light": THEME, "dark": THEME}, recompute=[Indicator.PPNA])

    assert source.drawn == [(Indicator.PPNA, 2023, 1.2346, 9.8765)]
    assert source.ranged == [Indicator.PPNA]
    assert read(files, "catalog.json")["indicators"]["ppna"]["min"] == 1.2346


def test_thumbnails_color_grays_as_the_website_does() -> None:
    ramp = [(0, 0, 0), (128, 128, 128), (255, 255, 255)]
    land, neutral = (1, 1, 1), (2, 2, 2)

    continuous = list(maps.colors("continuous", ramp, land, neutral))
    binary = list(maps.colors("binary", ramp, land, neutral))
    classes = list(maps.colors("categorical", ramp, land, neutral))

    assert (continuous[0], continuous[128], continuous[255]) == ((0, 0, 0), (128, 128, 128), (255, 255, 255))
    assert (binary[0], binary[255]) == (neutral, (128, 128, 128))
    assert (classes[0], classes[51], classes[255]) == (land, (128, 128, 128), (255, 255, 255))
