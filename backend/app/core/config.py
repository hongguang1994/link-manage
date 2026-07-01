from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "SimNexus"
    DEBUG: bool = False
    DATABASE_URL: str = "sqlite:///./sim_manager.db"
    SECRET_KEY: str = "change-me-in-production"

    # ModemManager polling interval (seconds)
    MODEM_POLL_INTERVAL: int = 10

    # SMS scheduler check interval (seconds)
    SMS_SCHEDULER_INTERVAL: int = 30

    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Telegram Bot integration (optional)
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
