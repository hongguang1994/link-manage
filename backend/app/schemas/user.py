from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.user import UserRole
from app.schemas.permission import PermissionOut


class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class AdminPasswordReset(BaseModel):
    new_password: str


class UserOut(BaseModel):
    id: int
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    permission: Optional[PermissionOut] = None

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
