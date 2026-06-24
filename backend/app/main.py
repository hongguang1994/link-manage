import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.security import hash_password
from app.models import user, permission  # ensure tables are created
from app.api import modems, sms
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.ws import router as ws_router
from app.services import modem_poller
from app.services.sms_scheduler import start as scheduler_start, stop as scheduler_stop

logging.basicConfig(level=logging.INFO)


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
app.include_router(users_router, prefix="/api")
app.include_router(modems.router, prefix="/api")
app.include_router(sms.router, prefix="/api")
app.include_router(ws_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
