from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, get_current_user
from app.models.user import User
from app.schemas.user import LoginRequest, TokenResponse, UserOut
from app.api.captcha import verify as verify_captcha

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginWithCaptcha(BaseModel):
    username: str
    password: str
    captcha_token: Optional[str] = None
    captcha_code: Optional[str] = None


@router.post("/login", response_model=TokenResponse)
def login(data: LoginWithCaptcha, db: Session = Depends(get_db)):
    if data.captcha_token and data.captcha_code is not None:
        verify_captcha(data.captcha_token, data.captcha_code)
    elif data.captcha_token or data.captcha_code is not None:
        # one is missing — treat as wrong captcha
        raise HTTPException(status_code=400, detail="验证码错误")
    user = db.query(User).filter(User.username == data.username, User.is_active == True).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    token = create_access_token({"sub": user.username})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
