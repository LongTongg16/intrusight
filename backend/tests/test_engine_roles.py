"""
Per-engine ingestion tests.

IntruSight supports four engines because they contribute different things. These
tests pin down what each one is expected to produce, and guard the correctness
properties that make a heterogeneous pipeline safe:

  * Suricata / Snort  -> detections carrying rule identity
  * Zeek              -> observations carrying protocol context, never a
                         fabricated signature id
  * Kismet            -> wireless observations and WIDS detections whose MAC
                         addresses never enter the IP-typed fields
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import eve_ingestor
import snort_ingestor
import zeek_ingestor
import kismet_ingestor
from routes.alerts import AlertIn
from services.geolocation_service import is_ip_address

FIXTURES = Path(__file__).resolve().parent.parent.parent / "demo" / "fixtures"


def _jsonl(path):
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _json_array(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


# ── Suricata: signature detection ────────────────────────────────────────────

class TestSuricataRole:
    @pytest.fixture
    def events(self):
        return [e for e in _jsonl(FIXTURES / "suricata" / "eve-alerts.json")
                if e.get("event_type") == "alert"]

    def test_fixture_parses_and_validates(self, events):
        assert events, "fixture must contain alert events"
        for event in events:
            AlertIn(**eve_ingestor.build_payload(event))

    def test_every_record_is_a_detection(self, events):
        for event in events:
            assert eve_ingestor.build_payload(event)["event_kind"] == "detection"

    def test_rule_identity_is_preserved(self, events):
        """A signature engine's value is the rule that matched."""
        for event in events:
            payload = eve_ingestor.build_payload(event)
            assert payload["sid"] == event["alert"]["signature_id"]
            assert payload["signature"] == event["alert"]["signature"]
            assert payload["category"] == event["alert"]["category"]

    def test_source_engine_is_tagged(self, events):
        assert {eve_ingestor.build_payload(e)["source_nids"] for e in events} == {"SURICATA"}

    def test_source_timestamp_is_preserved(self, events):
        for event in events:
            assert eve_ingestor.build_payload(event)["timestamp"] == event["timestamp"]

    def test_severity_normalises_onto_the_shared_scale(self, events):
        for event in events:
            assert eve_ingestor.build_payload(event)["severity"] in (1, 2, 3)

    def test_non_alert_events_are_not_ingested(self):
        """The fixture includes a flow record; only alerts belong in the queue."""
        raw = _jsonl(FIXTURES / "suricata" / "eve-alerts.json")
        assert any(e.get("event_type") != "alert" for e in raw), "fixture should cover this"
        assert eve_ingestor.process_line(json.dumps(
            {"event_type": "flow", "src_ip": "1.1.1.1", "dest_ip": "2.2.2.2"}
        )) == "skipped"


# ── Snort: rule-driven detection ─────────────────────────────────────────────

class TestSnortRole:
    @pytest.fixture
    def events(self):
        return _jsonl(FIXTURES / "snort" / "alert_json.txt")

    def test_fixture_parses_and_validates(self, events):
        assert events
        for event in events:
            AlertIn(**snort_ingestor.build_payload(event))

    def test_rule_message_is_not_rewritten(self, events):
        """
        The ingestor used to replace the rule's own message from a hardcoded SID
        table, hiding what the operator's rule actually said.
        """
        for event in events:
            assert snort_ingestor.build_payload(event)["signature"] == event["msg"]

    def test_rule_identity_is_carried_in_context(self, events):
        for event in events:
            context = snort_ingestor.build_payload(event)["engine_context"]
            assert context["rule"] == event["rule"]
            gid, sid, rev = event["rule"].split(":")
            assert context["rule_gid"] == int(gid)
            assert context["rule_rev"] == int(rev)

    def test_lab_rules_are_flagged_as_lab_rules(self, events):
        """A local demonstration rule must not read as production coverage."""
        for event in events:
            assert snort_ingestor.build_payload(event)["engine_context"]["lab_rule"] is True

    def test_protocol_is_not_defaulted_to_icmp(self):
        """
        The old default made every Snort record look like a ping. An unstated
        protocol is unknown.
        """
        payload = snort_ingestor.build_payload(
            {"timestamp": "2026-09-06T09:00:00Z", "rule": "1:1000004:2",
             "msg": "m", "src_ap": "10.0.0.1:1", "dst_ap": "10.0.0.2:2"}
        )
        assert payload["proto"] == "UNKNOWN"

    def test_priority_maps_onto_the_shared_scale(self, events):
        for event in events:
            payload = snort_ingestor.build_payload(event)
            assert payload["severity"] == snort_ingestor.map_snort_severity(event["priority"])
            assert payload["severity"] in (1, 2, 3)


