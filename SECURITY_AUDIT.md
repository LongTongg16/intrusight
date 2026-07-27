# Security remediation report

Date: 2026-07-27
Scope: current tracked files, selected historical blobs, authentication and
authorization, integrations, configuration, workflows, dependencies, archives,
documentation, and deployment assumptions.

No Git history was rewritten.

## Executive summary

The review confirmed two critical access-control problems, several high-impact
secret/data exposures, and a set of medium-severity hardening issues. Current
files have been remediated, but current-file cleanup is not sufficient because
Git history still contains credentials, account backups, and password hashes.

The repository can remain public only after the listed credentials are rotated.
A coordinated history cleanup is strongly recommended for the exposed personal
data and credential material.

## Confirmed findings

| Severity | Finding and evidence | Remediation |
| --- | --- | --- |
| Critical | Public registration accepted the `Administrator` role, and login issued tokens to `pending`, `suspended`, or `rejected` accounts. Together, a direct API client could self-register an administrator and immediately call admin routes. Original evidence: `backend/models/user.py:7-15`, `backend/routes/auth.py:58-79`, and `backend/services/user_service.py:41-67`. | Public registration is analyst-only (`backend/models/user.py:7-24`, `backend/routes/auth.py:48-58`) and login rejects every non-active account (`backend/routes/auth.py:61-78`). |
| Critical | JWT signing used a public fallback value. Original evidence: `backend/core/security.py:22`. A deployment without `SECRET_KEY` accepted attacker-forged tokens. | Startup now rejects missing, short, or known-placeholder secrets; algorithms are allow-listed and tokens require `iat` and `exp` (`backend/core/security.py:30-72`). |
| Critical | A Kismet API key was hardcoded in `backend/kismet_ingestor.py:8` and exists in multiple historical commits. | The worker now requires `KISMET_API_KEY`; no value is committed. Rotate the exposed Kismet key. |
| Critical | A Telegram bot token exists in historical versions of `backend/routes/alerts.py` and `frontend/src/pages/analyst/Dashboard.jsx`. The token is not repeated here. | Current code reads `TELEGRAM_BOT_TOKEN` only from the environment. Revoke the historical token and create a new one through BotFather. |
| High | Eight committed compressed database backups contained account emails, bcrypt password hashes, roles, statuses, network alert data, log-source paths, and—in some backups—Telegram IDs. Exact paths were `backend/backups/backup_*.json.gz` and `backend/backend/backups/backup_*.json.gz`. Binary archives do not have meaningful source line numbers. | All eight archives were removed and backup paths are ignored. Affected users should reset passwords because offline cracking remains possible. History cleanup is recommended. |
| High | Alert listing, details, notes, status changes, edits, and location refreshes were unauthenticated. Original evidence: `backend/routes/alerts.py:107-151`, `171-257`, and `283-326`. Alert ingestion was also public at lines 71-104. | User-facing alert routes require active-account JWT authentication. Ingestion requires an independent constant-time-checked `X-Ingest-API-Key` (`backend/core/security.py:117-122`, `backend/routes/alerts.py:83-88`). |
| High | Logout and password-reset invalidation relied on an `iat` claim that tokens did not contain. Several routes used a second auth dependency that never checked invalidation, and the original database check failed open on exceptions. Original evidence: `backend/core/security.py:26-39` and `backend/routes/auth.py:30-56`, `164-215`. | One auth dependency now checks the live account, active status, token version, and invalidation timestamp and fails closed when the auth store is unavailable (`backend/core/security.py:75-117`). Logout, status changes, and password changes increment a server-side token version. |
| High | First-login password change was enforced only by the frontend, so a direct API client could use the temporary-password JWT on normal routes. Authorization also trusted the role cached in a token instead of the live account. Original evidence: `backend/core/security.py:39-44` and `backend/routes/auth.py:71-99`. | Central authentication now reads the live role, blocks forced-change accounts from normal routes, and exposes a restricted dependency only to the password-change endpoint (`backend/core/security.py:76-141`, `backend/routes/auth.py:202-213`). |
| High | `backend/database.py:8` printed the raw MongoDB URI before printing a later redacted copy. A credentialed Atlas URI would therefore enter logs. | Database URIs are never logged; missing configuration fails startup (`backend/database.py:7-16`). |
| Medium | CORS declared an origin list but actually used `allow_origins=["*"]`. Original evidence: `backend/main.py:14-26`. | `CORS_ORIGINS` is parsed explicitly and methods/headers are restricted (`backend/main.py:17-32`). |
| Medium | The Telegram send endpoint accepted an arbitrary chat ID and arbitrary message text from any authenticated user and returned upstream response bodies. Original evidence: `backend/routes/alerts.py:154-168`. This could make the project bot an authenticated message relay and expose upstream error data. | The endpoint accepts only an alert ID, looks up the caller's stored Telegram ID, creates text server-side, and returns no upstream body (`backend/routes/alerts.py:172-199`). |
| Medium | Automatic Telegram recipient lookup did not require active account status, so suspended or rejected users with a stored chat ID could continue receiving alerts. Original evidence: `backend/services/user_service.py:97-106`. | Recipient selection now requires an active account and a non-empty Telegram ID (`backend/services/user_service.py:99-112`). |
| Medium | Backup restore joined an administrator-supplied filename directly to `BACKUP_DIR`, allowing `../` traversal to another gzip JSON file. Original evidence: `backend/routes/maintenance.py:188-231`. | Filenames must match `backup_YYYYMMDD_HHMMSS.json.gz` before access (`backend/routes/maintenance.py:30-34`, `63-66`, `195-238`). |
| Medium | Maintenance failures returned internal exception strings and also persisted them. Original evidence: `backend/routes/maintenance.py:163-165`, `229-231`, and `264-266`. | Responses are generic and logs record only exception classes (`backend/routes/maintenance.py:170-172`, `236-238`, `271-273`). |
| Medium | Any authenticated user could view and change log-source paths, syslog hosts, and ports. Original evidence: `backend/routes/logs.py:32-85`. | All log-source endpoints require the administrator role and reject malformed IDs (`backend/routes/logs.py:32-40`, `43-103`). |
| Medium | `backend/app.py` was an obsolete duplicate FastAPI entrypoint with wildcard credentialed CORS and unauthenticated alert operations. Running the wrong module would bypass the primary API's controls. | The unreferenced legacy entrypoint was removed. `backend/main.py` is the documented application. |
| Medium | Password policy was inconsistent: force-change and admin reset accepted weaker passwords than registration, and password strings were silently trimmed. | All create/reset/change paths use one strength validator, bcrypt is used directly, passwords preserve whitespace, and bcrypt's 72-byte limit is enforced. |
| Low | The dependency file included unused Flask, Celery, Redis, and related transitive packages, and pinned an old Requests release. | `backend/requirements.txt` now contains only runtime/test dependencies actually imported and uses the reviewed current Requests release. |
| Low | The frontend lockfile initially reported 11 known vulnerabilities, including affected Axios, Vite, build-tool, and React Router releases. | Dependencies were refreshed to patched in-range releases and ESLint 10. The remaining npm report is limited to a React Router advisory for React Server Components, which this client-only SPA does not use; no patched npm release is currently available. |
| Low | The workflow used older major action versions, `mongo:latest`, and default token permissions. | The workflow uses current major actions, MongoDB 8.0, a timeout, pip caching, read-only contents permission, and a secret-backed optional Codecov upload. |
| Low | A 62 MB GeoLite2 database was committed. MaxMind requires attribution and current data; its current terms require old releases to be replaced promptly. Bundling also bloated clones. | The MMDB was removed and ignored. Setup links to MaxMind's current download, update, and license documentation. |
| Low | `frontend/src.zip`, an empty root npm lockfile, generated EVE data, and a duplicate nested backend directory were repository artifacts rather than source. | They were removed and the relevant patterns are ignored. `frontend.zip` was not present in current files or reachable Git objects during this review. |

