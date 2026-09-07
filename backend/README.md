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

## Create the first administrator

Run the bootstrap tool from this directory and explicitly choose its database
target:

```bash
python create_admin.py
```

For local development, choose **Local MongoDB**. The tool uses `MONGODB_URL` and
`DATABASE_NAME` with the normal precedence (process environment, then
`backend/.env`) and refuses to label a remote host as local. Make sure the local
MongoDB service is running first.

For MongoDB Atlas or another remote deployment, choose **Custom / production
MongoDB**. Paste the URI into the hidden prompt, enter the database name, inspect
the sanitized host/database summary, and explicitly confirm before continuing.
The custom URI stays in memory for this run: it is not placed in command-line
arguments, exported, or saved to `.env`. `--local` and `--custom` may be used to
skip the target menu; there is intentionally no URI command-line option.

Never commit Atlas credentials or paste them into screenshots or chat. Rotate
any credential that may have been exposed; the bootstrap tool cannot make an
exposed credential safe again.

## Ingestion

All engine workers post to `/api/ingest/alerts` using the
`X-Ingest-API-Key` header. `INGEST_API_KEY` must match in the API and worker
environments. Kismet additionally requires its own `KISMET_API_KEY`.

The supplied Suricata and Snort rule/signature examples are lab fixtures. This
service consumes rule output; it does not manage IDS rule deployment.

## Demonstration operations

Run the demo tool from the repository root. It uses the same explicit target
style as `create_admin.py`:

```bash
python3 backend/tools/demo.py load
python3 backend/tools/demo.py status
python3 backend/tools/demo.py clear
```

Choose **Local** to use `http://localhost:8000` and the ingestion key from the
process environment or `backend/.env`. Choose **Production / custom** to enter
an API base (default `https://intrusight.onrender.com`) and an ingestion key at
a hidden prompt. The custom key remains in memory and is neither printed nor
saved. `--local` and `--custom` skip the menu; for example:

```bash
python3 backend/tools/demo.py load --local
python3 backend/tools/demo.py status --custom
python3 backend/tools/demo.py clear --custom
```

All three operations wait for `/health` to report that the database is ready;
remote targets get a 90-second cold-start window. Status and clear go through
`/api/demo/status` and `/api/demo/records`, protected by the same ingestion key,
and never require a MongoDB URI. Clear shows the actual count and API target and
requires confirmation before deleting only the managed replayed fixtures.

Each of the 21 records has stable `replayed-fixture` provenance and a stable
`demo_fixture_id`. Loading again is an upsert: it cannot create a second copy,
and it preserves analyst status, notes, and original creation time on the
existing record. Use `load --engine zeek` (or another engine name) to replay
only that engine. If an older provenance-only corpus or duplicate fixture
identity is present, load stops before posting and asks the operator to run the
scoped clear command first.

## GeoLite2

Do not commit the MaxMind database or download credentials. Follow
[`documentation/GEOIP_SETUP.md`](documentation/GEOIP_SETUP.md), keep the file
current, and set `GEOIP_DB_PATH` when it is stored outside `geoip/`.
