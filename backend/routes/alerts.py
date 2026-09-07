from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Response, Security
from core.security import get_current_user, verify_ingest_api_key
from pymongo.errors import DuplicateKeyError, PyMongoError

from pydantic import BaseModel, Field, field_validator, model_validator

from database import database_is_reachable
from services.alert_service import get_collection, SEVERITY_LABELS, ALLOWED_STATUS
from services.user_service import get_user_by_email
from services.geolocation_service import get_location_from_ip
from demo_contract import (
    ALL_FIXTURE_IDS,
    FIXTURE_ENGINE,
    PROVENANCE,
    fixture_object_id,
)

# The historical Telegram bot integration was removed: the bot identity behind it
# is no longer trusted. Alert ingestion has no outbound messaging side effect and
# alerts are surfaced through the dashboard only.

router = APIRouter(prefix="/api", tags=["Alerts"])


# ── Record kinds ──────────────────────────────────────────────────────────────
# Not every engine produces a detection. Suricata and Snort assert "this traffic
# matched a rule"; Zeek reports what a connection *was* (DNS query, TLS
# handshake, connection summary) and Kismet reports what is *present* on the
# air. Forcing the latter two to present a signature and a severity made them
# look like alerts they are not, so the record kind is explicit.
EVENT_KINDS = {"detection", "observation"}

# How to read source_asset/destination_asset. Kismet identifies endpoints by
# 802.11 hardware address; the wired engines use IP literals.
ASSET_KINDS = {"ip", "mac"}


class AlertIn(BaseModel):
    """
    The shared ingestion contract.

    Every field added for multi-engine support is optional, and `src_ip`/
    `dest_ip` were widened rather than replaced, so an ingestor written against
    the original contract still validates unchanged. When an ingestor sends only
    the new asset fields with `asset_kind="ip"`, the endpoint derives the legacy
    IP fields from them (see `ingest_alert`), so stored documents and every
    existing reader keep the shape they had.
    """
    timestamp: str
    signature: str
    # Detections require a severity. Observations explicitly carry null: using
    # 3 as an "informational" placeholder made ungraded context look low-risk.
    severity: Optional[int] = Field(ge=1, le=3)

    # Legacy endpoint fields. Optional since Kismet has no IP to report; still
    # populated for every IP-based engine.
    src_ip: Optional[str] = None
    dest_ip: Optional[str] = None
    src_port: Optional[int] = None
    dest_port: Optional[int] = None
    proto: Optional[str] = None
    category: Optional[str] = None
    sid: Optional[int] = None
    source_nids: Optional[str] = None

    # ── Multi-engine extension ────────────────────────────────────────────
    event_kind: str = "detection"
    observation_type: Optional[str] = None

    # Canonical endpoints. For IP engines these mirror src_ip/dest_ip; for
    # Kismet they carry MAC addresses and asset_kind says so, which is what
    # keeps hardware addresses out of the IP-typed fields.
    source_asset: Optional[str] = None
    destination_asset: Optional[str] = None
    asset_kind: Optional[str] = None

    # Engine-native fields that do not belong in the shared columns: Zeek's
    # uid/service/duration/bytes, Kismet's SSID/BSSID/channel/encryption, and
    # so on. Stored verbatim and rendered in the detail view only.
    engine_context: Optional[dict] = None

    @field_validator("event_kind")
    @classmethod
    def _known_event_kind(cls, value: str) -> str:
        if value not in EVENT_KINDS:
            raise ValueError(f"event_kind must be one of {sorted(EVENT_KINDS)}")
        return value

    @field_validator("asset_kind")
    @classmethod
    def _known_asset_kind(cls, value):
        if value is not None and value not in ASSET_KINDS:
            raise ValueError(f"asset_kind must be one of {sorted(ASSET_KINDS)}")
        return value

    @model_validator(mode="after")
    def _validate_record_semantics(self):
        """
        A record must identify its endpoints somehow — either the legacy IP
        fields or the asset fields. Rejecting the empty case here keeps the
        "unknown 0.0.0.0" placeholders that used to appear out of the database.
        """
        if not (self.src_ip or self.source_asset):
            raise ValueError("either src_ip or source_asset is required")
        if self.event_kind == "detection" and not (
            self.dest_ip or self.destination_asset
        ):
            raise ValueError("either dest_ip or destination_asset is required")

        if self.event_kind == "observation":
            if self.severity is not None:
                raise ValueError("observations must not carry a severity")
            if self.sid is not None:
                raise ValueError("observations must not carry a signature ID")
            if not self.observation_type:
                raise ValueError("observations require an observation_type")
        elif self.severity is None:
            raise ValueError("detections require a severity")

        context = self.engine_context or {}
        provenance = context.get("provenance")
        fixture_id = context.get("demo_fixture_id")
        if provenance == PROVENANCE:
            if fixture_id not in ALL_FIXTURE_IDS:
                raise ValueError("replayed fixtures require a known demo_fixture_id")
            if self.source_nids != FIXTURE_ENGINE[fixture_id]:
                raise ValueError("demo_fixture_id does not match source_nids")
        elif fixture_id is not None:
            raise ValueError("demo_fixture_id requires replayed-fixture provenance")
        return self


