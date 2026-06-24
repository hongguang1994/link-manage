from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Enum, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class SmsDirection(str, enum.Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


class SmsStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    RECEIVED = "received"


class TaskStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class SmsMessage(Base):
    __tablename__ = "sms_messages"

    id = Column(Integer, primary_key=True, index=True)
    modem_id = Column(Integer, ForeignKey("modems.id"), nullable=False)
    direction = Column(Enum(SmsDirection), nullable=False)
    phone_number = Column(String(30), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(Enum(SmsStatus), default=SmsStatus.PENDING)
    error_message = Column(Text)
    sent_at = Column(DateTime)
    received_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    mm_sms_index = Column(String(20))  # mmcli SMS index, used for inbound dedup
    modem = relationship("Modem", back_populates="sms_messages")
    scheduled_task_id = Column(Integer, ForeignKey("sms_scheduled_tasks.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)


class SmsTemplate(Base):
    __tablename__ = "sms_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    variables = Column(JSON)  # list of variable names like ["name", "code"]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SmsScheduledTask(Base):
    __tablename__ = "sms_scheduled_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    modem_id = Column(Integer, ForeignKey("modems.id"), nullable=False)
    recipients = Column(JSON, nullable=False)   # list of phone numbers
    content = Column(Text, nullable=False)
    cron_expression = Column(String(100))       # e.g. "0 9 * * *"
    send_once_at = Column(DateTime)             # for one-time scheduled sends
    status = Column(Enum(TaskStatus), default=TaskStatus.ACTIVE)
    last_run_at = Column(DateTime)
    next_run_at = Column(DateTime)
    run_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    modem = relationship("Modem", back_populates="scheduled_tasks")
