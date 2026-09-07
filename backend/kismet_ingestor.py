import time
import requests
import os
from datetime import datetime, timezone
from config import load_backend_env

load_backend_env()
KISMET_API_KEY = os.getenv("KISMET_API_KEY")
KISMET_URL = os.getenv(
    "KISMET_URL",
    "http://localhost:2501/alerts/last-time/{}/alerts.json",
)

API_URL = os.getenv("API_URL", "http://localhost:8000/api/ingest/alerts")
INGEST_API_KEY = os.getenv("INGEST_API_KEY")
SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))
SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}

# ── Kismet's role in IntruSight ──────────────────────────────────────────────
# Kismet is the only engine here that sees the radio layer. The wired engines
# cannot observe an access point that never routes a packet, a client probing
# for a network it remembers, or an SSID being impersonated.
#
# Kismet identifies everything by 802.11 hardware address, so its endpoints are
# MACs, not IPs. They are carried in `source_asset`/`destination_asset` with
# `asset_kind="mac"`; the IP fields are left unset. Previously the MACs were
# written into `src_ip`/`dest_ip`, which was semantically wrong and forced
# geolocation to defend itself against hardware addresses.
#
# Kismet contributes two different things, and they are not the same claim:
#   * device/AP sightings  -> observations ("this is present on the air")
#   * WIDS alerts          -> detections   ("Kismet's own logic fired")

BROADCAST_MAC = "FF:FF:FF:FF:FF:FF"