# ── Zeek: protocol / network context ─────────────────────────────────────────

class TestZeekRole:
    @pytest.fixture
    def records(self):
        return _jsonl(FIXTURES / "zeek" / "zeek-logs.json")

    def test_fixture_parses_and_validates(self, records):
        assert records
        for record in records:
            AlertIn(**zeek_ingestor.build_payload(record))

    def test_no_fabricated_signature_id(self, records):
        """
        The regression this guards: the ingestor stamped every Zeek record with
        `sid = random.randint(10000, 99999)`, inventing a rule id for records
        that never matched a rule.
        """
        for record in records:
            assert zeek_ingestor.build_payload(record).get("sid") in (None, 0)

    @pytest.mark.parametrize("log,expected", [
        ("conn", "connection"), ("dns", "dns_query"),
        ("http", "http_request"), ("ssl", "tls_handshake"),
    ])
    def test_each_log_becomes_its_own_observation_type(self, records, log, expected):
        matching = [r for r in records if r.get("_path") == log]
        assert matching, f"fixture must cover {log}.log"
        for record in matching:
            payload = zeek_ingestor.build_payload(record)
            assert payload["event_kind"] == "observation"
            assert payload["observation_type"] == expected

    def test_observations_do_not_claim_to_be_findings(self, records):
        """Context is informational; only a Zeek notice is a detection."""
        for record in records:
            payload = zeek_ingestor.build_payload(record)
            if payload["event_kind"] == "observation":
                assert payload["severity"] == 3
                assert payload["category"] == "Network context"

    def test_notices_are_detections(self, records):
        notices = [r for r in records if r.get("_path") == "notice"]
        assert notices, "fixture must cover notice.log"
        for record in notices:
            payload = zeek_ingestor.build_payload(record)
            assert payload["event_kind"] == "detection"
            assert payload["observation_type"] is None

    def test_protocol_context_is_preserved(self, records):
        dns = next(r for r in records if r.get("_path") == "dns")
        context = zeek_ingestor.build_payload(dns)["engine_context"]
        assert context["query"] == dns["query"]
        assert context["uid"] == dns["uid"]

        ssl = next(r for r in records if r.get("_path") == "ssl")
        context = zeek_ingestor.build_payload(ssl)["engine_context"]
        assert context["server_name"] == ssl["server_name"]
        assert context["validation_status"] == ssl["validation_status"]

        conn = next(r for r in records if r.get("_path") == "conn" and "duration" in r)
        context = zeek_ingestor.build_payload(conn)["engine_context"]
        assert context["conn_state"] == conn["conn_state"]
        assert context["orig_bytes"] == conn["orig_bytes"]

    def test_source_timestamp_is_preserved_not_ingest_time(self, records):
        for record in records:
            produced = zeek_ingestor.build_payload(record)["timestamp"]
            expected = datetime.fromtimestamp(record["ts"], tz=timezone.utc).isoformat()
            assert produced == expected


# ── Kismet: wireless visibility ──────────────────────────────────────────────

