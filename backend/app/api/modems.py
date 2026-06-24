from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, date

from app.core.database import get_db
from app.core.security import get_current_user, _perm, get_user_modem_grants
from app.models.user import UserRole
from app.models.modem import Modem
from app.models.sms import SmsMessage, SmsDirection
from app.schemas.modem import ModemOut, ModemUpdate, ModemDetail
from app.services import modem_manager

router = APIRouter(prefix="/modems", tags=["modems"], dependencies=[Depends(get_current_user)])


def _visible_modem_ids(user, db: Session):
    """Return list of modem IDs visible to this user, or None for unrestricted (admin)."""
    if user.role == UserRole.ADMIN:
        return None
    p = _perm(user)
    if not p or not p.get("can_view_sim"):
        raise HTTPException(status_code=403, detail="无SIM卡查看权限")
    # Modems user has any approved grant for (approver-managed cards included automatically)
    granted = get_user_modem_grants(user.id, db, user=user)
    # Intersect with role's allowed_modem_ids if restricted (skip for approvers — their scope is already their managed set)
    p2 = _perm(user)
    role_scope = p2.get("allowed_modem_ids") if p2 and not p2.get("can_approve_requests") else None
    if role_scope is not None:
        granted = [m for m in granted if m in role_scope]
    return granted


@router.get("/available", response_model=List[ModemOut])
def list_available_modems(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """All modems visible for apply purposes — any authenticated user with can_view_sim."""
    p = _perm(current_user)
    if current_user.role != UserRole.ADMIN and (not p or not p.get("can_view_sim")):
        raise HTTPException(status_code=403, detail="无SIM卡查看权限")
    return db.query(Modem).order_by(Modem.id).all()


@router.get("/", response_model=List[ModemOut])
def list_modems(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role == UserRole.ADMIN:
        return db.query(Modem).order_by(Modem.id).all()
    visible = _visible_modem_ids(current_user, db)
    if not visible:
        return []
    return db.query(Modem).filter(Modem.id.in_(visible)).order_by(Modem.id).all()


@router.get("/{modem_id}", response_model=ModemOut)
def get_modem(modem_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        visible = _visible_modem_ids(current_user, db)
        if visible is not None and modem_id not in visible:
            raise HTTPException(status_code=403, detail="无权访问该设备")
    modem = db.query(Modem).filter(Modem.id == modem_id).first()
    if not modem:
        raise HTTPException(status_code=404, detail="Modem not found")
    return modem


@router.patch("/{modem_id}", response_model=ModemOut)
def update_modem(modem_id: int, data: ModemUpdate, db: Session = Depends(get_db)):
    modem = db.query(Modem).filter(Modem.id == modem_id).first()
    if not modem:
        raise HTTPException(status_code=404, detail="Modem not found")
    if data.alias is not None:
        modem.alias = data.alias
    db.commit()
    db.refresh(modem)
    return modem


@router.get("/{modem_id}/detail", response_model=ModemDetail)
def get_modem_detail(modem_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        visible = _visible_modem_ids(current_user, db)
        if visible is not None and modem_id not in visible:
            raise HTTPException(status_code=403, detail="无权访问该设备")
    modem = db.query(Modem).filter(Modem.id == modem_id).first()
    if not modem:
        raise HTTPException(status_code=404, detail="Modem not found")

    sms_sent = db.query(func.count(SmsMessage.id)).filter(
        SmsMessage.modem_id == modem_id,
        SmsMessage.direction == SmsDirection.OUTBOUND,
    ).scalar() or 0

    sms_received = db.query(func.count(SmsMessage.id)).filter(
        SmsMessage.modem_id == modem_id,
        SmsMessage.direction == SmsDirection.INBOUND,
    ).scalar() or 0

    today_start = datetime.combine(date.today(), datetime.min.time())
    sms_today = db.query(func.count(SmsMessage.id)).filter(
        SmsMessage.modem_id == modem_id,
        SmsMessage.created_at >= today_start,
    ).scalar() or 0

    return ModemDetail(
        **{c.name: getattr(modem, c.name) for c in modem.__table__.columns},
        sms_sent=sms_sent,
        sms_received=sms_received,
        sms_today=sms_today,
    )


@router.post("/{modem_id}/refresh", response_model=ModemOut)
def refresh_modem(modem_id: int, db: Session = Depends(get_db)):
    modem = db.query(Modem).filter(Modem.id == modem_id).first()
    if not modem or not modem.mm_object_path:
        raise HTTPException(status_code=404, detail="Modem not found")
    info = modem_manager.get_modem_info(modem.mm_object_path)
    if not info:
        raise HTTPException(status_code=503, detail="Could not reach modem")
    modem.signal_quality = info.get("signal_quality", 0)
    modem.operator = info.get("operator", "")
    modem.status = info.get("status", "unknown")
    db.commit()
    db.refresh(modem)
    return modem
