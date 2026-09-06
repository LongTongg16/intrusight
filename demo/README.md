# IntruSight multi-engine demonstration

IntruSight normalizes output from four engines that see different things. This
directory contains the recorded engine output that demonstrates the difference,
and the loader that replays it through the normal ingestion path.

## Why four engines

| Engine | Contributes | Record kind |
| --- | --- | --- |
| **Suricata** | Signature-based detections — traffic matched a published rule | `detection` |
| **Snort** | Rule-driven detections from operator-authored rules | `detection` |
| **Zeek** | Protocol and connection context — what the traffic *was* | `observation` (+ notices as detections) |
| **Kismet** | Wireless visibility — what is present on the radio layer | `observation` (+ WIDS alerts as detections) |

The point is not that all four produce alerts. Two of them mostly do not.
Suricata and Snort answer *"did this match something known?"*. Zeek answers
*"what actually happened on this connection?"*. Kismet answers *"what is on the
air?"* — a question no wired engine in this project can answer at all.

A record therefore carries `event_kind`:

* `detection` — an engine asserts that traffic matched a rule. Severity graded.
* `observation` — an engine describes what it saw. Not graded; IntruSight does
  not invent a severity for it.

## Run it

```bash
# 1. backend + MongoDB running, INGEST_API_KEY set in backend/.env
python3 backend/tools/demo.py load

# 2. open the analyst dashboard and filter by engine

# 3. when finished
python3 backend/tools/demo.py clear
```

`status` shows what is currently loaded. `load --engine zeek` replays a single
engine.

The loader calls each engine's real ingestor (`eve_ingestor.build_payload`,
`snort_ingestor.build_payload`, `zeek_ingestor.build_payload`,
`kismet_ingestor.build_device_payload` / `build_alert_payload`) and posts the
result to `/api/ingest/alerts` with the ingestion key. It does not write to
MongoDB directly and it does not generate records — the same parsing code runs
here as when a live sensor is attached.

## Provenance

Everything in `fixtures/` is **recorded engine output shape**, replayed. It is
not live capture, and it is not sampled from a third-party dataset.

| Class | Where | Marked how |
| --- | --- | --- |
| Live engine output | not in this repository | — |
| Replayed fixture | `demo/fixtures/**` | `engine_context.provenance = "replayed-fixture"` |
| Test fixture | `backend/tests/` | test scope only |
| Illustrative UI sample | public landing page | labelled "Illustrative" in the UI |

Every record the loader creates is tagged `provenance: "replayed-fixture"`. The
analyst detail view shows a banner saying so, and `demo.py clear` deletes
exactly those records and nothing else — data from a live sensor is never
touched.

The fixtures are hand-authored to match each engine's documented output format
(Suricata EVE JSON, Snort JSON alerts, Zeek JSON logs, Kismet REST payloads),
using RFC 5737 documentation addresses (`203.0.113.0/24`), the private
`10.10.0.0/24` lab range, and locally-administered MAC addresses. They describe
one lab scenario; they are not a capture of any real network.

## The scenario

All four engines observe the same lab window, from their own vantage point:

```
09:14  Suricata   ET SCAN Potential SSH Scan            10.10.0.15 → 10.10.0.20:22
09:14  Zeek       connection  ssh  REJ                  (same 5-tuple, uid CHhAvVGS1DHFjwGM9)
09:14  Snort      lab rule 1000001 — sequential TCP     10.10.0.15 → 10.10.0.20:23
09:14  Zeek       connection  telnet  REJ
09:14  Suricata   ET INFO DNS query to .example TLD     10.10.0.15 → 10.10.0.53:53
09:14  Zeek       dns_query   updates.lab-marker.example → 203.0.113.24
09:15  Suricata   ET POLICY self-signed certificate     10.10.0.15 → 203.0.113.24:443
09:15  Zeek       tls_handshake  TLSv13, self signed certificate in chain
09:15  Zeek       connection  ssl  SF  1841/7420 bytes
09:16  Suricata   ET SCAN Nmap NSE User-Agent           10.10.0.15 → 10.10.0.20:8080
09:16  Snort      lab rule 1000004 — marker path        /intrusight-lab-marker
09:16  Zeek       http_request  GET /intrusight-lab-marker  404
09:17  Kismet     access point / client sightings       (radio layer, MACs)
09:17  Kismet     DEAUTHFLOOD, APSPOOF                  WIDS detections
```

The correlation is real, not asserted: the Zeek records share the 5-tuple and
Zeek connection `uid` of the connections Suricata alerted on. Suricata says *a
rule matched*; Zeek says *here is what that connection did*. That is the case
for running both.

Kismet's records are deliberately **not** correlated with the wired traffic. The
lab has no evidence linking the wireless devices to the IP hosts, so none is
claimed.

## Scenarios

* [`scenarios/suricata.md`](scenarios/suricata.md) — signature detection
* [`scenarios/snort.md`](scenarios/snort.md) — rule-driven detection
* [`scenarios/zeek.md`](scenarios/zeek.md) — protocol/network context
* [`scenarios/kismet.md`](scenarios/kismet.md) — wireless visibility

## Limitations

* The fixtures are replayed, not captured live. Running the engines themselves
  against a lab network is described in each scenario document but is not
  automated here.
* Snort's rules in `rules/intrusight-lab.rules` are lab rules written for this
  project. They are not production detection content.
* IntruSight performs no detection of its own. Every detection in the queue was
  made by an external engine.
