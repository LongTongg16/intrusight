# Snort — rule-driven detection

## What it demonstrates

That detection logic is something an operator writes and controls. Where
Suricata contributes a maintained ruleset, Snort here contributes **four rules
written for this project**, each firing on a marker that only exists inside the
lab.

## Why this engine is appropriate

Snort's rule language is the clearest way to show configurable detection: a rule
is a readable line of text with a message, a classification, a priority and a
match condition. `demo/rules/intrusight-lab.rules` is committed so the logic
behind every Snort record in the demonstration can be read.

The rules deliberately show different *kinds* of logic, not four variations of
one match:

| SID | Logic | Demonstrates |
| --- | --- | --- |
| 1000001 | `detection_filter` 15 SYNs in 30s by source | stateful thresholding |
| 1000004 | `http_uri` content match on a lab marker path | content matching |
| 1000005 | `http_stat_code` 401 ×5 in 60s by destination | response-side rate logic |
| 1000006 | `http_client_body` credential parameter | policy rule, not an attack |

## This is lab content, not production coverage

These rules exist to demonstrate the mechanism. They are not maintained
detection content and they would not detect a real intrusion. Every record they
produce is tagged `engine_context.lab_rule: true` so it can never be mistaken
for a maintained-ruleset detection.

A real deployment runs the Snort community ruleset, Talos, or Emerging Threats.

## Input source

`demo/fixtures/snort/alert_json.txt` — Snort JSON alert output, one per line.

## Running it live instead

```bash
snort -c /etc/snort/snort.lua -R demo/rules/intrusight-lab.rules -i eth0 \
      --plugin-path /usr/local/lib/snort_extra
export SNORT_ALERT_PATH=/var/log/snort/alert_json.txt
python3 backend/snort_ingestor.py
```

Then request `http://<lab-host>:8080/intrusight-lab-marker` to fire SID 1000004.

## How IntruSight normalizes it

| Snort field | Shared field |
| --- | --- |
| `msg` | `signature` — the rule's own message, not rewritten |
| `rule` (`gid:sid:rev`) | `sid` + `engine_context.rule` / `rule_gid` / `rule_rev` |
| `class` | `category` |
| `priority` (1–3) | `severity` (1–3) |
| `src_ap` / `dst_ap` | `src_ip`+`src_port` / `dest_ip`+`dest_port` |
| `service`, `iface` | `engine_context` |

`event_kind` is always `detection`.

## Expected output

Four detections tagged `SNORT`, all flagged as lab rules.

## Cleanup

`python3 backend/tools/demo.py clear`
