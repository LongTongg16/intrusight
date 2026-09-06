# IntruSight — five-minute demonstration

The point to convey: **four engines are here because they see different things,
and IntruSight keeps that difference visible while giving one place to work.**

## Setup (once)

```bash
# MongoDB running, backend/.env configured with MONGODB_URL, SECRET_KEY,
# INGEST_API_KEY
cd backend && uvicorn main:app --reload      # terminal 1
cd frontend && npm run dev                   # terminal 2
```

## Step 1 — load the corpus (10 seconds)

```bash
python3 backend/tools/demo.py load
```

```
SURICATA  Signature detection           4 records   4x detection
SNORT     Rule-driven detection         4 records   4x detection
ZEEK      Protocol / network context    7 records   3x connection, 1x detection,
                                                    1x dns_query, 1x http_request,
                                                    1x tls_handshake
KISMET    Wireless visibility           6 records   2x detection, 2x wireless_ap,
                                                    2x wireless_client
```

**Say:** every one of those records was parsed by the same ingestor that runs
against a live sensor. Nothing was generated; this is recorded engine output
replayed through the real pipeline.

## Step 2 — the queue (60 seconds)

Open **Alerts**. Point out that the queue mixes engines but stays scannable:
severity leads, the signature is the headline, the connection is one unit, and
the engine badge is colour-coded per engine.

Note the **Loaded · 10 context** figure — observations are counted separately
from graded detections.

## Step 3 — Suricata: signature detection (45 seconds)

Filter **Engine → Suricata**.

Four rule matches, each carrying a real Emerging Threats signature ID.
**Say:** Suricata answers "did this match something someone has already
described?"

Open one → the Record panel shows the signature ID, category and application
protocol.

## Step 4 — Snort: rule-driven detection (45 seconds)

Filter **Engine → Snort**.

**Say:** same *kind* of answer, different source of authority. These fired on
rules written for this lab — the actual rule text is in
`demo/rules/intrusight-lab.rules`, and every record is flagged `lab_rule: true`
so it is never mistaken for production coverage.

Open one → `engine_context` shows `rule: 1:1000004:2`, the gid/sid/rev and the
service.

## Step 5 — Zeek: context, not accusation (75 seconds — the important one)

Filter **Engine → Zeek**.

**Say:** notice these have **no severity badge**. Zeek is not accusing this
traffic of anything — it is describing it. IntruSight records them as
observations and refuses to invent a severity the engine never assigned.

Now the payoff. Search `203.0.113.24`:

* Suricata — *ET POLICY Observed Self-Signed Certificate*
* Zeek — *TLSv13 handshake with updates.lab-marker.example*, validation status
  `self signed certificate in certificate chain`
* Zeek — *SSL connection*, `conn_state SF`, 1841/7420 bytes, 4.2s
* Zeek — *DNS query for updates.lab-marker.example* → `203.0.113.24`

**Say:** Suricata told me a rule matched. Zeek told me which hostname resolved
to that address, what the handshake actually negotiated, and that the connection
completed carrying 7 KB back. Neither engine alone gives both halves. The link
is the shared 5-tuple and the Zeek connection `uid` — it is in the data, not
asserted by the platform.

## Step 6 — Kismet: the layer nothing else sees (60 seconds)

Filter **Engine → Kismet**.

**Say:** none of these have an IP address, because Kismet does not observe IP.
It observes the radio layer.

Open an access-point record. The Connection panel is titled **Observed
endpoints** and explains that these are 802.11 hardware addresses. The Kismet
detail panel shows SSID, BSSID, channel, band, encryption suite, signal and
packet count — none of which exists anywhere in the wired engines' output.

**Say:** two of the six Kismet records *are* detections — Kismet's own WIDS
logic firing on a deauthentication flood and an SSID advertised by an unexpected
BSSID. A device sighting is not an attack, and the model records that difference.

## Step 7 — what it does not do (30 seconds)

**Say, unprompted:**

* IntruSight performs no detection of its own. Every detection came from an
  external engine.
* Configuration state on the Log Sources page is not sensor health — nothing
  probes a sensor.
* This corpus is replayed recorded output, tagged as such, shown as a banner in
  the detail view.
* The Snort rules are lab rules, not production detection content.

```bash
python3 backend/tools/demo.py clear
```

## The one-sentence version

> Suricata and Snort tell me *something matched*; Zeek tells me *what actually
> happened*; Kismet tells me *what is on the air* — and IntruSight normalizes
> them enough to work in one queue without pretending they are the same thing.
