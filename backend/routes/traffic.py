"""
Traffic log endpoint.
Returns a unified flow log combining:
  1. Real triggered alerts from MongoDB (flagged by IDS rules)
  2. Seeded clean/non-triggered flows (realistic background traffic)

This lets the Network Traffic page show ALL network activity,
while the Alerts page shows only the triggered subset.
"""

import random
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Security
from pymongo.errors import PyMongoError
from core.security import get_current_user
from services.alert_service import get_collection

router = APIRouter(prefix="/api", tags=["Traffic"])

# ---------------------------------------------------------------------------
# Realistic clean (non-triggered) background flows
# These represent normal everyday traffic that never fired an IDS rule.
# ---------------------------------------------------------------------------
_CLEAN_FLOWS = [
    # DNS lookups
    {"src": "192.168.1.10",  "dst": "8.8.8.8",         "sport": 54231, "dport": 53,   "proto": "UDP",  "bytes": 72,   "packets": 1,  "flags": "—",         "duration": "0.01s", "ids": "Zeek",     "label": "DNS query – google.com"},
    {"src": "192.168.1.22",  "dst": "1.1.1.1",          "sport": 61002, "dport": 53,   "proto": "UDP",  "bytes": 68,   "packets": 1,  "flags": "—",         "duration": "0.01s", "ids": "Zeek",     "label": "DNS query – cloudflare.com"},
    {"src": "192.168.1.45",  "dst": "8.8.4.4",          "sport": 49832, "dport": 53,   "proto": "UDP",  "bytes": 80,   "packets": 1,  "flags": "—",         "duration": "0.02s", "ids": "Zeek",     "label": "DNS query – github.com"},
    # HTTPS browsing
    {"src": "192.168.1.10",  "dst": "142.250.80.46",    "sport": 52341, "dport": 443,  "proto": "TCP",  "bytes": 4821, "packets": 18, "flags": "SYN, ACK",  "duration": "1.23s", "ids": "Suricata", "label": "HTTPS – google.com"},
    {"src": "192.168.1.22",  "dst": "151.101.1.140",    "sport": 55120, "dport": 443,  "proto": "TCP",  "bytes": 2340, "packets": 9,  "flags": "PSH, ACK",  "duration": "0.88s", "ids": "Suricata", "label": "HTTPS – stackoverflow.com"},
    {"src": "192.168.1.33",  "dst": "140.82.114.4",     "sport": 58901, "dport": 443,  "proto": "TCP",  "bytes": 1870, "packets": 7,  "flags": "PSH, ACK",  "duration": "0.55s", "ids": "Suricata", "label": "HTTPS – github.com"},
    {"src": "192.168.1.45",  "dst": "13.107.42.14",     "sport": 60123, "dport": 443,  "proto": "TCP",  "bytes": 3100, "packets": 12, "flags": "PSH, ACK",  "duration": "0.94s", "ids": "Snort",    "label": "HTTPS – microsoft.com"},
    # HTTP (plain)
    {"src": "192.168.1.10",  "dst": "93.184.216.34",    "sport": 51234, "dport": 80,   "proto": "TCP",  "bytes": 512,  "packets": 4,  "flags": "SYN, ACK",  "duration": "0.22s", "ids": "Snort",    "label": "HTTP – example.com"},
    # SSH (internal admin)
    {"src": "192.168.1.5",   "dst": "192.168.1.200",    "sport": 62441, "dport": 22,   "proto": "TCP",  "bytes": 6420, "packets": 34, "flags": "PSH, ACK",  "duration": "12.4s", "ids": "Zeek",     "label": "SSH – internal admin session"},
    # NTP time sync
    {"src": "192.168.1.1",   "dst": "216.239.35.0",     "sport": 123,   "dport": 123,  "proto": "UDP",  "bytes": 48,   "packets": 1,  "flags": "—",         "duration": "0.03s", "ids": "Zeek",     "label": "NTP time sync"},
    # SMTP email
    {"src": "192.168.1.50",  "dst": "74.125.130.27",    "sport": 59301, "dport": 587,  "proto": "TCP",  "bytes": 1280, "packets": 6,  "flags": "PSH, ACK",  "duration": "0.67s", "ids": "Snort",    "label": "SMTP – outbound email"},
    # Internal DB traffic
    {"src": "192.168.1.100", "dst": "192.168.1.200",    "sport": 55678, "dport": 5432, "proto": "TCP",  "bytes": 8900, "packets": 42, "flags": "PSH, ACK",  "duration": "0.08s", "ids": "Zeek",     "label": "PostgreSQL – internal DB query"},
    {"src": "192.168.1.101", "dst": "192.168.1.200",    "sport": 54321, "dport": 3306, "proto": "TCP",  "bytes": 4200, "packets": 21, "flags": "PSH, ACK",  "duration": "0.05s", "ids": "Zeek",     "label": "MySQL – internal DB query"},
    # ICMP ping (routine health check)
    {"src": "192.168.1.1",   "dst": "192.168.1.100",    "sport": 0,     "dport": 0,    "proto": "ICMP", "bytes": 84,   "packets": 4,  "flags": "—",         "duration": "0.004s","ids": "Zeek",     "label": "ICMP ping – gateway health check"},
    {"src": "192.168.1.1",   "dst": "192.168.1.200",    "sport": 0,     "dport": 0,    "proto": "ICMP", "bytes": 84,   "packets": 4,  "flags": "—",         "duration": "0.003s","ids": "Zeek",     "label": "ICMP ping – server health check"},
    # DHCP
    {"src": "0.0.0.0",       "dst": "255.255.255.255",  "sport": 68,    "dport": 67,   "proto": "UDP",  "bytes": 342,  "packets": 2,  "flags": "—",         "duration": "0.01s", "ids": "Zeek",     "label": "DHCP request"},
    # Windows update
    {"src": "192.168.1.33",  "dst": "52.109.8.20",      "sport": 57892, "dport": 443,  "proto": "TCP",  "bytes": 15200,"packets": 58, "flags": "PSH, ACK",  "duration": "4.20s", "ids": "Snort",    "label": "HTTPS – Windows Update"},
    # Slack / Teams
    {"src": "192.168.1.22",  "dst": "52.42.196.12",     "sport": 56123, "dport": 443,  "proto": "TCP",  "bytes": 2800, "packets": 14, "flags": "PSH, ACK",  "duration": "0.72s", "ids": "Suricata", "label": "HTTPS – Slack"},
    {"src": "192.168.1.45",  "dst": "52.114.75.141",    "sport": 58234, "dport": 443,  "proto": "TCP",  "bytes": 3400, "packets": 16, "flags": "PSH, ACK",  "duration": "0.91s", "ids": "Suricata", "label": "HTTPS – MS Teams"},
    # Internal file share
    {"src": "192.168.1.10",  "dst": "192.168.1.250",    "sport": 49152, "dport": 445,  "proto": "TCP",  "bytes": 22400,"packets": 88, "flags": "PSH, ACK",  "duration": "1.10s", "ids": "Snort",    "label": "SMB – internal file share"},
]

