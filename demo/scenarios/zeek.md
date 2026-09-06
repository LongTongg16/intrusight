# Zeek — protocol and network context

## What it demonstrates

That not every useful security record is an alert.

Zeek does not primarily tell you something is wrong. It writes a structured
record for every connection it sees: which service was spoken, what name was
resolved, which TLS server was requested, how long it lasted, how many bytes
moved, and how it ended. When a signature engine fires, that record is what an
analyst actually needs in order to decide what happened.

## Why this engine is appropriate — and why it is not a second Snort

Making Zeek imitate a signature engine throws away the reason to run it. Zeek's
value is coverage and detail: it describes *all* the traffic, not just the part
that matched a rule.

IntruSight therefore records Zeek's protocol logs as **observations**:

* `event_kind: observation` — this describes traffic, it does not accuse it
* no `severity` grading — Zeek did not assess it, so IntruSight does not invent
  a level
* no `sid` — nothing matched, so there is no rule identity to report

Zeek's `notice.log` is the exception. A notice is Zeek's own policy script
raising something, so notices are ingested as `detection` with a severity.

> **Regression note.** This ingestor previously read `notice.log` only and
> stamped every record with `sid = random.randint(10000, 99999)` — a fabricated
> rule id for records that never matched a rule. Both are fixed;
> `tests/test_engine_roles.py::TestZeekRole::test_no_fabricated_signature_id`
> guards it.

## Input source

`demo/fixtures/zeek/zeek-logs.json` — Zeek JSON output with `_path` naming the
source log: three `conn`, one `dns`, one `ssl`, one `http`, one `notice`.

## Running it live instead

```bash
zeek -i eth0 LogAscii::use_json=T          # or: zeek -r capture.pcap
export ZEEK_LOG_FILE=/usr/local/zeek/logs/current/conn.log
python3 backend/zeek_ingestor.py
```

The ingestor classifies each record by `_path`, falling back to the
discriminating field of each log when `_path` is absent.

## How IntruSight normalizes it

| Zeek log | `observation_type` | Context preserved |
| --- | --- | --- |
| `conn` | `connection` | `uid`, `service`, `conn_state`, `duration`, `orig_bytes`, `resp_bytes` |
| `dns` | `dns_query` | `query`, `qtype_name`, `answers` |
| `http` | `http_request` | `method`, `host`, `uri`, `status_code`, `user_agent` |
| `ssl` | `tls_handshake` | `server_name`, `tls_version`, `cipher`, `validation_status` |
| `notice` | *(detection)* | `note`, `msg` |

`ts` (epoch seconds) is converted to a timezone-aware ISO-8601 string; ingest
time is used only when no usable source time exists.

## Why this matters in the demonstration

Three of the Zeek records share the connection Suricata alerted on:

```
Suricata  ET POLICY Observed Self-Signed Certificate   10.10.0.15 → 203.0.113.24:443
Zeek      tls_handshake   TLSv13, "self signed certificate in certificate chain",
                          server_name updates.lab-marker.example
Zeek      connection      service ssl, conn_state SF, 1841/7420 bytes, 4.2s
Zeek      dns_query       updates.lab-marker.example → 203.0.113.24
```

Suricata says a rule matched. Zeek says which name was resolved to reach that
host, what the TLS handshake actually negotiated, and that the connection
completed normally carrying 7 KB back. Neither engine alone gives an analyst
both halves.

The link is the shared 5-tuple and the Zeek `uid` — it is present in the data,
not asserted by IntruSight.

## Expected output

Six observations (3 connection, 1 dns_query, 1 tls_handshake, 1 http_request)
and one detection (the `Scan::Port_Scan` notice), all tagged `ZEEK`.

## Cleanup

`python3 backend/tools/demo.py clear`
