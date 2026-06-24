from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Any
from app.models.sms import SmsDirection, SmsStatus, TaskStatus


class SmsSendRequest(BaseModel):
    modem_id: int
    phone_number: str
    content: str


class SmsMessageOut(BaseModel):
    id: int
    modem_id: int
    direction: SmsDirection
    phone_number: str
    content: str
    status: SmsStatus
    error_message: Optional[str]
    sent_at: Optional[datetime]
    received_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class SmsTemplateCreate(BaseModel):
    name: str
    content: str
    variables: Optional[List[str]] = None


class SmsTemplateOut(BaseModel):
    id: int
    name: str
    content: str
    variables: Optional[List[str]]
    created_at: datetime

    model_config = {"from_attributes": True}


class ScheduledTaskCreate(BaseModel):
    name: str
    modem_id: int
    recipients: List[str]
    content: str
    cron_expression: Optional[str] = None
    send_once_at: Optional[datetime] = None


class ScheduledTaskUpdate(BaseModel):
    name: Optional[str] = None
    recipients: Optional[List[str]] = None
    content: Optional[str] = None
    cron_expression: Optional[str] = None
    send_once_at: Optional[datetime] = None
    status: Optional[TaskStatus] = None


class ScheduledTaskOut(BaseModel):
    id: int
    name: str
    modem_id: int
    recipients: List[Any]
    content: str
    cron_expression: Optional[str]
    send_once_at: Optional[datetime]
    status: TaskStatus
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    run_count: int
    created_at: datetime
    created_by_id: Optional[int] = None
    created_by_username: Optional[str] = None

    model_config = {"from_attributes": True}


class TaskStatsOut(BaseModel):
    total: int
    active: int
    paused: int
    completed: int
    failed: int
