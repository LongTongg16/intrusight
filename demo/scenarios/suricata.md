# Suricata — signature-based detection

## What it demonstrates

Suricata matches traffic against a published ruleset and says *this looked like
a known thing*. Every Suricata record in IntruSight is a rule match carrying the
rule's text, its `signature_id` and Suricata's own classification.

## Why this engine is appropriate

Suricata is a signature IDS with protocol awareness. It is the right engine to
answer "has anyone described this pattern before?" — it ships with community and
Emerging Threats rulesets covering scanning, policy violations, malware C2 and
exploitation. It is *not* the right engine to answer "what did this connection
actually do", which is Zeek's job.

## Input source

`demo/fixtures/suricata/eve-alerts.json` — Suricata EVE JSON, one event per line.
Four `alert` events plus one `flow` event (which the ingestor correctly skips,
demonstrating that only alerts enter the queue).

Signature IDs reference real Emerging Threats rules (2001219, 2027865, 2023476,
2024364) so the format is authentic. The traffic they describe is lab traffic.

## Running it live instead

```bash
suricata -c /etc/suricata/suricata.yaml -i eth0     # or -r capture.pcap
export SURICATA_EVE_PATH=/var/log/suricata/eve.json
python3 backend/eve_ingestor.py
```

The ingestor tails EVE JSON and posts every `event_type: alert`.

## How IntruSight normalizes it

| Suricata field | Shared field |
| --- | --- |
| `alert.signature` | `signature` |
| `alert.signature_id` | `sid` |
| `alert.category` | `category` |
| `alert.severity` (1–4) | `severity` (1–3; native 4 → 3) |
| `src_ip` / `dest_ip` | `src_ip` / `dest_ip`, `source_asset` / `destination_asset`, `asset_kind: ip` |
| `app_proto`, `flow_id`, `rev`, `gid`, `in_iface` | `engine_context` |

`event_kind` is always `detection`.

## Expected output

Four detections, severities high/medium/low, all tagged `SURICATA`.

## Cleanup

`python3 backend/tools/demo.py clear`
