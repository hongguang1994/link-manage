from pydantic import BaseModel
from typing import Optional, List


class PermissionOut(BaseModel):
    can_view_sim: bool = True
    can_send_sms: bool = True
    can_manage_tasks: bool = True
    can_view_history: bool = True
    read_only: bool = False
    allowed_modem_ids: Optional[List[int]] = None

    model_config = {"from_attributes": True}


class PermissionUpdate(BaseModel):
    can_view_sim: bool = True
    can_send_sms: bool = True
    can_manage_tasks: bool = True
    can_view_history: bool = True
    read_only: bool = False
    allowed_modem_ids: Optional[List[int]] = None
