# Security remediation report

Original audit: 2026-07-27
Latest remediation pass: 2026-09-04

Scope: current tracked files, selected historical blobs, authentication and
authorization, integrations, configuration, workflows, dependencies, archives,
documentation, and deployment assumptions.

**Status boundary:** findings and code-remediation results are historical to the
dated audit passes above. The current tree contains no repository evidence that
external credentials were rotated/revoked or affected account passwords were reset.
Credentials historically committed or exposed must be treated as compromised and
rotated/revoked by their owners. Removal from the current tree does not revoke
historical values. Section 6 therefore remains an outstanding operator checklist.

**No Git history was rewritten in either pass. No commit was created by the
latest pass.**

Current-code citations below name a file and a symbol rather than a line range,
because line numbers drift and the previous revision of this document accumulated
citations that no longer pointed at the code they described. Historical evidence
keeps its original line numbers and is explicitly labelled as such.

---

## 1. Executive summary

The original review confirmed two critical access-control problems, several
high-impact secret and personal-data exposures, and a set of medium-severity
hardening issues. The corresponding current-code vulnerabilities have been remediated, while historical credential and personal-data exposure remains and still requires the actions described in section 6.

The latest pass removed the Telegram integration entirely (section 3), corrected
four data-correctness defects in the ingestion pipeline (section 5), and
re-validated the whole tree (section 7).

Current-file cleanup remains insufficient on its own: Git history still contains
credentials, account backups, and password hashes. **The repository can remain
public only after the credentials in section 6 are rotated.** A coordinated
history cleanup is still recommended for the exposed personal data and credential
material.

---

## 2. Historical vulnerabilities (found, and their status)

Evidence in this table is the code **as it was when first audited**. Every item
here is remediated in current files; section 4 records what replaced it.

| Severity | Historical finding and original evidence | Status |
| --- | --- | --- |
| Critical | Public registration accepted the `Administrator` role, and login issued tokens to `pending`, `suspended`, or `rejected` accounts, so a direct API client could self-register an administrator and immediately call admin routes. Original evidence: `backend/models/user.py:7-15`, `backend/routes/auth.py:58-79`, `backend/services/user_service.py:41-67`. | Remediated |
| Critical | JWT signing used a public fallback value; a deployment without `SECRET_KEY` accepted attacker-forged tokens. Original evidence: `backend/core/security.py:22`. | Remediated |
| Critical | A Kismet API key was hardcoded. Original evidence: `backend/kismet_ingestor.py:8`. Present in multiple historical commits. | Remediated in code; **key rotation still required** |
| Critical | A Telegram bot token exists in historical versions of `backend/routes/alerts.py` and `frontend/src/pages/analyst/Dashboard.jsx`. The token is not repeated in this document. | Integration removed entirely (section 3); **token revocation still required** |
| High | Eight committed compressed database backups contained account emails, bcrypt password hashes, roles, statuses, network alert data, log-source paths, and — in some backups — Telegram IDs. Paths were `backend/backups/backup_*.json.gz` and `backend/backend/backups/backup_*.json.gz`. | Archives removed and paths ignored; **history still contains them** |
| High | Alert listing, details, notes, status changes, edits, and location refreshes were unauthenticated; alert ingestion was public. Original evidence: `backend/routes/alerts.py:71-104`, `107-151`, `171-257`, `283-326`. | Remediated |
| High | Logout and password-reset invalidation relied on an `iat` claim tokens did not contain; a second auth dependency never checked invalidation; the database check failed open on exceptions. Original evidence: `backend/core/security.py:26-39`, `backend/routes/auth.py:30-56`, `164-215`. | Remediated |
| High | First-login password change was enforced only by the frontend, and authorization trusted the role cached in the token instead of the live account. Original evidence: `backend/core/security.py:39-44`, `backend/routes/auth.py:71-99`. | Remediated |
| High | `backend/database.py:8` printed the raw MongoDB URI before printing a redacted copy, so a credentialed Atlas URI would enter logs. | Remediated |
| Medium | CORS declared an origin list but actually used `allow_origins=["*"]`. Original evidence: `backend/main.py:14-26`. | Remediated |
| Medium | The Telegram send endpoint accepted an arbitrary chat ID and arbitrary message text from any authenticated user and returned upstream response bodies, making the project bot an authenticated message relay. Original evidence: `backend/routes/alerts.py:154-168`. | Endpoint deleted (section 3) |
| Medium | Automatic Telegram recipient lookup did not require active account status, so suspended or rejected users with a stored chat ID kept receiving alerts. Original evidence: `backend/services/user_service.py:97-106`. | Lookup deleted (section 3) |
| Medium | Backup restore joined an administrator-supplied filename directly to `BACKUP_DIR`, allowing `../` traversal to another gzip JSON file. Original evidence: `backend/routes/maintenance.py:188-231`. | Remediated |
| Medium | Maintenance failures returned internal exception strings and persisted them. Original evidence: `backend/routes/maintenance.py:163-165`, `229-231`, `264-266`. | Remediated |
| Medium | Any authenticated user could view and change log-source paths, syslog hosts, and ports. Original evidence: `backend/routes/logs.py:32-85`. | Remediated |
| Medium | `backend/app.py` was an obsolete duplicate FastAPI entrypoint with wildcard credentialed CORS and unauthenticated alert operations. | Removed |
| Medium | Password policy was inconsistent: force-change and admin reset accepted weaker passwords than registration, and password strings were silently trimmed. | Remediated |
| Low | The dependency file included unused Flask, Celery, Redis, and related packages, and pinned an old Requests release. | Remediated |
| Low | The frontend lockfile reported 11 known vulnerabilities. | Reduced; see section 6 for the current, re-measured position |
| Low | The workflow used older major action versions, `mongo:latest`, and default token permissions. | Remediated |
| Low | A 62 MB GeoLite2 database was committed. | Removed and ignored |
| Low | `frontend/src.zip`, an empty root npm lockfile, generated EVE data, and a duplicate nested backend directory were repository artifacts rather than source. | Removed and ignored |

