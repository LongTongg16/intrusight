"""
maintenance.py — Database maintenance endpoints for the NIDS Dashboard.

Endpoints:
    GET  /api/maintenance/health       — Database health indicators
    GET  /api/maintenance/stats        — Collection sizes and document counts
    POST /api/maintenance/backup       — Create a JSON backup of all collections
    GET  /api/maintenance/backups      — List available backups
    POST /api/maintenance/restore      — Restore a backup to a test snapshot collection
    DELETE /api/maintenance/alerts/old — Purge alerts older than N days
    GET  /api/maintenance/logs         — Recent system/maintenance logs
"""

import os
import json
import gzip
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Security
from pydantic import BaseModel

from database import db
from core.security import get_current_user

router = APIRouter(tags=["Maintenance"])

# ── Config ────────────────────────────────────────────────────────────────────
BACKUP_DIR = Path(
    os.getenv("BACKUP_DIR", str(Path(__file__).resolve().parents[1] / "backups"))
).resolve()
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_FILENAME = re.compile(r"^backup_\d{8}_\d{6}\.json\.gz$")

COLLECTIONS = ["users", "logs", "alerts"]

# In-memory maintenance log (persisted to DB as well)
async def write_maintenance_log(action: str, detail: str, status: str = "success"):
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action":    action,
        "detail":    detail,
        "status":    status,
    }
    await db["maintenance_logs"].insert_one(entry)
    return entry


# ── Models ────────────────────────────────────────────────────────────────────
class PurgeRequest(BaseModel):
    days: int = 90  # delete alerts older than this many days

class RestoreRequest(BaseModel):
    filename: str  # backup filename to restore


