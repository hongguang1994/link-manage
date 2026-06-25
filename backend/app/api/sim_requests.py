from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user, require_approve_requests, _perm
from app.models.user import UserRole
from app.models.sim_request import SimAccessRequest, SimGrant, RequestStatus, PermissionLevel
from app.models.modem import Modem
from app.services import notify

router = APIRouter(prefix="/sim-requests", tags=["sim-requests"])


class RequestCreate(BaseModel):
    modem_id: int
    requested_level: str = "use"
    reason: Optional[str] = None


class ApproveBody(BaseModel):
    granted_level: str = "use"
    expires_at: Optional[datetime] = None
    admin_note: Optional[str] = None


class RejectBody(BaseModel):
    admin_note: Optional[str] = None


class BatchApproveBody(BaseModel):
    ids: List[int]
    granted_level: str = "use"
    expires_at: Optional[datetime] = None
    admin_note: Optional[str] = None


class DirectGrantBody(BaseModel):
    user_id: int
    modem_id: int
    granted_level: str = "use"
    expires_at: Optional[datetime] = None
    admin_note: Optional[str] = None


def _fmt_request(r: SimAccessRequest, grants: dict):
    """Serialize a request, merging current grant info if available."""
    now = datetime.utcnow()
    grant = grants.get((r.user_id, r.modem_id))
    return {
        "id": r.id,
        "user_id": r.user_id,
        "username": r.user.username if r.user else None,
        "modem_id": r.modem_id,
        "modem_name": (r.modem.alias or f"SIM {r.modem_id}") if r.modem else f"SIM {r.modem_id}",
        "status": r.status,
        "requested_level": r.requested_level,
        "granted_level": grant.granted_level if grant else None,
        "reason": r.reason,
        "admin_note": r.admin_note,
        "expires_at": grant.expires_at.isoformat() if grant and grant.expires_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        "is_expired": bool(grant and grant.expires_at and grant.expires_at < now),
    }