## Harmless test and example data

The following were reviewed and are not treated as leaked production secrets:

- `backend/.env.test` in history contained only a non-credentialed localhost MongoDB URL.
- `backend/docker-compose.test.yml` used local test credentials; it now binds an
  unauthenticated development database to loopback only.
- Test passwords, test email domains, private RFC 1918 addresses, and simulator
  MAC/IP values are fixtures.
- The GitHub Actions JWT and ingestion values are explicitly test-only process
  environment values, not deployment credentials.
- Public frontend/backend URLs are configuration, not secrets. They were changed
  to local defaults because the earlier deployments are not guaranteed to remain
  controlled or available.

No authenticated MongoDB URI, private key, AWS key, GitHub token, or current
populated `.env` file was confirmed in the scanned text history.

## Credentials and account actions

Perform these actions before treating the repository as safely public:

1. Revoke and regenerate the exposed Telegram bot token.
2. Revoke and regenerate the exposed Kismet API key.
3. Set a new high-entropy production `SECRET_KEY`. If any deployment ever used
   the old fallback, assume all tokens from that deployment were forgeable.
4. Generate a separate `INGEST_API_KEY`; do not reuse the JWT, Kismet, Telegram,
   or MongoDB secret.
5. Require password resets for every account represented in a committed backup.
   Bcrypt hashes are not plaintext, but public offline guessing is possible.
