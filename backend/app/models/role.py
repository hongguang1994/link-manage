from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Table, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


# Junction table: which modems a role's scope covers
role_modem_scope = Table(
    "role_modem_scope",
    Base.metadata,
    Column("role_id",  Integer, ForeignKey("roles.id",  ondelete="CASCADE"), primary_key=True),
    Column("modem_id", Integer, ForeignKey("modems.id", ondelete="CASCADE"), primary_key=True),
)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(64), unique=True, nullable=False)
    description = Column(Text, default="")
    is_system = Column(Boolean, default=False)

    # Feature permissions
    can_view_sim         = Column(Boolean, default=False)
    can_approve_requests = Column(Boolean, default=False)
    can_view_history     = Column(Boolean, default=False)

    # Operation type
    read_only = Column(Boolean, default=False)

    # Support: can reply to user support messages
    can_support = Column(Boolean, default=False)

    # Device scope: empty = unrestricted (for approvers) / no auto-grant (for regular roles)
    modem_scope = relationship("Modem", secondary=role_modem_scope, lazy="joined")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def allowed_modem_ids(self):
        """Compatibility shim: returns None if scope is empty, else list of IDs."""
        ids = [m.id for m in self.modem_scope]
        return None if not ids else ids
