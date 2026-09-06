import time
import json
import os
import requests
from datetime import datetime, timezone
from config import load_backend_env

load_backend_env()
API_URL = os.getenv(
    "API_URL",
    "http://localhost:8000/api/ingest/alerts"
)
INGEST_API_KEY = os.getenv("INGEST_API_KEY")
ZEEK_LOG_FILE = os.getenv("ZEEK_LOG_FILE", "zeek_notice.log")

SEVERITY_THRESHOLD = int(os.getenv("SEVERITY_THRESHOLD", "2"))
SEVERITY_LABELS = {1: "high", 2: "medium", 3: "low"}

# ── Zeek's role in IntruSight ────────────────────────────────────────────────
# Zeek is not a signature engine. Its value is the record it writes for every
# connection it sees: what protocol was spoken, which name was resolved, which
# TLS server name was requested, how long the connection lasted and how it
# ended. Those records are OBSERVATIONS — they describe traffic, they do not
# assert that it was malicious.
#
# Zeek's notice.log is the one exception: a notice is Zeek's own policy script
# raising something, so notices are ingested as detections.
#
# Previously this ingestor read notice.log only and stamped every record with
# `sid: random.randint(10000, 99999)` — a fabricated signature ID for records
# that have no signature. Both are fixed here.

# Which Zeek log a record came from, keyed by the fields it carries.
ZEEK_LOG_KINDS = {
    "conn": "connection",
    "dns": "dns_query",
    "http": "http_request",
    "ssl": "tls_handshake",
    "notice": "notice",
}

NOTE_TO_SEVERITY = {
    "SSH::Password_Guessing": 1,
    "HTTP::SQL_Injection_Attempt": 1,
    "SSL::Invalid_Server_Cert": 2,
    "Scan::Port_Scan": 2,
    "DNS::External_Name_Discovery": 3,
}


def compute_severity(data: dict) -> int:
    """
    Severity for a Zeek NOTICE.

    Observations do not use this: a connection summary or a DNS answer has no
    severity of its own, and inventing one would misrepresent it as a finding.
    """
    if "severity" in data:
        try:
            sev = int(data.get("severity"))
            if sev in (1, 2, 3):
                return sev
        except (TypeError, ValueError):
            pass

    return NOTE_TO_SEVERITY.get(data.get("note", ""), 2)


def detect_log_kind(data: dict) -> str:
    """
    Identify which Zeek log a JSON record came from.

    Zeek's JSON output does not name its own log, so the record is classified by
    the fields it carries. `_path` is used when present (zeek-json/Filebeat add
    it), otherwise the discriminating field of each log is used.
    """
    path = str(data.get("_path", "")).lower()
    if path in ZEEK_LOG_KINDS:
        return path
    if "note" in data:
        return "notice"
    if "query" in data:
        return "dns"
    if "host" in data or "uri" in data:
        return "http"
    if "server_name" in data or "ja3" in data or "validation_status" in data:
        return "ssl"
    if "conn_state" in data or "duration" in data or "orig_bytes" in data:
        return "conn"
    return "conn"


def _summary(kind: str, data: dict) -> str:
    """
    A human-readable one-line summary of what Zeek observed.

    Deliberately descriptive rather than accusatory: "DNS query for x.example"
    states a fact. The analyst decides whether it matters.
    """
    service = data.get("service") or data.get("proto") or "traffic"
    if kind == "dns":
        q = data.get("query") or "unknown name"
        return f"DNS query for {q}"
    if kind == "http":
        method = data.get("method") or "HTTP"
        host = data.get("host") or "unknown host"
        uri = data.get("uri") or "/"
        return f"{method} {host}{uri}"
    if kind == "ssl":
        name = data.get("server_name") or "unknown server"
        version = data.get("version") or "TLS"
        return f"{version} handshake with {name}"
    if kind == "notice":
        note = data.get("note") or "Notice"
        msg = data.get("msg")
        return f"{note} — {msg}" if msg else str(note)
    return f"{str(service).upper()} connection"


