import os
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user, is_support_staff
from app.models.user import User, UserRole
from app.models.support import SupportMessage
from app.services.notify import push

router = APIRouter(prefix="/support", tags=["support"])

UPLOAD_DIR = "/opt/simnexus/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


class MessageIn(BaseModel):
    content: str = ""
    user_id: Optional[int] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_type: Optional[str] = None


class MessageOut(BaseModel):
    id: int
    user_id: int
    sender_id: int
    sender_name: str
    content: str
    is_from_user: bool
    is_read: bool
    created_at: datetime
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_type: Optional[str] = None

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    user_id: int
    username: str
    last_message: str
    last_at: datetime
    unread_count: int


# ── Upload file ───────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    me: User = Depends(get_current_user),
):
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, "文件大小超过 20MB 限制")

    ext = os.path.splitext(file.filename or "")[1].lower()
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as f:
        f.write(data)

    content_type = file.content_type or ""
    att_type = "image" if content_type in ALLOWED_IMAGE_TYPES else "file"
    url = f"/api/support/files/{filename}"

    return {"url": url, "name": file.filename, "type": att_type}


# ── Serve uploaded file ───────────────────────────────────────────────────────

@router.get("/files/{filename}")
def serve_file(filename: str):
    # Prevent path traversal
    if "/" in filename or ".." in filename:
        raise HTTPException(400, "非法文件名")
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "文件不存在")
    return FileResponse(path)


# ── Send message ──────────────────────────────────────────────────────────────

@router.post("/messages", response_model=MessageOut)
def send_message(body: MessageIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not body.content.strip() and not body.attachment_url:
        raise HTTPException(400, "消息或附件不能同时为空")

    if is_support_staff(me):
        if not body.user_id:
            raise HTTPException(400, "客服必须指定目标用户")
        if not db.get(User, body.user_id):
            raise HTTPException(404, "用户不存在")
        msg = SupportMessage(
            user_id=body.user_id, sender_id=me.id,
            content=body.content.strip(), is_from_user=False,
            attachment_url=body.attachment_url,
            attachment_name=body.attachment_name,
            attachment_type=body.attachment_type,
        )
    else:
        msg = SupportMessage(
            user_id=me.id, sender_id=me.id,
            content=body.content.strip(), is_from_user=True,
            attachment_url=body.attachment_url,
            attachment_name=body.attachment_name,
            attachment_type=body.attachment_type,
        )

    db.add(msg)
    db.commit()
    db.refresh(msg)
    preview = body.content.strip()[:40] or (f"[{body.attachment_name}]" if body.attachment_name else "[附件]")
    if is_support_staff(me):
        push("support_reply", "客服已回复您的咨询", preview,
             audience="user", target_user_id=body.user_id)
    else:
        # Notify admins about new user message
        push("support_msg", f"用户咨询：{me.username}", preview, audience="support")
    return _to_out(msg, db)


# ── Get messages ──────────────────────────────────────────────────────────────

@router.get("/messages", response_model=list[MessageOut])
def get_messages(
    user_id: Optional[int] = None,
    since_id: Optional[int] = None,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if is_support_staff(me):
        if not user_id:
            raise HTTPException(400, "需要指定 user_id")
        q = db.query(SupportMessage).filter(SupportMessage.user_id == user_id)
    else:
        q = db.query(SupportMessage).filter(SupportMessage.user_id == me.id)

    if since_id:
        q = q.filter(SupportMessage.id > since_id)

    return [_to_out(m, db) for m in q.order_by(SupportMessage.created_at.asc()).all()]


# ── Mark as read ──────────────────────────────────────────────────────────────

@router.post("/messages/read")
def mark_read(user_id: Optional[int] = None, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if is_support_staff(me):
        if not user_id:
            raise HTTPException(400, "需要 user_id")
        db.query(SupportMessage).filter(
            SupportMessage.user_id == user_id,
            SupportMessage.is_from_user == True,
            SupportMessage.is_read == False,
        ).update({"is_read": True})
    else:
        db.query(SupportMessage).filter(
            SupportMessage.user_id == me.id,
            SupportMessage.is_from_user == False,
            SupportMessage.is_read == False,
        ).update({"is_read": True})
    db.commit()
    return {"ok": True}


# ── Unread count ──────────────────────────────────────────────────────────────

@router.get("/unread")
def unread_count(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if is_support_staff(me):
        count = db.query(func.count(SupportMessage.id)).filter(
            SupportMessage.is_from_user == True, SupportMessage.is_read == False,
        ).scalar()
    else:
        count = db.query(func.count(SupportMessage.id)).filter(
            SupportMessage.user_id == me.id,
            SupportMessage.is_from_user == False, SupportMessage.is_read == False,
        ).scalar()
    return {"count": count or 0}


# ── Conversations (admin) ─────────────────────────────────────────────────────

@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not is_support_staff(me):
        raise HTTPException(403, "无客服权限")
    from sqlalchemy import distinct
    user_ids = [r[0] for r in db.query(distinct(SupportMessage.user_id)).all()]
    result = []
    for uid in user_ids:
        user = db.get(User, uid)
        if not user:
            continue
        last = db.query(SupportMessage).filter(SupportMessage.user_id == uid).order_by(SupportMessage.created_at.desc()).first()
        unread = db.query(func.count(SupportMessage.id)).filter(
            SupportMessage.user_id == uid,
            SupportMessage.is_from_user == True, SupportMessage.is_read == False,
        ).scalar() or 0
        preview = last.attachment_name or last.content[:50] if last else ""
        result.append(ConversationOut(
            user_id=uid, username=user.username,
            last_message=f"[附件] {preview}" if last and last.attachment_url and not last.content else preview,
            last_at=last.created_at if last else datetime.utcnow(),
            unread_count=unread,
        ))
    result.sort(key=lambda x: x.last_at, reverse=True)
    return result


def _to_out(msg: SupportMessage, db: Session) -> MessageOut:
    sender = db.get(User, msg.sender_id)
    return MessageOut(
        id=msg.id, user_id=msg.user_id, sender_id=msg.sender_id,
        sender_name=sender.username if sender else "?",
        content=msg.content, is_from_user=msg.is_from_user,
        is_read=msg.is_read, created_at=msg.created_at,
        attachment_url=msg.attachment_url,
        attachment_name=msg.attachment_name,
        attachment_type=msg.attachment_type,
    )
