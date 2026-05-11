from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import CreditCardCycle, RefreshToken
from app.models.enums import CycleStatus
from app.services import recurrence_service

logger = logging.getLogger(__name__)


def _materialize_recurrences_job() -> None:
    db: Session = SessionLocal()
    try:
        count = recurrence_service.materialize_horizon(db, horizon_days=90)
        logger.info("materialize_recurrences: generated=%d", count)
    except Exception:
        db.rollback()
        logger.exception("materialize_recurrences: failed")
    finally:
        db.close()


def _notify_due_payables_job() -> None:
    db: Session = SessionLocal()
    try:
        sent = recurrence_service.notify_due_payables(db)
        logger.info("notify_due_payables: sent=%d", sent)
    except Exception:
        db.rollback()
        logger.exception("notify_due_payables: failed")
    finally:
        db.close()


def _close_cycles_job() -> None:
    db: Session = SessionLocal()
    try:
        today = date.today()
        cycles = list(
            db.execute(
                select(CreditCardCycle).where(
                    CreditCardCycle.status == CycleStatus.open,
                    CreditCardCycle.period_end < today,
                )
            )
            .scalars()
            .all()
        )
        for cycle in cycles:
            cycle.status = CycleStatus.closed
        db.commit()
        logger.info("close_cycles: closed=%d", len(cycles))
    except Exception:
        db.rollback()
        logger.exception("close_cycles: failed")
    finally:
        db.close()


def _refresh_fx_rates_job() -> None:
    db: Session = SessionLocal()
    try:
        from app.services import fx_service

        result = fx_service.refresh_rates(db)
        logger.info("refresh_fx_rates: %s", result)
    except Exception:
        db.rollback()
        logger.exception("refresh_fx_rates: failed")
    finally:
        db.close()


def _cleanup_refresh_tokens_job() -> None:
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        deleted = (
            db.query(RefreshToken)
            .filter(
                (RefreshToken.expires_at < now)
                | (RefreshToken.revoked_at.isnot(None))
            )
            .delete(synchronize_session=False)
        )
        db.commit()
        logger.info("cleanup_refresh_tokens: deleted=%d", deleted)
    except Exception:
        db.rollback()
        logger.exception("cleanup_refresh_tokens: failed")
    finally:
        db.close()


def start_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _materialize_recurrences_job,
        CronTrigger(hour=3, minute=0),
        id="materialize_recurrences",
        replace_existing=True,
    )
    scheduler.add_job(
        _close_cycles_job,
        CronTrigger(hour=3, minute=30),
        id="close_cycles",
        replace_existing=True,
    )
    scheduler.add_job(
        _cleanup_refresh_tokens_job,
        CronTrigger(hour=4, minute=0),
        id="cleanup_refresh_tokens",
        replace_existing=True,
    )
    scheduler.add_job(
        _refresh_fx_rates_job,
        CronTrigger(minute=0),
        id="refresh_fx_rates",
        replace_existing=True,
    )
    scheduler.add_job(
        _notify_due_payables_job,
        CronTrigger(hour=9, minute=0),
        id="notify_due_payables",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("scheduler started: 5 jobs registered")
    return scheduler


__all__ = ["start_scheduler"]
