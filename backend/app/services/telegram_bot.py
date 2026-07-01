"""
Telegram Bot integration for SimNexus.
- Pushes inbound SMS to a configured Telegram chat.
- Handles /send <number> <content> and /list commands via long-polling.
"""
import asyncio
import logging
import os
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _load_dotenv():
    """Load .env from the app working directory into os.environ."""
    for candidate in [Path("/app/.env"), Path(".env")]:
        if candidate.exists():
            for line in candidate.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
            break


_load_dotenv()

BOT_TOKEN: str = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID: str = os.environ.get("TELEGRAM_CHAT_ID", "")
API_BASE = "https://api.telegram.org"

_client: Optional[httpx.AsyncClient] = None
_poll_task: Optional[asyncio.Task] = None
_last_update_id: int = 0


def _base_url() -> str:
    return f"{API_BASE}/bot{BOT_TOKEN}"


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=35.0)
    return _client


async def send_message(text: str, chat_id: Optional[str] = None, log: bool = True) -> bool:
    """Send a text message to the configured Telegram chat."""
    if not BOT_TOKEN or not (chat_id or CHAT_ID):
        return False
    target = chat_id or CHAT_ID
    try:
        client = await _get_client()
        resp = await client.post(
            f"{_base_url()}/sendMessage",
            json={"chat_id": target, "text": text, "parse_mode": "HTML"},
        )
        ok = resp.json().get("ok", False)
        if ok and log:
            _log_message(target, "SimNexus", "out", text, is_command=False)
        return ok
    except Exception as e:
        logger.error(f"Telegram sendMessage failed: {e}")
        return False


async def push_inbound_sms(modem_label: str, sender: str, content: str) -> bool:
    """Push a received SMS notification to Telegram."""
    text = (
        f"📨 <b>收到短信</b>\n"
        f"设备：{modem_label}\n"
        f"发件人：{sender}\n"
        f"内容：{content}"
    )
    return await send_message(text)


def _modem_label(modem) -> str:
    return modem.alias or modem.model or f"设备#{modem.id}"


async def _do_send(modem, number: str, content: str, chat_id: str) -> None:
    from app.services import modem_manager
    import re
    obj_path = modem.mm_object_path or ""
    if obj_path.startswith("zte:"):
        from app.services import zte_http_modem as _zte
        success = _zte.send_sms(number, content)
        err = ""
    else:
        m = re.search(r"/Modem/(\d+)$", obj_path)
        if not m:
            await send_message("❌ 无法获取设备索引", chat_id=chat_id)
            return
        success, err = modem_manager.send_sms(m.group(1), number, content)
    label = _modem_label(modem)
    if success:
        await send_message(f"✅ [{label}] 短信已发送至 {number}", chat_id=chat_id)
    else:
        await send_message(f"❌ [{label}] 发送失败：{err}", chat_id=chat_id)


def _log_message(chat_id: str, username: str, direction: str, text: str,
                 is_command: bool = False, file_id: str = None, file_type: str = None):
    """Persist a Telegram message to DB (best-effort, non-blocking)."""
    try:
        from app.core.database import SessionLocal
        from app.models.telegram import TelegramMessage
        db = SessionLocal()
        try:
            db.add(TelegramMessage(
                chat_id=chat_id, username=username,
                direction=direction, text=text, is_command=is_command,
                file_id=file_id, file_type=file_type,
            ))
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to log Telegram message: {e}")


