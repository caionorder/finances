from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db, require_role
from app.core.rate_limit import limiter
from app.models import User
from app.models.enums import UserRole
from app.schemas.common import CursorPage
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceFromContractRequest,
    InvoiceOut,
    InvoiceOutstandingSummary,
    InvoiceStatusFilter,
    InvoiceUpdate,
    MarkReceivedRequest,
    VoidInvoiceRequest,
)
from app.services import invoice_service

router = APIRouter(prefix="/invoices", tags=["invoices"])
require_member_or_admin = require_role(UserRole.admin, UserRole.member)


# ---------------------------------------------------------------------------
# 1. List
# ---------------------------------------------------------------------------
@router.get(
    "",
    response_model=CursorPage[InvoiceOut],
    summary="List commercial invoices (cursor-paginated)",
    description=(
        "Lists commercial invoices.\n\n"
        "**Visibility**: any authenticated user can read (global visibility — decision #6).\n\n"
        "**Status filter** accepts a stored status (`draft`, `issued`, `sent`, `paid`, `void`) "
        "or the derived `overdue` bucket (issued/sent invoices past due date with an unsettled "
        "receivable). Filter further by `customer_id`, a `due_date` range and a `search` over "
        "the invoice number.\n\n"
        "Pass the previous response's `next_cursor` back as `?cursor=...`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def list_invoices(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    status_: InvoiceStatusFilter | None = Query(
        None,
        alias="status",
        description="Restrict to one status bucket (incl. derived `overdue`).",
    ),
    customer_id: int | None = Query(None, description="Restrict to a single customer."),
    from_due_date: date | None = Query(
        None, alias="from", description="Inclusive lower bound on `due_date` (ISO YYYY-MM-DD)."
    ),
    to_due_date: date | None = Query(
        None, alias="to", description="Inclusive upper bound on `due_date` (ISO YYYY-MM-DD)."
    ),
    search: str | None = Query(
        None, description="Case-insensitive search over the invoice number."
    ),
    cursor: str | None = Query(
        None, description="Opaque cursor from the previous page's `next_cursor`."
    ),
    limit: int = Query(50, ge=1, le=200, description="Max items per page (1-200)."),
) -> CursorPage[InvoiceOut]:
    return invoice_service.list_invoices(
        db,
        user,
        status_filter=status_,
        customer_id=customer_id,
        from_due_date=from_due_date,
        to_due_date=to_due_date,
        search=search,
        cursor=cursor,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# 13. Outstanding summary (declared before /{invoice_id})
# ---------------------------------------------------------------------------
@router.get(
    "/outstanding-summary",
    response_model=InvoiceOutstandingSummary,
    summary="Aging summary of outstanding invoices",
    description=(
        "Aggregates the net receivable amounts of issued/sent invoices whose linked receivable "
        "is still unsettled, split into `current`, `due_today` and `overdue` buckets. All "
        "amounts are USD."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
    },
)
def outstanding_summary(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOutstandingSummary:
    return invoice_service.outstanding_summary(db, user)


# ---------------------------------------------------------------------------
# 2. Create draft
# ---------------------------------------------------------------------------
@router.post(
    "",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member_or_admin)],
    summary="Create a draft invoice",
    description=(
        "Creates a draft invoice with its line items. Totals are computed server-side "
        "(authoritative). The invoice stays mutable until issued.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        201: {"description": "Draft invoice created."},
        400: {"description": "Referenced customer/contract does not exist."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        422: {"description": "Validation error."},
    },
)
def create_invoice(
    payload: InvoiceCreate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.create_draft(db, payload, user)
    return invoice_service.to_out(invoice, db)


# ---------------------------------------------------------------------------
# 3. Create draft from a contract
# ---------------------------------------------------------------------------
@router.post(
    "/from-contract",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member_or_admin)],
    summary="Create a draft invoice pre-filled from a contract",
    description=(
        "Seeds a draft invoice from an active contract: copies the customer, currency, terms, "
        "discount and tax defaults, seeds one line item from the contract scope/rate, sets the "
        "due date to `today + payment_terms_days` (overridable) and advances the contract's "
        "`next_period_start`.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        201: {"description": "Draft invoice created from contract."},
        400: {"description": "Contract not found or not active."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        422: {"description": "Validation error."},
    },
)
def create_invoice_from_contract(
    payload: InvoiceFromContractRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.create_from_contract(db, payload, user)
    return invoice_service.to_out(invoice, db)


# ---------------------------------------------------------------------------
# 4. Get detail
# ---------------------------------------------------------------------------
@router.get(
    "/{invoice_id}",
    response_model=InvoiceOut,
    summary="Get a single invoice by id",
    description="Returns the full invoice with line items. Readable by any authenticated user.",
    responses={
        401: {"description": "Missing or invalid access token."},
        404: {"description": "Invoice not found."},
    },
)
def get_invoice(
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.get(db, user, invoice_id)
    return invoice_service.to_out(invoice, db)


# ---------------------------------------------------------------------------
# 5. Patch (draft only)
# ---------------------------------------------------------------------------
@router.patch(
    "/{invoice_id}",
    response_model=InvoiceOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Update a draft invoice (header + replace line items)",
    description=(
        "Updates header fields and, if `line_items` is provided, **replaces** all line items. "
        "Totals are recomputed server-side. Allowed only while the invoice is `draft` (409 "
        "otherwise). Server-assigned fields (number, status, totals, issued_at) are never "
        "settable here.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Invoice not found."},
        409: {"description": "Invoice is not in 'draft' status."},
        422: {"description": "Validation error."},
    },
)
def update_invoice(
    invoice_id: int,
    payload: InvoiceUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.get(db, user, invoice_id)
    updated = invoice_service.update_draft(db, invoice, payload, user)
    return invoice_service.to_out(updated, db)


# ---------------------------------------------------------------------------
# 6. Delete (draft only)
# ---------------------------------------------------------------------------
@router.delete(
    "/{invoice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_member_or_admin)],
    summary="Delete a draft invoice",
    description=(
        "Hard-deletes a draft invoice (and its line items via cascade). Allowed only while "
        "the invoice is `draft` (409 otherwise — issued invoices are voided, not deleted).\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        204: {"description": "Draft invoice deleted."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Invoice not found."},
        409: {"description": "Invoice is not in 'draft' status."},
    },
)
def delete_invoice(
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    invoice = invoice_service.get(db, user, invoice_id)
    invoice_service.delete_draft(db, invoice, user)


# ---------------------------------------------------------------------------
# 7. Issue
# ---------------------------------------------------------------------------
@router.post(
    "/{invoice_id}/issue",
    response_model=InvoiceOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Issue a draft invoice",
    description=(
        "Issues a draft invoice. This:\n\n"
        "1. freezes the totals and snapshots the bank receiving fee;\n"
        "2. allocates the next invoice number (`INV-NNNNNN`);\n"
        "3. freezes the issuer + customer/contract snapshots;\n"
        "4. creates a pending net-amount `Receivable` (`total - bank_fee`) on the issuer's "
        "receiving account;\n"
        "5. attempts to render the PDF (graceful-degrade — the invoice is still issued if the "
        "renderer is unavailable);\n"
        "6. flips status to `issued`.\n\n"
        "Requires a configured issuer profile with a non-archived USD `receiving_account_id` and "
        "at least one line item.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        200: {"description": "Invoice issued."},
        400: {"description": "No line items, or issuer profile/receiving account misconfigured."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Invoice not found."},
        409: {"description": "Invoice is not in 'draft' status."},
    },
)
def issue_invoice(
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.get(db, user, invoice_id)
    issued = invoice_service.issue(db, invoice, user)
    return invoice_service.to_out(issued, db)


# ---------------------------------------------------------------------------
# 8. Mark sent
# ---------------------------------------------------------------------------
@router.post(
    "/{invoice_id}/mark-sent",
    response_model=InvoiceOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Mark an issued invoice as sent",
    description=(
        "Flags an issued invoice as sent (after you download and deliver the PDF). Idempotent "
        "for already-sent invoices.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        200: {"description": "Invoice marked sent."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Invoice not found."},
        409: {"description": "Invoice is not issued/sent."},
    },
)
def mark_invoice_sent(
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.get(db, user, invoice_id)
    updated = invoice_service.mark_sent(db, invoice, user)
    return invoice_service.to_out(updated, db)


# ---------------------------------------------------------------------------
# 9. Mark received
# ---------------------------------------------------------------------------
@router.post(
    "/{invoice_id}/mark-received",
    response_model=InvoiceOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Settle an invoice by booking the net income",
    description=(
        "Settles the invoice's linked receivable: books an `income` transaction for the net "
        "amount (`total - bank_fee`) on the issuer's receiving account and flips the invoice to "
        "`paid`.\n\n"
        "**ACL**: the caller needs `write` permission on the receiving account (enforced by the "
        "receivable settlement flow). **Authorization**: `role == admin` or `role == member`."
    ),
    responses={
        200: {"description": "Invoice settled (paid)."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Insufficient role or no write access to the receiving account."},
        404: {"description": "Invoice not found."},
        409: {"description": "Invoice is not issued/sent, or has no linked receivable."},
    },
)
def mark_invoice_received(
    invoice_id: int,
    payload: MarkReceivedRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.get(db, user, invoice_id)
    updated = invoice_service.mark_received(db, invoice, payload.received_at, user)
    return invoice_service.to_out(updated, db)


# ---------------------------------------------------------------------------
# 10. Unmark received
# ---------------------------------------------------------------------------
@router.post(
    "/{invoice_id}/unmark-received",
    response_model=InvoiceOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Reverse the settlement of an invoice",
    description=(
        "Rolls back the income transaction booked by `mark-received` and returns the invoice "
        "to `issued` (or `sent`, if it had been sent).\n\n"
        "**ACL**: the caller needs `write` permission on the receiving account. "
        "**Authorization**: `role == admin` or `role == member`."
    ),
    responses={
        200: {"description": "Settlement reversed."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Insufficient role or no write access to the receiving account."},
        404: {"description": "Invoice not found."},
        409: {"description": "Invoice is not in 'paid' status, or has no linked receivable."},
    },
)
def unmark_invoice_received(
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.get(db, user, invoice_id)
    updated = invoice_service.unmark_received(db, invoice, user)
    return invoice_service.to_out(updated, db)


# ---------------------------------------------------------------------------
# 11. Void
# ---------------------------------------------------------------------------
@router.post(
    "/{invoice_id}/void",
    response_model=InvoiceOut,
    dependencies=[Depends(require_member_or_admin)],
    summary="Void an issued/sent invoice",
    description=(
        "Voids an issued or sent invoice with a required reason. If the linked receivable has "
        "not been received it is deleted; if it has been received, the call returns 409 (unmark "
        "the receipt first). The invoice number is retained. Draft invoices are deleted, not "
        "voided.\n\n"
        "**Authorization**: caller must have `role == admin` or `role == member`."
    ),
    responses={
        200: {"description": "Invoice voided."},
        401: {"description": "Missing or invalid access token."},
        403: {"description": "Caller has insufficient role."},
        404: {"description": "Invoice not found."},
        409: {"description": "Invoice is not issued/sent, or its receivable is already received."},
        422: {"description": "Missing void reason."},
    },
)
def void_invoice(
    invoice_id: int,
    payload: VoidInvoiceRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> InvoiceOut:
    invoice = invoice_service.get(db, user, invoice_id)
    updated = invoice_service.void(db, invoice, payload.void_reason, user)
    return invoice_service.to_out(updated, db)


# ---------------------------------------------------------------------------
# 12. PDF
# ---------------------------------------------------------------------------
@router.get(
    "/{invoice_id}/pdf",
    summary="Download the persisted invoice PDF",
    description=(
        "Streams the PDF generated when the invoice was issued. Returns 404 if the invoice was "
        "issued before the renderer was available (`pdf_path` is null) or if the file is missing "
        "on disk.\n\n"
        "Readable by any authenticated user (global visibility). Rate-limited to 30 requests "
        "per minute per caller."
    ),
    responses={
        200: {
            "description": "Binary PDF stream.",
            "content": {"application/pdf": {}},
        },
        401: {"description": "Missing or invalid access token."},
        404: {"description": "Invoice not found, no PDF generated, or file missing on disk."},
        429: {"description": "Rate limit exceeded (30/minute)."},
    },
)
@limiter.limit("30/minute")
def get_invoice_pdf(
    request: Request,
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> FileResponse:
    invoice = invoice_service.get(db, user, invoice_id)
    if not invoice.pdf_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invoice has no PDF")
    abs_path = Path(settings.UPLOAD_DIR) / invoice.pdf_path
    if not abs_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF missing on disk")
    filename = f"{invoice.number or invoice.id}.pdf"
    return FileResponse(
        path=str(abs_path),
        media_type="application/pdf",
        filename=filename,
    )