---

## 3. Telegram containment

### Why

The bot identity historically associated with this project is now publicly branded as something unrelated and is treated as untrusted. Any code path that could reach it is therefore treated as an untrusted egress channel for alert data, not as a feature.

### Current state

The integration is **removed**, not disabled behind configuration. Verified in the
current tree:

| Property | Where enforced |
| --- | --- |
| No Telegram HTTP sender exists | `send_telegram_message` and `BOT_TOKEN` deleted from `backend/routes/alerts.py` |
| Alert ingestion has no messaging side effect | the severity-threshold notify block deleted from `ingest_alert` |
| No manual send endpoint | `POST /api/alerts/send-telegram` and `TelegramAlertRequest` deleted |
| No recipient lookup | `get_users_with_telegram_id` deleted from `backend/services/user_service.py` |
| `TELEGRAM_BOT_TOKEN` is not read anywhere | removed from `.env.example`; no `os.getenv` site remains |
| No `api.telegram.org` string in application code | asserted by test |
| API models neither accept nor return `telegram_id` | `UserIn`, `UserOut`, `EditProfileIn`, `UserListOut` in `backend/models/user.py` |
| Profile updates cannot write a chat ID | `update_user_profile` no longer takes the parameter |
| The dashboard has no send control | Telegram column, button, handler, and `telegram-btn` CSS removed |
| Profile pages no longer collect chat IDs | field and notification toggle removed from both `Profile.jsx` pages |
| Marketing pages no longer advertise it | `About.jsx`, `Features.jsx`, `Visitor.jsx` |

### Regression tests

`backend/tests/test_telegram_containment.py` asserts, behaviourally where
possible:

- no registered route path contains "telegram";
- `POST /api/alerts/send-telegram` is not handled;
- `routes.alerts` exposes no sender, token, request model, or recipient lookup;
- **ingesting a severity-1 alert opens no network socket** (`socket.socket.connect`
  is asserted un-called), which is the direct proof that ingestion has no outbound
  side effect;
- ingestion performs no user-recipient query;
- no application source file contains `api.telegram.org` or `TELEGRAM_BOT_TOKEN`.

`backend/tests/test_services.py` and `test_security_models.py` additionally assert
that the recipient lookup is gone, that profile updates write only `full_name`,
and that no user-facing model exposes `telegram_id`.

### Deliberately retained references

These are labelled historical and are **not** live integration code:

- explanatory comments in `backend/routes/alerts.py` and `backend/models/user.py`;
- the removal notice in `.env.example`;
- the "Telegram is not a maintained integration" section of `README.md`;
- this section;
- the contributor-attribution paragraph in `README.md`, which accurately records
  that broader project notes mention a Telegram integration. This wording is
  preserved because Git history supports it.