6. Review Telegram chat IDs and account emails in the backups as exposed personal
   data under the rules applicable to the project and institution.

Current-file cleanup does not revoke credentials and does not remove historical
objects.

## Recommended history cleanup plan

History cleanup is recommended because the backups contain personal data and
password hashes and source history contains active credential formats. It will
change commit IDs, but `git-filter-repo` preserves authorship metadata and
contributor attribution. Coordinate this operation with all seven team members
and repository administrators.

1. Rotate credentials and reset affected passwords first.
2. Archive an access-controlled mirror for legitimate academic recordkeeping.
3. Freeze pushes and notify every collaborator that a fresh clone will be required.
4. Make a new mirror clone:

   ```bash
   git clone --mirror https://github.com/LongTongg16/intrusight.git intrusight-clean.git
   cd intrusight-clean.git
   ```

5. Create a local `replacements.txt` outside the repository containing the old
   Kismet and Telegram values. Do not paste them into an issue, commit, shell
   history, or pull request. Follow `git-filter-repo`'s replace-text format.
6. Remove binary/data paths and replace the two credential values in one reviewable pass:

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
8. Force-push the rewritten branches and tags only after explicit team approval.
9. Ask collaborators to delete old clones and re-clone. Close or update pull
   requests that reference old commits.
10. Contact GitHub Support if cached views or pull-request refs still expose the
    data. Forks and external clones cannot be revoked by rewriting this repository.

Do not run this plan casually: it is intentionally separate from the remediation
branch and was not performed here.

## Residual risks

- No rate limiting or brute-force protection is implemented.
- JWTs remain in browser local storage, increasing the consequence of frontend XSS.
- Backups created at runtime contain sensitive data and are not encrypted by the application.
- The ingestion key is shared across engines rather than scoped per sensor.
- `npm audit --omit=dev` reports two high-severity dependency paths for the same
  React Router Server Components CSRF advisory. That server feature is not used
  here, and the current registry offers no patched release; monitor and upgrade
  when upstream publishes one. Do not apply npm's suggested downgrade.
- The sync/async dual MongoDB clients increase operational complexity.
- Simulated traffic in the UI must not be presented as captured evidence.
- Deployment infrastructure and provider access controls were not available for review.

## Validation performed

- Backend: `141 passed` with pytest.
- Backend import/syntax check: `python -m compileall -q backend` passed.
- Frontend: ESLint passed with no warnings.
- Frontend: the Vite production build passed; it reports a non-security bundle
  size warning for the main JavaScript chunk.
- Current tracked files were scanned for credential patterns and forbidden
  archives/data artifacts. No populated secret was confirmed.
