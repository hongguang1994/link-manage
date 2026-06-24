from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from pydantic import BaseModel
from datetime import datetime
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user, is_support_staff
from app.models.notification import Notification
from app.models.user import User, UserRole

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str
    is_read: bool
    created_at: datetime
    audience: str

    class Config:
        from_attributes = True


def _visible_filter(me: User):
    """SQLAlchemy filter expression for notifications visible to this user.

    audience values:
      'admin'   — system admins only
      'support' — admins + users with can_support role
      'all'     — every logged-in user
      'user'    — specific user via target_user_id
    """
    conditions = [
        Notification.audience == "all",
        and_(Notification.audience == "user", Notification.target_user_id == me.id),
    ]
    if me.role == UserRole.ADMIN:
        conditions += [
            Notification.audience == "admin",
            Notification.audience == "support",
        ]
    elif is_support_staff(me):
        # support staff (can_support role) sees support-channel notifications
        conditions.append(Notification.audience == "support")
    return or_(*conditions)


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    return (
        db.query(Notification)
        .filter(_visible_filter(me))
        .order_by(Notification.id.desc())
        .limit(limit)
        .all()
    )


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    count = (
        db.query(Notification)
        .filter(_visible_filter(me), Notification.is_read == False)
        .count()
    )
    return {"count": count}


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    (
        db.query(Notification)
        .filter(_visible_filter(me), Notification.is_read == False)
        .update({"is_read": True}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read")
def mark_one_read(
    notification_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        _visible_filter(me),
    ).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}
