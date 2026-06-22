"""Regression test for the invoice PDF post-commit seam.

Bug (prod, INV-000102): ``issue()`` renders the PDF in ``_try_render_pdf`` AFTER
the durable issue commit. ``render_and_persist`` writes the file to disk and only
``flush()``es ``pdf_path``; ``_try_render_pdf`` used to NOT commit, and the
request-scoped ``get_db`` never commits on teardown — so the flushed ``pdf_path``
was rolled back when the session closed. The PDF file landed on disk but
``pdf_path`` stayed NULL, hiding the frontend download button and 404-ing the
``/pdf`` endpoint.

These tests pin the contract of ``_try_render_pdf`` with a mocked session and a
mocked renderer (no DB, no WeasyPrint needed):

  * on a successful render it MUST ``commit()`` (and never ``rollback()``);
  * on a failed render it MUST ``rollback()`` (graceful-degrade) and never raise.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services import invoice_service


def test_try_render_pdf_commits_on_success() -> None:
    db = MagicMock()
    with patch("app.services.invoice_pdf_service.render_and_persist") as render:
        invoice_service._try_render_pdf(db, invoice_id=42)

    render.assert_called_once_with(db, 42)
    db.commit.assert_called_once()
    db.rollback.assert_not_called()


def test_try_render_pdf_rolls_back_and_swallows_on_failure() -> None:
    db = MagicMock()
    with patch(
        "app.services.invoice_pdf_service.render_and_persist",
        side_effect=OSError("weasyprint native libs unavailable"),
    ):
        # Must never propagate — PDF is non-critical; the invoice is already issued.
        invoice_service._try_render_pdf(db, invoice_id=7)

    db.commit.assert_not_called()
    db.rollback.assert_called_once()
