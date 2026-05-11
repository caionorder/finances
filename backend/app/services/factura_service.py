from __future__ import annotations

import base64
import logging
from datetime import date as _date
from typing import TypedDict

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Category, Factura, User
from app.models.enums import FacturaType, UserRole
from app.schemas.common import CursorPage
from app.schemas.factura import (
    FacturaCreate,
    FacturaOut,
    FacturaUpdate,
    _validate_ruc,
)
from app.services._search import escape_like
from app.services.file_storage import delete_factura_file, save_factura_file

logger = logging.getLogger(__name__)


class FacturaFilters(TypedDict, total=False):
    type: FacturaType | None
    date_from: object  # _date | None
    date_to: object
    supplier: str | None
    search: str | None


def _encode_cursor(factura_id: int) -> str:
    return base64.urlsafe_b64encode(str(factura_id).encode("ascii")).decode("ascii")


def _decode_cursor(cursor: str) -> int:
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("ascii")
        return int(decoded)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid cursor"
        ) from exc


def _to_out(f: Factura) -> FacturaOut:
    return FacturaOut(
        id=f.id,
        type=f.type.value if hasattr(f.type, "value") else f.type,
        number=f.number,
        ruc=f.ruc,
        supplier_name=f.supplier_name,
        date=f.date,
        total=f.total,
        iva_5=f.iva_5,
        iva_10=f.iva_10,
        exempt=f.exempt,
        currency_code=f.currency_code,
        category_id=f.category_id,
        notes=f.notes,
        file_path=f.file_path,
        file_mime=f.file_mime,
        file_size=f.file_size,
        has_file=f.file_path is not None,
        created_at=f.created_at,
        updated_at=f.updated_at,
    )


def list_facturas(
    db: Session,
    user: User,
    filters: FacturaFilters,
    cursor: str | None,
    limit: int,
) -> CursorPage[FacturaOut]:
    """List facturas.

    Visibility: admin and member roles see all facturas (shared fiscal artefacts).
    Viewer sees only what they created (defensive default for the lowest-privilege role).
    Write operations (create/update/delete) remain gated on member+admin via the API layer.
    """
    stmt = select(Factura)

    if user.role == UserRole.viewer:
        stmt = stmt.where(Factura.created_by_user_id == user.id)

    if filters.get("type") is not None:
        stmt = stmt.where(Factura.type == filters["type"])
    if filters.get("date_from") is not None:
        stmt = stmt.where(Factura.date >= filters["date_from"])
    if filters.get("date_to") is not None:
        stmt = stmt.where(Factura.date <= filters["date_to"])
    supplier = filters.get("supplier")
    if supplier:
        escaped = escape_like(supplier)
        stmt = stmt.where(
            Factura.supplier_name.like(f"%{escaped}%", escape="\\")
        )
    search = filters.get("search")
    if search:
        escaped = escape_like(search)
        like = f"%{escaped}%"
        stmt = stmt.where(
            Factura.number.like(like, escape="\\")
            | Factura.ruc.like(like, escape="\\")
            | Factura.supplier_name.like(like, escape="\\")
            | Factura.notes.like(like, escape="\\")
        )

    if cursor is not None:
        cursor_id = _decode_cursor(cursor)
        stmt = stmt.where(Factura.id < cursor_id)

    stmt = stmt.order_by(Factura.id.desc()).limit(limit + 1)
    rows = list(db.execute(stmt).scalars().all())

    has_next = len(rows) > limit
    items = rows[:limit]
    next_cursor = _encode_cursor(items[-1].id) if has_next and items else None

    return CursorPage[FacturaOut](
        items=[_to_out(f) for f in items],
        next_cursor=next_cursor,
        limit=limit,
    )


def _check_ownership(factura: Factura, user: User) -> None:
    """Admin and member can read any factura. Viewer can only read what they created."""
    if user.role in (UserRole.admin, UserRole.member):
        return
    if factura.created_by_user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="no access to this factura"
        )


def get(db: Session, factura_id: int, user: User) -> Factura:
    factura = db.get(Factura, factura_id)
    if factura is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="factura not found"
        )
    _check_ownership(factura, user)
    return factura


def list_for_export(
    db: Session,
    user: User,
    *,
    start: _date,
    end: _date,
    type_filter: FacturaType | None,
) -> list[Factura]:
    stmt = select(Factura).where(Factura.date >= start, Factura.date <= end)
    if user.role == UserRole.viewer:
        stmt = stmt.where(Factura.created_by_user_id == user.id)
    if type_filter is not None:
        stmt = stmt.where(Factura.type == type_filter)
    stmt = stmt.order_by(Factura.date.asc(), Factura.id.asc())
    return list(db.execute(stmt).scalars().all())


