import time
import json
import os
import requests
import random
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv(
    "API_URL",
    "http://localhost:8000/api/ingest/alerts"
)
INGEST_API_KEY = os.getenv("INGEST_API_KEY")
ZEEK_LOG_FILE = os.getenv("ZEEK_LOG_FILE", "zeek_notice.log")

SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))
SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}

# If your Zeek logs do NOT contain a severity field, use a mapping by note:
NOTE_TO_SEVERITY = {
    "SSH::Password_Guessing": 1,
    "HTTP::SQL_Injection_Attempt": 1,
    "SSL::Invalid_Server_Cert": 2,
    "DNS::External_Name_Discovery": 3,
}

def compute_severity(data: dict) -> int:
    """
    Priority:
    1) Use severity from the Zeek log line if present (e.g., produced by your simulator)
    2) Else map severity based on 'note'
    3) Else default to medium (2)
    """
    if "severity" in data:
        try:
            sev = int(data.get("severity"))
            if sev in (1, 2, 3):
                return sev
        except (TypeError, ValueError):
            pass

    note = data.get("note", "")
    return NOTE_TO_SEVERITY.get(note, 2)

def start_reading():
    if not INGEST_API_KEY:
        raise SystemExit("INGEST_API_KEY must be set")

    print("Ingestor Mode: ZEEK")
    print(f"Watching file: {ZEEK_LOG_FILE}")
    print(f"API endpoint: {API_URL}")
    print("-" * 50)

    if not os.path.exists(ZEEK_LOG_FILE):
        open(ZEEK_LOG_FILE, "w").close()

    with open(ZEEK_LOG_FILE, "r", encoding="utf-8") as f:
        f.seek(0, os.SEEK_END)

        sent = 0
        failed = 0
        telegram_alerts = 0

        while True:
            line = f.readline()

            if not line:
                time.sleep(0.5)
                continue

            try:
                data = json.loads(line.strip())
                severity = compute_severity(data)

                payload = {
                    "timestamp": datetime.now().isoformat(),
                    "src_ip": data.get("id.orig_h", "0.0.0.0"),
                    "src_port": data.get("id.orig_p", 0),
                    "dest_ip": data.get("id.resp_h", "0.0.0.0"),
                    "dest_port": data.get("id.resp_p", 0),
                    "proto": data.get("proto", "tcp").upper(),
                    "signature": "[ZEEK] " + data.get("note", "Unknown"),
                    "severity": severity,
                    "category": "Behavioral",
                    "sid": random.randint(10000, 99999),
                    "source_nids": "ZEEK"
                }

                req = requests.post(
                    API_URL,
                    json=payload,
                    headers={"X-Ingest-API-Key": INGEST_API_KEY},
                    timeout=60,
                )

                if req.status_code in (200, 201):
                    label = SEVERITY_LABELS.get(severity, "unknown")

                    if severity <= SEVERITY_THRESHOLD:
                        print(f"\n[ALERT] {payload['signature']} ({label}) | "
                              f"{payload['src_ip']} -> {payload['dest_ip']}")
                        telegram_alerts += 1
                    else:
                        print(f"\n✔️ {payload['signature']} ({label})")

                    sent += 1
                else:
                    failed += 1
                    print(f"\n✖️ Alert ingestion failed with HTTP {req.status_code}")

            except json.JSONDecodeError:
                # Ignore malformed lines
                continue
            except Exception as e:
                failed += 1
                print(f"\n✖️ Error: {e}")

            print(
                f"Total Sent: {sent} | Telegram: {telegram_alerts} | Failed: {failed}        ",
                end="\r"
            )

if __name__ == "__main__":
    start_reading()
