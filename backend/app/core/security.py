from datetime import datetime, timedelta
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db

SECRET_KEY = "simnexus-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from app.models.user import User
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if user is None:
        raise credentials_exc
    return user


def require_admin(current_user=Depends(get_current_user)):
    from app.models.user import UserRole
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current_user


def _perm(user):
    """Return effective permission object.
    Priority: admin > merged RBAC roles > legacy UserPermission > full-access default.
    Role merging: any True wins for flags; read_only=False if any role allows writes;
    allowed_modem_ids=None (all) if any role has no restriction, else union of IDs.
    Approved SimAccessRequests are merged on top as additional device grants."""
    from app.models.user import UserRole
    from app.models.permission import UserPermission
    if user.role == UserRole.ADMIN:
        return UserPermission(
            can_view_sim=True, can_send_sms=True,
            can_manage_tasks=True, can_view_history=True,
            read_only=False, allowed_modem_ids=None,
        )
    roles = getattr(user, "rbac_roles", None)
    if roles:
        view_sim = any(r.can_view_sim for r in roles)
        send_sms = any(r.can_send_sms for r in roles)
        manage  = any(r.can_manage_tasks for r in roles)
        history = any(r.can_view_history for r in roles)
        ro      = all(r.read_only for r in roles)   # read_only only if ALL roles are read_only
        # Device scope: None means unrestricted; union IDs otherwise
        if any(r.allowed_modem_ids is None for r in roles):
            modem_ids = None
        else:
            modem_ids = list({mid for r in roles for mid in (r.allowed_modem_ids or [])}) or None
        base = UserPermission(
            can_view_sim=view_sim, can_send_sms=send_sms,
            can_manage_tasks=manage, can_view_history=history,
            read_only=ro, allowed_modem_ids=modem_ids,
        )
    else:
        p = user.permission
        if p is None:
            return None
        # Copy to avoid mutating the ORM object
        base = UserPermission(
            can_view_sim=p.can_view_sim, can_send_sms=p.can_send_sms,
            can_manage_tasks=p.can_manage_tasks, can_view_history=p.can_view_history,
            read_only=p.read_only,
            allowed_modem_ids=list(p.allowed_modem_ids) if p.allowed_modem_ids else p.allowed_modem_ids,
        )

    # Skip merging if user already has unrestricted send_sms
    if base.can_send_sms and base.allowed_modem_ids is None:
        return base

    # Merge approved (non-expired) sim access requests
    _merge_sim_grants(user.id, base)
    return base


def _merge_sim_grants(user_id: int, perm) -> None:
    """Query approved SimAccessRequests and merge modem IDs into perm in-place."""
    from app.models.sim_request import SimAccessRequest, RequestStatus
    from app.core.database import SessionLocal
    from datetime import datetime
    from sqlalchemy import or_

    now = datetime.utcnow()
    db = SessionLocal()
    try:
        approved_ids = [
            r.modem_id for r in db.query(SimAccessRequest.modem_id).filter(
                SimAccessRequest.user_id == user_id,
                SimAccessRequest.status == RequestStatus.APPROVED,
                or_(SimAccessRequest.expires_at.is_(None), SimAccessRequest.expires_at > now),
            ).all()
        ]
    finally:
        db.close()

    if not approved_ids:
        return

    perm.can_send_sms = True
    perm.can_manage_tasks = True
    if perm.allowed_modem_ids is None:
        # already unrestricted — no change needed
        pass
    else:
        perm.allowed_modem_ids = list(set(perm.allowed_modem_ids) | set(approved_ids))


def require_send_sms(current_user=Depends(get_current_user)):
    p = _perm(current_user)
    if not p or not p.can_send_sms:
        raise HTTPException(status_code=403, detail="无发送短信权限")
    if p.read_only:
        raise HTTPException(status_code=403, detail="当前账号为只读模式")
    return current_user


def require_manage_tasks(current_user=Depends(get_current_user)):
    p = _perm(current_user)
    if not p or not p.can_manage_tasks:
        raise HTTPException(status_code=403, detail="无定时任务管理权限")
    return current_user


def require_view_history(current_user=Depends(get_current_user)):
    p = _perm(current_user)
    if not p or not p.can_view_history:
        raise HTTPException(status_code=403, detail="无短信记录查看权限")
    return current_user


def is_support_staff(user) -> bool:
    """True for admin users or users with any RBAC role that has can_support=True."""
    from app.models.user import UserRole
    if user.role == UserRole.ADMIN:
        return True
    roles = getattr(user, "rbac_roles", None)
    if roles and any(r.can_support for r in roles):
        return True
    return False


def require_support_staff(current_user=Depends(get_current_user)):
    if not is_support_staff(current_user):
        raise HTTPException(status_code=403, detail="无客服权限")
    return current_user


def require_write(current_user=Depends(get_current_user)):
    p = _perm(current_user)
    if p and p.read_only:
        raise HTTPException(status_code=403, detail="当前账号为只读模式")
    return current_user