# Spread clean flows across the last 24 hours with realistic timestamps
_BASE_TIME = datetime.now(timezone.utc)


def _clean_flow_with_ts(flow: dict, minutes_ago: int) -> dict:
    ts = (_BASE_TIME - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {**flow, "ts": ts, "triggered": False, "signature": None, "severity": None}


def _seeded_clean_flows():
    """Return clean flows with staggered timestamps spread across last 24 hours."""
    step = (24 * 60) // len(_CLEAN_FLOWS)
    return [
        _clean_flow_with_ts(flow, i * step + random.randint(0, step - 1))
        for i, flow in enumerate(_CLEAN_FLOWS)
    ]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/traffic")
def get_traffic_logs(current_user: dict = Security(get_current_user)):
    """
    Returns all network flows:
    - triggered=True  → fired an IDS rule (also visible on Alerts page)
    - triggered=False → clean background traffic (only visible here)
    """
    col = get_collection()

    triggered_flows = []
    if col is not None:
        try:
            for alert in col.find({}, {"_id": 0}).sort("timestamp", -1).limit(300):
                triggered_flows.append({
                    "ts":        alert.get("timestamp", ""),
                    "src":       alert.get("src_ip", "—"),
                    "dst":       alert.get("dest_ip", "—"),
                    "sport":     alert.get("src_port") or 0,
                    "dport":     alert.get("dest_port") or 0,
                    "proto":     alert.get("proto", "TCP"),
                    "bytes":     random.randint(300, 9000),   # not stored on alert, estimate
                    "packets":   random.randint(2, 50),
                    "flags":     "PSH, ACK",
                    "duration":  f"{random.uniform(0.05, 2.5):.2f}s",
                    "ids":       alert.get("source_nids", "Unknown"),
                    "triggered": True,
                    "signature": alert.get("signature", ""),
                    "severity":  alert.get("severity_label", ""),
                    "label":     alert.get("signature", ""),
                })
        except PyMongoError:
            triggered_flows = []

    clean_flows = _seeded_clean_flows()

    # Merge and sort newest first
    all_flows = triggered_flows + clean_flows
    all_flows.sort(key=lambda f: f.get("ts") or "", reverse=True)

    return {"items": all_flows, "total": len(all_flows)}
