import json
import os
import random
import time
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

EVE_PATH = os.getenv("SURICATA_EVE_PATH") or os.getenv(
    "ALERTS_FILE_PATH", "/opt/homebrew/var/log/suricata/eve.json"
)

SURICATA_ALERTS = [
    {
        "signature_id": 1000001,
        "signature": "[Recon] Ping Sweep Detected",
        "category": "Misc activity",
        "severity": 3,
        "proto": "ICMP",
        "dest_port": 0
    },
    {
        "signature_id": 1000002,
        "signature": "[Recon] Port Scan Detected",
        "category": "Attempted Information Leak",
        "severity": 2,
        "proto": "TCP",
        "dest_port": None
    },
    {
        "signature_id": 1000003,
        "signature": "[Web] Admin Page Access Attempt",
        "category": "Potentially Bad Traffic",
        "severity": 2,
        "proto": "TCP",
        "dest_port": 80
    },
    {
        "signature_id": 1000004,
        "signature": "[Web] Possible SQL Injection Attempt",
        "category": "Web Application Attack",
        "severity": 1,
        "proto": "TCP",
        "dest_port": 80
    },

]

HTTP_URLS = [
    "/",
    "/login",
    "/admin",
    "/phpmyadmin",
    "/search?q=test",
    "/index.php?id=1' OR '1'='1"
]

USER_AGENTS = [
    "Mozilla/5.0",
    "curl/8.7.1",
    "Nmap Scripting Engine",
    "python-requests/2.31.0"
]


def iso_now():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="microseconds")


def random_ip(private=True):
    if private:
        return f"192.168.1.{random.randint(10, 250)}"
    return f"{random.randint(11, 210)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def build_event():
    chosen = random.choice(SURICATA_ALERTS)

    src_ip = random_ip(private=True)
    dest_ip = random_ip(private=False)

    if chosen["proto"] == "ICMP":
        src_port = 0
        dest_port = 0
        app_proto = "failed"
        http = None
    else:
        src_port = random.randint(1024, 65535)
        dest_port = chosen["dest_port"] if chosen["dest_port"] is not None else random.choice(
            [21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 3389, 8080]
        )
        app_proto = "http" if dest_port in (80, 8080) else "failed"
        http = None

        if app_proto == "http":
            http = {
                "hostname": dest_ip,
                "url": random.choice(HTTP_URLS),
                "http_user_agent": random.choice(USER_AGENTS),
                "http_method": random.choice(["GET", "POST"]),
                "protocol": "HTTP/1.1",
                "status": random.choice([200, 301, 403, 404]),
                "length": random.randint(120, 4096)
            }

    event = {
        "timestamp": iso_now(),
        "flow_id": random.randint(10**14, 10**15 - 1),
        "in_iface": "en0",
        "event_type": "alert",
        "src_ip": src_ip,
        "src_port": src_port,
        "dest_ip": dest_ip,
        "dest_port": dest_port,
        "proto": chosen["proto"],
        "alert": {
            "action": "allowed",
            "gid": 1,
            "signature_id": chosen["signature_id"],
            "rev": 1,
            "signature": chosen["signature"],
            "category": chosen["category"],
            "severity": chosen["severity"]
        },
        "app_proto": app_proto
    }

    if http:
        event["http"] = http

    return event


def write_event():
    event = build_event()

    os.makedirs(os.path.dirname(EVE_PATH), exist_ok=True)

    with open(EVE_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")

    sig = event["alert"]["signature"]
    sev = event["alert"]["severity"]
    print(f"Generated Suricata alert: {sig} | severity={sev} -> {EVE_PATH}")

def start_simulator():
    print("Suricata Simulator")
    print("Continuous mode started. Press Ctrl+C to stop.")
    print(f"Writing to: {EVE_PATH}")
    print("-" * 50)

    try:
        while True:
            write_event()
            wait_time = random.randint(8, 20)
            print(f"Waiting {wait_time} seconds...")
            time.sleep(wait_time)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    start_simulator()