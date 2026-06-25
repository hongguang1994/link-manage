import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SAEnum, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class RequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class PermissionLevel(str, enum.Enum):
    VIEW = "view"    # can see card info only
    USE = "use"      # can send SMS / create tasks (implies view)


class SimAccessRequest(Base):
    """Records the approval workflow. Append-only once created; status is final."""
    __tablename__ = "sim_access_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    modem_id = Column(Integer, ForeignKey("modems.id", ondelete="CASCADE"), nullable=False)
    status = Column(SAEnum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    requested_level = Column(SAEnum(PermissionLevel), default=PermissionLevel.USE, nullable=False)
    reason = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    modem = relationship("Modem")


class SimGrant(Base):
    """Current effective grant per (user, modem). One row per pair, upserted on approve/grant."""
    __tablename__ = "sim_grants"
    __table_args__ = (UniqueConstraint("user_id", "modem_id", name="uq_sim_grants_user_modem"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    modem_id = Column(Integer, ForeignKey("modems.id", ondelete="CASCADE"), nullable=False)
    granted_level = Column(SAEnum(PermissionLevel), nullable=False)
    expires_at = Column(DateTime, nullable=True)
    granted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    request_id = Column(Integer, ForeignKey("sim_access_requests.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    modem = relationship("Modem")
    granted_by = relationship("User", foreign_keys=[granted_by_id])
