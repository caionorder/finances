from __future__ import annotations

import logging
import subprocess
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import AccountAcl, AuditLog, Payable, Receivable, Recurrence, User
from app.models.enums import RecurrenceKind, UserRole
from app.schemas.recurrence import RecurrenceOut, RecurrenceUpdate

logger = logging.getLogger(__name__)


def _safe_day(year: int, month: int, target_day: int) -> int:
    last = monthrange(year, month)[1]
    return min(target_day, last)


def _coerce_until(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    return None


def compute_next_run_date(rule: dict, last_date: date) -> date | None:
    """Dado uma rule e a ultima data gerada, retorna a proxima.
    None se passou da `until` ou freq nao suportada.
    """
    freq = rule.get("freq")
    interval = int(rule.get("interval") or 1)

    if freq == "weekly":
        next_d = last_date + timedelta(days=7 * interval)
    elif freq == "monthly":
        m_index = last_date.month - 1 + interval
        year = last_date.year + m_index // 12
        month = m_index % 12 + 1
        target_day = int(rule.get("day") or last_date.day)
        next_d = date(year, month, _safe_day(year, month, target_day))
    elif freq == "yearly":
        target_year = last_date.year + interval
        target_month = int(rule.get("month") or last_date.month)
        target_day = int(rule.get("day") or last_date.day)
        next_d = date(
            target_year,
            target_month,
            _safe_day(target_year, target_month, target_day),
        )
    else:
        return None

    until = _coerce_until(rule.get("until"))
    if until and next_d > until:
        return None
    return next_d


def _entity_class(kind: RecurrenceKind | str):
    k = kind.value if isinstance(kind, RecurrenceKind) else kind
    return Payable if k == "payable" else Receivable


def generate_occurrence(db: Session, recurrence: Recurrence) -> object | None:
    """Cria a proxima Payable ou Receivable baseado no template + next_run_date.
    Avanca next_run_date e desativa a recurrence se passou da `until`.
    Retorna a entity criada ou None se nao deveria gerar.

    NOTA: nao chama db.commit(); o caller controla a transaction.
    """
    if not recurrence.is_active or not recurrence.next_run_date:
        return None
    template = recurrence.template_json or {}
    cls = _entity_class(recurrence.kind)

    entity = cls(
        description=template["description"],
        amount=Decimal(str(template["amount"])),
        currency_code=template["currency_code"],
        due_date=recurrence.next_run_date,
        account_id=template.get("account_id"),
        category_id=template.get("category_id"),
        notes=template.get("notes"),
        recurrence_id=recurrence.id,
        created_by_user_id=template.get("created_by_user_id"),
    )
    db.add(entity)
    db.flush()

    new_next = compute_next_run_date(recurrence.rule_json, recurrence.next_run_date)
    recurrence.next_run_date = new_next
    if new_next is None:
        recurrence.is_active = False
    db.flush()
    return entity


def materialize_horizon(db: Session, horizon_days: int = 90) -> int:
    """Job: para todas Recurrences ativas com next_run_date <= today + horizon,
    gera ate alcancar o horizonte. Retorna count de ocorrencias geradas.
    """
    horizon = date.today() + timedelta(days=horizon_days)
    count = 0
    recurrences = (
        db.query(Recurrence)
        .filter(
            Recurrence.is_active.is_(True),
            Recurrence.next_run_date.isnot(None),
            Recurrence.next_run_date <= horizon,
        )
        .all()
    )
    for rec in recurrences:
        # safety: limite por recurrence pra prevenir loop em rule degenerada
        max_iter = 365
        i = 0
        try:
            while (
                rec.is_active
                and rec.next_run_date is not None
                and rec.next_run_date <= horizon
                and i < max_iter
            ):
                generate_occurrence(db, rec)
                count += 1
                i += 1
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("materialize_horizon failed for recurrence %s", rec.id)
    return count


def mark_overdue(_db: Session) -> int:
    """Job: status `overdue` eh computed em runtime (due_date < today and paid_at null).
    Mantemos como hook pra futuro (notificacao). No-op hoje.
    """
    return 0


def _visible_account_ids(db: Session, user: User) -> list[int]:
    rows = db.execute(
        select(AccountAcl.account_id).where(AccountAcl.user_id == user.id)
    ).all()
    return [r[0] for r in rows]


def list_recurrences(
    db: Session,
    user: User,
    kind: RecurrenceKind | None = None,
    is_active: bool | None = None,
) -> list[RecurrenceOut]:
    """Admin ve todas. Member/viewer ve as criadas por si
    OU as cujo template aponta para uma account com ACL para o usuario.
    """
    stmt = select(Recurrence)
    if kind is not None:
        stmt = stmt.where(Recurrence.kind == kind)
    if is_active is not None:
        stmt = stmt.where(Recurrence.is_active.is_(is_active))
    if user.role != UserRole.admin:
        visible = _visible_account_ids(db, user)
        created_by_pred = (
            func.json_extract(Recurrence.template_json, "$.created_by_user_id")
            == user.id
        )
        if visible:
            account_pred = func.json_extract(
                Recurrence.template_json, "$.account_id"
            ).in_(visible)
            stmt = stmt.where(or_(created_by_pred, account_pred))
        else:
            stmt = stmt.where(created_by_pred)
    stmt = stmt.order_by(Recurrence.id.desc())
    rows = list(db.execute(stmt).scalars().all())
    return [RecurrenceOut.model_validate(r) for r in rows]


def get_recurrence(db: Session, user: User, recurrence_id: int) -> Recurrence:
    rec = db.get(Recurrence, recurrence_id)
    if rec is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="recurrence not found"
        )
    if user.role != UserRole.admin:
        tpl = rec.template_json or {}
        if tpl.get("created_by_user_id") != user.id:
            account_id = tpl.get("account_id")
            if account_id is None or db.get(AccountAcl, (account_id, user.id)) is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="no access to this recurrence",
                )
    return rec