def _fmt_grant(g: SimGrant):
    now = datetime.utcnow()
    return {
        "id": g.id,
        "user_id": g.user_id,
        "modem_id": g.modem_id,
        "granted_level": g.granted_level,
        "expires_at": g.expires_at.isoformat() if g.expires_at else None,
        "is_expired": bool(g.expires_at and g.expires_at < now),
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


def _approver_modem_scope(approver, db: Session) -> Optional[List[int]]:
    if approver.role == UserRole.ADMIN:
        return None
    p = _perm(approver)
    return p.get("allowed_modem_ids") if p else []


def _upsert_grant(db: Session, user_id: int, modem_id: int,
                  granted_level: str, expires_at, granted_by_id: int,
                  request_id: Optional[int] = None):
    """Insert or update sim_grants for (user_id, modem_id)."""
    now = datetime.utcnow()
    existing = db.query(SimGrant).filter(
        SimGrant.user_id == user_id,
        SimGrant.modem_id == modem_id,
    ).first()
    if existing:
        existing.granted_level = PermissionLevel(granted_level)
        existing.expires_at = expires_at
        existing.granted_by_id = granted_by_id
        if request_id:
            existing.request_id = request_id
        existing.updated_at = now
    else:
        db.add(SimGrant(
            user_id=user_id,
            modem_id=modem_id,
            granted_level=PermissionLevel(granted_level),
            expires_at=expires_at,
            granted_by_id=granted_by_id,
            request_id=request_id,
            created_at=now,
            updated_at=now,
        ))


# ── Requests ───────────────────────────────────────────────────────────────────

@router.post("/")
def create_request(body: RequestCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if body.requested_level not in ("view", "use"):
        raise HTTPException(400, "requested_level 必须是 view 或 use")

    # Block if already has active grant
    now = datetime.utcnow()
    existing_grant = db.query(SimGrant).filter(
        SimGrant.user_id == current_user.id,
        SimGrant.modem_id == body.modem_id,
    ).first()
    if existing_grant and (existing_grant.expires_at is None or existing_grant.expires_at > now):
        raise HTTPException(400, "已有有效授权，无需重复申请")

    # Block if already pending
    pending = db.query(SimAccessRequest).filter(
        SimAccessRequest.user_id == current_user.id,
        SimAccessRequest.modem_id == body.modem_id,
        SimAccessRequest.status == RequestStatus.PENDING,
    ).first()
    if pending:
        raise HTTPException(400, "已有待审批的申请，请勿重复提交")

    req = SimAccessRequest(
        user_id=current_user.id,
        modem_id=body.modem_id,
        requested_level=PermissionLevel(body.requested_level),
        reason=body.reason,
        status=RequestStatus.PENDING,
    )
    db.add(req)
    db.commit()
    notify.push("sim_request", "新的SIM卡申请",
                f"用户 {current_user.username} 申请访问 SIM {body.modem_id}",
                audience="admin")
    return {"ok": True}


@router.get("/my")
def my_requests(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    reqs = (
        db.query(SimAccessRequest)
        .filter(SimAccessRequest.user_id == current_user.id)
        .order_by(SimAccessRequest.created_at.desc())
        .all()
    )
    grants = {(g.user_id, g.modem_id): g for g in
              db.query(SimGrant).filter(SimGrant.user_id == current_user.id).all()}
    return [_fmt_request(r, grants) for r in reqs]


@router.get("/my-grants")
def my_grants(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Return the user's current active grants."""
    now = datetime.utcnow()
    grants = db.query(SimGrant).filter(
        SimGrant.user_id == current_user.id,
    ).all()
    return [_fmt_grant(g) for g in grants if g.expires_at is None or g.expires_at > now]


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
    reqs = q.order_by(SimAccessRequest.created_at.desc()).all()

    user_ids = {r.user_id for r in reqs}
    modem_ids = {r.modem_id for r in reqs}
    grants = {}
    if user_ids and modem_ids:
        for g in db.query(SimGrant).filter(
            SimGrant.user_id.in_(user_ids),
            SimGrant.modem_id.in_(modem_ids),
        ).all():
            grants[(g.user_id, g.modem_id)] = g

    return [_fmt_request(r, grants) for r in reqs]


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
    req.admin_note = body.admin_note
    req.updated_at = datetime.utcnow()

    _upsert_grant(db, req.user_id, req.modem_id, body.granted_level,
                  body.expires_at, approver.id, req.id)
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
        req.admin_note = body.admin_note
        req.updated_at = datetime.utcnow()
        _upsert_grant(db, req.user_id, req.modem_id, body.granted_level,
                      body.expires_at, approver.id, req.id)
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

    _upsert_grant(db, body.user_id, body.modem_id, body.granted_level,
                  body.expires_at, approver.id)
    db.commit()

    modem_name = modem.alias or f"SIM {modem.id}"
    level_label = "使用权限" if body.granted_level == "use" else "查看权限"
    notify.push("sim_approved", "SIM卡权限已授予",
                f"管理员已授予你 {modem_name} 的{level_label}",
                audience="user", target_user_id=body.user_id)
    return {"ok": True}


@router.delete("/grants/{grant_id}")
def revoke_grant(grant_id: int, db: Session = Depends(get_db), approver=Depends(require_approve_requests)):
    """Revoke an active grant."""
    grant = db.query(SimGrant).filter(SimGrant.id == grant_id).first()
    if not grant:
        raise HTTPException(404, "授权记录不存在")
    scope = _approver_modem_scope(approver, db)
    if scope is not None and grant.modem_id not in scope:
        raise HTTPException(403, "无权撤销该设备的授权")
    db.delete(grant)
    db.commit()
    notify.push("sim_revoked", "SIM卡权限已撤销",
                f"你对 SIM {grant.modem_id} 的访问权限已被撤销",
                audience="user", target_user_id=grant.user_id)
    return {"ok": True}