def build_payload(data: dict) -> dict:
    """
    Map one Zeek JSON record onto the shared contract.

    Notices become detections; every other Zeek log becomes an observation with
    `severity` fixed at the informational level (3). No `sid` is emitted for
    observations, because Zeek did not match a signature.
    """
    kind = detect_log_kind(data)
    observation_type = ZEEK_LOG_KINDS.get(kind, "connection")
    is_notice = kind == "notice"

    src_ip = data.get("id.orig_h") or data.get("id", {}).get("orig_h")
    dest_ip = data.get("id.resp_h") or data.get("id", {}).get("resp_h")
    src_port = data.get("id.orig_p") or data.get("id", {}).get("orig_p") or 0
    dest_port = data.get("id.resp_p") or data.get("id", {}).get("resp_p") or 0

    # Engine-native detail, kept out of the shared columns. Only fields Zeek
    # actually wrote are carried — nothing is defaulted into existence.
    context = {
        k: v for k, v in {
            "zeek_log": kind,
            "uid": data.get("uid"),
            "service": data.get("service"),
            "conn_state": data.get("conn_state"),
            "duration": data.get("duration"),
            "orig_bytes": data.get("orig_bytes"),
            "resp_bytes": data.get("resp_bytes"),
            "query": data.get("query"),
            "qtype_name": data.get("qtype_name"),
            "answers": data.get("answers"),
            "method": data.get("method"),
            "host": data.get("host"),
            "uri": data.get("uri"),
            "status_code": data.get("status_code"),
            "user_agent": data.get("user_agent"),
            "server_name": data.get("server_name"),
            "tls_version": data.get("version"),
            "cipher": data.get("cipher"),
            "validation_status": data.get("validation_status"),
            "note": data.get("note"),
            "msg": data.get("msg"),
        }.items() if v is not None
    }

    payload = {
        "timestamp": extract_timestamp(data),
        "src_ip": src_ip,
        "src_port": src_port,
        "dest_ip": dest_ip,
        "dest_port": dest_port,
        "proto": str(data.get("proto", "tcp")).upper(),
        "signature": _summary(kind, data),
        "source_nids": "ZEEK",
        "source_asset": src_ip,
        "destination_asset": dest_ip,
        "asset_kind": "ip",
        "engine_context": context or None,
    }

    if is_notice:
        payload["event_kind"] = "detection"
        payload["observation_type"] = None
        payload["severity"] = compute_severity(data)
        payload["category"] = "Zeek notice"
        # A notice has no rule id. The field is left unset rather than filled
        # with a random number, which is what this ingestor used to do.
    else:
        payload["event_kind"] = "observation"
        payload["observation_type"] = observation_type
        # Context carries no severity of its own; 3 is the shared scale's
        # informational level and the UI renders observations without a
        # severity badge.
        payload["severity"] = 3
        payload["category"] = "Network context"

    return payload


def extract_timestamp(data: dict) -> str:
    """
    Return the source event time as a timezone-aware ISO-8601 string.

    Zeek notice records carry `ts` as epoch seconds (a JSON number, or a string
    when the log passed through a text exporter). Already-normalised ISO-8601
    strings are accepted too. Only when no usable source time exists do we fall
    back to the ingest time, so the pipeline never presents ingest time as if it
    were observed event time.
    """
    raw = data.get("ts", data.get("timestamp"))

    if isinstance(raw, bool):
        raw = None
    elif isinstance(raw, str):
        raw = raw.strip() or None

    if isinstance(raw, (int, float)):
        try:
            return datetime.fromtimestamp(float(raw), tz=timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            pass
    elif isinstance(raw, str):
        try:
            return datetime.fromtimestamp(float(raw), tz=timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            pass
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
        else:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat()

    return datetime.now(timezone.utc).isoformat()

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
        notable_alerts = 0

        while True:
            line = f.readline()

            if not line:
                time.sleep(0.5)
                continue

            try:
                data = json.loads(line.strip())
                payload = build_payload(data)
                severity = payload["severity"]

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
                        notable_alerts += 1
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
                f"Total Sent: {sent} | Notable: {notable_alerts} | Failed: {failed}        ",
                end="\r"
            )

if __name__ == "__main__":
    start_reading()