### Stored data

Existing MongoDB user documents may still contain a `telegram_id` written before
removal. **No migration or deletion was performed**, by instruction. Current code
never reads or writes the field. Purging it from stored documents and from the
committed backups in Git history remains an operator decision, and those chat IDs
should still be treated as exposed personal data.

---

## 4. Remediated vulnerabilities — current controls

| Control | Current implementation |
| --- | --- |
| Secret validation | `_load_secret_key` in `backend/core/security.py` rejects missing, short (<32 char), and known-placeholder secrets at import time |
| JWT algorithm | allow-listed to HS256/384/512; `verify_token` requires both `iat` and `exp` |
| Session invalidation | `_authenticate_credentials` checks the live account, `status == "active"`, live role, and exact `token_version`, and fails closed (503) when the auth store is unavailable. Logout, password changes/resets, and status changes increment that generation atomically; `token_invalidated_at` is normalized second-precision audit metadata, not an authorization boundary. |
| Forced password change | blocked from normal routes by `get_current_user`; a separate `get_current_user_for_password_change` dependency is exposed only to that endpoint |
| Registration role | `public_registration_is_analyst_only` validator on `UserIn` |
| Admin authorization | `require_administrator` in `routes/auth.py` and `routes/logs.py`; inline role checks in `routes/maintenance.py` |
| Ingestion authentication | `verify_ingest_api_key` requires a >=24-char configured key and uses `secrets.compare_digest` |
| CORS | `backend/main.py` parses `CORS_ORIGINS` explicitly, refuses `*`, sets `allow_credentials=False`, and restricts methods and headers |
| Backup path safety | `get_backup_path` requires the filename to match `^backup_\d{8}_\d{6}\.json\.gz$` before any filesystem access |
| Error disclosure | maintenance responses are generic; logs record only the exception class name |
| URI logging | `backend/database.py` never logs a connection URI and fails startup on missing configuration |

Re-reviewed in this pass with no new defect found: JWT validation, `SECRET_KEY`
handling, `INGEST_API_KEY` handling and constant-time comparison, CORS, admin-only
route coverage, public registration, account-status enforcement, token
invalidation, maintenance path traversal, backup exposure, error disclosure,
`.gitignore` coverage of `.env`, and committed-secret patterns.

**No authentication redesign was performed, and no security control was weakened
to make a test pass.**

---

## 5. Data-correctness defects fixed in this pass

These were correctness and telemetry-integrity bugs rather than access-control
vulnerabilities, but two of them affected the trustworthiness of stored evidence.

| Defect | Before | After |
| --- | --- | --- |
| Suricata severity mismatch | `eve_ingestor.py` emitted native severity 1-4 while `AlertIn` accepts 1-3, so every informational Suricata alert was rejected with HTTP 422 and counted as "failed" | `compute_severity` still reads the native value; `to_shared_severity` maps native 4 to shared 3 before the payload is built. `SEVERITY_LABELS` now matches the shared contract |
| Zeek timestamp integrity | `zeek_ingestor.py` stamped every alert with `datetime.now().isoformat()` — naive local time, discarding the observed event time | extract_timestamp preserves Zeek's ts (epoch number, numeric string, or ISO string) as a timezone-aware ISO-8601 timestamp
| Kismet MAC addresses reaching GeoIP | Kismet places 802.11 MAC addresses in the shared `src_ip`/`dest_ip` fields; these were passed to the GeoIP reader and rejected only by a broad `except Exception` | `is_ip_address` in `services/geolocation_service.py` validates IP literals up front, so a non-IP value returns `None` without a lookup. The schema limitation is documented in `kismet_ingestor.py` and `README.md`. **No data-model migration was performed** |
| Split-brain MongoDB configuration | `services/alert_service.py` read `MONGO_URI` with a fallback to `MONGODB_URL`, while `database.py` read only `MONGODB_URL`. Setting both to different values silently pointed the alerts collection at one deployment and users, maintenance, and reports at another | `MONGODB_URL` is the single canonical variable for both clients; the override is removed. `alert_service` still tolerates an unset value so `get_collection()` returns `None` and callers answer 503 |
| Profile password change was unreachable | Both Profile pages issued `PUT /api/users/profile/password` — wrong path *and* wrong method. The route was never registered, so the password-change UI returned 404 for every user | Both pages call `POST /api/users/change-password` through a new `changePassword` helper in the shared `frontend/src/services/api.js` layer, with the `current_password` / `new_password` body `ChangePasswordIn` expects |
| Maintenance collection mismatch | `COLLECTIONS = ["users", "logs", "alerts"]`, but log sources live in `db.log_sources`. Stats permanently reported 0 for a collection the application never creates, and **every backup silently omitted all configured log sources** | `COLLECTIONS = ["users", "alerts", "log_sources"]`. Backups now contain users, alerts, and the real log-source data |

