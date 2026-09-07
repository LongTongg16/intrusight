"""Authenticated, provenance-scoped operations for the demo corpus."""

from fastapi import APIRouter, Header, HTTPException
from pymongo.errors import PyMongoError

from core.security import verify_ingest_api_key
from demo_contract import MANAGED_DEMO_QUERY, summarize_demo_records
from services.alert_service import get_collection


router = APIRouter(prefix="/api/demo", tags=["Demo operations"])

DEMO_PROJECTION = {
    "_id": 0,
    "source_nids": 1,
    "event_kind": 1,
    "engine_context.provenance": 1,
    "engine_context.demo_fixture_id": 1,
}


def _authorized_collection(ingest_api_key: str | None):
    verify_ingest_api_key(ingest_api_key)
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return collection


@router.get("/status")
def demo_status(
    ingest_api_key: str | None = Header(default=None, alias="X-Ingest-API-Key"),
):
    collection = _authorized_collection(ingest_api_key)
    try:
        records = list(collection.find(MANAGED_DEMO_QUERY, DEMO_PROJECTION))
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {"ok": True, **summarize_demo_records(records)}


@router.delete("/records")
def clear_demo_records(
    ingest_api_key: str | None = Header(default=None, alias="X-Ingest-API-Key"),
):
    collection = _authorized_collection(ingest_api_key)
    try:
        result = collection.delete_many(MANAGED_DEMO_QUERY)
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {
        "ok": True,
        "removed": result.deleted_count,
        "message": "Only replayed-fixture demonstration records were removed.",
    }
