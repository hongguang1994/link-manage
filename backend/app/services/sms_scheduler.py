"""
APScheduler-based SMS task runner.
Loads active tasks from DB and fires them on schedule.
"""
import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.sms import SmsScheduledTask, SmsMessage, TaskStatus, SmsStatus, SmsDirection
from app.models.modem import Modem
from app.services import modem_manager

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def start():
    scheduler.start()
    scheduler.add_job(reload_tasks, "interval", seconds=60, id="task_reloader", replace_existing=True)
    reload_tasks()
    logger.info("SMS scheduler started")


def stop():
    scheduler.shutdown()


def reload_tasks():
    """Sync APScheduler jobs with DB tasks."""
    db = SessionLocal()
    try:
        tasks = db.query(SmsScheduledTask).filter(SmsScheduledTask.status == TaskStatus.ACTIVE).all()
        active_ids = set()
        for task in tasks:
            job_id = f"sms_task_{task.id}"
            active_ids.add(job_id)
            if scheduler.get_job(job_id):
                continue
            _schedule_task(task, db)
        # Remove jobs for deleted/paused tasks
        for job in scheduler.get_jobs():
            if job.id.startswith("sms_task_") and job.id not in active_ids:
                scheduler.remove_job(job.id)
    finally:
        db.close()


def _schedule_task(task: SmsScheduledTask, db: Session):
    job_id = f"sms_task_{task.id}"
    if task.cron_expression:
        trigger = CronTrigger.from_crontab(task.cron_expression)
    elif task.send_once_at:
        trigger = DateTrigger(run_date=task.send_once_at)
    else:
        logger.warning(f"Task {task.id} has no schedule, skipping")
        return

    job = scheduler.add_job(
        execute_task,
        trigger=trigger,
        args=[task.id],
        id=job_id,
        replace_existing=True,
    )
    if job.next_run_time:
        task.next_run_at = job.next_run_time.replace(tzinfo=None)
        db.commit()
    logger.info(f"Scheduled task {task.id} ({task.name})")


async def execute_task(task_id: int):
    db = SessionLocal()
    try:
        task = db.query(SmsScheduledTask).filter(SmsScheduledTask.id == task_id).first()
        if not task or task.status != TaskStatus.ACTIVE:
            return

        modem = db.query(Modem).filter(Modem.id == task.modem_id).first()
        if not modem or not modem.mm_object_path:
            logger.error(f"Task {task_id}: modem not found")
            return

        import re
        match = re.search(r"/Modem/(\d+)$", modem.mm_object_path)
        if not match:
            return
        mm_index = match.group(1)

        recipients = task.recipients if isinstance(task.recipients, list) else []
        for phone_number in recipients:
            success, message = modem_manager.send_sms(mm_index, phone_number, task.content)
            sms = SmsMessage(
                modem_id=modem.id,
                direction=SmsDirection.OUTBOUND,
                phone_number=phone_number,
                content=task.content,
                status=SmsStatus.SENT if success else SmsStatus.FAILED,
                error_message=None if success else message,
                sent_at=datetime.utcnow() if success else None,
                scheduled_task_id=task.id,
            )
            db.add(sms)

        task.last_run_at = datetime.utcnow()
        task.run_count = (task.run_count or 0) + 1
        if task.send_once_at:
            task.status = TaskStatus.COMPLETED
        db.commit()
        logger.info(f"Task {task_id} executed, sent to {len(recipients)} recipients")
    except Exception as e:
        logger.exception(f"Task {task_id} failed: {e}")
        db.rollback()
    finally:
        db.close()
