# Kismet — wireless visibility

## What it demonstrates

The layer none of the other three engines can see.

Suricata, Snort and Zeek all read IP traffic. None of them can observe an access
point that never routes a packet, a client probing for a network it remembers,
or an SSID being advertised by a BSSID that should not be advertising it. Kismet
observes the radio layer directly.

## Why this engine is appropriate — and why it is not another IP IDS

Kismet identifies everything by 802.11 hardware address. It has no IP addresses
to report, and its interesting fields — SSID, BSSID, channel, band, encryption
suite, signal strength — have no equivalent anywhere in the wired engines'
output.

Kismet contributes two different things, and IntruSight does not conflate them:

* **Device and access-point sightings** → `event_kind: observation`.
  "This BSSID was heard on channel 6 advertising IntruSight-Lab with WPA2-PSK."
  That is presence, not an attack. It is recorded as context.
* **WIDS alerts** → `event_kind: detection`. Kismet's own detection logic firing
  (a deauthentication flood, an SSID/BSSID mismatch). That is a real detection
  claim and is graded.

## Address representation — the correctness rule

Kismet MAC addresses previously occupied `src_ip` / `dest_ip`. That was
semantically wrong: it put hardware addresses in front of every consumer
expecting an IP literal, and forced geolocation to defend itself against them.

Now:

```
src_ip          : null            <- Kismet observes no IP
dest_ip         : null
source_asset    : C4:12:F5:2A:9B:01
destination_asset: KISMET-LAB-01
asset_kind      : "mac"
```

Geolocation is skipped entirely when `asset_kind` is `mac`, rather than relying
on the lookup to reject a non-IP string. The frontend reads the asset fields, so
these records display their MACs correctly instead of rendering "—".

`tests/test_engine_roles.py::TestKismetRole::test_mac_addresses_never_enter_ip_fields`
guards this.

## Input source

* `demo/fixtures/kismet/kismet-devices.json` — device/AP records in Kismet's
  `kismet.device.base.*` field shape (2 access points, 2 clients).
* `demo/fixtures/kismet/kismet-alerts.json` — WIDS alerts in Kismet's
  `kismet.alert.*` shape (DEAUTHFLOOD, APSPOOF).

MAC addresses use locally-administered and vendor-documentation OUIs. The SSID
`IntruSight-Lab` is this project's own.

## Running it live instead

Live wireless capture needs a monitor-mode-capable adapter and is not
reproducible on arbitrary hardware, which is why the demonstration replays
recorded output. To run it for real:

```bash
kismet -c wlan0mon
export KISMET_API_KEY=<kismet api token>
export KISMET_URL='http://localhost:2501/alerts/last-time/{}/alerts.json'
python3 backend/kismet_ingestor.py
```

Only capture traffic on a network you are authorised to monitor.

## How IntruSight normalizes it

| Kismet field | Shared field |
| --- | --- |
| `kismet.device.base.macaddr` | `source_asset` (`asset_kind: mac`) |
| `kismet.device.base.name` | `engine_context.ssid` |
| `kismet.device.base.channel` / `.band` / `.frequency` | `engine_context` |
| `kismet.device.base.crypt` | `engine_context.encryption` |
| `kismet.device.base.signal` | `engine_context.signal_dbm` |
| `kismet.device.base.manuf` | `engine_context.manufacturer` |
| `kismet.alert.header` | `signature` |
| `kismet.alert.severity` (0–20) | `severity` (1–3) |
| `kismet.alert.timestamp` (epoch) | `timestamp` (ISO-8601) |

> **Bug found during this work.** Kismet reports times as epoch seconds, but the
> shared contract types `timestamp` as a string — the raw value was rejected
> with HTTP 422. This ingestor could never have delivered a record from a live
> Kismet server. Now normalized to ISO-8601, with a regression test.

## What is deliberately not claimed

* No correlation between the wireless devices and the IP hosts. The lab has no
  evidence linking them, so IntruSight asserts none.
* An access-point sighting is never described as an attack.
* Signal strength is reported as Kismet measured it; it is not turned into a
  distance or a location.

## Expected output

Four observations (2 access points, 2 wireless clients) and two detections
(DEAUTHFLOOD, APSPOOF), all tagged `KISMET`, none carrying an IP address.

## Cleanup

`python3 backend/tools/demo.py clear`
