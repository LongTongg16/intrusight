import ipaddress
import os
import geoip2.database
from typing import Optional, Dict

# Path to MaxMind GeoLite2 database
GEOIP_DB_PATH = os.getenv("GEOIP_DB_PATH", "geoip/GeoLite2-City.mmdb")

_reader = None


def is_ip_address(value) -> bool:
    """
    Return True only for literal IPv4/IPv6 addresses.

    Kismet alerts reuse the shared ``src_ip``/``dest_ip`` fields to carry 802.11
    hardware (MAC) addresses, so geolocation must reject non-IP values explicitly
    instead of relying on the GeoIP reader to raise on them.
    """
    if not isinstance(value, str):
        return False
    try:
        ipaddress.ip_address(value.strip())
    except ValueError:
        return False
    return True


def get_geoip_reader():
    """Initialize and cache the GeoIP reader"""
    global _reader
    if _reader is None:
        if not os.path.exists(GEOIP_DB_PATH):
            return None
        try:
            _reader = geoip2.database.Reader(GEOIP_DB_PATH)
        except Exception:
            return None
    return _reader


def get_location_from_ip(ip_address: str) -> Optional[Dict]:
    """
    Lookup geolocation data for an IP address
    
    Args:
        ip_address: IPv4 or IPv6 address to lookup. Values that are not IP
            literals (for example the MAC addresses Kismet alerts place in
            src_ip/dest_ip) are rejected before any lookup is attempted.

    Returns:
        Dictionary with location data or None if the value is not an IP address
        or the lookup fails
        {
            "country": "US",
            "country_name": "United States",
            "region": "CA",
            "city": "Los Angeles",
            "latitude": 34.0522,
            "longitude": -118.2437,
            "timezone": "America/Los_Angeles",
            "isp": "ISP Name" (if available)
        }
    """
    if not is_ip_address(ip_address):
        return None

    reader = get_geoip_reader()
    if reader is None:
        return None
    
    try:
        response = reader.city(ip_address)
        
        location_data = {
            "country": response.country.iso_code,
            "country_name": response.country.name,
            "region": response.subdivisions[0].iso_code if response.subdivisions else None,
            "region_name": response.subdivisions[0].name if response.subdivisions else None,
            "city": response.city.name,
            "latitude": response.location.latitude,
            "longitude": response.location.longitude,
            "timezone": response.location.time_zone,
            "accuracy_radius": response.location.accuracy_radius,
        }
        
        return location_data
    except geoip2.errors.AddressNotFoundError:
        # IP address not in database (e.g., private networks)
        return None
    except Exception:
        return None


def close_geoip_reader():
    """Close the GeoIP reader connection"""
    global _reader
    if _reader is not None:
        _reader.close()
        _reader = None
