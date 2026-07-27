import json
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

SNORT_PATH = os.getenv("ALERTS_FILE_PATH", "/opt/homebrew/var/log/snort/alert_json.txt")
API_URL = os.getenv("API_URL", "http://localhost:8000/api/ingest/alerts")
INGEST_API_KEY = os.getenv("INGEST_API_KEY")

SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))
SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}

SID_MAP = {
    1000003: "[Recon] Snort Ping Sweep Detected",
    1000004: "[Recon] Snort Port Scan Detected",
    1000005: "[Web] Snort Admin Page Access Attempt",
    1000006: "[Web] Snort SQL Injection Attempt"
}

def map_snort_severity(priority):
    if priority == 1: return 1
    if priority == 2: return 2
    return 3

def build_payload(event: dict) -> dict:
    src_ap = event.get("src_ap", "")
    dst_ap = event.get("dst_ap", "")

    src_ip = event.get("src_addr") or event.get("src_ip") or event.get("client_addr") or (src_ap.split(":")[0] if ":" in src_ap else "")
    dest_ip = event.get("dst_addr") or event.get("dst_ip") or event.get("server_addr") or (dst_ap.split(":")[0] if ":" in dst_ap else "")

    rule_id = event.get("rule", "0:0:0")
    snort_sid = int(rule_id.split(":")[1]) if ":" in rule_id else 0

    clean_signature = SID_MAP.get(snort_sid) or event.get("msg") or f"Rule {rule_id}"

    return {
        "timestamp": event.get("timestamp"),
        "src_ip": src_ip or "0.0.0.0",
        "src_port": int(src_ap.split(":")[1]) if ":" in src_ap and src_ap.split(":")[1].isdigit() else 0,
        "dest_ip": dest_ip or "0.0.0.0",
        "dest_port": int(dst_ap.split(":")[1]) if ":" in dst_ap and dst_ap.split(":")[1].isdigit() else 0,
        "proto": event.get("proto", "ICMP"),
        "signature": clean_signature,
        "severity": map_snort_severity(event.get("priority", 3)),
        "category": event.get("class", "Network Activity"),
        "sid": snort_sid,
        "source_nids": "SNORT"
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

    if not payload.get("timestamp") or payload.get("src_ip") == "0.0.0.0":
        return "skipped"

    success = send_alert(payload)
    if not success:
        return "skipped"

    sev = payload.get("severity", 3)
    severity_label = SEVERITY_LABELS.get(sev, "unknown")

    if sev <= SEVERITY_THRESHOLD:
        print(f"\n[ALERT] {payload['signature']} ({severity_label}) | {payload['src_ip']} -> {payload['dest_ip']}")
        return "telegram"

    print(f"\n✔ {payload['signature']} ({severity_label})")
    return "sent"

def main():
    if not INGEST_API_KEY:
        raise SystemExit("INGEST_API_KEY must be set")

    sent = 0
    skipped = 0
    telegram_alerts = 0

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
            if result == "telegram":
                sent += 1
                telegram_alerts += 1
            elif result == "sent":
                sent += 1
            else:
                skipped += 1

            print(f"Total Sent: {sent} | Telegram: {telegram_alerts} | Skipped: {skipped}        ", end="\r")

if __name__ == "__main__":
    main()