def update_recurrence(
    db: Session, rec: Recurrence, payload: RecurrenceUpdate
) -> Recurrence:
    data = payload.model_dump(exclude_unset=True)
    rule_changed = False
    if "rule" in data and data["rule"] is not None:
        rec.rule_json = data["rule"]
        rule_changed = True
    if "template" in data and data["template"] is not None:
        merged = dict(rec.template_json or {})
        merged.update(data["template"])
        rec.template_json = merged
    if "next_run_date" in data:
        rec.next_run_date = data["next_run_date"]
    elif rule_changed:
        rec.next_run_date = compute_next_run_date(rec.rule_json, date.today())
    if "is_active" in data and data["is_active"] is not None:
        rec.is_active = data["is_active"]
    db.commit()
    db.refresh(rec)
    return rec


def deactivate(db: Session, rec: Recurrence) -> None:
    rec.is_active = False
    db.commit()


def generate_next_manual(db: Session, rec: Recurrence) -> object | None:
    if not rec.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="recurrence is inactive",
        )
    if rec.next_run_date is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="recurrence has no next_run_date",
        )
    entity = generate_occurrence(db, rec)
    db.commit()
    return entity


def notify_due_payables(db: Session) -> int:
    """Job diário: notifica payables vencendo em 0, 1 ou 3 dias via osascript.

    Idempotente: registra cada envio em audit_logs com action='payable_notification_sent'
    e evita reenviar o mesmo payable_id no mesmo dia civil.

    Args:
        db: SQLAlchemy session.

    Returns:
        Number of notifications successfully sent.
    """
    today = date.today()
    today_start = datetime(today.year, today.month, today.day, tzinfo=None)

    targets: list[tuple[Payable, int]] = []
    for offset in (0, 1, 3):
        target_date = today + timedelta(days=offset)
        items = (
            db.query(Payable)
            .filter(
                Payable.due_date == target_date,
                Payable.paid_at.is_(None),
            )
            .all()
        )
        for p in items:
            targets.append((p, offset))

    sent = 0
    for payable, offset in targets:
        already = (
            db.query(AuditLog)
            .filter(
                AuditLog.action == "payable_notification_sent",
                AuditLog.entity == "Payable",
                AuditLog.entity_id == payable.id,
                AuditLog.created_at >= today_start,
            )
            .first()
        )
        if already:
            logger.debug(
                "notify_due_payables: skip payable_id=%s already notified today",
                payable.id,
            )
            continue

        when = (
            "vence hoje"
            if offset == 0
            else f"vence em {offset} dia{'s' if offset > 1 else ''}"
        )
        title = f"\U0001f4b8 {payable.description}"
        body = f"{when} — {payable.currency_code} {payable.amount}"
        title_esc = title.replace('"', '\\"')
        body_esc = body.replace('"', '\\"')
        script = (
            f'display notification "{body_esc}" with title "{title_esc}" sound name "Submarine"'
        )
        try:
            subprocess.run(["osascript", "-e", script], timeout=5, check=False)
            logger.info(
                "notify_due_payables: sent notification payable_id=%s offset=%d due=%s",
                payable.id,
                offset,
                payable.due_date,
            )
        except Exception as exc:
            logger.warning(
                "notify_due_payables: osascript failed for payable_id=%s: %s",
                payable.id,
                exc,
            )
            continue

        log = AuditLog(
            action="payable_notification_sent",
            entity="Payable",
            entity_id=payable.id,
            user_id=None,
            payload_json={"offset": offset, "due_date": str(payable.due_date)},
        )
        db.add(log)
        sent += 1

    db.commit()
    logger.info("notify_due_payables: total_sent=%d", sent)
    return sent


__all__ = [
    "compute_next_run_date",
    "generate_occurrence",
    "materialize_horizon",
    "mark_overdue",
    "notify_due_payables",
    "list_recurrences",
    "get_recurrence",
    "update_recurrence",
    "deactivate",
    "generate_next_manual",
]
