from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from app.core.database import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(64), unique=True, nullable=False)
    description = Column(Text, default="")
    is_system = Column(Boolean, default=False)   # system roles cannot be deleted

    # Feature permissions
    can_view_sim      = Column(Boolean, default=True)
    can_send_sms      = Column(Boolean, default=True)
    can_manage_tasks  = Column(Boolean, default=True)
    can_view_history  = Column(Boolean, default=True)

    # Operation type
    read_only = Column(Boolean, default=False)

    # Support: can reply to user support messages
    can_support = Column(Boolean, default=False)

    # Device scope: None = all devices; list of modem IDs = restricted
    allowed_modem_ids = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