class TestKismetRole:
    @pytest.fixture
    def devices(self):
        return _json_array(FIXTURES / "kismet" / "kismet-devices.json")

    @pytest.fixture
    def alerts(self):
        return _json_array(FIXTURES / "kismet" / "kismet-alerts.json")

    def test_fixtures_parse_and_validate(self, devices, alerts):
        assert devices and alerts
        for device in devices:
            AlertIn(**kismet_ingestor.build_device_payload(device))
        for alert in alerts:
            AlertIn(**kismet_ingestor.build_alert_payload(alert))

    def test_mac_addresses_never_enter_ip_fields(self, devices, alerts):
        """
        The correctness rule for this engine. MACs previously occupied
        src_ip/dest_ip, which is semantically wrong and put hardware addresses
        in front of any consumer expecting an IP.
        """
        payloads = ([kismet_ingestor.build_device_payload(d) for d in devices]
                    + [kismet_ingestor.build_alert_payload(a) for a in alerts])
        for payload in payloads:
            assert payload["src_ip"] is None
            assert payload["dest_ip"] is None
            assert payload["asset_kind"] == "mac"
            assert not is_ip_address(payload["source_asset"])

    def test_wireless_identity_is_preserved(self, devices):
        """SSID, BSSID, channel, band and encryption have no shared column."""
        ap = next(d for d in devices if d["kismet.device.base.type"] == "Wi-Fi AP")
        context = kismet_ingestor.build_device_payload(ap)["engine_context"]
        assert context["ssid"] == ap["kismet.device.base.name"]
        assert context["bssid"] == ap["kismet.device.base.macaddr"]
        assert context["channel"] == ap["kismet.device.base.channel"]
        assert context["encryption"] == ap["kismet.device.base.crypt"]
        assert context["band"] == ap["kismet.device.base.band"]

    def test_device_sightings_are_observations_not_alerts(self, devices):
        """Seeing an access point is not an attack."""
        for device in devices:
            payload = kismet_ingestor.build_device_payload(device)
            assert payload["event_kind"] == "observation"
            assert payload["observation_type"] in ("wireless_ap", "wireless_client")
            assert payload["severity"] == 3

    def test_wids_alerts_are_detections(self, alerts):
        for alert in alerts:
            payload = kismet_ingestor.build_alert_payload(alert)
            assert payload["event_kind"] == "detection"
            assert payload["signature"] == alert["kismet.alert.header"]

    def test_epoch_timestamps_are_normalised_to_iso(self, alerts):
        """
        Kismet reports epoch seconds; the contract types timestamp as a string,
        so the raw value used to be rejected with HTTP 422.
        """
        for alert in alerts:
            produced = kismet_ingestor.build_alert_payload(alert)["timestamp"]
            assert isinstance(produced, str)
            expected = datetime.fromtimestamp(
                alert["kismet.alert.timestamp"], tz=timezone.utc
            ).isoformat()
            assert produced == expected

    def test_severity_maps_onto_the_shared_scale(self, alerts):
        for alert in alerts:
            severity = kismet_ingestor.build_alert_payload(alert)["severity"]
            assert severity in (1, 2, 3)


# ── Cross-engine contract ────────────────────────────────────────────────────

