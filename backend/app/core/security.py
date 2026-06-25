from datetime import datetime, timedelta
from typing import Optional, List
# 直接使用 bcrypt，不用 passlib：passlib 在 Python 3.13 上有兼容性问题
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
    # User 模型在函数内导入以避免循环引用（security ← models ← security）
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

    多角色合并规则：
    - 正向标志（can_*）取并集（any）
    - read_only 取交集（all）：所有角色均只读才限制
    - allowed_modem_ids：仅考虑审批员角色的 modem_scope；
      任意一个审批员角色 scope 为空 → None（不限制）
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

    # modem_scope 来自 role_modem_scope 关联表（替代原 JSON allowed_modem_ids 列）
    # None = 不限制（审批员语义）；空列表 = 未配置范围（普通角色无自动授权）
    approver_roles = [r for r in roles if r.can_approve_requests]
    if approver_roles and any(not r.modem_scope for r in approver_roles):
        modem_ids = None   # 至少一个审批员角色无范围限制 → 全局权限
    elif approver_roles:
        modem_ids = list({m.id for r in approver_roles for m in r.modem_scope}) or None
    else:
        modem_ids = None   # 无审批员角色，此字段对普通角色无意义

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

    来源（取并集）：
    1. sim_grants 表中未过期的显式授权记录
    2. 审批员角色的 modem_scope（自动拥有使用权，无需提交申请）
    3. 普通角色配置了 modem_scope 时，scope 内的卡自动授权

    level=None → 任意权限（view 或 use）
    level='use' → 仅返回 use 级别的授权（用于发短信权限校验）

    注意：user 参数传入时才计算角色自动授权；WS 连接等场景必须传入 user
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
            scope_ids = [m.id for m in role.modem_scope]
            if role.can_approve_requests:
                if not scope_ids:
                    # Empty scope = unrestricted approver → all modems
                    all_ids = [r.id for r in db.query(Modem.id).all()]
                    grant_ids.update(all_ids)
                else:
                    grant_ids.update(scope_ids)
            elif scope_ids:
                # Non-approver roles: explicit scope = auto-grant those cards
                grant_ids.update(scope_ids)

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
