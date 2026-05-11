from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings


def _api_key_or_remote(request: Request) -> str:
    header = request.headers.get(settings.API_KEY_HEADER)
    if header:
        return f"apikey:{header}"
    return get_remote_address(request)


limiter = Limiter(key_func=_api_key_or_remote)


__all__ = ["limiter"]
