from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import require_admin
from app.models.role import Role
from app.models.modem import Modem
from app.models.user import User
from app.schemas.role import RoleCreate, RoleUpdate, RoleOut

router = APIRouter(prefix="/roles", tags=["roles"])


class SetRolesBody(BaseModel):
    role_ids: List[int]


def _apply_modem_scope(role: Role, allowed_modem_ids, db: Session):
    """Sync role.modem_scope from an allowed_modem_ids list (or None to clear)."""
    if allowed_modem_ids is None:
        role.modem_scope = []
    else:
        modems = db.query(Modem).filter(Modem.id.in_(allowed_modem_ids)).all() if allowed_modem_ids else []
        role.modem_scope = modems


@router.get("/", response_model=List[RoleOut], dependencies=[Depends(require_admin)])
def list_roles(db: Session = Depends(get_db)):
    return db.query(Role).order_by(Role.id).all()


@router.post("/", response_model=RoleOut, dependencies=[Depends(require_admin)])
def create_role(data: RoleCreate, db: Session = Depends(get_db)):
    if db.query(Role).filter(Role.name == data.name).first():
        raise HTTPException(status_code=400, detail="角色名称已存在")
    dump = data.model_dump(exclude={"allowed_modem_ids"})
    role = Role(**dump)
    db.add(role)
    db.flush()  # get role.id before setting relationships
    _apply_modem_scope(role, data.allowed_modem_ids, db)
    db.commit()
    db.refresh(role)
    return role


@router.patch("/{role_id}", response_model=RoleOut, dependencies=[Depends(require_admin)])
def update_role(role_id: int, data: RoleUpdate, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    fields = data.model_dump(exclude_unset=True)
    if "allowed_modem_ids" in fields:
        _apply_modem_scope(role, fields.pop("allowed_modem_ids"), db)
    for field, value in fields.items():
        setattr(role, field, value)
    db.commit()
    db.refresh(role)
    return role


@router.delete("/{role_id}", dependencies=[Depends(require_admin)])
def delete_role(role_id: int, db: Session = Depends(get_db)):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    if role.is_system:
        raise HTTPException(status_code=400, detail="系统预置角色不可删除")
    db.delete(role)
    db.commit()
    return {"ok": True}


@router.put("/users/{user_id}/roles", dependencies=[Depends(require_admin)])
def set_user_roles(user_id: int, body: SetRolesBody, db: Session = Depends(get_db)):
    """Replace all RBAC roles for a user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    roles = db.query(Role).filter(Role.id.in_(body.role_ids)).all() if body.role_ids else []
    user.rbac_roles = roles
    db.commit()
    db.refresh(user)
    return {"ok": True, "user_id": user_id, "role_ids": [r.id for r in user.rbac_roles]}
