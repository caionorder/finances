from __future__ import annotations

import csv
import datetime as _dt
import zipfile
from calendar import monthrange
from decimal import Decimal, InvalidOperation
from io import BytesIO, StringIO
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_role
from app.core.rate_limit import limiter
from app.models import User
from app.models.enums import FacturaType, UserRole
from app.schemas.common import CursorPage
from app.schemas.factura import FacturaCreate, FacturaOut, FacturaUpdate
from app.services import factura_service
from app.services.file_storage import MAX_FILE_SIZE

router = APIRouter(prefix="/facturas", tags=["facturas"])
require_member_or_admin = require_role(UserRole.admin, UserRole.member)


def _enforce_content_length(request: Request) -> None:
    raw = request.headers.get("Content-Length")
    if not raw:
        return
    try:
        value = int(raw)
    except ValueError:
        return
    if value > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"request too large (max {MAX_FILE_SIZE} bytes; got {value})",
        )


def _parse_date(value: str, field: str) -> _dt.date:
    try:
        return _dt.date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid date format for '{field}' (expected YYYY-MM-DD)",
        ) from exc


def _parse_decimal(value: str, field: str) -> Decimal:
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid decimal for '{field}'",
        ) from exc


@router.get(
    "",
    response_model=CursorPage[FacturaOut],
    summary="List facturas (Paraguay-style invoices), cursor-paginated",
    description=(
        "Lists facturas the caller can see, optionally filtered by type, issue-date range, "
        "supplier name and a free-text search across number/ruc/supplier_name.\n\n"
        "A factura represents a fiscal invoice with discriminated IVA buckets (5%, 10%, "
        "exempt) — the canonical document for Paraguayan tax reporting.\n\n"
        "**Pagination**: pass the previous response's `next_cursor` back as `?cursor=...`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_facturas(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    type: FacturaType | None = Query(
        default=None,
        description="Filter by direction: `received` (suppliers' invoices to us) or `issued` (invoices we emitted).",
    ),
    date_from: _dt.date | None = Query(
        default=None,
        alias="from",
        description="Inclusive lower bound on the factura `date` (ISO YYYY-MM-DD).",
    ),
    date_to: _dt.date | None = Query(
        default=None,
        alias="to",
        description="Inclusive upper bound on the factura `date` (ISO YYYY-MM-DD).",
    ),
    supplier: str | None = Query(
        None,
        description="Case-insensitive substring match against `supplier_name`.",
    ),
    search: str | None = Query(
        None,
        description="Free-text search across number, RUC and supplier name (case-insensitive).",
    ),
    cursor: str | None = Query(
        None,
        description="Opaque cursor returned by the previous page's `next_cursor`.",
    ),
    limit: int = Query(50, ge=1, le=200, description="Max items per page (1-200)."),
) -> CursorPage[FacturaOut]:
    return factura_service.list_facturas(
        db,
        user,
        filters={
            "type": type,
            "date_from": date_from,
            "date_to": date_to,
            "supplier": supplier,
            "search": search,
        },
        cursor=cursor,
        limit=limit,
    )


