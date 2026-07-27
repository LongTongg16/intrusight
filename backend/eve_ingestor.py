import json
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

EVE_PATH = os.getenv("ALERTS_FILE_PATH", "/opt/homebrew/var/log/suricata/eve.json")
API_URL = os.getenv(
    "API_URL",
    "http://localhost:8000/api/ingest/alerts"
)
INGEST_API_KEY = os.getenv("INGEST_API_KEY")

SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))

# Suricata: lower number = higher severity
SEVERITY_LABELS = {
    1: "high",
    2: "medium",
    3: "low",
    4: "info"
}

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


def build_payload(event: dict) -> dict:
    alert = event.get("alert", {})
    severity = compute_severity(event)

    return {
        "timestamp": event.get("timestamp"),
        "src_ip": event.get("src_ip"),
        "src_port": event.get("src_port", 0),
        "dest_ip": event.get("dest_ip"),
        "dest_port": event.get("dest_port", 0),
        "proto": str(event.get("proto", "TCP")).upper(),
        "signature": alert.get("signature", "Unknown Suricata Alert"),
        "severity": severity,
        "category": alert.get("category", "Unknown"),
        "sid": alert.get("signature_id", 0),
        "source_nids": "SURICATA"
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
        return "telegram"

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
    telegram_alerts = 0

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

            if result == "telegram":
                sent += 1
                telegram_alerts += 1
            elif result == "sent":
                sent += 1
            elif result == "failed":
                failed += 1
            else:
                skipped += 1

            print(
                f"Total Sent: {sent} | Telegram: {telegram_alerts} | Failed: {failed} | Skipped: {skipped}   ",
                end="\r"
            )


if __name__ == "__main__":
    main()