# ── Helpers ───────────────────────────────────────────────────────────────────
def get_timestamp():
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def get_backup_path(filename: str) -> Path:
    if not BACKUP_FILENAME.fullmatch(filename):
        raise HTTPException(status_code=400, detail="Invalid backup filename")
    return BACKUP_DIR / filename


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/api/maintenance/health")
async def get_health(current_user: dict = Security(get_current_user)):
    """Return database connectivity and collection health indicators."""
    if current_user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")

    try:
        # Ping MongoDB
        await db.command("ping")
        db_connected = True
    except Exception:
        db_connected = False

    stats = {}
    total_docs = 0
    for col in COLLECTIONS:
        try:
            count = await db[col].count_documents({})
            stats[col] = count
            total_docs += count
        except Exception:
            stats[col] = -1

    # Count backups on disk
    backups = sorted(BACKUP_DIR.glob("backup_*.json.gz"), reverse=True)

    return {
        "ok": True,
        "db_connected":   db_connected,
        "total_documents": total_docs,
        "collections":    stats,
        "backup_count":   len(backups),
        "latest_backup":  backups[0].name if backups else None,
        "checked_at":     datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/maintenance/stats")
async def get_stats(current_user: dict = Security(get_current_user)):
    """Return detailed stats per collection."""
    if current_user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")

    result = {}
    for col in COLLECTIONS:
        count = await db[col].count_documents({})
        result[col] = {"count": count}

        # Extra stats for alerts
        if col == "alerts":
            high   = await db[col].count_documents({"severity_label": "high"})
            medium = await db[col].count_documents({"severity_label": "medium"})
            low    = await db[col].count_documents({"severity_label": "low"})
            new    = await db[col].count_documents({"status": "new"})
            inv    = await db[col].count_documents({"status": "investigating"})
            res    = await db[col].count_documents({"status": "resolved"})
            result[col].update({
                "high": high, "medium": medium, "low": low,
                "new": new, "investigating": inv, "resolved": res,
            })

    return {"ok": True, "stats": result}


@router.post("/api/maintenance/backup")
async def create_backup(current_user: dict = Security(get_current_user)):
    """Export all collections to a compressed JSON backup file."""
    if current_user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")

    filename  = f"backup_{get_timestamp()}.json.gz"
    filepath  = BACKUP_DIR / filename
    data      = {}
    doc_count = 0

    try:
        for col in COLLECTIONS:
            docs = await db[col].find({}, {"_id": 0}).to_list(None)
            data[col] = docs
            doc_count += len(docs)

        with gzip.open(filepath, "wt", encoding="utf-8") as f:
            json.dump(data, f, default=str)

        size_kb = round(filepath.stat().st_size / 1024, 1)

        await write_maintenance_log(
            "backup",
            f"Backup created: {filename} ({doc_count} documents, {size_kb} KB)"
        )

        return {
            "ok":        True,
            "filename":  filename,
            "documents": doc_count,
            "size_kb":   size_kb,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        await write_maintenance_log("backup", f"Backup failed ({type(exc).__name__})", "error")
        raise HTTPException(status_code=500, detail="Backup failed") from exc


@router.get("/api/maintenance/backups")
async def list_backups(current_user: dict = Security(get_current_user)):
    """List all available backup files."""
    if current_user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")

    backups = sorted(BACKUP_DIR.glob("backup_*.json.gz"), reverse=True)
    result  = []

    for b in backups:
        stat = b.stat()
        result.append({
            "filename":   b.name,
            "size_kb":    round(stat.st_size / 1024, 1),
            "created_at": datetime.utcfromtimestamp(stat.st_mtime).isoformat(),
        })

    return {"ok": True, "backups": result}


@router.post("/api/maintenance/restore")
async def restore_backup(
    body: RestoreRequest,
    current_user: dict = Security(get_current_user)
):
    """
    Restore a backup to test snapshot collections (prefixed with 'restore_test_').
    Does NOT overwrite live data — safe for recoverability verification.
    """
    if current_user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")

    filepath = get_backup_path(body.filename)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup file not found")

    try:
        with gzip.open(filepath, "rt", encoding="utf-8") as f:
            data = json.load(f)

        restored_counts = {}
        for col, docs in data.items():
            test_col = f"restore_test_{col}"
            await db[test_col].drop()
            if docs:
                await db[test_col].insert_many(docs)
            restored_counts[col] = len(docs)

        await write_maintenance_log(
            "restore",
            f"Backup '{body.filename}' restored to test collections: {restored_counts}"
        )

        return {
            "ok":              True,
            "filename":        body.filename,
            "restored_counts": restored_counts,
            "note":            "Data restored to restore_test_* collections. Live data was not affected.",
            "restored_at":     datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        await write_maintenance_log("restore", f"Restore failed ({type(exc).__name__})", "error")
        raise HTTPException(status_code=500, detail="Restore failed") from exc


@router.delete("/api/maintenance/alerts/old")
async def purge_old_alerts(
    body: PurgeRequest,
    current_user: dict = Security(get_current_user)
):
    """Delete alerts older than the specified number of days."""
    if current_user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")

    if body.days < 1:
        raise HTTPException(status_code=400, detail="days must be at least 1")

    cutoff = (datetime.now(timezone.utc) - timedelta(days=body.days)).isoformat()

    try:
        result = await db["alerts"].delete_many({"created_at": {"$lt": cutoff}})
        deleted = result.deleted_count

        await write_maintenance_log(
            "purge",
            f"Purged {deleted} alerts older than {body.days} days (cutoff: {cutoff})"
        )

        return {
            "ok":      True,
            "deleted": deleted,
            "cutoff":  cutoff,
            "days":    body.days,
        }

    except Exception as exc:
        await write_maintenance_log("purge", f"Purge failed ({type(exc).__name__})", "error")
        raise HTTPException(status_code=500, detail="Alert purge failed") from exc


@router.get("/api/maintenance/logs")
async def get_maintenance_logs(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: dict = Security(get_current_user)
):
    """Return recent maintenance activity logs."""
    if current_user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")

    logs = await db["maintenance_logs"].find(
        {}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(None)

    return {"ok": True, "logs": logs}