class TestSharedContract:
    def test_legacy_payload_still_validates(self):
        """Every new field is optional: an ingestor written against the original
        contract must keep working untouched."""
        legacy = AlertIn(timestamp="2026-09-06T09:00:00Z", src_ip="10.0.0.1",
                         dest_ip="10.0.0.2", signature="legacy", severity=2)
        assert legacy.event_kind == "detection"
        assert legacy.engine_context is None

    def test_a_record_must_identify_its_endpoints(self):
        with pytest.raises(ValueError):
            AlertIn(timestamp="t", signature="s", severity=2)

    def test_unknown_event_kind_is_rejected(self):
        with pytest.raises(ValueError):
            AlertIn(timestamp="t", signature="s", severity=2,
                    src_ip="1.1.1.1", dest_ip="2.2.2.2", event_kind="incident")

    def test_unknown_asset_kind_is_rejected(self):
        with pytest.raises(ValueError):
            AlertIn(timestamp="t", signature="s", severity=2,
                    source_asset="a", destination_asset="b", asset_kind="hostname")

    def test_all_four_engines_are_represented(self):
        """The demonstration corpus must actually cover every engine."""
        engines = set()
        for event in _jsonl(FIXTURES / "suricata" / "eve-alerts.json"):
            if event.get("event_type") == "alert":
                engines.add(eve_ingestor.build_payload(event)["source_nids"])
        for event in _jsonl(FIXTURES / "snort" / "alert_json.txt"):
            engines.add(snort_ingestor.build_payload(event)["source_nids"])
        for record in _jsonl(FIXTURES / "zeek" / "zeek-logs.json"):
            engines.add(zeek_ingestor.build_payload(record)["source_nids"])
        for device in _json_array(FIXTURES / "kismet" / "kismet-devices.json"):
            engines.add(kismet_ingestor.build_device_payload(device)["source_nids"])
        assert engines == {"SURICATA", "SNORT", "ZEEK", "KISMET"}

    def test_engines_contribute_different_record_kinds(self):
        """
        The point of the redesign: the four engines must not all produce the
        same shape. Zeek and Kismet contribute observations; the signature
        engines do not.
        """
        zeek_kinds = {zeek_ingestor.build_payload(r)["event_kind"]
                      for r in _jsonl(FIXTURES / "zeek" / "zeek-logs.json")}
        kismet_kinds = {kismet_ingestor.build_device_payload(d)["event_kind"]
                        for d in _json_array(FIXTURES / "kismet" / "kismet-devices.json")}
        suricata_kinds = {eve_ingestor.build_payload(e)["event_kind"]
                          for e in _jsonl(FIXTURES / "suricata" / "eve-alerts.json")
                          if e.get("event_type") == "alert"}

        assert "observation" in zeek_kinds
        assert kismet_kinds == {"observation"}
        assert suricata_kinds == {"detection"}


# ── Demonstration loader ─────────────────────────────────────────────────────

class TestDemoLoader:
    """
    The loader must exercise the real ingestors rather than inventing records,
    and must tag everything it creates so cleanup can be precise.
    """

    @pytest.fixture
    def demo(self):
        import importlib.util
        path = Path(__file__).resolve().parent.parent / "tools" / "demo.py"
        spec = importlib.util.spec_from_file_location("intrusight_demo", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_every_engine_has_a_scenario(self, demo):
        assert set(demo.ENGINES) == {"suricata", "snort", "zeek", "kismet"}

    def test_each_scenario_yields_valid_records(self, demo):
        for name, (_role, loader) in demo.ENGINES.items():
            records = list(loader())
            assert records, f"{name} scenario produced nothing"
            for record in records:
                AlertIn(**record)

    def test_corpus_is_small_and_covers_both_record_kinds(self, demo):
        records = [r for _role, loader in demo.ENGINES.values() for r in loader()]
        assert 12 <= len(records) <= 40, "corpus should stay small and reviewable"
        kinds = {r["event_kind"] for r in records}
        assert kinds == {"detection", "observation"}

    def test_observation_types_are_distinct_per_engine(self, demo):
        """Zeek and Kismet must not converge on the same observation vocabulary."""
        zeek = {r.get("observation_type") for r in demo.load_zeek()} - {None}
        kismet = {r.get("observation_type") for r in demo.load_kismet()} - {None}
        assert zeek and kismet
        assert not (zeek & kismet), "engines should contribute different observation types"

    def test_loader_does_not_fabricate_severity_for_observations(self, demo):
        for _role, loader in demo.ENGINES.values():
            for record in loader():
                if record["event_kind"] == "observation":
                    assert record["severity"] == 3
