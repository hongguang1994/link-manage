import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models import user, permission, support, notification  # ensure tables are created
from app.models import role as role_model  # ensure roles table is created
from app.api import modems, sms
from app.api.auth import router as auth_router
from app.api.captcha import router as captcha_router
from app.api.users import router as users_router
from app.api.roles import router as roles_router
from app.api.ws import router as ws_router
from app.api.support import router as support_router
from app.api.notifications import router as notifications_router
from app.services import modem_poller
from app.services.sms_scheduler import start as scheduler_start, stop as scheduler_stop

logging.basicConfig(level=logging.INFO)


DEFAULT_ROLES = [
    {"name": "全功能用户", "description": "可使用所有功能，无设备限制", "is_system": True,
     "can_view_sim": True, "can_send_sms": True, "can_manage_tasks": True, "can_view_history": True,
     "read_only": False, "allowed_modem_ids": None},
    {"name": "只读用户", "description": "仅可查看，不可操作", "is_system": True,
     "can_view_sim": True, "can_send_sms": False, "can_manage_tasks": False, "can_view_history": True,
     "read_only": True, "allowed_modem_ids": None},
    {"name": "短信操作员", "description": "可发送短信，查看记录，不可管理任务", "is_system": True,
     "can_view_sim": True, "can_send_sms": True, "can_manage_tasks": False, "can_view_history": True,
     "read_only": False, "allowed_modem_ids": None},
    {"name": "任务管理员", "description": "可管理定时任务，可查看记录", "is_system": True,
     "can_view_sim": True, "can_send_sms": True, "can_manage_tasks": True, "can_view_history": True,
     "read_only": False, "can_support": False, "allowed_modem_ids": None},
    {"name": "客服", "description": "可查看并回复用户咨询，无其他管理权限", "is_system": True,
     "can_view_sim": False, "can_send_sms": False, "can_manage_tasks": False, "can_view_history": False,
     "read_only": True, "can_support": True, "allowed_modem_ids": None},
]


def _seed_default_roles():
    from app.models.role import Role
    db = SessionLocal()
    try:
        for r in DEFAULT_ROLES:
            if not db.query(Role).filter(Role.name == r["name"]).first():
                db.add(Role(**r))
        db.commit()
    finally:
        db.close()


def _ensure_default_admin():
    from app.models.user import User, UserRole
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            admin = User(
                username="admin",
                password_hash=hash_password("admin123"),
                role=UserRole.ADMIN,
            )
            db.add(admin)
            db.commit()
            logging.getLogger(__name__).info("默认管理员账号已创建：admin / admin123")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _seed_default_roles()
    _ensure_default_admin()
    scheduler_start()
    poller_task = asyncio.create_task(modem_poller.start_polling())
    yield
    modem_poller.stop_polling()
    poller_task.cancel()
    scheduler_stop()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(captcha_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(roles_router, prefix="/api")
app.include_router(modems.router, prefix="/api")
app.include_router(sms.router, prefix="/api")
app.include_router(ws_router)
app.include_router(support_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