class StatusUpdate(BaseModel):
    status: str


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class AlertUpdate(BaseModel):
    dest_ip: Optional[str] = None
    src_ip: Optional[str] = None
    signature: Optional[str] = None
    severity: Optional[int] = Field(default=None, ge=1, le=3)


@router.get("/health")
async def health():
    mongo_reachable = await database_is_reachable()
    return {
        "ok": True,
        "ready": mongo_reachable,
        "mongo_connected": mongo_reachable,
        "checks": {
            "api": "healthy",
            "mongodb": "reachable" if mongo_reachable else "unreachable",
        },
    }


@router.post("/ingest/alerts", status_code=201)
async def ingest_alert(
    alert: AlertIn,
    response: Response,
    ingest_api_key: str | None = Header(default=None, alias="X-Ingest-API-Key"),
):
    verify_ingest_api_key(ingest_api_key)
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    doc = alert.model_dump()
    doc["severity_label"] = (
        SEVERITY_LABELS.get(doc["severity"]) if doc["severity"] is not None else None
    )

    # Reconcile the legacy IP fields with the canonical asset fields so a
    # document is complete however the sender chose to describe its endpoints.
    if doc.get("asset_kind") is None:
        doc["asset_kind"] = "ip" if (doc.get("src_ip") or doc.get("dest_ip")) else None

    if doc["asset_kind"] == "ip":
        # A sender using only the new fields still gets the legacy shape.
        doc["src_ip"] = doc.get("src_ip") or doc.get("source_asset")
        doc["dest_ip"] = doc.get("dest_ip") or doc.get("destination_asset")

    doc["source_asset"] = doc.get("source_asset") or doc.get("src_ip")
    doc["destination_asset"] = doc.get("destination_asset") or doc.get("dest_ip")

    # Geolocation runs on IP endpoints only. Kismet reports MAC addresses, and
    # asset_kind is now an explicit signal rather than relying on the lookup to
    # reject a non-IP string.
    if doc["asset_kind"] == "ip":
        dest_location = get_location_from_ip(doc.get("dest_ip"))
        if dest_location:
            doc["dest_location"] = dest_location

        src_location = get_location_from_ip(doc.get("src_ip"))
        if src_location:
            doc["src_location"] = src_location

    context = doc.get("engine_context") or {}
    fixture_id = context.get("demo_fixture_id")
    if context.get("provenance") == PROVENANCE and fixture_id:
        object_id = fixture_object_id(fixture_id)
        alert_id = str(object_id)
        identity = {
            "_id": object_id,
            "engine_context.provenance": PROVENANCE,
            "engine_context.demo_fixture_id": fixture_id,
        }
        try:
            result = collection.update_one(
                identity,
                {
                    "$set": doc,
                    "$setOnInsert": {
                        "id": alert_id,
                        "status": "new",
                        "notes": [],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                },
                upsert=True,
            )
        except DuplicateKeyError as exc:
            # The deterministic ObjectId is already occupied by a document
            # that does not carry this exact demo identity. Never overwrite it.
            raise HTTPException(
                status_code=409,
                detail="Demo fixture identity conflicts with an existing record",
            ) from exc
        except PyMongoError as exc:
            raise HTTPException(status_code=503, detail="Database unavailable") from exc
        created = result.upserted_id is not None
        response.status_code = 201 if created else 200
        return {
            "ok": True,
            "id": alert_id,
            "created": created,
            "demo_fixture_id": fixture_id,
        }

    doc["status"] = "new"
    doc["notes"] = []
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    result = collection.insert_one(doc)
    alert_id = str(result.inserted_id)
    collection.update_one({"_id": result.inserted_id}, {"$set": {"id": alert_id}})

    return {"ok": True, "id": alert_id, "created": True}


@router.get("/alerts")
def get_alerts(
    severity: Optional[int] = None,
    src_ip: Optional[str] = None,
    dest_ip: Optional[str] = None,
    proto: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Security(get_current_user),
):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    query = {}
    if severity is not None:
        query["severity"] = severity
    if src_ip:
        query["src_ip"] = src_ip
    if dest_ip:
        query["dest_ip"] = dest_ip
    if proto:
        query["proto"] = proto
    if status:
        query["status"] = status.lower().strip()

    alerts = list(collection.find(query, {"_id": 0}).sort("created_at", -1))
    return {"ok": True, "items": alerts}


# ── STATIC ROUTES BEFORE WILDCARD ──────────────────────────────

@router.get("/alerts/dashboard/summary")          # ✅ moved up
def summary(current_user: dict = Security(get_current_user)):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    alerts = list(collection.find({}, {"_id": 0, "severity_label": 1}))
    result = {"high": 0, "medium": 0, "low": 0}

    for alert in alerts:
        label = alert.get("severity_label")
        if label in result:
            result[label] += 1

    return {"ok": True, "total": len(alerts), "severity_summary": result}


@router.post("/alerts/refresh-all-locations")     # ✅ moved up
def refresh_all_locations(current_user: dict = Security(get_current_user)):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    alerts = list(collection.find({}, {"_id": 0}))
    updated_count = 0

    for alert in alerts:
        update_data = {}
        if alert.get("dest_ip"):
            dest_location = get_location_from_ip(alert["dest_ip"])
            update_data["dest_location"] = dest_location if dest_location else None
        if alert.get("src_ip"):
            src_location = get_location_from_ip(alert["src_ip"])
            update_data["src_location"] = src_location if src_location else None
        if update_data:
            collection.update_one({"id": alert["id"]}, {"$set": update_data})
            updated_count += 1

    return {"ok": True, "message": f"Refreshed locations for {updated_count} alerts"}


# ── WILDCARD ROUTES AFTER ───────────────────────────────────────

@router.get("/alerts/{alert_id}")
def get_alert(alert_id: str, current_user: dict = Security(get_current_user)):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    alert = collection.find_one({"id": alert_id}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"ok": True, "item": alert}


@router.patch("/alerts/{alert_id}/status")
def update_status(
    alert_id: str,
    body: StatusUpdate,
    current_user: dict = Security(get_current_user),
):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    new_status = body.status.lower().strip()
    if new_status not in ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail="Status must be new, investigating, or resolved")

    result = collection.update_one({"id": alert_id}, {"$set": {"status": new_status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert = collection.find_one({"id": alert_id}, {"_id": 0})
    return {"ok": True, "item": alert}


@router.patch("/alerts/{alert_id}")
def update_alert(
    alert_id: str,
    body: AlertUpdate,
    current_user: dict = Security(get_current_user),
):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    update_data = {}
    if body.dest_ip is not None:
        update_data["dest_ip"] = body.dest_ip
        dest_location = get_location_from_ip(body.dest_ip)
        update_data["dest_location"] = dest_location if dest_location else None
    if body.src_ip is not None:
        update_data["src_ip"] = body.src_ip
        src_location = get_location_from_ip(body.src_ip)
        update_data["src_location"] = src_location if src_location else None
    if body.signature is not None:
        update_data["signature"] = body.signature
    if body.severity is not None:
        update_data["severity"] = body.severity
        update_data["severity_label"] = SEVERITY_LABELS.get(body.severity, "unknown")

    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    result = collection.update_one({"id": alert_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert = collection.find_one({"id": alert_id}, {"_id": 0})
    return {"ok": True, "item": alert}


@router.post("/alerts/{alert_id}/notes")
async def add_note(alert_id: str, body: NoteIn, current_user: dict = Security(get_current_user)):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    user_email = current_user.get("sub")
    user_data = await get_user_by_email(user_email)

    note = {
        "text": body.text,
        "author": user_data.get("full_name", "Analyst") if user_data else "Analyst",
        "role": current_user.get("role", "Analyst"),
        "time": datetime.now(timezone.utc).isoformat()
    }

    result = collection.update_one({"id": alert_id}, {"$push": {"notes": note}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"ok": True, "note": note}


@router.get("/alerts/{alert_id}/notes")
def get_notes(alert_id: str, current_user: dict = Security(get_current_user)):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    alert = collection.find_one({"id": alert_id}, {"_id": 0, "notes": 1})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    raw_notes = alert.get("notes", [])
    normalized_notes = []
    for idx, note in enumerate(raw_notes):
        if isinstance(note, str):
            normalized_notes.append({"id": idx, "text": note, "author": "System", "role": "System", "time": "—"})
        elif isinstance(note, dict):
            normalized_notes.append({"id": idx, "text": note.get("text", ""), "author": note.get("author", "System"), "role": note.get("role", "Analyst"), "time": note.get("time", "—")})

    return {"ok": True, "items": normalized_notes}


@router.post("/alerts/{alert_id}/refresh-location")
def refresh_alert_location(
    alert_id: str,
    current_user: dict = Security(get_current_user),
):
    collection = get_collection()
    if collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    alert = collection.find_one({"id": alert_id}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    update_data = {}
    if alert.get("dest_ip"):
        dest_location = get_location_from_ip(alert["dest_ip"])
        update_data["dest_location"] = dest_location if dest_location else None
    if alert.get("src_ip"):
        src_location = get_location_from_ip(alert["src_ip"])
        update_data["src_location"] = src_location if src_location else None

    if update_data:
        collection.update_one({"id": alert_id}, {"$set": update_data})

    updated_alert = collection.find_one({"id": alert_id}, {"_id": 0})
    return {"ok": True, "item": updated_alert}
