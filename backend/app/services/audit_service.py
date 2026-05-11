from sqlalchemy.orm import Session

from app.models import AuditLog


SENSITIVE_KEYS = {
    "password",
    "password_hash",
    "current_password",
    "new_password",
    "plain_key",
    "key_hash",
    "token",
    "access_token",
    "refresh_token",
    "file",
}


def _sanitize_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        return payload
    out: dict = {}
    for k, v in payload.items():
        if k in SENSITIVE_KEYS:
            out[k] = "[REDACTED]"
        elif isinstance(v, dict):
            out[k] = _sanitize_payload(v)
        elif isinstance(v, list) and v and isinstance(v[0], dict):
            out[k] = [_sanitize_payload(x) for x in v]
        else:
            out[k] = v
    return out


def log_action(
    db: Session,
    user_id: int | None,
    action: str,
    entity: str,
    entity_id: int | None,
    payload: dict | None = None,
) -> AuditLog:
    """Persiste 1 linha de audit. Nao faz commit (caller controla)."""
    safe_payload = _sanitize_payload(payload) if payload else None
    log = AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        payload_json=safe_payload,
    )
    db.add(log)
    return log


__all__ = ["log_action"]
