"""
WebSocket endpoint for real-time modem status push to frontend.
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.modem import Modem

router = APIRouter()
logger = logging.getLogger(__name__)
_clients: list[WebSocket] = []


@router.websocket("/ws/modems")
async def modem_status_ws(websocket: WebSocket):
    await websocket.accept()
    _clients.append(websocket)
    try:
        while True:
            db = SessionLocal()
            try:
                modems = db.query(Modem).all()
                data = [
                    {
                        "id": m.id,
                        "alias": m.alias,
                        "device_path": m.device_path,
                        "operator": m.operator,
                        "signal_quality": m.signal_quality,
                        "status": m.status.value if m.status else "unknown",
                        "phone_number": m.phone_number,
                    }
                    for m in modems
                ]
                await websocket.send_text(json.dumps(data))
            finally:
                db.close()
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        _clients.remove(websocket)
