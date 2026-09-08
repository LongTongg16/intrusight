from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Security
from pydantic import BaseModel, EmailStr

from core.security import (
    create_access_token,
    get_current_user,
    get_current_user_for_password_change,
    hash_password,
)
from database import db
from models.user import (
    ChangePasswordIn,
    EditProfileIn,
    LoginIn,
    LoginOut,
    RoleEnum,
    UserIn,
    UserListOut,
    UserOut,
)
from services.auth_service import authenticate_user
from services.user_service import (
    change_password,
    create_user,
    get_all_users,
    get_user_by_id,
    update_user_profile,
    validate_full_name,
    validate_password_strength,
)

router = APIRouter()


def require_administrator(current_user: dict) -> None:
    if current_user.get("role") != RoleEnum.ADMIN.value:
        raise HTTPException(status_code=403, detail="Administrators only")


def parse_user_id(user_id: str) -> ObjectId:
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID format")
    return ObjectId(user_id)


def utc_now() -> str:
    """Return a normalized audit timestamp; token_version controls revocation."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@router.post("/api/auth/register", response_model=UserOut, status_code=201)
async def register(user_data: UserIn):
    try:
        return await create_user(
            user_data.email,
            user_data.password,
            user_data.full_name,
            RoleEnum.ANALYST.value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/auth/login", response_model=LoginOut)
async def login(login_data: LoginIn):
    user = await authenticate_user(login_data.email, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    status = user.get("status", "active")
    if status != "active":
        raise HTTPException(status_code=403, detail="Account is not active")

    token = create_access_token(
        {
            "sub": user["email"],
            "role": user["role"],
            "user_id": str(user["_id"]),
            "ver": user.get("token_version", 0),
        }
    )
    user_out = UserOut(
        id=str(user["_id"]),
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        status=status,
    )
    return LoginOut(
        token=token,
        user=user_out,
        force_password_change=bool(user.get("force_password_change", False)),
    )


@router.get("/api/users", response_model=list[UserListOut])
async def get_users(current_user: dict = Security(get_current_user)):
    require_administrator(current_user)
    return await get_all_users()


@router.get("/api/users/profile", response_model=UserOut)
async def get_profile(current_user: dict = Security(get_current_user)):
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserOut(
        id=str(user["_id"]),
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        status=user.get("status", "pending"),
    )


@router.put("/api/users/profile", response_model=UserOut)
async def edit_profile(
    profile_data: EditProfileIn,
    current_user: dict = Security(get_current_user),
):
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user = await update_user_profile(user_id, profile_data.full_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut(
        id=str(user["_id"]),
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        status=user.get("status", "pending"),
    )


@router.post("/api/users/change-password")
async def change_user_password(
    password_data: ChangePasswordIn,
    current_user: dict = Security(get_current_user),
):
    user_id = current_user.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user = await change_password(
            user_id,
            password_data.current_password,
            password_data.new_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "ok": True,
        "message": "Password changed successfully. Please sign in again.",
    }


@router.post("/api/auth/logout")
async def logout(current_user: dict = Security(get_current_user)):
    user_id = current_user.get("user_id")
    if user_id and ObjectId.is_valid(user_id):
        try:
            await db["users"].update_one(
                {"_id": ObjectId(user_id)},
                {
                    "$set": {"token_invalidated_at": utc_now()},
                    "$inc": {"token_version": 1},
                },
            )
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Logout service unavailable") from exc
    return {"ok": True, "message": "Logged out successfully"}


class ForceChangePasswordIn(BaseModel):
    new_password: str


@router.post("/api/users/force-change-password")
async def force_change_password(
    data: ForceChangePasswordIn,
    current_user: dict = Security(get_current_user_for_password_change),
):
    user_id = current_user.get("user_id")
    object_id = parse_user_id(user_id or "")
    user = await db["users"].find_one({"_id": object_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("force_password_change"):
        raise HTTPException(status_code=403, detail="Password change not required")

    try:
        validate_password_strength(data.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated_user = await db["users"].find_one_and_update(
        {"_id": object_id, "force_password_change": True},
        {
            "$set": {
                "hashed_password": hash_password(data.new_password),
                "force_password_change": False,
                "token_invalidated_at": utc_now(),
            },
            "$inc": {"token_version": 1},
        },
        return_document=True,
    )
    if not updated_user:
        raise HTTPException(status_code=409, detail="Password-change state changed")

    new_version = updated_user.get("token_version", 0)
    token = create_access_token(
        {
            "sub": updated_user["email"],
            "role": updated_user["role"],
            "user_id": user_id,
            "ver": new_version,
        }
    )
    return {
        "ok": True,
        "message": "Password updated successfully",
        "token": token,
    }


class StatusUpdate(BaseModel):
    status: str


@router.put("/api/users/{user_id}/status")
async def update_user_status(
    user_id: str,
    body: StatusUpdate,
    current_user: dict = Security(get_current_user),
):
    require_administrator(current_user)
    if current_user.get("user_id") == user_id and body.status in {"suspended", "rejected"}:
        raise HTTPException(status_code=403, detail="You cannot suspend or reject your own account")

    allowed = {"active", "suspended", "rejected", "pending"}
    if body.status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid account status")

    result = await db["users"].update_one(
        {"_id": parse_user_id(user_id)},
        {
            "$set": {
                "status": body.status,
                "token_invalidated_at": utc_now(),
            },
            "$inc": {"token_version": 1},
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "message": f"User status updated to {body.status}"}


class UserUpdate(BaseModel):
    full_name: str
    role: RoleEnum


@router.put("/api/users/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Security(get_current_user),
):
    require_administrator(current_user)
    object_id = parse_user_id(user_id)

    try:
        validate_full_name(body.full_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    role = body.role.value
    if current_user.get("user_id") == user_id:
        existing = await db["users"].find_one({"_id": object_id}, {"role": 1})
        if existing:
            role = existing["role"]

    result = await db["users"].update_one(
        {"_id": object_id},
        {"$set": {"full_name": body.full_name.strip(), "role": role}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "message": "User updated successfully"}


class AdminCreateUser(BaseModel):
    full_name: str
    email: EmailStr
    role: RoleEnum
    password: str


@router.post("/api/users/admin-create", status_code=201)
async def admin_create_user(
    body: AdminCreateUser,
    current_user: dict = Security(get_current_user),
):
    require_administrator(current_user)
    email = str(body.email).strip().lower()

    try:
        validate_full_name(body.full_name)
        validate_password_strength(body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if await db["users"].find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    result = await db["users"].insert_one(
        {
            "email": email,
            "full_name": body.full_name.strip(),
            "role": body.role.value,
            "hashed_password": hash_password(body.password),
            "status": "active",
            "force_password_change": True,
            "token_version": 0,
            "created_at": utc_now(),
        }
    )
    return {
        "ok": True,
        "id": str(result.inserted_id),
        "message": "User created. They must change their password on first login.",
    }


class AdminResetPassword(BaseModel):
    new_password: str


@router.post("/api/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: str,
    body: AdminResetPassword,
    current_user: dict = Security(get_current_user),
):
    require_administrator(current_user)
    try:
        validate_password_strength(body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = await db["users"].update_one(
        {"_id": parse_user_id(user_id)},
        {
            "$set": {
                "hashed_password": hash_password(body.new_password),
                "force_password_change": True,
                "token_invalidated_at": utc_now(),
            },
            "$inc": {"token_version": 1},
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "ok": True,
        "message": "Password reset. User must change their password on next login.",
    }
