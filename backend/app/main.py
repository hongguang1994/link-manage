import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
# 显式导入所有 model 模块，确保 SQLAlchemy 在 create_all 前完成元数据注册
# 若省略这些导入，对应表将不会被 Base.metadata.create_all 创建
from app.models import user, support, notification
from app.models import role as role_model
from app.models import sim_request as sim_request_model
from app.api import modems, sms
from app.api.auth import router as auth_router
from app.api.captcha import router as captcha_router
from app.api.users import router as users_router
from app.api.roles import router as roles_router
from app.api.ws import router as ws_router
from app.api.support import router as support_router
from app.api.notifications import router as notifications_router
from app.api.sim_requests import router as sim_requests_router
from app.services import modem_poller
from app.services.sms_scheduler import start as scheduler_start, stop as scheduler_stop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all 必须在 scheduler/poller 启动前执行，确保表已存在
    # 无 Alembic 迁移：新字段需手动执行 migrate_*.py 脚本
    Base.metadata.create_all(bind=engine)
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
app.include_router(sim_requests_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
