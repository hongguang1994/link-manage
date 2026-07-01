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
from app.services.modem_manager import enable_modem
from app.services.notify import push
from app.services import telegram_bot
# ZTE 驱动为可选依赖，导入失败时降级为仅 mmcli 模式
try:
    from app.services import zte_http_modem as _zte
    _ZTE_AVAILABLE = True
except ImportError:
    _ZTE_AVAILABLE = False

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

    # ZTE HTTP 调用是阻塞 I/O，必须用 run_in_executor 以免阻塞事件循环
    # "_source": "zte" 标记用于后续区分收件箱读取路径
    if _ZTE_AVAILABLE:
        try:
            zte_info = await asyncio.get_event_loop().run_in_executor(
                None, _zte.get_modem_info
            )
            if zte_info:
                zte_info["_source"] = "zte"
                detected.append(zte_info)
        except Exception as e:
            logger.debug(f"ZTE poll skipped: {e}")
    db = SessionLocal()
    try:
        seen_paths = set()
        for info in detected:
            path = info["mm_object_path"]
            seen_paths.add(path)
            modem = db.query(Modem).filter(Modem.mm_object_path == path).first()
            if not modem:
                # D-Bus path changes on re-insertion; try to match by IMEI to
                # avoid UNIQUE constraint failure and preserve history
                imei = info.get("imei")
                if imei:
                    modem = db.query(Modem).filter(Modem.imei == imei).first()
                if modem:
                    modem.mm_object_path = path  # update to new D-Bus path
                else:
                    modem = Modem(mm_object_path=path)
                    db.add(modem)

            modem.device_path = info.get("device_path", "")
            modem.manufacturer = info.get("manufacturer", "")
            modem.model = info.get("model", "")
            # IMEI 有时轮询为空（设备初始化中），保留上次已知值
            modem.imei = info.get("imei") or modem.imei
            modem.operator = info.get("operator", "")
            modem.signal_quality = info.get("signal_quality", 0)
            modem.status = ModemStatus(info.get("status", "unknown"))
            # 只在读到新号码时更新，避免 MVNO 卡（如 GiffGaff）覆盖手动填写的号码
            if info.get("phone_number"):
                modem.phone_number = info.get("phone_number")
            modem.access_technologies = info.get("access_technologies", "")
            modem.registration_state = info.get("registration_state", "")
            modem.tx_bytes = info.get("tx_bytes", 0)
            modem.rx_bytes = info.get("rx_bytes", 0)
            modem.connection_duration = info.get("connection_duration", 0)
            modem.imsi = info.get("imsi") or modem.imsi
            modem.iccid = info.get("iccid") or modem.iccid
            modem.firmware_revision = info.get("firmware_revision") or modem.firmware_revision
            modem.hardware_revision = info.get("hardware_revision") or modem.hardware_revision
            modem.current_bands = info.get("current_bands") or modem.current_bands
            modem.sim_operator_name = info.get("sim_operator_name") or modem.sim_operator_name
            modem.sim_operator_code = info.get("sim_operator_code") or modem.sim_operator_code
            modem.current_modes = info.get("current_modes") or modem.current_modes
            modem.ports = info.get("ports") or modem.ports
            modem.plugin = info.get("plugin") or modem.plugin
            modem.last_seen = datetime.utcnow()
            modem.is_active = True
            db.commit()

            # Auto-enable modems stuck in "disabled" state so they can register
            if info.get("raw_state") == "disabled" and not info["mm_object_path"].startswith("zte:"):
                logger.info(f"Auto-enabling disabled modem {info['mm_index']}")
                await asyncio.get_event_loop().run_in_executor(
                    None, enable_modem, info["mm_index"]
                )

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
            if info.get("_source") == "zte":
                await _ingest_zte_inbox(db, modem)
            else:
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


async def _ingest_zte_inbox(db: Session, modem: Modem):
    if not _ZTE_AVAILABLE:
        return
    try:
        messages = await asyncio.get_event_loop().run_in_executor(None, _zte.list_sms)
    except Exception:
        return
    for msg in messages:
        sms_index = msg["index"]
        # 去重键：(modem_id, mm_sms_index, direction=inbound)
        # ZTE 使用设备内部 id 作为 sms_index，重启设备后可能复用
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
                phone_number=msg["number"],
                content=msg["text"],
                status=SmsStatus.RECEIVED,
                received_at=datetime.utcnow(),
            )
            db.add(sms)
            label = modem.alias or modem.model or f"设备#{modem.id}"
            asyncio.create_task(
                telegram_bot.push_inbound_sms(label, msg["number"], msg["text"])
            )
    db.commit()


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
            label = modem.alias or modem.model or f"设备#{modem.id}"
            asyncio.create_task(
                telegram_bot.push_inbound_sms(label, msg["phone_number"], msg["content"])
            )
    db.commit()
