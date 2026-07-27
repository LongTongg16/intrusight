from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Security
from pydantic import BaseModel

from core.security import get_current_user
from services.alert_service import _client, DB_NAME

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def get_reports_collection():
    if _client is None:
        return None
    return _client[DB_NAME]["report_history"]


class ReportHistoryEntry(BaseModel):
    id: str
    generatedAt: str
    dateFrom: str
    dateTo: str
    scope: str
    by: str
    format: str
    alertCount: int


@router.get("/history")
def get_report_history(current_user: dict = Security(get_current_user)):
    col = get_reports_collection()
    if col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.get("user_id") or current_user.get("sub")
    records = list(
        col.find({"user_id": user_id}, {"_id": 0}).sort("savedAt", -1)
    )
    return {"items": records}


@router.post("/history", status_code=201)
def save_report_history(
    entry: ReportHistoryEntry,
    current_user: dict = Security(get_current_user),
):
    col = get_reports_collection()
    if col is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_id = current_user.get("user_id") or current_user.get("sub")
    doc = entry.model_dump()
    doc["user_id"] = user_id
    doc["savedAt"] = datetime.now(timezone.utc).isoformat()
    col.insert_one(doc)
    return {"ok": True}
