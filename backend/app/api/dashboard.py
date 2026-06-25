from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.sms import SmsMessage, SmsScheduledTask, SmsDirection, SmsStatus, TaskStatus

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = datetime.utcnow().date()
    seven_days_ago = today - timedelta(days=6)

    # SMS per day for last 7 days (all users, admin overview)
    sms_rows = (
        db.query(
            func.date(SmsMessage.created_at).label("day"),
            SmsMessage.status,
            func.count().label("cnt"),
        )
        .filter(
            SmsMessage.direction == SmsDirection.OUTBOUND,
            func.date(SmsMessage.created_at) >= seven_days_ago.isoformat(),
        )
        .group_by("day", SmsMessage.status)
        .all()
    )

    # Build day-keyed dict for last 7 days
    trend: dict[str, dict] = {}
    for i in range(7):
        d = (today - timedelta(days=6 - i)).isoformat()
        trend[d] = {"date": d, "sent": 0, "failed": 0}

    for row in sms_rows:
        day_str = str(row.day)
        if day_str in trend:
            if row.status == SmsStatus.SENT:
                trend[day_str]["sent"] = row.cnt
            elif row.status == SmsStatus.FAILED:
                trend[day_str]["failed"] = row.cnt

    # Month-to-date success rate
    month_start = today.replace(day=1).isoformat()
    month_rows = (
        db.query(SmsMessage.status, func.count().label("cnt"))
        .filter(
            SmsMessage.direction == SmsDirection.OUTBOUND,
            func.date(SmsMessage.created_at) >= month_start,
        )
        .group_by(SmsMessage.status)
        .all()
    )
    month_stats = {"sent": 0, "failed": 0, "pending": 0}
    for row in month_rows:
        if row.status == SmsStatus.SENT:
            month_stats["sent"] = row.cnt
        elif row.status == SmsStatus.FAILED:
            month_stats["failed"] = row.cnt
        else:
            month_stats["pending"] += row.cnt

    # Scheduled task status counts
    task_rows = (
        db.query(SmsScheduledTask.status, func.count().label("cnt"))
        .group_by(SmsScheduledTask.status)
        .all()
    )
    task_stats = {"active": 0, "paused": 0, "completed": 0, "failed": 0}
    for row in task_rows:
        task_stats[row.status] = row.cnt

    return {
        "sms_trend": list(trend.values()),
        "month_sms": month_stats,
        "tasks": task_stats,
    }
