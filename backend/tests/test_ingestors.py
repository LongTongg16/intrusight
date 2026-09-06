"""
Tests for the shared ingestion contract across engines.

Covers the normalisation rules that let Suricata, Snort, Zeek and Kismet events
share one alert schema: the 1=high/2=medium/3=low severity scale, source event
time preservation, and address handling for engines that do not report IPs.
"""

import importlib
import os
import sys
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import eve_ingestor
import zeek_ingestor
from routes.alerts import AlertIn
from services.geolocation_service import get_location_from_ip, is_ip_address


# ── Suricata severity normalisation ──────────────────────────────────────────

class TestSuricataSeverityNormalisation:
    """Suricata's native scale runs 1-4; the shared contract only has 1-3."""

    @pytest.mark.parametrize("native,shared", [(1, 1), (2, 2), (3, 3), (4, 3)])
    def test_native_severity_maps_onto_shared_scale(self, native, shared):
        assert eve_ingestor.to_shared_severity(native) == shared

    @pytest.mark.parametrize("unexpected", [0, 5, 99, -1, None])
    def test_unexpected_severity_falls_back_to_low(self, unexpected):
        assert eve_ingestor.to_shared_severity(unexpected) == 3

    @pytest.mark.parametrize("native", [1, 2, 3, 4])
    def test_compute_severity_reads_the_native_event_value(self, native):
        event = {"alert": {"severity": native, "category": "Unknown"}}
        assert eve_ingestor.compute_severity(event) == native

    def test_missing_severity_falls_back_to_category(self):
        event = {"alert": {"category": "A Network Trojan was Detected"}}
        assert eve_ingestor.compute_severity(event) == 1

    def test_unknown_category_without_severity_defaults_to_low(self):
        event = {"alert": {"category": "Something Unmapped"}}
        assert eve_ingestor.compute_severity(event) == 3

    def test_informational_category_normalises_to_shared_low(self):
        """'Not Suspicious Traffic' maps to native 4, which must reach the API as 3."""
        event = {"alert": {"category": "Not Suspicious Traffic"}}

        assert eve_ingestor.compute_severity(event) == 4
        assert eve_ingestor.build_payload(event)["severity"] == 3

    @pytest.mark.parametrize("native", [1, 2, 3, 4])
    def test_built_payload_always_validates_against_the_api_schema(self, native):
        """The regression this guards: native 4 used to be rejected with HTTP 422."""
        event = {
            "timestamp": "2024-05-13T10:30:00.000000+0000",
            "src_ip": "192.168.1.10",
            "dest_ip": "10.0.0.1",
            "src_port": 1234,
            "dest_port": 443,
            "proto": "tcp",
            "alert": {
                "severity": native,
                "signature": "Test Signature",
                "category": "Unknown",
                "signature_id": 2016400,
            },
        }

        payload = eve_ingestor.build_payload(event)
        validated = AlertIn(**payload)

        assert 1 <= validated.severity <= 3

    def test_severity_labels_match_the_shared_contract(self):
        assert eve_ingestor.SEVERITY_LABELS == {1: "high", 2: "medium", 3: "low"}


# ── Zeek timestamp integrity ─────────────────────────────────────────────────

class TestZeekTimestampIntegrity:
    """Zeek notice records carry the observation time; it must not be discarded."""

    def test_epoch_float_is_preserved(self):
        result = zeek_ingestor.extract_timestamp({"ts": 1715596200.5})

        parsed = datetime.fromisoformat(result)
        assert parsed.tzinfo is not None
        assert parsed == datetime.fromtimestamp(1715596200.5, tz=timezone.utc)

    def test_epoch_numeric_string_is_preserved(self):
        result = zeek_ingestor.extract_timestamp({"ts": "1715596200"})

        assert datetime.fromisoformat(result) == datetime.fromtimestamp(
            1715596200, tz=timezone.utc
        )

    def test_iso_string_with_zulu_suffix_is_preserved(self):
        result = zeek_ingestor.extract_timestamp({"ts": "2024-05-13T10:30:00Z"})

        assert datetime.fromisoformat(result) == datetime(
            2024, 5, 13, 10, 30, tzinfo=timezone.utc
        )

    def test_naive_iso_string_is_treated_as_utc(self):
        result = zeek_ingestor.extract_timestamp({"ts": "2024-05-13T10:30:00"})

        assert datetime.fromisoformat(result) == datetime(
            2024, 5, 13, 10, 30, tzinfo=timezone.utc
        )

    @pytest.mark.parametrize("record", [
        {},
        {"ts": None},
        {"ts": ""},
        {"ts": "   "},
        {"ts": "not-a-timestamp"},
        {"ts": True},
    ])
    def test_unusable_source_time_falls_back_to_ingest_time(self, record):
        before = datetime.now(timezone.utc)
        result = zeek_ingestor.extract_timestamp(record)
        after = datetime.now(timezone.utc)

        parsed = datetime.fromisoformat(result)
        assert parsed.tzinfo is not None, "fallback must be timezone-aware"
        assert before - timedelta(seconds=1) <= parsed <= after + timedelta(seconds=1)

    def test_source_time_is_used_rather_than_ingest_time(self):
        """A year-old event must not be relabelled with the current time."""
        old_event_epoch = (
            datetime.now(timezone.utc) - timedelta(days=365)
        ).timestamp()

        parsed = datetime.fromisoformat(
            zeek_ingestor.extract_timestamp({"ts": old_event_epoch})
        )

        assert datetime.now(timezone.utc) - parsed > timedelta(days=364)


# ── Kismet address semantics / GeoIP validation ──────────────────────────────

