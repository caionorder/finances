import base64
from datetime import date, datetime, time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_role
from app.models import AuditLog, User
from app.models.enums import UserRole
from app.schemas.audit import AuditLogOut
from app.schemas.common import CursorPage

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

require_admin = require_role(UserRole.admin)


def _encode_cursor(log_id: int) -> str:
    return base64.urlsafe_b64encode(str(log_id).encode("ascii")).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")
        return int(decoded)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid cursor"
        ) from exc


@router.get(
    "",
    response_model=CursorPage[AuditLogOut],
    dependencies=[Depends(require_admin)],
)
def list_audit_logs(
    db: Annotated[Session, Depends(get_db)],
    entity: str | None = None,
    entity_id: int | None = None,
    user_id: int | None = None,
    action: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    cursor: str | None = None,
    limit: int = Query(100, ge=1, le=500),
) -> CursorPage[AuditLogOut]:
    stmt = select(AuditLog, User.email.label("user_email")).outerjoin(
        User, User.id == AuditLog.user_id
    )

    if entity is not None:
        stmt = stmt.where(AuditLog.entity == entity)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    if from_date is not None:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(from_date, time.min))
    if to_date is not None:
        stmt = stmt.where(AuditLog.created_at <= datetime.combine(to_date, time.max))

    if cursor is not None:
        cursor_id = _decode_cursor(cursor)
        stmt = stmt.where(AuditLog.id < cursor_id)

    stmt = stmt.order_by(AuditLog.id.desc()).limit(limit + 1)
    rows = db.execute(stmt).all()

    has_next = len(rows) > limit
    rows = rows[:limit]

    items: list[AuditLogOut] = []
    for log, user_email in rows:
        items.append(
            AuditLogOut(
                id=log.id,
                user_id=log.user_id,
                user_email=user_email,
                action=log.action,
                entity=log.entity,
                entity_id=log.entity_id,
                payload_json=log.payload_json,
                created_at=log.created_at,
            )
        )

    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None
    return CursorPage[AuditLogOut](items=items, next_cursor=next_cursor, limit=limit)
