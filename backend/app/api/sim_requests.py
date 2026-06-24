from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_approve_requests, _perm
from app.models.user import UserRole
from app.models.sim_request import SimAccessRequest, RequestStatus, PermissionLevel
from app.models.modem import Modem
from app.services import notify

router = APIRouter(prefix="/sim-requests", tags=["sim-requests"])


class RequestCreate(BaseModel):
    modem_id: int
    requested_level: str = "use"   # 'view' | 'use'
    reason: Optional[str] = None


class ApproveBody(BaseModel):
    granted_level: str = "use"    # approver can downgrade
    expires_at: Optional[datetime] = None
    admin_note: Optional[str] = None


class RejectBody(BaseModel):
    admin_note: Optional[str] = None


class BatchApproveBody(BaseModel):
    ids: List[int]
    granted_level: str = "use"
    expires_at: Optional[datetime] = None
    admin_note: Optional[str] = None


# ── Grant an extra modem to a user directly (approver action) ──────────────────

class DirectGrantBody(BaseModel):
    user_id: int
    modem_id: int
    granted_level: str = "use"
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
        "requested_level": r.requested_level,
        "granted_level": r.granted_level,
        "reason": r.reason,
        "admin_note": r.admin_note,
        "expires_at": r.expires_at.isoformat() if r.expires_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        "is_expired": r.expires_at is not None and r.expires_at < now,
    }


def _approver_modem_scope(approver, db: Session) -> Optional[List[int]]:
    """Return modem IDs this approver can manage, or None for unrestricted."""
    if approver.role == UserRole.ADMIN:
        return None
    p = _perm(approver)
    return p.get("allowed_modem_ids") if p else []


