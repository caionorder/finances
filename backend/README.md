# Finances Backend

FastAPI + SQLAlchemy 2.0 + MySQL backend for the personal finance system.

## Quickstart (local dev)

```bash
uv sync
cp .env.example .env
# edit .env with your local DATABASE_URL / JWT_SECRET

uv run alembic upgrade head        # after Poseidon ships migrations
uv run uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/api/docs

Health check: http://localhost:8000/api/health

## Migrations

```bash
uv run alembic revision --autogenerate -m "<message>"
uv run alembic upgrade head
uv run alembic downgrade -1
```

## Layout

```
app/
├── api/         # routers
├── core/        # config, security, deps
├── db/          # engine, session, base
├── models/      # SQLAlchemy models (Phase 1+)
├── schemas/     # Pydantic DTOs
├── services/    # business logic
└── scheduler/   # APScheduler jobs (Phase 5)
```