class TestGeoIpAddressValidation:
    """
    Kismet places 802.11 MAC addresses in the shared src_ip/dest_ip fields.
    Geolocation must reject them explicitly instead of attempting a lookup.
    """

    @pytest.mark.parametrize("mac", [
        "00:11:22:33:44:55",
        "de:ad:be:ef:ca:fe",
        "00:00:00:00:00:00",
        "AA-BB-CC-DD-EE-FF",
    ])
    def test_mac_addresses_are_not_ip_addresses(self, mac):
        assert is_ip_address(mac) is False

    @pytest.mark.parametrize("value", [
        "", "   ", "not-an-ip", "999.999.999.999", "192.168.1", None, 12345, ["10.0.0.1"],
    ])
    def test_non_ip_values_are_rejected(self, value):
        assert is_ip_address(value) is False

    @pytest.mark.parametrize("ip", [
        "8.8.8.8", "192.168.1.10", "2001:4860:4860::8888", "::1", " 1.1.1.1 ",
    ])
    def test_ip_literals_are_accepted(self, ip):
        assert is_ip_address(ip) is True

    def test_mac_address_lookup_never_reaches_the_geoip_reader(self):
        with patch("services.geolocation_service.get_geoip_reader") as mock_reader:
            assert get_location_from_ip("00:11:22:33:44:55") is None
            mock_reader.assert_not_called()

    @pytest.mark.parametrize("ip", ["8.8.8.8", "2001:4860:4860::8888"])
    def test_valid_ip_still_reaches_the_geoip_reader(self, ip):
        # `name` is reserved by the Mock constructor, so set it after creation.
        country = MagicMock(iso_code="US")
        country.name = "United States"
        city = MagicMock()
        city.name = "Mountain View"

        reader = MagicMock()
        reader.city.return_value = MagicMock(
            country=country,
            subdivisions=[],
            city=city,
            location=MagicMock(
                latitude=37.4,
                longitude=-122.0,
                time_zone="America/Los_Angeles",
                accuracy_radius=10,
            ),
        )

        with patch("services.geolocation_service.get_geoip_reader", return_value=reader):
            result = get_location_from_ip(ip)

        reader.city.assert_called_once_with(ip)
        assert result is not None
        assert result["country"] == "US"
        assert result["country_name"] == "United States"
        assert result["city"] == "Mountain View"

    def test_lookup_returns_none_when_no_database_is_configured(self):
        with patch("services.geolocation_service.get_geoip_reader", return_value=None):
            assert get_location_from_ip("8.8.8.8") is None


# ── Maintenance / log-source collection consistency ──────────────────────────

class TestMaintenanceCollections:
    def test_canonical_collections_are_configured(self):
        from routes.maintenance import COLLECTIONS

        assert set(COLLECTIONS) == {"users", "alerts", "log_sources"}

    def test_backups_cover_users_alerts_and_log_sources(self):
        from routes.maintenance import COLLECTIONS

        for required in ("users", "alerts", "log_sources"):
            assert required in COLLECTIONS

    def test_stale_logs_collection_is_not_configured(self):
        """The application never creates a 'logs' collection; it always read 0."""
        from routes.maintenance import COLLECTIONS

        assert "logs" not in COLLECTIONS

    @pytest.mark.asyncio
    async def test_maintenance_targets_the_collection_the_log_routes_use(self):
        """Cross-module check: routes/logs.py and maintenance must agree."""
        from routes.logs import get_logs
        from routes.maintenance import COLLECTIONS

        with patch("routes.logs.db") as mock_db:
            mock_db.log_sources.find.return_value.to_list = AsyncMock(return_value=[])

            await get_logs(user={"role": "Administrator"})

            mock_db.log_sources.find.assert_called_once()

        assert "log_sources" in COLLECTIONS


# ── Engine-specific ingestor path configuration ──────────────────────────────

class TestEngineSpecificPathVariables:
    """Engine-specific variables win; ALERTS_FILE_PATH stays as a legacy fallback."""

    @staticmethod
    def _reload(module_name, env):
        with patch.dict(os.environ, env, clear=False):
            for stale in ("SURICATA_EVE_PATH", "SNORT_ALERT_PATH", "ALERTS_FILE_PATH"):
                if stale not in env:
                    os.environ.pop(stale, None)
            # Keep a developer's private backend/.env from repopulating a path
            # intentionally omitted by this isolated configuration test.
            with patch("dotenv.load_dotenv", return_value=False):
                return importlib.reload(importlib.import_module(module_name))

    def test_suricata_prefers_its_engine_specific_variable(self):
        module = self._reload("eve_ingestor", {
            "SURICATA_EVE_PATH": "/tmp/suricata-eve.json",
            "ALERTS_FILE_PATH": "/tmp/legacy.json",
        })
        assert module.EVE_PATH == "/tmp/suricata-eve.json"

    def test_suricata_falls_back_to_the_legacy_variable(self):
        module = self._reload("eve_ingestor", {"ALERTS_FILE_PATH": "/tmp/legacy.json"})
        assert module.EVE_PATH == "/tmp/legacy.json"

    def test_snort_prefers_its_engine_specific_variable(self):
        module = self._reload("snort_ingestor", {
            "SNORT_ALERT_PATH": "/tmp/snort-alerts.txt",
            "ALERTS_FILE_PATH": "/tmp/legacy.json",
        })
        assert module.SNORT_PATH == "/tmp/snort-alerts.txt"

    def test_snort_falls_back_to_the_legacy_variable(self):
        module = self._reload("snort_ingestor", {"ALERTS_FILE_PATH": "/tmp/legacy.json"})
        assert module.SNORT_PATH == "/tmp/legacy.json"
