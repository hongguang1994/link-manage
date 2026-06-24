"""Helper to write notifications from anywhere in the backend.

audience:
  'admin'  — only admin users see this
  'all'    — every logged-in user sees this
  'user'   — only the user with target_user_id sees this
"""
from app.core.database import SessionLocal
from app.models.notification import Notification


def push(
    type_: str,
    title: str,
    body: str = "",
    audience: str = "admin",
    target_user_id: int | None = None,
) -> None:
    db = SessionLocal()
    try:
        n = Notification(
            type=type_,
            title=title,
            body=body,
            audience=audience,
            target_user_id=target_user_id,
        )
        db.add(n)
        db.commit()
        # Keep at most 300 latest notifications
        ids = db.query(Notification.id).order_by(Notification.id.desc()).offset(300).all()
        if ids:
            db.query(Notification).filter(
                Notification.id.in_([r[0] for r in ids])
            ).delete(synchronize_session=False)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
