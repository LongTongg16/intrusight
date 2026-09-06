import json
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

# SURICATA_EVE_PATH is the current variable; ALERTS_FILE_PATH is the legacy name
# kept as a fallback so existing deployments keep working.
EVE_PATH = os.getenv("SURICATA_EVE_PATH") or os.getenv(
    "ALERTS_FILE_PATH", "/opt/homebrew/var/log/suricata/eve.json"
)
API_URL = os.getenv(
    "API_URL",
    "http://localhost:8000/api/ingest/alerts"
)
INGEST_API_KEY = os.getenv("INGEST_API_KEY")

SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))

# Shared IntruSight severity contract (also enforced by the backend AlertIn model):
#   1 = high, 2 = medium, 3 = low
SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}

# Suricata's native scale has a fourth, informational level that the shared model
# does not carry. Native 4 is the least severe value Suricata emits, so it maps
# onto the shared scale's least severe level rather than being dropped or rejected.
SURICATA_TO_SHARED_SEVERITY = {1: 1, 2: 2, 3: 3, 4: 3}

# Optional fallback if severity is missing
CATEGORY_TO_SEVERITY = {
    "A Network Trojan was Detected": 1,
    "Malware Command and Control Activity Detected": 1,
    "Attempted Administrator Privilege Gain": 1,
    "Attempted User Privilege Gain": 1,
    "Potentially Bad Traffic": 2,
    "Attempted Information Leak": 2,
    "Potential Corporate Privacy Violation": 3,
    "Not Suspicious Traffic": 4,
    "Unknown": 3
}


def compute_severity(event: dict) -> int:
    alert = event.get("alert", {})

    sev = alert.get("severity")
    try:
        sev = int(sev)
        if sev in (1, 2, 3, 4):
            return sev
    except (TypeError, ValueError):
        pass

    category = alert.get("category", "Unknown")
    return CATEGORY_TO_SEVERITY.get(category, 3)


def to_shared_severity(native_severity: int) -> int:
    """Map a Suricata-native severity (1-4) onto the shared 1-3 contract."""
    return SURICATA_TO_SHARED_SEVERITY.get(native_severity, 3)


def build_payload(event: dict) -> dict:
    """
    Map one Suricata EVE alert event onto the shared contract.

    Suricata's role in IntruSight is signature-based detection: every record it
    contributes is a rule match, carrying the rule's signature text, its
    signature_id and the Suricata category. That is why `event_kind` is always
    "detection" here — unlike Zeek and Kismet, Suricata is asserting that
    traffic matched a known pattern.
    """
    alert = event.get("alert", {})
    severity = to_shared_severity(compute_severity(event))
    src_ip = event.get("src_ip")
    dest_ip = event.get("dest_ip")

    # Fields Suricata reports that have no shared column. Kept engine-native
    # rather than flattened into the common schema.
    context = {
        k: v for k, v in {
            "rule_rev": alert.get("rev"),
            "rule_gid": alert.get("gid"),
            "app_proto": event.get("app_proto"),
            "flow_id": event.get("flow_id"),
            "interface": event.get("in_iface"),
            "native_severity": compute_severity(event),
        }.items() if v is not None
    }

    return {
        "timestamp": event.get("timestamp"),
        "src_ip": src_ip,
        "src_port": event.get("src_port", 0),
        "dest_ip": dest_ip,
        "dest_port": event.get("dest_port", 0),
        "proto": str(event.get("proto", "TCP")).upper(),
        "signature": alert.get("signature", "Unknown Suricata Alert"),
        "severity": severity,
        "category": alert.get("category", "Unknown"),
        "sid": alert.get("signature_id", 0),
        "source_nids": "SURICATA",
        "event_kind": "detection",
        "source_asset": src_ip,
        "destination_asset": dest_ip,
        "asset_kind": "ip",
        "engine_context": context or None,
    }


def send_alert(payload: dict) -> bool:
    if not INGEST_API_KEY:
        return False
    try:
        response = requests.post(
            API_URL,
            json=payload,
            headers={"X-Ingest-API-Key": INGEST_API_KEY},
            timeout=10,
        )
        if response.status_code in (200, 201):
            return True

        print(f"\nAlert ingestion failed with HTTP {response.status_code}")
        return False

    except requests.RequestException as e:
        print(f"\n️ Request error: {e}")
        return False


def process_line(line: str) -> str:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return "skipped"

    if event.get("event_type") != "alert":
        return "skipped"

    payload = build_payload(event)

    if not payload.get("timestamp") or not payload.get("src_ip") or not payload.get("dest_ip"):
        return "skipped"

    success = send_alert(payload)
    if not success:
        return "failed"

    sev = payload.get("severity", 3)
    severity_label = SEVERITY_LABELS.get(sev, "unknown")

    if sev <= SEVERITY_THRESHOLD:
        print(
            f"\n[ALERT] {payload['signature']} ({severity_label}) | "
            f"{payload['src_ip']}:{payload['src_port']} -> "
            f"{payload['dest_ip']}:{payload['dest_port']}"
        )
        return "notable"

    print(
        f"\n✔️ {payload['signature']} ({severity_label}) | "
        f"{payload['src_ip']} -> {payload['dest_ip']}"
    )
    return "sent"


def main():
    if not INGEST_API_KEY:
        raise SystemExit("INGEST_API_KEY must be set")

    sent = 0
    skipped = 0
    failed = 0
    notable_alerts = 0

    print("Ingestor Mode: SURICATA")
    print(f"Watching file: {EVE_PATH}")
    print(f"API endpoint: {API_URL}")
    print(f"Severity threshold: {SEVERITY_THRESHOLD}")
    print("-" * 50)

    if not os.path.exists(EVE_PATH):
        print(f"File not found: {EVE_PATH}")
        return

    with open(EVE_PATH, "r", encoding="utf-8") as file:
        file.seek(0, os.SEEK_END)

        while True:
            line = file.readline()

            if not line:
                time.sleep(0.5)
                continue

            result = process_line(line.strip())

            if result == "notable":
                sent += 1
                notable_alerts += 1
            elif result == "sent":
                sent += 1
            elif result == "failed":
                failed += 1
            else:
                skipped += 1

            print(
                f"Total Sent: {sent} | Notable: {notable_alerts} | Failed: {failed} | Skipped: {skipped}   ",
                end="\r"
            )


if __name__ == "__main__":
    main()
