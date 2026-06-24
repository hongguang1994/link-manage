import re
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_send_sms, require_manage_tasks, require_view_history, require_write
from app.models.user import User
from app.models.modem import Modem
from app.models.sms import SmsMessage, SmsTemplate, SmsScheduledTask, SmsDirection, SmsStatus, TaskStatus
from app.schemas.sms import (
    SmsSendRequest, SmsMessageOut,
    SmsTemplateCreate, SmsTemplateOut,
    ScheduledTaskCreate, ScheduledTaskUpdate, ScheduledTaskOut, TaskStatsOut,
)
from app.services import modem_manager
from app.services.sms_scheduler import scheduler, _schedule_task
from app.services.notify import push

router = APIRouter(prefix="/sms", tags=["sms"], dependencies=[Depends(get_current_user)])


# ── Direct send ────────────────────────────────────────────────────────────────

@router.post("/send", response_model=SmsMessageOut, dependencies=[Depends(require_send_sms)])
def send_sms(req: SmsSendRequest, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
    if not modem:
        raise HTTPException(status_code=404, detail="Modem not found")

    obj_path = modem.mm_object_path or ""
    if obj_path.startswith("zte:"):
        # ZTE HTTP driver
        try:
            from app.services import zte_http_modem as _zte
            success = _zte.send_sms(req.phone_number, req.content)
            message = "" if success else "ZTE device returned failure"
        except Exception as exc:
            success, message = False, str(exc)
    else:
        match = re.search(r"/Modem/(\d+)$", obj_path)
        if not match:
            raise HTTPException(status_code=503, detail="Modem not available")
        mm_index = match.group(1)
        success, message = modem_manager.send_sms(mm_index, req.phone_number, req.content)
    sms = SmsMessage(
        modem_id=modem.id,
        direction=SmsDirection.OUTBOUND,
        phone_number=req.phone_number,
        content=req.content,
        status=SmsStatus.SENT if success else SmsStatus.FAILED,
        error_message=None if success else message,
        sent_at=datetime.utcnow() if success else None,
        created_by_id=me.id,
    )
    db.add(sms)
    db.commit()
    db.refresh(sms)
    if not success:
        body = f"发往 {req.phone_number} 的短信发送失败：{message}"
        modem_label = modem.alias or modem.model or f"设备#{modem.id}"
        if me.role.value == "admin":
            push("sms_failed", "短信发送失败", f"[{modem_label}] {body}", audience="admin")
        else:
            push("sms_failed", "短信发送失败", f"[{modem_label}] {body}",
                 audience="user", target_user_id=me.id)
        raise HTTPException(status_code=502, detail=f"SMS send failed: {message}")
    return sms


# ── Message history ────────────────────────────────────────────────────────────

@router.get("/messages", response_model=List[SmsMessageOut], dependencies=[Depends(require_view_history)])
def list_messages(
    modem_id: Optional[int] = None,
    direction: Optional[SmsDirection] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(SmsMessage)
    if modem_id:
        q = q.filter(SmsMessage.modem_id == modem_id)
    if direction:
        q = q.filter(SmsMessage.direction == direction)
    return q.order_by(SmsMessage.created_at.desc()).offset(skip).limit(limit).all()


# ── Templates ──────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[SmsTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.query(SmsTemplate).all()


@router.post("/templates", response_model=SmsTemplateOut, dependencies=[Depends(require_write)])
def create_template(data: SmsTemplateCreate, db: Session = Depends(get_db)):
    tpl = SmsTemplate(**data.model_dump())
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/templates/{template_id}", dependencies=[Depends(require_write)])
def delete_template(template_id: int, db: Session = Depends(get_db)):
    tpl = db.query(SmsTemplate).filter(SmsTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
    return {"ok": True}


# ── Scheduled tasks ────────────────────────────────────────────────────────────

def _task_to_out(task: SmsScheduledTask, db: Session) -> ScheduledTaskOut:
    """Attach creator username to task output."""
    data = ScheduledTaskOut.model_validate(task)
    if task.created_by_id:
        u = db.get(User, task.created_by_id)
        data.created_by_username = u.username if u else None
    return data


@router.get("/tasks", response_model=List[ScheduledTaskOut], dependencies=[Depends(require_manage_tasks)])
def list_tasks(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    from app.models.user import UserRole
    q = db.query(SmsScheduledTask)
    if me.role != UserRole.ADMIN:
        q = q.filter(SmsScheduledTask.created_by_id == me.id)
    tasks = q.order_by(SmsScheduledTask.id.desc()).all()
    return [_task_to_out(t, db) for t in tasks]


# ── Admin task monitoring ──────────────────────────────────────────────────────

@router.get("/admin/tasks", response_model=List[ScheduledTaskOut], dependencies=[Depends(require_admin)])
def admin_list_tasks(
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    from app.models.user import UserRole
    q = db.query(SmsScheduledTask)
    if status:
        q = q.filter(SmsScheduledTask.status == status)
    if user_id:
        q = q.filter(SmsScheduledTask.created_by_id == user_id)
    tasks = q.order_by(SmsScheduledTask.id.desc()).all()
    return [_task_to_out(t, db) for t in tasks]


@router.get("/admin/tasks/stats", response_model=TaskStatsOut, dependencies=[Depends(require_admin)])
def admin_task_stats(db: Session = Depends(get_db)):
    all_tasks = db.query(SmsScheduledTask).all()
    return TaskStatsOut(
        total=len(all_tasks),
        active=sum(1 for t in all_tasks if t.status == TaskStatus.ACTIVE),
        paused=sum(1 for t in all_tasks if t.status == TaskStatus.PAUSED),
        completed=sum(1 for t in all_tasks if t.status == TaskStatus.COMPLETED),
        failed=sum(1 for t in all_tasks if t.status == TaskStatus.FAILED),
    )


@router.get("/admin/tasks/{task_id}/history", response_model=List[SmsMessageOut], dependencies=[Depends(require_admin)])
def admin_task_history(task_id: int, limit: int = 20, db: Session = Depends(get_db)):
    return (
        db.query(SmsMessage)
        .filter(SmsMessage.scheduled_task_id == task_id)
        .order_by(SmsMessage.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/tasks", response_model=ScheduledTaskOut, dependencies=[Depends(require_manage_tasks), Depends(require_write)])
def create_task(data: ScheduledTaskCreate, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not data.cron_expression and not data.send_once_at:
        raise HTTPException(status_code=400, detail="Provide cron_expression or send_once_at")
    task = SmsScheduledTask(**data.model_dump(), created_by_id=me.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    _schedule_task(task, db)
    return task


@router.patch("/tasks/{task_id}", response_model=ScheduledTaskOut, dependencies=[Depends(require_manage_tasks), Depends(require_write)])
def update_task(task_id: int, data: ScheduledTaskUpdate, db: Session = Depends(get_db)):
    task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    job_id = f"sms_task_{task.id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if task.status == TaskStatus.ACTIVE:
        _schedule_task(task, db)
    return task


@router.delete("/tasks/{task_id}", dependencies=[Depends(require_manage_tasks), Depends(require_write)])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    job_id = f"sms_task_{task.id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    db.delete(task)
    db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/run-now")
async def run_task_now(task_id: int, db: Session = Depends(get_db)):
    """Trigger a scheduled task immediately."""
    from app.services.sms_scheduler import execute_task
    task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await execute_task(task_id)
    return {"ok": True}
