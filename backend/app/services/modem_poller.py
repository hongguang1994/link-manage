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
from app.services.notify import push

logger = logging.getLogger(__name__)
# Track previous modem statuses to detect transitions
_prev_status: dict[str, str] = {}
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
            modem.access_technologies = info.get("access_technologies", "")
            modem.registration_state = info.get("registration_state", "")
            modem.tx_bytes = info.get("tx_bytes", 0)
            modem.rx_bytes = info.get("rx_bytes", 0)
            modem.connection_duration = info.get("connection_duration", 0)
            modem.last_seen = datetime.utcnow()
            modem.is_active = True
            db.commit()

            # Detect status transitions
            new_status = info.get("status", "unknown")
            old_status = _prev_status.get(path)
            label = modem.alias or modem.model or path
            if old_status is not None and old_status != new_status:
                if new_status == "connected":
                    push("modem_online", f"设备上线", f"{label} 已连接")
                elif new_status in ("disconnected", "unknown"):
                    push("modem_offline", f"设备离线", f"{label} 已断开连接")
            _prev_status[path] = new_status

            # Ingest received SMS
            await _ingest_inbox(db, modem, info["mm_index"])

        # Mark modems no longer detected as disconnected
        gone = db.query(Modem).filter(
            Modem.mm_object_path.notin_(seen_paths),
            Modem.is_active == True
        ).all()
        for m in gone:
            label = m.alias or m.model or m.mm_object_path
            push("modem_offline", "设备离线", f"{label} 已断开连接")
            m.status = ModemStatus.DISCONNECTED
            m.is_active = False
        db.commit()
    finally:
        db.close()


async def _ingest_inbox(db: Session, modem: Modem, mm_index: str):
    messages = modem_manager.list_inbox(mm_index)
    for msg in messages:
        sms_index = msg["sms_index"]
        existing = db.query(SmsMessage).filter(
            SmsMessage.modem_id == modem.id,
            SmsMessage.mm_sms_index == sms_index,
            SmsMessage.direction == SmsDirection.INBOUND,
        ).first()
        if not existing:
            sms = SmsMessage(
                modem_id=modem.id,
                mm_sms_index=sms_index,
                direction=SmsDirection.INBOUND,
                phone_number=msg["phone_number"],
                content=msg["content"],
                status=SmsStatus.RECEIVED,
                received_at=datetime.utcnow(),
            )
            db.add(sms)
    db.commit()
