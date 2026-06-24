from datetime import datetime
from sqlalchemy import Column, Integer, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False, default="")
    is_from_user = Column(Boolean, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # Attachment fields (nullable)
    attachment_url = Column(Text, nullable=True)
    attachment_name = Column(Text, nullable=True)
    attachment_type = Column(Text, nullable=True)   # "image" | "file"

    user = relationship("User", foreign_keys=[user_id])
    sender = relationship("User", foreign_keys=[sender_id])
