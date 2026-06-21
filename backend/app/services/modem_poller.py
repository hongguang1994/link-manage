"""
Background task: polls ModemManager every N seconds,
syncs modem state into DB, and ingests received SMS.
"""
import asyncio
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.modem import Modem, ModemStatus
from app.models.sms import SmsMessage, SmsDirection, SmsStatus
from app.services import modem_manager

logger = logging.getLogger(__name__)
_running = False


async def start_polling():
    global _running
    _running = True
    while _running:
        try:
            await _poll()
        except Exception as e:
            logger.exception(f"Poller error: {e}")
        await asyncio.sleep(settings.MODEM_POLL_INTERVAL)


def stop_polling():
    global _running
    _running = False


async def _poll():
    detected = modem_manager.list_modems()
    db = SessionLocal()
    try:
        seen_paths = set()
        for info in detected:
            path = info["mm_object_path"]
            seen_paths.add(path)
            modem = db.query(Modem).filter(Modem.mm_object_path == path).first()
            if not modem:
                modem = Modem(mm_object_path=path)
                db.add(modem)

            modem.device_path = info.get("device_path", "")
            modem.manufacturer = info.get("manufacturer", "")
            modem.model = info.get("model", "")
            modem.imei = info.get("imei") or modem.imei
            modem.operator = info.get("operator", "")
            modem.signal_quality = info.get("signal_quality", 0)
            modem.status = ModemStatus(info.get("status", "unknown"))
            modem.phone_number = info.get("phone_number") or modem.phone_number
            modem.last_seen = datetime.utcnow()
            modem.is_active = True
            db.commit()

            # Ingest received SMS
            await _ingest_inbox(db, modem, info["mm_index"])

        # Mark modems no longer detected as disconnected
        db.query(Modem).filter(
            Modem.mm_object_path.notin_(seen_paths),
            Modem.is_active == True
        ).update({"status": ModemStatus.DISCONNECTED, "is_active": False}, synchronize_session=False)
        db.commit()
    finally:
        db.close()


async def _ingest_inbox(db: Session, modem: Modem, mm_index: str):
    messages = modem_manager.list_inbox(mm_index)
    for msg in messages:
        existing = db.query(SmsMessage).filter(
            SmsMessage.modem_id == modem.id,
            SmsMessage.phone_number == msg["phone_number"],
            SmsMessage.content == msg["content"],
            SmsMessage.direction == SmsDirection.INBOUND,
        ).first()
        if not existing:
            sms = SmsMessage(
                modem_id=modem.id,
                direction=SmsDirection.INBOUND,
                phone_number=msg["phone_number"],
                content=msg["content"],
                status=SmsStatus.RECEIVED,
                received_at=datetime.utcnow(),
            )
            db.add(sms)
    db.commit()
