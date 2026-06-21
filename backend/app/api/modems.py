from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.models.modem import Modem
from app.schemas.modem import ModemOut, ModemUpdate
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
