import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SAEnum, Text
from sqlalchemy.orm import relationship
from app.core.database import Base


class RequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class SimAccessRequest(Base):
    __tablename__ = "sim_access_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    modem_id = Column(Integer, ForeignKey("modems.id", ondelete="CASCADE"), nullable=False)
    status = Column(SAEnum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    reason = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # None = permanent
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    modem = relationship("Modem")
