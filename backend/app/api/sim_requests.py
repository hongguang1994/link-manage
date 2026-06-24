from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.sim_request import SimAccessRequest, RequestStatus
from app.models.modem import Modem
from app.services import notify

router = APIRouter(prefix="/sim-requests", tags=["sim-requests"])


class RequestCreate(BaseModel):
    modem_id: int
    reason: Optional[str] = None


class ApproveBody(BaseModel):
    expires_at: Optional[datetime] = None
    admin_note: Optional[str] = None


class RejectBody(BaseModel):
    admin_note: Optional[str] = None


class BatchApproveBody(BaseModel):
    ids: List[int]
    expires_at: Optional[datetime] = None
    admin_note: Optional[str] = None


def _fmt(r: SimAccessRequest):
    now = datetime.utcnow()
    return {
        "id": r.id,
        "user_id": r.user_id,
        "username": r.user.username if r.user else None,
        "modem_id": r.modem_id,
        "modem_name": (r.modem.alias or f"SIM {r.modem_id}") if r.modem else f"SIM {r.modem_id}",
        "status": r.status,
        "reason": r.reason,
        "admin_note": r.admin_note,
        "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        "is_expired": r.expires_at is not None and r.expires_at < now,
    }


@router.post("/")
def create_request(body: RequestCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    modem = db.query(Modem).filter(Modem.id == body.modem_id).first()
    if not modem:
        raise HTTPException(404, "设备不存在")

    now = datetime.utcnow()
    # Block duplicate pending
    pending = db.query(SimAccessRequest).filter(
        SimAccessRequest.user_id == current_user.id,
        SimAccessRequest.modem_id == body.modem_id,
        SimAccessRequest.status == RequestStatus.PENDING,
    ).first()
    if pending:
        raise HTTPException(400, "已有待审批的申请")

    # Block if already has valid approved access
    approved = db.query(SimAccessRequest).filter(
        SimAccessRequest.user_id == current_user.id,
        SimAccessRequest.modem_id == body.modem_id,
        SimAccessRequest.status == RequestStatus.APPROVED,
    ).first()
    if approved and (approved.expires_at is None or approved.expires_at > now):
        raise HTTPException(400, "已有有效的使用权限")

    req = SimAccessRequest(
        user_id=current_user.id,
        modem_id=body.modem_id,
        reason=body.reason,
        status=RequestStatus.PENDING,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    modem_name = modem.alias or f"SIM {modem.id}"
    notify.push(
        "sim_request", "新的SIM卡使用申请",
        f"用户 {current_user.username} 申请使用 {modem_name}",
        audience="admin",
    )
    return _fmt(req)


@router.get("/my")
def my_requests(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    reqs = (
        db.query(SimAccessRequest)
        .filter(SimAccessRequest.user_id == current_user.id)
        .order_by(SimAccessRequest.created_at.desc())
        .all()
    )
    return [_fmt(r) for r in reqs]


@router.get("/")
def list_requests(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(SimAccessRequest)
    if status:
        q = q.filter(SimAccessRequest.status == status)
    reqs = q.order_by(SimAccessRequest.created_at.desc()).all()
    return [_fmt(r) for r in reqs]


@router.put("/{req_id}/approve")
def approve_request(req_id: int, body: ApproveBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    req = db.query(SimAccessRequest).filter(SimAccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "申请不存在")
    req.status = RequestStatus.APPROVED
    req.expires_at = body.expires_at
    req.admin_note = body.admin_note
    req.updated_at = datetime.utcnow()
    db.commit()

    modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
    modem_name = (modem.alias or f"SIM {req.modem_id}") if modem else f"SIM {req.modem_id}"
    notify.push(
        "sim_approved", "SIM卡申请已批准",
        f"你对 {modem_name} 的使用申请已获批准" + (f"，有效期至 {body.expires_at.strftime('%Y-%m-%d')}" if body.expires_at else "（永久）"),
        audience="user",
        target_user_id=req.user_id,
    )
    return {"ok": True}


@router.put("/{req_id}/reject")
def reject_request(req_id: int, body: RejectBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    req = db.query(SimAccessRequest).filter(SimAccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "申请不存在")
    req.status = RequestStatus.REJECTED
    req.admin_note = body.admin_note
    req.updated_at = datetime.utcnow()
    db.commit()

    modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
    modem_name = (modem.alias or f"SIM {req.modem_id}") if modem else f"SIM {req.modem_id}"
    notify.push(
        "sim_rejected", "SIM卡申请已拒绝",
        f"你对 {modem_name} 的使用申请未获批准" + (f"，备注：{body.admin_note}" if body.admin_note else ""),
        audience="user",
        target_user_id=req.user_id,
    )
    return {"ok": True}


@router.post("/batch-approve")
def batch_approve(body: BatchApproveBody, db: Session = Depends(get_db), _=Depends(require_admin)):
    reqs = db.query(SimAccessRequest).filter(SimAccessRequest.id.in_(body.ids)).all()
    for req in reqs:
        req.status = RequestStatus.APPROVED
        req.expires_at = body.expires_at
        req.admin_note = body.admin_note
        req.updated_at = datetime.utcnow()
        modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
        modem_name = (modem.alias or f"SIM {req.modem_id}") if modem else f"SIM {req.modem_id}"
        notify.push(
            "sim_approved", "SIM卡申请已批准",
            f"你对 {modem_name} 的使用申请已获批准" + (f"，有效期至 {body.expires_at.strftime('%Y-%m-%d')}" if body.expires_at else "（永久）"),
            audience="user",
            target_user_id=req.user_id,
        )
    db.commit()
    return {"approved": len(reqs)}
