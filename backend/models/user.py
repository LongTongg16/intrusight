from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from enum import Enum

class RoleEnum(str, Enum):
    ANALYST = "Security Analyst"
    ADMIN = "Administrator"

class UserIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: RoleEnum
    telegram_id: Optional[str] = None  # optional field

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
    telegram_id: Optional[str] = None

class EditProfileIn(BaseModel):
    full_name: str
    telegram_id: Optional[str] = None
    
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
    telegram_id: Optional[str] = None
