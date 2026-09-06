from pydantic import BaseModel, EmailStr, field_validator
from enum import Enum

# Historical note: these models previously carried a `telegram_id` field for the
# removed Telegram bot integration. The field is no longer accepted or returned by
# the API. Existing MongoDB user documents may still contain a stored `telegram_id`
# from that era; it is left untouched here and is never read or written by current
# code. Purging it from stored documents is a separate, deliberate operator action.

class RoleEnum(str, Enum):
    ANALYST = "Security Analyst"
    ADMIN = "Administrator"

class UserIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: RoleEnum

    @field_validator('email', 'full_name', mode='before')
    def trim_strings(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator('role')
    def public_registration_is_analyst_only(cls, v):
        if v != RoleEnum.ANALYST:
            raise ValueError("Public registration is limited to Security Analyst accounts")
        return v

class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    status: str

class EditProfileIn(BaseModel):
    full_name: str

    @field_validator('full_name', mode='before')
    def trim_strings(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str
    
class LoginIn(BaseModel):
    email: EmailStr
    password: str

    @field_validator('email', mode='before')
    def trim_strings(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

class LoginOut(BaseModel):
    token: str
    user: UserOut
    force_password_change: bool = False 

class UserListOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    status: str