@router.post(
    "",
    response_model=FacturaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member_or_admin)],
    summary="Create a factura with an optional PDF/image attachment",
    description=(
        "Creates a new factura. The request is **multipart/form-data** to accept an optional "
        "scanned document (`file`) alongside the structured fiscal fields.\n\n"
        "Fields:\n\n"
        "* `type` — `received` or `issued`.\n"
        "* `number` / `ruc` / `supplier_name` — fiscal identifiers.\n"
        "* `date` — issue date (ISO YYYY-MM-DD).\n"
        "* `total` — grand total as decimal string.\n"
        "* `iva_5`, `iva_10`, `exempt` — IVA buckets (Paraguay), defaulting to `0`.\n"
        "* `currency_code` — defaults to `PYG`.\n"
        "* `file` — optional PDF/image (max " + str(MAX_FILE_SIZE) + " bytes).\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`.\n\n"
        "The attached file is persisted under `UPLOAD_DIR` and can later be retrieved via "
        "`GET /facturas/{id}/download`."
    ),
    responses={
        201: {"description": "Factura created."},
        400: {"description": "Invalid date or decimal in a form field."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        413: {"description": "Uploaded file exceeds the configured size limit."},
        422: {"description": "Validation error (unknown type, malformed RUC, ...)."},
    },
)
def create_factura(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    type: Annotated[str, Form()],
    number: Annotated[str, Form()],
    ruc: Annotated[str, Form()],
    supplier_name: Annotated[str, Form()],
    date: Annotated[str, Form()],
    total: Annotated[str, Form()],
    iva_5: Annotated[str, Form()] = "0",
    iva_10: Annotated[str, Form()] = "0",
    exempt: Annotated[str, Form()] = "0",
    currency_code: Annotated[str, Form()] = "PYG",
    category_id: Annotated[int | None, Form()] = None,
    notes: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> FacturaOut:
    payload = FacturaCreate(
        type=type,  # type: ignore[arg-type]
        number=number,
        ruc=ruc,
        supplier_name=supplier_name,
        date=_parse_date(date, "date"),
        total=_parse_decimal(total, "total"),
        iva_5=_parse_decimal(iva_5, "iva_5"),
        iva_10=_parse_decimal(iva_10, "iva_10"),
        exempt=_parse_decimal(exempt, "exempt"),
        currency_code=currency_code,
        category_id=category_id,
        notes=notes,
    )
    upload = file if (file is not None and file.filename) else None
    factura = factura_service.create(db, payload, upload, user)
    return factura_service._to_out(factura)


@router.get(
    "/export",
    summary="Export a month of facturas as a ZIP (CSV + attached files)",
    description=(
        "Bundles all facturas falling inside the supplied calendar month into a single ZIP "
        "stream containing:\n\n"
        "1. `facturas-YYYY-MM.csv` — one row per factura with all fiscal columns.\n"
        "2. `arquivos/factura-<number>-<ruc>.<ext>` — the original attachment for each "
        "factura that has one. Slashes in number/RUC are sanitized to underscores.\n\n"
        "Use this endpoint to drive monthly tax submissions (e.g. SET in Paraguay).\n\n"
        "**Filter**: `type` may be `received`, `issued` or `all` (default `all`)."
    ),
    responses={
        200: {
            "description": "ZIP archive streamed.",
            "content": {"application/zip": {}},
        },
        400: {"description": "Invalid `month` (must be `YYYY-MM`) or unsupported `type`."},
        401: {"description": "Missing or invalid access token."},
    },
)
def export_facturas(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    month: Annotated[str, Query(pattern=r"^\d{4}-\d{2}$")],
    type_filter: Annotated[str, Query(alias="type")] = "all",
) -> StreamingResponse:
    if type_filter not in ("received", "issued", "all"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="type must be one of: received, issued, all",
        )
    year, mo = map(int, month.split("-"))
    if not (1 <= mo <= 12):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="invalid month"
        )

    start = _dt.date(year, mo, 1)
    end = _dt.date(year, mo, monthrange(year, mo)[1])

    facturas = factura_service.list_for_export(
        db,
        user,
        start=start,
        end=end,
        type_filter=FacturaType(type_filter) if type_filter != "all" else None,
    )

    sio = StringIO()
    writer = csv.writer(sio)
    writer.writerow(
        [
            "type",
            "number",
            "ruc",
            "supplier",
            "date",
            "total",
            "iva_5",
            "iva_10",
            "exempt",
            "currency",
            "category_id",
            "notes",
            "has_file",
        ]
    )
    for f in facturas:
        type_value = f.type.value if hasattr(f.type, "value") else f.type
        writer.writerow(
            [
                type_value,
                f.number,
                f.ruc,
                f.supplier_name,
                f.date.isoformat(),
                str(f.total),
                str(f.iva_5),
                str(f.iva_10),
                str(f.exempt),
                f.currency_code,
                f.category_id if f.category_id is not None else "",
                f.notes or "",
                "yes" if f.file_path else "no",
            ]
        )

    buf = BytesIO()
    upload_root = Path(settings.UPLOAD_DIR)
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"facturas-{month}.csv", sio.getvalue())
        for f in facturas:
            if not f.file_path:
                continue
            src = upload_root / f.file_path
            if not src.exists():
                continue
            ext = f.file_path.rsplit(".", 1)[-1] if "." in f.file_path else "bin"
            safe_number = f.number.replace("/", "_").replace("\\", "_")
            safe_ruc = f.ruc.replace("/", "_").replace("\\", "_")
            arcname = f"arquivos/factura-{safe_number}-{safe_ruc}.{ext}"
            zf.write(src, arcname=arcname)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="facturas-{month}.zip"'
        },
    )