**Backup compatibility note:** backup files created before this change use the key
`logs` for a collection that was always empty. Restore iterates the keys present in
the file rather than the configured list, so older backups still restore (into
`restore_test_logs`). New backups use the `log_sources` key. The
`maintenance_logs` collection is operational metadata and remains deliberately
outside the backup set.

Covered by `backend/tests/test_ingestors.py` (61 tests),
`backend/tests/test_services.py::TestMongoConfigurationIsCanonical` (4 tests), and
`backend/tests/test_auth_api.py::TestPasswordChangeRouteContract` (5 tests). Each
group was mutation-checked: reverting the Suricata 4→3 mapping fails 3 tests, and
restoring the `MONGO_URI` override fails 2.

---

## 6. Current residual risks

**Requires human action — not fixable in code:**

1. Revoke and regenerate the historical Telegram bot token. Removing the
   integration does not revoke a credential.
2. Revoke and regenerate the exposed Kismet API key.
3. Set a new high-entropy production `SECRET_KEY`. If any deployment ever used the
   old fallback, assume every token it issued was forgeable.
4. Generate a separate `INGEST_API_KEY`; do not reuse the JWT, Kismet, or MongoDB
   secret.
5. Require password resets for every account represented in a committed backup.
   Bcrypt hashes are not plaintext, but offline guessing against a public
   repository is possible.
6. Treat the Telegram chat IDs and account emails in those backups as exposed
   personal data under the rules applicable to the project and institution.

**Dependency advisories** (re-measured this pass, `npm audit --omit=dev`:
4 vulnerabilities — 2 moderate, 2 high):

- `react-router` / `react-router-dom` 7.12.0-7.18.1, high: RSC-mode CSRF bypass
  (GHSA-qwww-vcr4-c8h2). This client-only SPA does not use React Server
  Components.
- `dompurify` <=3.4.12, moderate: XSS via detached subtree after `IN_PLACE` hook
  removal (GHSA-55q2-fjhq-7xh7). Reaches the tree transitively through the jsPDF
  export path.
- `fflate` 0.8.0-0.8.2, moderate: infinite loop on malformed ZIP64 archives
  (GHSA-px8p-9vwx-vf98). Also transitive via jsPDF.

`npm audit fix` reports a fix is available for these. **It was not run in this
pass**, deliberately: the resulting lockfile churn is unrelated to this
remediation and would make the diff harder to review as one unit. Applying it
should be a separate, reviewed change.

**Architectural risks accepted for now:**

- JWTs are stored in browser `localStorage`, so a frontend XSS becomes a token
  theft. This is a known architectural trade-off; it was **not** redesigned in this
  pass and no new concrete vulnerability was found in the current implementation.
- No rate limiting or brute-force protection anywhere, including on login.
- `/api/ingest/alerts` has no idempotency key or replay protection, and the
  ingestion key is shared across all engines rather than scoped per sensor.
- Backups created at runtime contain sensitive data and are not encrypted by the
  application.
- No centralized audit logging; only `maintenance_logs` is written.
- The synchronous PyMongo alert client runs inside async FastAPI request handlers,
  which can block the event loop under load.
- Simulated traffic in the UI must never be presented as captured evidence.
- Deployment infrastructure and provider access controls were not available for
  review.

---

## 7. Deployment and security assumptions

- There is **no currently verified public production deployment** of this project.
- The application is an educational prototype. Perform a fresh threat model and
  deployment review before exposing it to production network data.
- Frontend route guards are usability only; the FastAPI service is the
  authorization boundary.
- `backend/docker-compose.test.yml` is a development database: unauthenticated,
  bound to loopback only. It is not a deployment artifact.
- Earlier project documentation referenced Netlify and Render deployments. No such
  URL remains in any tracked file; treat any you encounter as historical.
