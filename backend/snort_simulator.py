import json
import os
import random
import time
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SNORT_PATH = os.getenv("SNORT_ALERT_PATH") or os.getenv(
    "ALERTS_FILE_PATH", "/opt/homebrew/var/log/snort/alert_json.txt"
)

SNORT_ALERTS = [
    {
        "sid": 1000003,
        "rule": "1:1000003:1",
        "msg": "[Recon] Snort Ping Sweep Detected",
        "class": "Misc activity",
        "priority": 3,
        "proto": "ICMP",
        "service": "unknown",
        "dst_port": 0
    },
    {
        "sid": 1000004,
        "rule": "1:1000004:1",
        "msg": "[Recon] Snort Port Scan Detected",
        "class": "Attempted Information Leak",
        "priority": 2,
        "proto": "TCP",
        "service": "unknown",
        "dst_port": None
    },
    {
        "sid": 1000005,
        "rule": "1:1000005:1",
        "msg": "[Web] Snort Admin Page Access Attempt",
        "class": "Potentially Bad Traffic",
        "priority": 2,
        "proto": "TCP",
        "service": "http",
        "dst_port": 80
    },
    {
        "sid": 1000006,
        "rule": "1:1000006:1",
        "msg": "[Web] Snort SQL Injection Attempt",
        "class": "Web Application Attack",
        "priority": 1,
        "proto": "TCP",
        "service": "http",
        "dst_port": 80
    },
    {
        "sid": 1000007,
        "rule": "1:1000007:1",
        "msg": "[Info] Snort Banner Grab Attempt",
        "class": "Not Suspicious Traffic",
        "priority": 4,
        "proto": "TCP",
        "service": "http",
        "dst_port": 8080
    }
]


def snort_timestamp():
    return datetime.now().strftime("%m/%d-%H:%M:%S.%f")


def random_private_ip():
    return f"192.168.1.{random.randint(10, 250)}"


def random_public_like_ip():
    return f"{random.randint(11, 210)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}"


def build_event():
    chosen = random.choice(SNORT_ALERTS)

    src_ip = random_private_ip()
    dst_ip = random_public_like_ip()

    if chosen["proto"] == "ICMP":
        src_port = 0
        dst_port = 0
        src_ap = src_ip
        dst_ap = dst_ip
    else:
        src_port = random.randint(1024, 65535)
        dst_port = chosen["dst_port"] if chosen["dst_port"] is not None else random.choice(
            [21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 3389, 8080]
        )
        src_ap = f"{src_ip}:{src_port}"
        dst_ap = f"{dst_ip}:{dst_port}"

    event = {
        "timestamp": snort_timestamp(),
        "pkt_num": random.randint(1, 50000),
        "proto": chosen["proto"],
        "pkt_gen": "stream_tcp" if chosen["proto"] == "TCP" else "raw",
        "pkt_len": random.randint(60, 1500),
        "dir": random.choice(["C2S", "S2C"]),
        "src_addr": src_ip,
        "src_ap": src_ap,
        "dst_addr": dst_ip,
        "dst_ap": dst_ap,
        "rule": chosen["rule"],
        "priority": chosen["priority"],
        "class": chosen["class"],
        "action": "allow",
        "msg": chosen["msg"],
        "service": chosen["service"],
        "sid": chosen["sid"]
    }

    if chosen["proto"] == "TCP":
        event["src_port"] = src_port
        event["dst_port"] = dst_port

    return event


def write_event():
    event = build_event()

    os.makedirs(os.path.dirname(SNORT_PATH), exist_ok=True)

    with open(SNORT_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")

    print(
        f"Generated Snort alert: {event['msg']} | "
        f"priority={event['priority']} -> {SNORT_PATH}"
    )


def start_simulator():
    print("Snort Simulator")
    print("Continuous mode started. Press Ctrl+C to stop.")
    print(f"Writing to: {SNORT_PATH}")
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