@router.post("/")
def create_request(body: RequestCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if body.requested_level not in ("view", "use"):
        raise HTTPException(400, "requested_level 必须是 view 或 use")

    modem = db.query(Modem).filter(Modem.id == body.modem_id).first()
    if not modem:
        raise HTTPException(404, "设备不存在")

    # Block duplicate pending
    pending = db.query(SimAccessRequest).filter(
        SimAccessRequest.user_id == current_user.id,
        SimAccessRequest.modem_id == body.modem_id,
        SimAccessRequest.status == RequestStatus.PENDING,
    ).first()
    if pending:
        raise HTTPException(400, "已有待审批的申请")

    # Block if already has valid approved access
    now = datetime.utcnow()
    approved = db.query(SimAccessRequest).filter(
        SimAccessRequest.user_id == current_user.id,
        SimAccessRequest.modem_id == body.modem_id,
        SimAccessRequest.status == RequestStatus.APPROVED,
        or_(SimAccessRequest.expires_at.is_(None), SimAccessRequest.expires_at > now),
    ).first()
    if approved:
        raise HTTPException(400, "已有有效的授权")

    req = SimAccessRequest(
        user_id=current_user.id,
        modem_id=body.modem_id,
        requested_level=PermissionLevel(body.requested_level),
        reason=body.reason,
        status=RequestStatus.PENDING,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    modem_name = modem.alias or f"SIM {modem.id}"
    level_label = "使用权限" if body.requested_level == "use" else "查看权限"
    notify.push(
        "sim_request", "新的SIM卡申请",
        f"用户 {current_user.username} 申请 {modem_name} 的{level_label}",
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
    approver=Depends(require_approve_requests),
):
    scope = _approver_modem_scope(approver, db)
    q = db.query(SimAccessRequest)
    if scope is not None:
        q = q.filter(SimAccessRequest.modem_id.in_(scope))
    if status:
        q = q.filter(SimAccessRequest.status == status)
    return [_fmt(r) for r in q.order_by(SimAccessRequest.created_at.desc()).all()]


@router.put("/{req_id}/approve")
def approve_request(req_id: int, body: ApproveBody, db: Session = Depends(get_db), approver=Depends(require_approve_requests)):
    if body.granted_level not in ("view", "use"):
        raise HTTPException(400, "granted_level 必须是 view 或 use")

    req = db.query(SimAccessRequest).filter(SimAccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "申请不存在")

    scope = _approver_modem_scope(approver, db)
    if scope is not None and req.modem_id not in scope:
        raise HTTPException(403, "无权审批该设备的申请")

    req.status = RequestStatus.APPROVED
    req.granted_level = PermissionLevel(body.granted_level)
    req.expires_at = body.expires_at
    req.admin_note = body.admin_note
    req.updated_at = datetime.utcnow()
    db.commit()

    modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
    modem_name = (modem.alias or f"SIM {req.modem_id}") if modem else f"SIM {req.modem_id}"
    level_label = "使用权限" if body.granted_level == "use" else "查看权限"
    exp_str = f"，有效期至 {body.expires_at.strftime('%Y-%m-%d')}" if body.expires_at else "（永久）"
    notify.push("sim_approved", "SIM卡申请已批准",
                f"你对 {modem_name} 的申请已获批准{level_label}{exp_str}",
                audience="user", target_user_id=req.user_id)
    return {"ok": True}


@router.put("/{req_id}/reject")
def reject_request(req_id: int, body: RejectBody, db: Session = Depends(get_db), approver=Depends(require_approve_requests)):
    req = db.query(SimAccessRequest).filter(SimAccessRequest.id == req_id).first()
    if not req:
        raise HTTPException(404, "申请不存在")

    scope = _approver_modem_scope(approver, db)
    if scope is not None and req.modem_id not in scope:
        raise HTTPException(403, "无权审批该设备的申请")

    req.status = RequestStatus.REJECTED
    req.admin_note = body.admin_note
    req.updated_at = datetime.utcnow()
    db.commit()

    modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
    modem_name = (modem.alias or f"SIM {req.modem_id}") if modem else f"SIM {req.modem_id}"
    notify.push("sim_rejected", "SIM卡申请已拒绝",
                f"你对 {modem_name} 的申请未获批准" + (f"，原因：{body.admin_note}" if body.admin_note else ""),
                audience="user", target_user_id=req.user_id)
    return {"ok": True}


@router.post("/batch-approve")
def batch_approve(body: BatchApproveBody, db: Session = Depends(get_db), approver=Depends(require_approve_requests)):
    if body.granted_level not in ("view", "use"):
        raise HTTPException(400, "granted_level 必须是 view 或 use")

    scope = _approver_modem_scope(approver, db)
    reqs = db.query(SimAccessRequest).filter(SimAccessRequest.id.in_(body.ids)).all()
    approved_count = 0
    for req in reqs:
        if scope is not None and req.modem_id not in scope:
            continue
        req.status = RequestStatus.APPROVED
        req.granted_level = PermissionLevel(body.granted_level)
        req.expires_at = body.expires_at
        req.admin_note = body.admin_note
        req.updated_at = datetime.utcnow()
        modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
        modem_name = (modem.alias or f"SIM {req.modem_id}") if modem else f"SIM {req.modem_id}"
        level_label = "使用权限" if body.granted_level == "use" else "查看权限"
        exp_str = f"，有效期至 {body.expires_at.strftime('%Y-%m-%d')}" if body.expires_at else "（永久）"
        notify.push("sim_approved", "SIM卡申请已批准",
                    f"你对 {modem_name} 的申请已获批准{level_label}{exp_str}",
                    audience="user", target_user_id=req.user_id)
        approved_count += 1
    db.commit()
    return {"approved": approved_count}


@router.post("/grant")
def direct_grant(body: DirectGrantBody, db: Session = Depends(get_db), approver=Depends(require_approve_requests)):
    """Approver directly grants access without requiring a prior application."""
    if body.granted_level not in ("view", "use"):
        raise HTTPException(400, "granted_level 必须是 view 或 use")

    scope = _approver_modem_scope(approver, db)
    if scope is not None and body.modem_id not in scope:
        raise HTTPException(403, "无权授权该设备")

    modem = db.query(Modem).filter(Modem.id == body.modem_id).first()
    if not modem:
        raise HTTPException(404, "设备不存在")

    # Check for existing approved grant
    now = datetime.utcnow()
    existing = db.query(SimAccessRequest).filter(
        SimAccessRequest.user_id == body.user_id,
        SimAccessRequest.modem_id == body.modem_id,
        SimAccessRequest.status == RequestStatus.APPROVED,
        or_(SimAccessRequest.expires_at.is_(None), SimAccessRequest.expires_at > now),
    ).first()
    if existing:
        # Update existing grant
        existing.granted_level = PermissionLevel(body.granted_level)
        existing.expires_at = body.expires_at
        existing.admin_note = body.admin_note
        existing.updated_at = now
        db.commit()
    else:
        req = SimAccessRequest(
            user_id=body.user_id,
            modem_id=body.modem_id,
            requested_level=PermissionLevel(body.granted_level),
            granted_level=PermissionLevel(body.granted_level),
            status=RequestStatus.APPROVED,
            admin_note=body.admin_note,
            expires_at=body.expires_at,
        )
        db.add(req)
        db.commit()

    modem_name = modem.alias or f"SIM {modem.id}"
    level_label = "使用权限" if body.granted_level == "use" else "查看权限"
    notify.push("sim_approved", "SIM卡权限已授予",
                f"管理员已授予你 {modem_name} 的{level_label}",
                audience="user", target_user_id=body.user_id)
    return {"ok": True}
