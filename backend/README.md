# IntruSight backend

The backend is the FastAPI service, MongoDB persistence layer, IDS ingestors,
and development simulators for IntruSight.

Use the [root README](../README.md) for complete setup, environment, architecture,
testing, deployment, security, and attribution documentation.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp ../.env.example .env
```

Replace every required placeholder in `.env` and run `chmod 600 .env`. The file
is gitignored and loaded automatically, so shell exports are not required.

Start MongoDB separately, then run:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API documentation is at `http://localhost:8000/docs`. The public
`http://localhost:8000/health` response reports both API liveness and MongoDB
readiness without exposing the MongoDB URI. See the root README for Docker,
Homebrew, external MongoDB, and connectivity-check instructions.

## Ingestion

All engine workers post to `/api/ingest/alerts` using the
`X-Ingest-API-Key` header. `INGEST_API_KEY` must match in the API and worker
environments. Kismet additionally requires its own `KISMET_API_KEY`.

The supplied Suricata and Snort rule/signature examples are lab fixtures. This
service consumes rule output; it does not manage IDS rule deployment.

## GeoLite2

Do not commit the MaxMind database or download credentials. Follow
[`documentation/GEOIP_SETUP.md`](documentation/GEOIP_SETUP.md), keep the file
current, and set `GEOIP_DB_PATH` when it is stored outside `geoip/`.
