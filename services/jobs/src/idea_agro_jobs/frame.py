"""The frame the map images and the country outline share: Web Mercator over Uruguay's bounds."""

import math

# West, south, east, north, padded a little so outlines never touch the image's edge.
BOUNDS = (-58.46, -34.99, -53.16, -30.07)


def half_up(value: float) -> int:
    """Rounds halves up, as the website's scripts do."""
    return math.floor(value + 0.5)


def mercator_y(latitude: float) -> float:
    return math.log(math.tan(math.pi / 4 + latitude * math.pi / 360))


def height(width: int) -> int:
    """The height of an image of the frame that is `width` wide."""
    west, south, east, north = BOUNDS
    return half_up(width * (mercator_y(north) - mercator_y(south)) / ((east - west) * math.pi / 180))


def pixel(longitude: float, latitude: float, width: int) -> tuple[float, float]:
    """Where a point falls in an image of the frame that is `width` wide."""
    west, south, east, north = BOUNDS
    top, bottom = mercator_y(north), mercator_y(south)
    return (longitude - west) / (east - west) * width, (top - mercator_y(latitude)) / (top - bottom) * height(width)
