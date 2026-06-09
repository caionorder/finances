from __future__ import annotations

import datetime as _dt
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

ALLOWED_MIMES: dict[str, str] = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
CHUNK_SIZE = 64 * 1024


def save_factura_file(
    upload: UploadFile,
    upload_dir: str,
    factura_date: _dt.date,
    content_length: int | None = None,
) -> tuple[str, str, int]:
    """Salva arquivo, retorna (relative_path, mime, size_bytes).

    Path layout: {upload_dir}/facturas/{year}/{mm:02d}/{uuid4hex}.{ext}
    Filename eh sempre uuid4 — nao usa nome original (anti path-traversal).
    """
    if content_length is not None and content_length > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"file too large (max {MAX_FILE_SIZE} bytes; got {content_length})",
        )

    if upload.content_type not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unsupported mime type: {upload.content_type}",
        )
    ext = ALLOWED_MIMES[upload.content_type]

    upload.file.seek(0, 2)
    size = upload.file.tell()
    upload.file.seek(0)
    if size <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="empty file"
        )
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"file too large (max {MAX_FILE_SIZE} bytes)",
        )

    rel_dir = f"facturas/{factura_date.year}/{factura_date.month:02d}"
    abs_dir = Path(upload_dir) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    name = f"{uuid.uuid4().hex}.{ext}"
    abs_path = abs_dir / name
    with open(abs_path, "wb") as f:
        while True:
            chunk = upload.file.read(CHUNK_SIZE)
            if not chunk:
                break
            f.write(chunk)

    rel_path = f"{rel_dir}/{name}"
    return rel_path, upload.content_type or "application/octet-stream", size


def save_invoice_pdf_bytes(
    data: bytes,
    upload_dir: str,
    issue_date: _dt.date,
) -> tuple[str, str, int]:
    """Persist generated invoice PDF bytes, return (relative_path, mime, size).

    Path layout: {upload_dir}/invoices/{year}/{mm:02d}/{uuid4hex}.pdf
    Filename is always a server-generated uuid4 (anti path-traversal; the path
    is never derived from user input — plan §7 L1). Mirrors the conventions of
    ``save_factura_file`` but takes raw bytes (the PDF is produced in-process by
    WeasyPrint, not uploaded).
    """
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="empty pdf"
        )
    size = len(data)
    if size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"file too large (max {MAX_FILE_SIZE} bytes)",
        )

    rel_dir = f"invoices/{issue_date.year}/{issue_date.month:02d}"
    abs_dir = Path(upload_dir) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    name = f"{uuid.uuid4().hex}.pdf"
    abs_path = abs_dir / name
    with open(abs_path, "wb") as f:
        f.write(data)

    rel_path = f"{rel_dir}/{name}"
    return rel_path, "application/pdf", size


def delete_factura_file(rel_path: str | None, upload_dir: str) -> None:
    if not rel_path:
        return
    abs_path = Path(upload_dir) / rel_path
    try:
        if abs_path.exists():
            abs_path.unlink()
    except OSError:
        # arquivo ausente / permissao — nao bloqueia delete logico
        return


__all__ = [
    "ALLOWED_MIMES",
    "MAX_FILE_SIZE",
    "save_factura_file",
    "save_invoice_pdf_bytes",
    "delete_factura_file",
]
