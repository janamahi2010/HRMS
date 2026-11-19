from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_M = 6_371_008.8  # mean Earth radius (IUGG)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters between two WGS84 points."""
    lat1, lng1, lat2, lng2 = map(lambda v: radians(float(v)), (lat1, lng1, lat2, lng2))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(a)))
