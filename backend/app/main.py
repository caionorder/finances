from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api import (
    accounts,
    api_keys,
    audit_logs,
    auth,
    categories,
    credit_card_purchases,
    credit_cards,
    external,
    facturas,
    fx,
    health,
    investments,
    payables,
    receivables,
    recurrences,
    reports,
    transactions,
    users,
)
from app.core.config import settings
from app.core.rate_limit import limiter
from app.scheduler.jobs import start_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    scheduler = start_scheduler()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


API_DESCRIPTION = """
# Finances API

Personal finance management backend that powers accounts, credit cards, transactions,
payables, receivables, recurrences and facturas (invoices) across multiple currencies.

## Authentication

All endpoints (except `/auth/login`, `/auth/refresh` and `/health`) require a JWT
**bearer token** in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

* Access tokens: 15 min TTL
* Refresh tokens: 7 days TTL — exchange via `POST /api/auth/refresh`
* Machine-to-machine clients can use long-lived API keys via `/api/api-keys`

## Multi-currency model

Each `Account` and `CreditCard` is **pinned to a single currency** (`BRL`, `USD`, `PYG`, ...).
Transactions inherit the currency from their parent account/card — clients never
need to send `currency_code` on writes.

* Monetary fields are serialized as **strings** (e.g. `"123.45"`) to preserve decimal
  precision. Clients MUST parse them with a Decimal/BigDecimal type, never `float`.
* Cross-currency aggregations require an explicit FX conversion via `/api/fx`.

## Access control

* `User.role` is one of `admin`, `member`, `viewer`.
* `AccountAcl` / `CreditCardAcl` grant per-user `read` or `write` access on each
  resource. Admins bypass ACL checks.
* Write operations on accounts/cards/transactions return **403** when the caller
  lacks `write` permission, **404** when the resource does not exist.

## Credit cards & billing cycles

* Purchases are created via `POST /api/credit-cards/{id}/purchases`. Installments
  (`installments: N`, with `N >= 1`) generate N child purchases automatically.
* Each purchase is assigned to a `BillingCycle` based on the card's `closing_day`.
* Cycles transition `open → closed → paid` and expose totals at
  `GET /api/credit-cards/{id}/cycles`.

## Conventions

* Pagination is **cursor-based** — pass the opaque `next_cursor` from the previous
  response back as `?cursor=...`.
* Dates are ISO-8601 (`YYYY-MM-DD`). Datetimes are UTC ISO-8601 with timezone offset.
* All write endpoints return the full resource on success (201 on create, 200 on
  update, 204 on delete).

## Useful links

* **Swagger UI** — interactive playground: [`/api/docs`](/api/docs)
* **ReDoc** — long-form reference: [`/api/redoc`](/api/redoc)
* **OpenAPI schema (JSON)**: [`/api/openapi.json`](/api/openapi.json)
"""

OPENAPI_TAGS: list[dict[str, str]] = [
    {"name": "auth", "description": "Login, refresh and logout. Issues JWT access/refresh tokens."},
    {"name": "users", "description": "User profile management and admin user CRUD."},
    {"name": "accounts", "description": "Bank/cash/investment accounts. One currency per account. ACL-gated."},
    {"name": "categories", "description": "Income/expense/transfer categories with parent-child tree."},
    {"name": "transactions", "description": "Money movements on accounts (income, expense, transfer)."},
    {"name": "credit-cards", "description": "Credit/debit cards, ACLs and billing cycles."},
    {"name": "credit-card-purchases", "description": "Purchases booked against a credit card — installments supported."},
    {"name": "facturas", "description": "Received/issued invoices (Paraguay-style facturas)."},
    {"name": "payables", "description": "Bills to pay. Supports partial payments and recurrence."},
    {"name": "receivables", "description": "Money expected to be received. Tracks status and partial collections."},
    {"name": "recurrences", "description": "Recurring payable/receivable templates that auto-generate instances."},
    {"name": "reports", "description": "Aggregations: monthly P&L, category breakdown, dashboard BI."},
    {"name": "fx", "description": "FX rates and on-the-fly conversion between supported currencies."},
    {"name": "investments", "description": "Investment positions, movements and yield projections."},
    {"name": "api-keys", "description": "Long-lived API keys for machine-to-machine clients (agents)."},
    {"name": "audit-logs", "description": "Read-only audit trail of sensitive operations (admin only)."},
    {"name": "external", "description": "External integrations consumed by trusted callers via API key."},
    {"name": "health", "description": "Liveness/readiness probes. No auth required."},
]

app = FastAPI(
    title="Finances API",
    version="0.1.0",
    summary="Multi-currency personal finance backend (accounts, cards, payables, reports).",
    description=API_DESCRIPTION,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_tags=OPENAPI_TAGS,
    contact={"name": "Caio Norder", "email": "caio@joinads.me"},
    license_info={"name": "Proprietary — all rights reserved"},
    swagger_ui_parameters={
        "persistAuthorization": True,
        "docExpansion": "none",
        "defaultModelsExpandDepth": 1,
        "displayRequestDuration": True,
        "filter": True,
    },
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(credit_cards.router, prefix="/api")
app.include_router(credit_card_purchases.card_router, prefix="/api")
app.include_router(credit_card_purchases.purchase_router, prefix="/api")
app.include_router(facturas.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(payables.router, prefix="/api")
app.include_router(receivables.router, prefix="/api")
app.include_router(recurrences.router, prefix="/api")
app.include_router(api_keys.router, prefix="/api")
app.include_router(audit_logs.router, prefix="/api")
app.include_router(external.router, prefix="/api")
app.include_router(investments.router, prefix="/api")
app.include_router(fx.router, prefix="/api")
