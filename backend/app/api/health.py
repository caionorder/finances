from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.deps import get_db

router = APIRouter()


@router.get("/health")
def health(db: Annotated[Session, Depends(get_db)]) -> dict[str, str | bool]:
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": db_ok, "version": "0.1.0"}
