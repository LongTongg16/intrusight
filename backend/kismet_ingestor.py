import time
import requests
import os
from dotenv import load_dotenv

load_dotenv()

KISMET_API_KEY = os.getenv("KISMET_API_KEY")
KISMET_URL = os.getenv(
    "KISMET_URL",
    "http://localhost:2501/alerts/last-time/{}/alerts.json",
)

API_URL = os.getenv("API_URL", "http://localhost:8000/api/ingest/alerts")
INGEST_API_KEY = os.getenv("INGEST_API_KEY")
SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))
SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}

def build_payload(alert: dict) -> dict:
    src_mac = alert.get("kismet.alert.source_mac", "00:00:00:00:00:00")
    dest_mac = alert.get("kismet.alert.dest_mac", "00:00:00:00:00:00")
    
    kismet_sev = alert.get("kismet.alert.severity", 5)
    if kismet_sev > 15: severity = 1
    elif kismet_sev > 5: severity = 2
    else: severity = 3

    return {
        "timestamp": alert.get("kismet.alert.timestamp", time.time()),
        "src_ip": src_mac,  
        "src_port": 0,      
        "dest_ip": dest_mac,
        "dest_port": 0,
        "proto": "802.11 Wi-Fi", 
        "signature": alert.get("kismet.alert.header", "Unknown Wireless Alert"),
        "severity": severity,
        "category": alert.get("kismet.alert.class", "WIDS Activity"),
        "sid": alert.get("kismet.alert.hash", 0),
        "source_nids": "KISMET"
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
    telegram_alerts = 0
    
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
                            telegram_alerts += 1
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

        print(f"Total Sent: {sent} | Telegram: {telegram_alerts} | Skipped: {skipped}        ", end="\r")
        time.sleep(2)

if __name__ == "__main__":
    main()