- `backend/documentation/*.md` are historical working notes from earlier
  milestones. Where they conflict with `README.md` or this document, they are
  stale; `README.md` and this file are authoritative.

---

## 8. Validation evidence from this pass

Run on 2026-09-04 against branch `security-and-readme-remediation`, starting from
commit `2464de0`. Every command below was actually executed; results are quoted as
produced.

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `pytest` (backend/) | **218 passed**, 0 failed, 183 warnings, 13.09s (baseline before this work: 141 passed) |
| Backend coverage | same run | 55% total, up from 54% |
| Python compilation | `python -m compileall -q backend` | exit 0 |
| Frontend install | `npm ci` (frontend/) | exit 0; 238 packages added, 239 audited; `package-lock.json` unchanged |
| Frontend lint | `npm run lint` | exit 0, no findings |
| Frontend build | `npm run build` | exit 0; pre-existing >500 kB main-chunk size warning only |
| Whitespace/conflict check | `git diff --check` | exit 0, clean |
| Secret scan | credential-pattern scan across all tracked files | no matches. Patterns covered private keys, AWS access keys, GitHub tokens, OpenAI keys, Slack tokens, credentialed `mongodb+srv://` URIs, and the Telegram bot-token format |
| Telegram sweep | `git grep` for telegram / `api.telegram.org` / `chat_id` / `bot_token` / `Ids_dashboard_bot` / `Xstakerobot` | every remaining match is documentation, a historical comment, or a containment test. No active code match |

No secret value was printed at any point during this pass. Docker and a local
`mongod` were unavailable in the environment; the pytest suite does not require
them, as its database fixtures are mocked.

The 183 pytest warnings are pre-existing `DeprecationWarning`s (`datetime.utcnow`,
`asyncio.get_event_loop_policy`) from test helpers and `pytest-asyncio`, unrelated
to this pass.

---

## 9. Recommended history cleanup plan

Unchanged from the original audit and **still not performed**. History cleanup is
recommended because the backups contain personal data and password hashes and the
source history contains active credential formats. It changes commit IDs, but
`git-filter-repo` preserves authorship metadata and contributor attribution.
Coordinate with all seven team members and repository administrators.

1. Rotate credentials and reset affected passwords first.
2. Archive an access-controlled mirror for legitimate academic recordkeeping.
3. Freeze pushes and notify every collaborator that a fresh clone will be required.
4. Make a new mirror clone:

   ```bash
   git clone --mirror https://github.com/LongTongg16/intrusight.git intrusight-clean.git
   cd intrusight-clean.git
   ```

5. Create a local `replacements.txt` **outside** the repository containing the old
   Kismet and Telegram values. Do not paste them into an issue, commit, shell
   history, or pull request. Follow `git-filter-repo`'s replace-text format.
6. Remove binary/data paths and replace the two credential values in one pass:

   ```bash
   git filter-repo --sensitive-data-removal \
     --invert-paths \
     --path backend/backups \
     --path backend/backend/backups \
     --path backend/geoip/GeoLite2-City.mmdb \
     --path frontend/src.zip \
     --replace-text /private/path/replacements.txt
   ```

7. Re-run secret scanning against all refs and inspect the rewritten contributor
   graph before publishing.
8. Force-push rewritten branches and tags only after explicit team approval.
9. Ask collaborators to delete old clones and re-clone. Close or update pull
   requests that reference old commits.
10. Contact GitHub Support if cached views or pull-request refs still expose the
    data. Forks and external clones cannot be revoked by rewriting this repository.

Do not run this plan casually: it is intentionally separate from the remediation
branch and was not performed here.

---

## 10. Harmless test and example data

Reviewed and not treated as leaked production secrets:

- `backend/.env.test` in history contained only a non-credentialed localhost MongoDB URL.
- `backend/docker-compose.test.yml` uses no credentials and binds to loopback only.
- Test passwords, test email domains, private RFC 1918 addresses, and simulator
  MAC/IP values are fixtures.
- The GitHub Actions JWT and ingestion values are explicitly test-only process
  environment values, not deployment credentials.
- Public frontend/backend URLs are configuration, not secrets. They were changed to
  local defaults because the earlier deployments are not guaranteed to remain
  controlled or available.

No authenticated MongoDB URI, private key, AWS key, GitHub token, or populated
`.env` file was confirmed in the scanned text history.
