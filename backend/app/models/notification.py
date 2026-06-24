from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from app.core.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(32), nullable=False)
    title = Column(String(128), nullable=False)
    body = Column(Text, nullable=False, default="")
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    # audience: 'admin' = admin only, 'all' = everyone, 'user' = specific user
    audience = Column(String(16), nullable=False, default="admin")
    target_user_id = Column(Integer, nullable=True)   # set when audience='user'