def to_iso_timestamp(raw) -> str:
    """
    Normalise a Kismet time value to a timezone-aware ISO-8601 string.

    Kismet reports times as epoch seconds (a JSON number). The shared contract
    types `timestamp` as a string, so the raw epoch was rejected with HTTP 422 —
    this ingestor could never have delivered a record from a live Kismet server.
    Already-ISO strings pass through, and only a genuinely unusable value falls
    back to ingest time.
    """
    if isinstance(raw, bool):
        raw = None
    elif isinstance(raw, str):
        raw = raw.strip() or None

    if isinstance(raw, (int, float)):
        try:
            return datetime.fromtimestamp(float(raw), tz=timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            pass
    elif isinstance(raw, str):
        try:
            return datetime.fromtimestamp(float(raw), tz=timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            pass
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
        else:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat()

    return datetime.now(timezone.utc).isoformat()


def map_kismet_severity(raw) -> int:
    """
    Kismet severity runs roughly 0-20. Map onto the shared 1-3 scale.
    """
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return 3
    if value > 15:
        return 1
    if value > 5:
        return 2
    return 3


def _wireless_context(record: dict) -> dict:
    """
    Wireless fields worth keeping. These are the reason Kismet is here — an SSID,
    a channel and an encryption suite have no equivalent in the wired engines'
    output and no column in the shared schema.
    """
    return {
        k: v for k, v in {
            "ssid": record.get("kismet.device.base.name")
                    or record.get("kismet.alert.ssid"),
            "bssid": record.get("kismet.device.base.macaddr")
                     or record.get("kismet.alert.bssid"),
            "channel": record.get("kismet.device.base.channel")
                       or record.get("kismet.alert.channel"),
            "frequency_khz": record.get("kismet.device.base.frequency"),
            "band": record.get("kismet.device.base.band"),
            "encryption": record.get("kismet.device.base.crypt"),
            "device_type": record.get("kismet.device.base.type"),
            "manufacturer": record.get("kismet.device.base.manuf"),
            "signal_dbm": record.get("kismet.device.base.signal"),
            "packets": record.get("kismet.device.base.packets.total"),
            "first_seen": record.get("kismet.device.base.first_time"),
            "last_seen": record.get("kismet.device.base.last_time"),
            "sensor": record.get("kismet.device.base.sensor"),
        }.items() if v is not None
    }


def build_alert_payload(alert: dict) -> dict:
    """
    Map a Kismet WIDS alert onto the shared contract as a detection.

    A Kismet alert is Kismet's own detection logic firing (a deauthentication
    flood, an SSID being advertised by an unexpected BSSID). That is a genuine
    detection claim, so `event_kind` is "detection".
    """
    src_mac = alert.get("kismet.alert.source_mac") or None
    dest_mac = alert.get("kismet.alert.dest_mac") or None

    context = _wireless_context(alert)
    context["kismet_alert_class"] = alert.get("kismet.alert.class")
    context = {k: v for k, v in context.items() if v is not None}

    return {
        "timestamp": to_iso_timestamp(alert.get("kismet.alert.timestamp")),
        # No IP fields: Kismet does not observe them.
        "src_ip": None,
        "dest_ip": None,
        "src_port": 0,
        "dest_port": 0,
        "proto": "IEEE802.11",
        "signature": alert.get("kismet.alert.header", "Unknown wireless alert"),
        "severity": map_kismet_severity(alert.get("kismet.alert.severity", 5)),
        "category": alert.get("kismet.alert.class", "Wireless IDS"),
        "sid": alert.get("kismet.alert.hash") or None,
        "source_nids": "KISMET",
        "event_kind": "detection",
        "observation_type": None,
        "source_asset": src_mac,
        "destination_asset": dest_mac or BROADCAST_MAC,
        "asset_kind": "mac",
        "engine_context": context or None,
    }


def build_device_payload(device: dict) -> dict:
    """
    Map a Kismet device sighting onto the shared contract as an observation.

    A device sighting is not an alert. It states that a particular BSSID was
    heard on a particular channel with a particular SSID and encryption suite.
    That is wireless *visibility* — valuable context, and something no wired
    engine in this project can provide — so it is recorded as an observation at
    the informational level rather than dressed up as a finding.
    """
    mac = device.get("kismet.device.base.macaddr") or None
    dev_type = str(device.get("kismet.device.base.type", "")).lower()
    is_ap = "access point" in dev_type or dev_type == "wi-fi ap"

    context = _wireless_context(device)

    name = device.get("kismet.device.base.name") or mac or "unknown device"
    summary = (f"Access point {name} observed"
               if is_ap else f"Wireless client {name} observed")

    return {
        "timestamp": to_iso_timestamp(device.get("kismet.device.base.last_time")),
        "src_ip": None,
        "dest_ip": None,
        "src_port": 0,
        "dest_port": 0,
        "proto": "IEEE802.11",
        "signature": summary,
        # A sighting asserts presence, not severity.
        "severity": None,
        "category": "Wireless visibility",
        "sid": None,
        "source_nids": "KISMET",
        "event_kind": "observation",
        "observation_type": "wireless_ap" if is_ap else "wireless_client",
        "source_asset": mac,
        # A sighting has no counterparty. Do not fabricate one from the sensor
        # name merely to fill a shared endpoint column.
        "destination_asset": None,
        "asset_kind": "mac",
        "engine_context": context or None,
    }


# Retained under its historical name so existing callers keep working.
build_payload = build_alert_payload


def send_alert(payload: dict) -> bool:
    if not INGEST_API_KEY:
        return False
    try:
        response = requests.post(
            API_URL,
            json=payload,
            headers={"X-Ingest-API-Key": INGEST_API_KEY},
            timeout=15,
        )
        return response.status_code in (200, 201)
    except requests.RequestException:
        return False

def main():
    if not KISMET_API_KEY:
        raise SystemExit("KISMET_API_KEY must be set")
    if not INGEST_API_KEY:
        raise SystemExit("INGEST_API_KEY must be set")

    print("Ingestor Mode: KISMET")
    print("Polling configured Kismet API")
    print(f"API endpoint: {API_URL}")
    print("-" * 50)

    sent = 0
    skipped = 0
    notable_alerts = 0
    
    last_timestamp = int(time.time())
    cookies = {"KISMET": KISMET_API_KEY}

    while True:
        try:
            response = requests.get(KISMET_URL.format(last_timestamp), cookies=cookies, timeout=5)
            
            if response.status_code == 200:
                alerts = response.json()
                
                for alert in alerts:
                    payload = build_payload(alert)
                    
                    if send_alert(payload):
                        sev = payload.get("severity", 3)
                        label = SEVERITY_LABELS.get(sev, "unknown")
                        
                        if sev <= SEVERITY_THRESHOLD:
                            print(f"\n[ALERT] {payload['signature']} ({label}) | {payload['src_ip']} -> {payload['dest_ip']}")
                            notable_alerts += 1
                        else:
                            print(f"\n✔ {payload['signature']} ({label})")
                        
                        sent += 1
                    else:
                        skipped += 1
                        
                if alerts:
                    last_timestamp = int(time.time())

            elif response.status_code == 401:
                print("\n[ERROR] Kismet API Key is invalid or missing!")
                time.sleep(10)

        except requests.RequestException:
            pass

        print(f"Total Sent: {sent} | Notable: {notable_alerts} | Skipped: {skipped}        ", end="\r")
        time.sleep(2)

if __name__ == "__main__":
    main()
