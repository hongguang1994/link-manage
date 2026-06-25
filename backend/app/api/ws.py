"""
WebSocket endpoint for real-time modem status push to frontend.
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from app.core.database import SessionLocal
from app.core.security import SECRET_KEY, ALGORITHM, get_user_modem_grants, _perm
from app.models.modem import Modem
from app.models.user import User, UserRole

router = APIRouter()
logger = logging.getLogger(__name__)
_clients: list[WebSocket] = []


@router.websocket("/ws/modems")
async def modem_status_ws(websocket: WebSocket, token: str = ""):
    # Validate JWT before accepting
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            await websocket.close(code=4001)
            return
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username, User.is_active == True).first()
            if not user:
                await websocket.close(code=4001)
                return
            is_admin = user.role == UserRole.ADMIN
            # Pre-compute visible modem IDs for non-admin users
            if not is_admin:
                visible_ids = set(get_user_modem_grants(user.id, db, user=user))
            else:
                visible_ids = None  # None = all
        finally:
            db.close()
    except JWTError:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    _clients.append(websocket)
    try:
        while True:
            db = SessionLocal()
            try:
                q = db.query(Modem)
                if visible_ids is not None:
                    q = q.filter(Modem.id.in_(visible_ids))
                modems = q.all()
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
    except Exception:
        pass
    finally:
        if websocket in _clients:
            _clients.remove(websocket)
