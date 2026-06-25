from datetime import datetime, timedelta
from typing import Optional, List
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from sqlalchemy import or_
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
    """Return merged permission dict from user's RBAC roles.
    Admin users bypass all checks — callers should check user.role == ADMIN first.
    Returns None if user has no roles assigned.
    """
    from app.models.user import UserRole
    if user.role == UserRole.ADMIN:
        return {
            "can_view_sim": True,
            "can_approve_requests": True,
            "can_view_history": True,
            "can_support": True,
            "read_only": False,
            "allowed_modem_ids": None,
        }
    roles = getattr(user, "rbac_roles", None) or []
    if not roles:
        return None

    if any(r.allowed_modem_ids is None for r in roles):
        modem_ids = None
    else:
        modem_ids = list({mid for r in roles for mid in (r.allowed_modem_ids or [])}) or None

    return {
        "can_view_sim":         any(r.can_view_sim for r in roles),
        "can_approve_requests": any(r.can_approve_requests for r in roles),
        "can_view_history":     any(r.can_view_history for r in roles),
        "can_support":          any(r.can_support for r in roles),
        "read_only":            all(r.read_only for r in roles),
        "allowed_modem_ids":    modem_ids,
    }


def get_user_modem_grants(user_id: int, db: Session, level: Optional[str] = None, user=None) -> List[int]:
    """Return modem IDs the user has access to.
    Queries sim_grants (current effective grants) plus role-based auto-grants.
    level=None → any grant (view or use)
    level='use' → only use-level grants
    """
    from app.models.sim_request import SimGrant, PermissionLevel
    from app.models.modem import Modem
    now = datetime.utcnow()
    q = db.query(SimGrant.modem_id).filter(
        SimGrant.user_id == user_id,
        or_(SimGrant.expires_at.is_(None), SimGrant.expires_at > now),
    )
    if level == "use":
        q = q.filter(SimGrant.granted_level == PermissionLevel.USE)
    grant_ids = set(r.modem_id for r in q.all())

    if user is not None:
        roles = getattr(user, "rbac_roles", None) or []
        for role in roles:
            if role.can_approve_requests:
                # Approvers automatically have use-level access to their managed cards
                if role.allowed_modem_ids is None:
                    all_ids = [r.id for r in db.query(Modem.id).all()]
                    grant_ids.update(all_ids)
                else:
                    grant_ids.update(role.allowed_modem_ids)
            elif role.allowed_modem_ids is not None:
                # Non-approver roles: explicit allowed_modem_ids = auto-grant access to those cards
                grant_ids.update(role.allowed_modem_ids)

    return list(grant_ids)


def require_approve_requests(current_user=Depends(get_current_user)):
    from app.models.user import UserRole
    if current_user.role == UserRole.ADMIN:
        return current_user
    p = _perm(current_user)
    if not p or not p.get("can_approve_requests"):
        raise HTTPException(status_code=403, detail="无审批权限")
    return current_user


def require_view_history(current_user=Depends(get_current_user)):
    from app.models.user import UserRole
    if current_user.role == UserRole.ADMIN:
        return current_user
    p = _perm(current_user)
    if not p or not p.get("can_view_history"):
        raise HTTPException(status_code=403, detail="无短信记录查看权限")
    return current_user


def is_support_staff(user) -> bool:
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
