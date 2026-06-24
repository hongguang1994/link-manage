from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, date

from app.core.database import get_db
from app.models.modem import Modem
from app.models.sms import SmsMessage, SmsDirection
from app.schemas.modem import ModemOut, ModemUpdate, ModemDetail
from app.services import modem_manager

router = APIRouter(prefix="/modems", tags=["modems"])


@router.get("/", response_model=List[ModemOut])
def list_modems(db: Session = Depends(get_db)):
    return db.query(Modem).order_by(Modem.id).all()


@router.get("/{modem_id}", response_model=ModemOut)
def get_modem(modem_id: int, db: Session = Depends(get_db)):
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
def get_modem_detail(modem_id: int, db: Session = Depends(get_db)):
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
    """Force refresh modem info from ModemManager."""
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
