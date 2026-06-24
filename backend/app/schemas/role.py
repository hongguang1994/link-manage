from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RoleCreate(BaseModel):
    name: str
    description: str = ""
    can_view_sim: bool = False
    can_approve_requests: bool = False
    can_view_history: bool = False
    read_only: bool = False
    can_support: bool = False
    allowed_modem_ids: Optional[List[int]] = None


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    can_view_sim: Optional[bool] = None
    can_approve_requests: Optional[bool] = None
    can_view_history: Optional[bool] = None
    read_only: Optional[bool] = None
    can_support: Optional[bool] = None
    allowed_modem_ids: Optional[List[int]] = None


class RoleOut(BaseModel):
    id: int
    name: str
    description: str
    is_system: bool
    can_view_sim: bool
    can_approve_requests: bool
    can_view_history: bool
    read_only: bool
    can_support: bool
    allowed_modem_ids: Optional[List[int]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
