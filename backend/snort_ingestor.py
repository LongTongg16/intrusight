import json
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

# SNORT_ALERT_PATH is the current variable; ALERTS_FILE_PATH is the legacy name
# kept as a fallback so existing deployments keep working.
SNORT_PATH = os.getenv("SNORT_ALERT_PATH") or os.getenv(
    "ALERTS_FILE_PATH", "/opt/homebrew/var/log/snort/alert_json.txt"
)
API_URL = os.getenv("API_URL", "http://localhost:8000/api/ingest/alerts")
INGEST_API_KEY = os.getenv("INGEST_API_KEY")

SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))
SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}

# Rules shipped with the demonstration lab (demo/rules/intrusight-lab.rules).
# These are LOCAL LAB RULES written for this project, not production signatures:
# they exist to show that Snort detection is rule-driven and that an operator can
# add their own logic. A real deployment would run a maintained ruleset.
LAB_RULE_SIDS = {1000001, 1000002, 1000003, 1000004, 1000005, 1000006}


def map_snort_severity(priority):
    """Snort priority 1 (most urgent) .. 3+ maps onto the shared 1-3 scale."""
    if priority == 1:
        return 1
    if priority == 2:
        return 2
    return 3


def _split_addr_port(value: str):
    """Split Snort's "addr:port" endpoint form, tolerating a bare address."""
    if not value or ":" not in value:
        return value or "", 0
    addr, _, port = value.rpartition(":")
    return addr, int(port) if port.isdigit() else 0


def build_payload(event: dict) -> dict:
    """
    Map one Snort JSON alert onto the shared contract.

    Snort's role in IntruSight is rule-driven detection. The distinguishing
    information is the rule itself — gid:sid:rev, the operator-authored message
    and the classification — so those are preserved rather than replaced.

    The previous implementation rewrote `msg` from a hardcoded SID table, which
    hid what the rule actually said, and defaulted `proto` to ICMP, which is why
    every Snort record looked like a ping.
    """
    src_ap = event.get("src_ap", "")
    dst_ap = event.get("dst_ap", "")

    src_ip = (event.get("src_addr") or event.get("src_ip")
              or event.get("client_addr") or _split_addr_port(src_ap)[0])
    dest_ip = (event.get("dst_addr") or event.get("dst_ip")
               or event.get("server_addr") or _split_addr_port(dst_ap)[0])

    src_port = event.get("src_port") or _split_addr_port(src_ap)[1]
    dest_port = event.get("dst_port") or _split_addr_port(dst_ap)[1]

    rule_id = str(event.get("rule", "0:0:0"))
    parts = rule_id.split(":")
    snort_sid = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0

    # The rule's own message is the signature. No rewriting.
    signature = event.get("msg") or f"Snort rule {rule_id}"

    context = {
        k: v for k, v in {
            "rule": rule_id,
            "rule_gid": int(parts[0]) if parts and parts[0].isdigit() else None,
            "rule_rev": int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else None,
            "service": event.get("service"),
            "interface": event.get("iface"),
            "native_priority": event.get("priority"),
            # Flagged so the UI and the reader can tell a lab rule from a
            # maintained ruleset instead of assuming production coverage.
            "lab_rule": snort_sid in LAB_RULE_SIDS,
        }.items() if v is not None
    }

    return {
        "timestamp": event.get("timestamp"),
        "src_ip": src_ip or None,
        "src_port": src_port,
        "dest_ip": dest_ip or None,
        "dest_port": dest_port,
        # No ICMP default: an unstated protocol is unknown, not a ping.
        "proto": str(event.get("proto") or "UNKNOWN").upper(),
        "signature": signature,
        "severity": map_snort_severity(event.get("priority", 3)),
        "category": event.get("class", "Unclassified"),
        "sid": snort_sid,
        "source_nids": "SNORT",
        "event_kind": "detection",
        "source_asset": src_ip or None,
        "destination_asset": dest_ip or None,
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
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        print(f"\nAlert ingestion failed with HTTP {response.status_code}")
        return False
    except requests.RequestException as e:
        print(f"\nRequest error: {e}")
        return False

def process_line(line: str) -> str:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return "skipped"

    if not ("rule" in event or "msg" in event):
        return "skipped"

    payload = build_payload(event)

    if not payload.get("timestamp") or not payload.get("src_ip"):
        return "skipped"

    success = send_alert(payload)
    if not success:
        return "skipped"

    sev = payload.get("severity", 3)
    severity_label = SEVERITY_LABELS.get(sev, "unknown")

    if sev <= SEVERITY_THRESHOLD:
        print(f"\n[ALERT] {payload['signature']} ({severity_label}) | {payload['src_ip']} -> {payload['dest_ip']}")
        return "notable"

    print(f"\n✔ {payload['signature']} ({severity_label})")
    return "sent"

def main():
    if not INGEST_API_KEY:
        raise SystemExit("INGEST_API_KEY must be set")

    sent = 0
    skipped = 0
    notable_alerts = 0

    print("Ingestor Mode: SNORT")
    print(f"Watching file: {SNORT_PATH}")
    print(f"API endpoint: {API_URL}")
    print("-" * 50)

    if not os.path.exists(SNORT_PATH):
        print(f"File not found: {SNORT_PATH}")
        return

    with open(SNORT_PATH, "r", encoding="utf-8") as file:
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
            else:
                skipped += 1

            print(f"Total Sent: {sent} | Notable: {notable_alerts} | Skipped: {skipped}        ", end="\r")

if __name__ == "__main__":
    main()