@router.get(
    "/{factura_id}",
    response_model=FacturaOut,
    summary="Get a single factura by id",
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has no visibility on this factura."},
        404: {"description": "Factura not found."},
    },
)
def get_factura(
    factura_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FacturaOut:
    factura = factura_service.get(db, factura_id, user)
    return factura_service._to_out(factura)


@router.get(
    "/{factura_id}/download",
    summary="Download the original file attached to a factura",
    description=(
        "Streams the binary file (typically PDF or image) that was uploaded when the factura "
        "was created or updated. The response carries the original `Content-Type` (`file_mime`) "
        "and a filename derived from the factura number.\n\n"
        "Returns 404 if the factura has no `file_path`, or if the underlying file is missing "
        "on disk."
    ),
    responses={
        200: {
            "description": "Binary stream of the original attachment.",
            "content": {"application/octet-stream": {}, "application/pdf": {}, "image/*": {}},
        },
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has no visibility on this factura."},
        404: {"description": "Factura not found or has no attached file."},
    },
)
def download_factura(
    factura_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FileResponse:
    factura = factura_service.get(db, factura_id, user)
    if not factura.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="factura has no file"
        )
    abs_path = Path(settings.UPLOAD_DIR) / factura.file_path
    if not abs_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="file missing on disk"
        )
    ext = factura.file_path.rsplit(".", 1)[-1] if "." in factura.file_path else "bin"
    safe_number = factura.number.replace("/", "_").replace("\\", "_")
    return FileResponse(
        path=str(abs_path),
        media_type=factura.file_mime or "application/octet-stream",
        filename=f"factura-{safe_number}.{ext}",
    )


@router.patch(
    "/{factura_id}",
    response_model=FacturaOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Update fiscal fields and/or replace the attached file",
    description=(
        "Partial update via **multipart/form-data**. Any form field left out is preserved as-is. "
        "If `file` is supplied, the new upload replaces the previous attachment on disk; "
        "otherwise the existing file is kept.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        400: {"description": "Invalid date or decimal in a form field."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role or no visibility on the factura."},
        404: {"description": "Factura not found."},
        413: {"description": "Uploaded file exceeds the configured size limit."},
        422: {"description": "Validation error."},
    },
)
def update_factura(
    factura_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    type: Annotated[str | None, Form()] = None,
    number: Annotated[str | None, Form()] = None,
    ruc: Annotated[str | None, Form()] = None,
    supplier_name: Annotated[str | None, Form()] = None,
    date: Annotated[str | None, Form()] = None,
    total: Annotated[str | None, Form()] = None,
    iva_5: Annotated[str | None, Form()] = None,
    iva_10: Annotated[str | None, Form()] = None,
    exempt: Annotated[str | None, Form()] = None,
    category_id: Annotated[int | None, Form()] = None,
    notes: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> FacturaOut:
    factura = factura_service.get(db, factura_id, user)

    update_data: dict[str, object] = {}
    if type is not None:
        update_data["type"] = type
    if number is not None:
        update_data["number"] = number
    if ruc is not None:
        update_data["ruc"] = ruc
    if supplier_name is not None:
        update_data["supplier_name"] = supplier_name
    if date is not None:
        update_data["date"] = _parse_date(date, "date")
    if total is not None:
        update_data["total"] = _parse_decimal(total, "total")
    if iva_5 is not None:
        update_data["iva_5"] = _parse_decimal(iva_5, "iva_5")
    if iva_10 is not None:
        update_data["iva_10"] = _parse_decimal(iva_10, "iva_10")
    if exempt is not None:
        update_data["exempt"] = _parse_decimal(exempt, "exempt")
    if category_id is not None:
        update_data["category_id"] = category_id
    if notes is not None:
        update_data["notes"] = notes

    payload = FacturaUpdate.model_validate(update_data)
    upload = file if (file is not None and file.filename) else None
    factura = factura_service.update(db, factura, payload, upload)
    return factura_service._to_out(factura)


@router.delete(
    "/{factura_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_member_or_admin)],
    summary="Delete a factura (and its attachment)",
    description=(
        "Permanently removes a factura record and the on-disk file it points to (if any).\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        204: {"description": "Factura and any attached file removed."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role or no visibility on the factura."},
        404: {"description": "Factura not found."},
    },
)
def delete_factura(
    factura_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    factura = factura_service.get(db, factura_id, user)
    factura_service.delete(db, factura)
