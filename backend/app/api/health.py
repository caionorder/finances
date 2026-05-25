from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.deps import get_db

router = APIRouter()


@router.get(
    "/health",
    summary="Liveness + database readiness probe",
    description=(
        "Lightweight unauthenticated endpoint used by load balancers, orchestrators "
        "(K8s readiness/liveness, Docker healthcheck) and uptime monitors.\n\n"
        "Returns:\n\n"
        "* `status`: always `\"ok\"` — the HTTP 200 itself signals the process is up.\n"
        "* `db`: `true` if `SELECT 1` succeeded against the primary database, `false` otherwise.\n"
        "  Use this to gate readiness — a `false` value typically means the DB is unreachable "
        "or in cold start.\n"
        "* `version`: API version string (matches `FastAPI.version`).\n\n"
        "**No authentication is required** and the endpoint is exempt from rate limiting."
    ),
    responses={
        200: {"description": "Probe completed. Inspect the `db` field to determine readiness."},
    },
)
def health(db: Annotated[Session, Depends(get_db)]) -> dict[str, str | bool]:
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok, "version": "0.1.0"}
