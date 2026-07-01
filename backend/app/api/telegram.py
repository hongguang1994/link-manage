from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import httpx

from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.user import User
from app.models.telegram import TelegramMessage
from app.services import telegram_bot

router = APIRouter(prefix="/telegram", tags=["telegram"])


class TelegramMessageOut(BaseModel):
    id: int
    chat_id: str
    username: Optional[str]
    direction: str
    text: str
    created_at: datetime
    is_command: bool
    file_id: Optional[str] = None
    file_type: Optional[str] = None

    model_config = {"from_attributes": True}


class SendRequest(BaseModel):
    text: str
    chat_id: Optional[str] = None


@router.get("/messages", response_model=List[TelegramMessageOut], dependencies=[Depends(require_admin)])
def list_messages(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    return (
        db.query(TelegramMessage)
        .order_by(TelegramMessage.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/send", dependencies=[Depends(require_admin)])
async def send_message(
    body: SendRequest,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="消息不能为空")
    ok = await telegram_bot.send_message(body.text, chat_id=body.chat_id or None, log=False)
    if not ok:
        raise HTTPException(status_code=502, detail="发送失败，请检查 Bot Token 和 Chat ID")
    # log outbound
    msg = TelegramMessage(
        chat_id=body.chat_id or telegram_bot.CHAT_ID,
        username="SimNexus",
        direction="out",
        text=body.text,
        is_command=False,
    )
    db.add(msg)
    db.commit()
    return {"ok": True}


@router.post("/send-file", dependencies=[Depends(require_admin)])
async def send_file(
    file: UploadFile = File(...),
    caption: str = Form(""),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    bot_token = telegram_bot.BOT_TOKEN
    chat_id = telegram_bot.CHAT_ID
    if not bot_token or not chat_id:
        raise HTTPException(status_code=503, detail="Bot not configured")

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    is_image = content_type.startswith("image/")

    method = "sendPhoto" if is_image else "sendDocument"
    field = "photo" if is_image else "document"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{bot_token}/{method}",
            data={"chat_id": chat_id, "caption": caption},
            files={field: (file.filename, content, content_type)},
        )
        data = resp.json()

    if not data.get("ok"):
        raise HTTPException(status_code=502, detail=data.get("description", "发送失败"))

    # Extract file_id from Telegram response
    result = data.get("result", {})
    file_type = "photo" if is_image else "document"
    sent_file_id = None
    if is_image and result.get("photo"):
        sent_file_id = result["photo"][-1]["file_id"]
    elif result.get("document"):
        sent_file_id = result["document"]["file_id"]

    label = caption or file.filename or ""
    msg = TelegramMessage(
        chat_id=chat_id, username="SimNexus",
        direction="out", text=label, is_command=False,
        file_type=file_type, file_id=sent_file_id,
    )
    db.add(msg)
    db.commit()
    return {"ok": True}


@router.delete("/messages", dependencies=[Depends(require_admin)])
def clear_messages(db: Session = Depends(get_db)):
    db.query(TelegramMessage).delete()
    db.commit()
    return {"ok": True}


@router.get("/file/{file_id:path}")
async def proxy_file(file_id: str, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Proxy Telegram file download. Accepts JWT via ?token= for img src / direct link usage."""
    from jose import jwt, JWTError
    from app.core.security import SECRET_KEY, ALGORITHM
    from app.models.user import User, UserRole
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(User).filter(User.username == username, User.is_active == True).first()
        if not user or user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Forbidden")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    bot_token = telegram_bot.BOT_TOKEN
    if not bot_token:
        raise HTTPException(status_code=503, detail="Bot not configured")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"https://api.telegram.org/bot{bot_token}/getFile", params={"file_id": file_id})
        data = r.json()
        if not data.get("ok"):
            raise HTTPException(status_code=404, detail="File not found")
        file_path = data["result"]["file_path"]
        # Step 2: stream the file
        url = f"https://api.telegram.org/file/bot{bot_token}/{file_path}"
        resp = await client.get(url)
        content_type = resp.headers.get("content-type", "application/octet-stream")
        filename = file_path.split("/")[-1]
        headers = {"Content-Disposition": f'inline; filename="{filename}"'}
        return StreamingResponse(iter([resp.content]), media_type=content_type, headers=headers)


@router.get("/config", dependencies=[Depends(require_admin)])
def get_config():
    return {
        "bot_token_set": bool(telegram_bot.BOT_TOKEN),
        "chat_id": telegram_bot.CHAT_ID,
        "polling": telegram_bot._poll_task is not None and not telegram_bot._poll_task.done(),
    }
