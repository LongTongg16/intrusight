import time
import requests
import os
import random
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("API_URL", "http://localhost:8000/api/ingest/alerts")
INGEST_API_KEY = os.getenv("INGEST_API_KEY")


def generate_real_mac(device_type="client"):
    apple_ouis = ["00:1D:4F", "14:CD:00", "28:CF:E9", "DC:A9:04"]
    samsung_ouis = ["00:15:99", "04:FE:31", "10:3B:59"]
    intel_ouis = ["00:1B:21", "88:B1:11", "34:13:E8"]
    cisco_ouis = ["00:1A:A1", "00:1B:2B", "00:40:96"]

    if device_type == "router":
        oui = random.choice(cisco_ouis)
    else:
        oui = random.choice(apple_ouis + samsung_ouis + intel_ouis)

    nic = f"{random.randint(0, 255):02X}:{random.randint(0, 255):02X}:{random.randint(0, 255):02X}"
    return f"{oui}:{nic}"


def trigger_fake_kismet_alert():
    attacks = [
        {"sig": "[WIDS] Rogue Access Point (Evil Twin) Detected", "sev": 1},
        {"sig": "[WIDS] Deauthentication Flood Attack", "sev": 1},
        {"sig": "[WIDS] PMKID Handshake Capture Attempt", "sev": 2},
        {"sig": "[WIDS] Client MAC Spoofing Detected", "sev": 2}
    ]

    chosen_attack = random.choice(attacks)
    real_timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")

    src_mac = generate_real_mac("client")
    dest_mac = generate_real_mac("router")

    if "Deauthentication" in chosen_attack["sig"]:
        dest_mac = "FF:FF:FF:FF:FF:FF"

    payload = {
        "timestamp": real_timestamp,
        "src_ip": src_mac,
        "src_port": 0,
        "dest_ip": dest_mac,
        "dest_port": 0,
        "proto": "802.11 Wi-Fi",
        "signature": chosen_attack["sig"],
        "severity": chosen_attack["sev"],
        "category": "Wireless Intrusion",
        "sid": random.randint(900000, 999999),
        "source_nids": "KISMET"
    }

    try:
        if not INGEST_API_KEY:
            raise RuntimeError("INGEST_API_KEY must be set")
        response = requests.post(
            API_URL,
            json=payload,
            headers={"X-Ingest-API-Key": INGEST_API_KEY},
            timeout=60,
        )
        if response.status_code in (200, 201):
            print(f"✔️ [KISMET] Attack: {payload['signature']} | {payload['src_ip']} -> {payload['dest_ip']}")
        else:
            print(f"Failed to send: HTTP {response.status_code}")
    except Exception as e:
        print(f"Error: {e}")


def start_simulator():
    print("Kismet Simulator")
    print("Continuous mode started. Press Ctrl+C to stop.")
    print("-" * 50)

    try:
        while True:
            trigger_fake_kismet_alert()
            wait_time = random.randint(15, 35)
            print(f"Waiting {wait_time} seconds...")
            time.sleep(wait_time)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    start_simulator()
