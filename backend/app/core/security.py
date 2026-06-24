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
    """Return permission object or a full-access default for admins."""
    from app.models.user import UserRole
    from app.models.permission import UserPermission
    if user.role == UserRole.ADMIN:
        return UserPermission(
            can_view_sim=True, can_send_sms=True,
            can_manage_tasks=True, can_view_history=True,
            read_only=False, allowed_modem_ids=None,
        )
    return user.permission


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


def require_write(current_user=Depends(get_current_user)):
    p = _perm(current_user)
    if p and p.read_only:
        raise HTTPException(status_code=403, detail="当前账号为只读模式")
    return current_user