def _check_category(db: Session, category_id: int | None) -> None:
    if category_id is None:
        return
    cat = db.get(Category, category_id)
    if cat is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="category not found"
        )


def _maybe_warn_invalid_ruc(ruc: str) -> None:
    if not _validate_ruc(ruc):
        logger.warning("factura ruc failed mod-11 check (accepted): %s", ruc)


def create(
    db: Session,
    payload: FacturaCreate,
    file: UploadFile | None,
    user: User,
) -> Factura:
    _maybe_warn_invalid_ruc(payload.ruc)
    _check_category(db, payload.category_id)

    # checagem de duplicidade aplicacional (alem do UNIQUE no DB) — 409 amigavel
    existing = db.execute(
        select(Factura.id).where(
            Factura.type == FacturaType(payload.type),
            Factura.number == payload.number,
            Factura.ruc == payload.ruc,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="factura with same (type, number, ruc) already exists",
        )

    rel_path: str | None = None
    file_mime: str | None = None
    file_size: int | None = None
    if file is not None:
        rel_path, file_mime, file_size = save_factura_file(
            file, settings.UPLOAD_DIR, payload.date
        )

    factura = Factura(
        type=FacturaType(payload.type),
        number=payload.number,
        ruc=payload.ruc,
        supplier_name=payload.supplier_name,
        date=payload.date,
        total=payload.total,
        iva_5=payload.iva_5,
        iva_10=payload.iva_10,
        exempt=payload.exempt,
        currency_code=payload.currency_code,
        category_id=payload.category_id,
        notes=payload.notes,
        file_path=rel_path,
        file_mime=file_mime,
        file_size=file_size,
        created_by_user_id=user.id,
    )
    try:
        db.add(factura)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if rel_path is not None:
            delete_factura_file(rel_path, settings.UPLOAD_DIR)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="factura with same (type, number, ruc) already exists",
        ) from exc
    except Exception:
        db.rollback()
        if rel_path is not None:
            delete_factura_file(rel_path, settings.UPLOAD_DIR)
        raise

    db.refresh(factura)
    return factura


def update(
    db: Session,
    factura: Factura,
    payload: FacturaUpdate,
    file: UploadFile | None,
) -> Factura:
    data = payload.model_dump(exclude_unset=True)

    if "ruc" in data and data["ruc"] is not None:
        _maybe_warn_invalid_ruc(data["ruc"])
    if "category_id" in data:
        _check_category(db, data["category_id"])

    new_type = FacturaType(data["type"]) if "type" in data and data["type"] else factura.type
    new_number = data.get("number") or factura.number
    new_ruc = data.get("ruc") or factura.ruc
    if (
        ("type" in data and FacturaType(data["type"]) != factura.type)
        or ("number" in data and data["number"] is not None and data["number"] != factura.number)
        or ("ruc" in data and data["ruc"] is not None and data["ruc"] != factura.ruc)
    ):
        clash = db.execute(
            select(Factura.id).where(
                Factura.type == new_type,
                Factura.number == new_number,
                Factura.ruc == new_ruc,
                Factura.id != factura.id,
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="factura with same (type, number, ruc) already exists",
            )

    old_rel_path = factura.file_path
    new_rel_path: str | None = None
    if file is not None:
        target_date = data.get("date") or factura.date
        new_rel_path, new_mime, new_size = save_factura_file(
            file, settings.UPLOAD_DIR, target_date
        )
        factura.file_path = new_rel_path
        factura.file_mime = new_mime
        factura.file_size = new_size

    if "type" in data and data["type"] is not None:
        factura.type = FacturaType(data["type"])
    for fld in ("number", "ruc", "supplier_name", "date", "total", "iva_5", "iva_10", "exempt", "category_id", "notes"):
        if fld in data:
            setattr(factura, fld, data[fld])

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if new_rel_path is not None:
            delete_factura_file(new_rel_path, settings.UPLOAD_DIR)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="factura with same (type, number, ruc) already exists",
        ) from exc
    except Exception:
        db.rollback()
        if new_rel_path is not None:
            delete_factura_file(new_rel_path, settings.UPLOAD_DIR)
        raise

    if file is not None and old_rel_path and old_rel_path != new_rel_path:
        delete_factura_file(old_rel_path, settings.UPLOAD_DIR)

    db.refresh(factura)
    return factura


def delete(db: Session, factura: Factura) -> None:
    rel_path = factura.file_path
    try:
        db.delete(factura)
        db.commit()
    except Exception:
        db.rollback()
        raise
    delete_factura_file(rel_path, settings.UPLOAD_DIR)


__all__ = [
    "list_facturas",
    "list_for_export",
    "get",
    "create",
    "update",
    "delete",
]
