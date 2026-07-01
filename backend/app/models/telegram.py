from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean
from datetime import datetime
from app.core.database import Base


class TelegramMessage(Base):
    __tablename__ = "telegram_messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(String(64), nullable=False, index=True)
    username = Column(String(128), nullable=True)
    direction = Column(String(8), nullable=False)  # "in" | "out"
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_command = Column(Boolean, default=False)
    file_id = Column(String(256), nullable=True)
    file_type = Column(String(32), nullable=True)  # photo | document | video | sticker
