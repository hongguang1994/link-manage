from sqlalchemy import Column, Integer, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class UserPermission(Base):
    __tablename__ = "user_permissions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # Feature modules
    can_view_sim = Column(Boolean, default=True)
    can_send_sms = Column(Boolean, default=True)
    can_manage_tasks = Column(Boolean, default=True)
    can_view_history = Column(Boolean, default=True)

    # Operation type: True = read-only, no POST/PATCH/DELETE
    read_only = Column(Boolean, default=False)

    # Device scope: None = all modems; list of modem IDs = restricted
    allowed_modem_ids = Column(JSON, nullable=True)

    user = relationship("User", back_populates="permission")
