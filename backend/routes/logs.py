from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId
from database import db
from core.security import get_current_user

router = APIRouter()


class LogIn(BaseModel):
    name: str
    type: str
    logType: str
    status: str = "Active"
    filePath: Optional[str] = None    # stored file path for file-based sources
    syslogHost: Optional[str] = None  # host for syslog sources
    syslogPort: Optional[int] = Field(default=None, ge=1, le=65535)


class LogUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    logType: Optional[str] = None


def get_timestamp():
    return datetime.now().strftime("%d-%b-%Y %H:%M")


def require_administrator(user: dict) -> None:
    if user.get("role") != "Administrator":
        raise HTTPException(status_code=403, detail="Administrators only")


def parse_log_id(log_id: str) -> ObjectId:
    if not ObjectId.is_valid(log_id):
        raise HTTPException(status_code=400, detail="Invalid log ID format")
    return ObjectId(log_id)


@router.get("/api/logs")
async def get_logs(user=Depends(get_current_user)):
    require_administrator(user)
    logs = await db.log_sources.find().to_list(None)
    for log in logs:
        log["id"] = str(log["_id"])
        del log["_id"]
    return logs


@router.post("/api/logs")
async def create_log(log: LogIn, user=Depends(get_current_user)):
    require_administrator(user)
    new_log = log.model_dump()
    new_log["lastUpdated"] = get_timestamp()
    result = await db.log_sources.insert_one(new_log)
    new_log["id"] = str(result.inserted_id)
    del new_log["_id"]
    return new_log


@router.put("/api/logs/{log_id}")
async def update_log(log_id: str, data: LogUpdate, user=Depends(get_current_user)):
    require_administrator(user)
    object_id = parse_log_id(log_id)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["lastUpdated"] = get_timestamp()
    result = await db.log_sources.update_one({"_id": object_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    updated = await db.log_sources.find_one({"_id": object_id})
    updated["id"] = str(updated["_id"])
    del updated["_id"]
    return updated


@router.put("/api/logs/{log_id}/status")
async def toggle_status(log_id: str, user=Depends(get_current_user)):
    require_administrator(user)
    object_id = parse_log_id(log_id)
    log = await db.log_sources.find_one({"_id": object_id})
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    new_status = "Inactive" if log["status"] == "Active" else "Active"
    await db.log_sources.update_one( 
        {"_id": object_id},
        {"$set": {"status": new_status, "lastUpdated": get_timestamp()}}
    )
    log["status"] = new_status
    log["id"] = str(log["_id"])
    del log["_id"]
    return log


@router.delete("/api/logs/{log_id}")
async def delete_log(log_id: str, user=Depends(get_current_user)):
    require_administrator(user)
    result = await db.log_sources.delete_one({"_id": parse_log_id(log_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Log not found")
    return {"deleted": log_id}
