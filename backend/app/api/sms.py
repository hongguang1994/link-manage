import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user, require_admin, require_view_history, get_user_modem_grants, _perm
from app.models.user import User, UserRole
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


def _require_use_grant(modem_id: int, user: User, db: Session):
    """Raise 403 if user doesn't have use-level grant for this modem."""
    if user.role == UserRole.ADMIN:
        return
    use_ids = get_user_modem_grants(user.id, db, level="use", user=user)
    if modem_id not in use_ids:
        raise HTTPException(status_code=403, detail="无该SIM卡的使用权限，请先申请")


def _user_visible_modem_ids(user: User, db: Session) -> Optional[List[int]]:
    """Returns list of modem IDs user can see in history/tasks, or None for admin."""
    if user.role == UserRole.ADMIN:
        return None
    return get_user_modem_grants(user.id, db, user=user)


# ── Direct send ────────────────────────────────────────────────────────────────

@router.post("/send", response_model=SmsMessageOut)
def send_sms(req: SmsSendRequest, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    modem = db.query(Modem).filter(Modem.id == req.modem_id).first()
    if not modem:
        raise HTTPException(status_code=404, detail="Modem not found")

    _require_use_grant(modem.id, me, db)

    obj_path = modem.mm_object_path or ""
    if obj_path.startswith("zte:"):
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
        if me.role == UserRole.ADMIN:
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
    me: User = Depends(get_current_user),
):
    q = db.query(SmsMessage)
    visible = _user_visible_modem_ids(me, db)
    if visible is not None:
        q = q.filter(SmsMessage.modem_id.in_(visible))
    if modem_id:
        q = q.filter(SmsMessage.modem_id == modem_id)
    if direction:
        q = q.filter(SmsMessage.direction == direction)
    return q.order_by(SmsMessage.created_at.desc()).offset(skip).limit(limit).all()


def _delete_from_modem(msg: SmsMessage, db: Session):
    """If inbound, also remove the SMS object from the physical modem."""
    if msg.direction != SmsDirection.INBOUND or msg.mm_sms_index is None:
        return
    modem = db.query(Modem).filter(Modem.id == msg.modem_id).first()
    if modem:
        modem_manager.delete_sms_from_modem(modem.mm_object_path, str(msg.mm_sms_index))


@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    msg = db.query(SmsMessage).filter(SmsMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="记录不存在")
    visible = _user_visible_modem_ids(me, db)
    if visible is not None and msg.modem_id not in visible:
        raise HTTPException(status_code=403, detail="无权限")
    _delete_from_modem(msg, db)
    db.delete(msg)
    db.commit()
    return {"ok": True}


@router.post("/messages/batch-delete")
def batch_delete_messages(
    body: dict,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    ids: List[int] = body.get("ids", [])
    if not ids:
        return {"deleted": 0}
    visible = _user_visible_modem_ids(me, db)
    q = db.query(SmsMessage).filter(SmsMessage.id.in_(ids))
    if visible is not None:
        q = q.filter(SmsMessage.modem_id.in_(visible))
    msgs = q.all()
    for msg in msgs:
        _delete_from_modem(msg, db)
    for msg in msgs:
        db.delete(msg)
    db.commit()
    return {"deleted": len(msgs)}


# ── Templates ──────────────────────────────────────────────────────────────────

@router.get("/templates", response_model=List[SmsTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return db.query(SmsTemplate).all()


@router.post("/templates", response_model=SmsTemplateOut)
def create_template(data: SmsTemplateCreate, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    tpl = SmsTemplate(**data.model_dump())
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    tpl = db.query(SmsTemplate).filter(SmsTemplate.id == template_id).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
    return {"ok": True}


# ── Scheduled tasks ────────────────────────────────────────────────────────────

def _task_to_out(task: SmsScheduledTask, db: Session) -> ScheduledTaskOut:
    data = ScheduledTaskOut.model_validate(task)
    if task.created_by_id:
        u = db.get(User, task.created_by_id)
        data.created_by_username = u.username if u else None
    return data


@router.get("/tasks", response_model=List[ScheduledTaskOut])
def list_tasks(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    q = db.query(SmsScheduledTask)
    if me.role != UserRole.ADMIN:
        visible = _user_visible_modem_ids(me, db)
        if visible is not None:
            q = q.filter(SmsScheduledTask.modem_id.in_(visible))
        q = q.filter(SmsScheduledTask.created_by_id == me.id)
    tasks = q.order_by(SmsScheduledTask.id.desc()).all()
    return [_task_to_out(t, db) for t in tasks]


@router.post("/tasks", response_model=ScheduledTaskOut)
def create_task(data: ScheduledTaskCreate, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    _require_use_grant(data.modem_id, me, db)
    cron = data.cron_expression.strip() if data.cron_expression else None
    if not cron and not data.send_once_at:
        raise HTTPException(status_code=400, detail="Provide cron_expression or send_once_at")
    dump = data.model_dump()
    dump['cron_expression'] = cron
    task = SmsScheduledTask(**dump, created_by_id=me.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    _schedule_task(task, db)
    return task


@router.patch("/tasks/{task_id}", response_model=ScheduledTaskOut)
def update_task(task_id: int, data: ScheduledTaskUpdate, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if me.role != UserRole.ADMIN and task.created_by_id != me.id:
        raise HTTPException(status_code=403, detail="无权修改此任务")
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


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if me.role != UserRole.ADMIN and task.created_by_id != me.id:
        raise HTTPException(status_code=403, detail="无权删除此任务")
    job_id = f"sms_task_{task.id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    db.delete(task)
    db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/run-now")
async def run_task_now(task_id: int, db: Session = Depends(get_db)):
    from app.services.sms_scheduler import execute_task
    task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await execute_task(task_id)
    return {"ok": True}


# ── Admin task monitoring ──────────────────────────────────────────────────────

@router.get("/admin/tasks", response_model=List[ScheduledTaskOut])
def admin_list_tasks(status: Optional[str] = None, user_id: Optional[int] = None, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    q = db.query(SmsScheduledTask)
    if me.role != UserRole.ADMIN:
        q = q.filter(SmsScheduledTask.created_by_id == me.id)
    else:
        if user_id:
            q = q.filter(SmsScheduledTask.created_by_id == user_id)
    if status:
        q = q.filter(SmsScheduledTask.status == status)
    return [_task_to_out(t, db) for t in q.order_by(SmsScheduledTask.id.desc()).all()]


@router.get("/admin/tasks/stats", response_model=TaskStatsOut)
def admin_task_stats(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    q = db.query(SmsScheduledTask)
    if me.role != UserRole.ADMIN:
        q = q.filter(SmsScheduledTask.created_by_id == me.id)
    all_tasks = q.all()
    return TaskStatsOut(
        total=len(all_tasks),
        active=sum(1 for t in all_tasks if t.status == TaskStatus.ACTIVE),
        paused=sum(1 for t in all_tasks if t.status == TaskStatus.PAUSED),
        completed=sum(1 for t in all_tasks if t.status == TaskStatus.COMPLETED),
        failed=sum(1 for t in all_tasks if t.status == TaskStatus.FAILED),
    )


@router.get("/admin/tasks/{task_id}/history", response_model=List[SmsMessageOut])
def admin_task_history(task_id: int, limit: int = 20, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if me.role != UserRole.ADMIN and task.created_by_id != me.id:
        raise HTTPException(status_code=403, detail="无权查看该任务")
    return (
        db.query(SmsMessage)
        .filter(SmsMessage.scheduled_task_id == task_id)
        .order_by(SmsMessage.created_at.desc())
        .limit(limit)
        .all()
    )