async def _handle_command(message: dict) -> None:
    """Process a Telegram bot command."""
    from app.core.database import SessionLocal
    from app.models.modem import Modem, ModemStatus
    from app.models.sms import SmsMessage, SmsDirection

    chat_id = str(message["chat"]["id"])
    text: str = message.get("text") or message.get("caption") or ""
    text = text.strip()
    username = message.get("from", {}).get("username") or message.get("from", {}).get("first_name", "")

    # Handle media messages
    file_id = None
    file_type = None
    if "photo" in message:
        file_type = "photo"
        file_id = message["photo"][-1]["file_id"]  # largest size
        _log_message(chat_id, username, "in", text or "[图片]", file_id=file_id, file_type=file_type)
        return
    elif "document" in message:
        file_type = "document"
        file_id = message["document"]["file_id"]
        fname = message["document"].get("file_name", "文件")
        _log_message(chat_id, username, "in", text or f"[文件: {fname}]", file_id=file_id, file_type=file_type)
        return
    elif "video" in message:
        file_type = "video"
        file_id = message["video"]["file_id"]
        _log_message(chat_id, username, "in", text or "[视频]", file_id=file_id, file_type=file_type)
        return
    elif "sticker" in message:
        file_type = "sticker"
        file_id = message["sticker"]["file_id"]
        _log_message(chat_id, username, "in", "[贴纸]", file_id=file_id, file_type=file_type)
        return
    elif "voice" in message:
        file_type = "voice"
        file_id = message["voice"]["file_id"]
        _log_message(chat_id, username, "in", "[语音]", file_id=file_id, file_type=file_type)
        return

    if not text:
        return
    _log_message(chat_id, username, "in", text, is_command=text.startswith("/"))

    if text.startswith("/modems"):
        db = SessionLocal()
        try:
            modems = db.query(Modem).filter(Modem.is_active == True).all()
            if not modems:
                await send_message("暂无设备", chat_id=chat_id)
                return
            lines = ["📱 <b>当前设备列表</b>"]
            for m in modems:
                status = "🟢" if m.status == ModemStatus.CONNECTED else "🔴"
                label = _modem_label(m)
                phone = f" {m.phone_number}" if m.phone_number else ""
                op = f" [{m.operator}]" if m.operator else ""
                lines.append(f"{status} <b>#{m.id}</b> {label}{phone}{op}")
            lines.append("\n发送时用: /send #&lt;设备ID&gt; &lt;号码&gt; &lt;内容&gt;")
            await send_message("\n".join(lines), chat_id=chat_id)
        finally:
            db.close()

    elif text.startswith("/send"):
        # /send [#modem_id] <number> <content>
        args = text[5:].strip()
        db = SessionLocal()
        try:
            modem = None
            if args.startswith("#"):
                parts = args.split(" ", 2)
                try:
                    modem_id = int(parts[0][1:])
                    modem = db.query(Modem).filter(Modem.id == modem_id).first()
                    if not modem:
                        await send_message(f"❌ 未找到设备 #{modem_id}", chat_id=chat_id)
                        return
                    args = " ".join(parts[1:])
                except ValueError:
                    pass

            parts = args.split(" ", 1)
            if len(parts) < 2:
                await send_message(
                    "用法:\n/send &lt;号码&gt; &lt;内容&gt;\n/send #&lt;设备ID&gt; &lt;号码&gt; &lt;内容&gt;",
                    chat_id=chat_id,
                )
                return
            number, content = parts[0], parts[1]

            if modem is None:
                connected = db.query(Modem).filter(Modem.status == ModemStatus.CONNECTED).all()
                if not connected:
                    await send_message("❌ 无可用设备", chat_id=chat_id)
                    return
                if len(connected) > 1:
                    lines = ["⚠️ 有多个在线设备，请指定设备ID："]
                    for m in connected:
                        lines.append(f"  #{m.id} {_modem_label(m)}")
                    lines.append(f"\n例: /send #{connected[0].id} {number} {content}")
                    await send_message("\n".join(lines), chat_id=chat_id)
                    return
                modem = connected[0]

            await _do_send(modem, number, content, chat_id)
        finally:
            db.close()

    elif text.startswith("/list"):
        db = SessionLocal()
        try:
            # optional: /list #<modem_id>
            args = text[5:].strip()
            q = db.query(SmsMessage).filter(SmsMessage.direction == SmsDirection.INBOUND)
            if args.startswith("#"):
                try:
                    mid = int(args[1:].split()[0])
                    q = q.filter(SmsMessage.modem_id == mid)
                except ValueError:
                    pass
            msgs = q.order_by(SmsMessage.created_at.desc()).limit(10).all()
            if not msgs:
                await send_message("暂无收到的短信", chat_id=chat_id)
                return
            # group by modem
            modem_map = {m.id: _modem_label(m) for m in db.query(Modem).all()}
            lines = ["📋 <b>最近收到的短信</b>"]
            for m in msgs:
                ts = m.created_at.strftime("%m-%d %H:%M") if m.created_at else ""
                dev = modem_map.get(m.modem_id, f"#{m.modem_id}")
                lines.append(f"\n[{ts}] <b>{m.phone_number}</b> via {dev}\n{m.content}")
            await send_message("\n".join(lines), chat_id=chat_id)
        finally:
            db.close()

    elif text.startswith("/start") or text.startswith("/help"):
        help_text = (
            "🤖 <b>SimNexus Bot</b>\n\n"
            "/modems - 查看所有设备\n"
            "/list - 查看最近10条收到的短信\n"
            "/list #&lt;设备ID&gt; - 查看指定设备的短信\n"
            "/send &lt;号码&gt; &lt;内容&gt; - 发送短信（单卡时自动选择）\n"
            "/send #&lt;设备ID&gt; &lt;号码&gt; &lt;内容&gt; - 通过指定设备发送\n"
        )
        await send_message(help_text, chat_id=chat_id)


async def _poll_loop() -> None:
    """Long-poll Telegram for updates and dispatch commands."""
    global _last_update_id
    if not BOT_TOKEN:
        logger.info("Telegram bot token not configured; skipping polling")
        return
    logger.info("Telegram bot polling started")
    while True:
        try:
            client = await _get_client()
            resp = await client.get(
                f"{_base_url()}/getUpdates",
                params={"offset": _last_update_id + 1, "timeout": 30},
                timeout=35.0,
            )
            data = resp.json()
            if data.get("ok"):
                for update in data.get("result", []):
                    _last_update_id = update["update_id"]
                    msg = update.get("message") or update.get("edited_message")
                    if msg:
                        asyncio.create_task(_handle_command(msg))
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Telegram poll error: {e}")
            await asyncio.sleep(5)


async def start_polling() -> None:
    global _poll_task
    if not BOT_TOKEN:
        return
    _poll_task = asyncio.create_task(_poll_loop())


async def stop_polling() -> None:
    global _poll_task, _client
    if _poll_task:
        _poll_task.cancel()
        try:
            await _poll_task
        except asyncio.CancelledError:
            pass
        _poll_task = None
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
