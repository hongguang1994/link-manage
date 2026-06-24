from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.models.modem import ModemStatus


class ModemBase(BaseModel):
    alias: Optional[str] = None


class ModemUpdate(ModemBase):
    pass


class ModemOut(BaseModel):
    id: int
    device_path: Optional[str]
    mm_object_path: Optional[str]
    imei: Optional[str]
    manufacturer: Optional[str]
    model: Optional[str]
    phone_number: Optional[str]
    operator: Optional[str]
    signal_quality: int
    status: ModemStatus
    alias: Optional[str]
    is_active: bool
    last_seen: Optional[datetime]
    created_at: datetime
    access_technologies: Optional[str]
    registration_state: Optional[str]
    tx_bytes: Optional[int]
    rx_bytes: Optional[int]
    connection_duration: Optional[int]

    model_config = {"from_attributes": True}


class ModemDetail(ModemOut):
    sms_sent: int = 0
    sms_received: int = 0
    sms_today: int = 0
