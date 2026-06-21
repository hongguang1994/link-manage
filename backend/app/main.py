import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.api import modems, sms
from app.api.ws import router as ws_router
from app.services import modem_poller
from app.services.sms_scheduler import start as scheduler_start, stop as scheduler_stop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
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

app.include_router(modems.router, prefix="/api")
app.include_router(sms.router, prefix="/api")
app.include_router(ws_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
