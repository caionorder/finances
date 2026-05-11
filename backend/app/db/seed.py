"""Idempotent seed script.

Run via: `uv run python -m app.db.seed`

Reads ADMIN_EMAIL and ADMIN_PASSWORD from env (default email admin@example.com).
ADMIN_PASSWORD is required when ENV != dev; in dev it falls back to "changeme"
with a warning. Idempotent: re-running will not duplicate rows nor raise — every
entity is checked first via SELECT before INSERT.
"""

from __future__ import annotations

import os

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Category, Currency, User, Workspace
from app.models.enums import CategoryKind, UserRole

# ---------------------------------------------------------------------------
# Currencies
# ---------------------------------------------------------------------------
CURRENCIES: list[dict] = [
    {"code": "BRL", "symbol": "R$", "decimals": 2, "name": "Real"},
    {"code": "USD", "symbol": "US$", "decimals": 2, "name": "Dolar"},
    {"code": "PYG", "symbol": "Gs.", "decimals": 0, "name": "Guarani"},
]

# ---------------------------------------------------------------------------
# Workspace
# ---------------------------------------------------------------------------
WORKSPACE = {
    "id": 1,
    "name": "Familia",
    "settings_json": {
        "timezone": "America/Sao_Paulo",
        "date_format": "DD/MM/YYYY",
        "default_currency": "BRL",
    },
}

# ---------------------------------------------------------------------------
# Categories tree
# ---------------------------------------------------------------------------
# Each top-level entry: {"name": str, "kind": CategoryKind, "icon": str|None,
#                        "color": str|None, "children": [{"name": ..., ...}, ...]}
INCOME_TREE: list[dict] = [
    {"name": "Salario", "icon": "briefcase", "color": "#16a34a"},
    {"name": "Freelance", "icon": "laptop", "color": "#22c55e"},
    {"name": "Investimentos", "icon": "trending-up", "color": "#10b981"},
    {"name": "Outros", "icon": None, "color": None},
]

EXPENSE_TREE: list[dict] = [
    {
        "name": "Alimentacao",
        "icon": "utensils",
        "color": "#ef4444",
        "children": [
            {"name": "Mercado"},
            {"name": "Restaurante"},
            {"name": "Delivery"},
        ],
    },
    {
        "name": "Transporte",
        "icon": "car",
        "color": "#f97316",
        "children": [
            {"name": "Combustivel"},
            {"name": "Uber/Taxi"},
            {"name": "Estacionamento"},
            {"name": "Manutencao"},
        ],
    },
    {
        "name": "Moradia",
        "icon": "home",
        "color": "#8b5cf6",
        "children": [
            {"name": "Aluguel"},
            {"name": "Condominio"},
            {"name": "Energia"},
            {"name": "Agua"},
            {"name": "Internet"},
            {"name": "Gas"},
        ],
    },
    {
        "name": "Saude",
        "icon": "heart",
        "color": "#ec4899",
        "children": [
            {"name": "Medico"},
            {"name": "Farmacia"},
            {"name": "Plano de Saude"},
        ],
    },
    {
        "name": "Educacao",
        "icon": "book",
        "color": "#3b82f6",
        "children": [
            {"name": "Cursos"},
            {"name": "Livros"},
        ],
    },
    {
        "name": "Lazer",
        "icon": "gamepad",
        "color": "#06b6d4",
        "children": [
            {"name": "Streaming"},
            {"name": "Cinema"},
            {"name": "Viagem"},
        ],
    },
    {
        "name": "Pessoal",
        "icon": "user",
        "color": "#a855f7",
        "children": [
            {"name": "Vestuario"},
            {"name": "Beleza"},
        ],
    },
    {"name": "Impostos", "icon": "file-text", "color": "#6b7280"},
    {"name": "Outros", "icon": None, "color": None},
]


def _upsert_currency(db: Session, payload: dict) -> bool:
    existing = db.query(Currency).filter(Currency.code == payload["code"]).first()
    if existing:
        return False
    db.add(Currency(**payload))
    return True


def _upsert_workspace(db: Session) -> bool:
    existing = db.query(Workspace).filter(Workspace.id == WORKSPACE["id"]).first()
    if existing:
        return False
    db.add(Workspace(**WORKSPACE))
    return True


def _upsert_admin(db: Session) -> tuple[bool, str]:
    email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    env = os.getenv("ENV", "dev")
    password = os.getenv("ADMIN_PASSWORD")
    if not password:
        if env == "dev":
            password = "changeme"
            print(
                "WARNING: using insecure default admin password 'changeme' (ENV=dev)"
            )
        else:
            raise RuntimeError(
                f"ADMIN_PASSWORD env var is required when ENV={env} (not dev)"
            )
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return False, email
    db.add(
        User(
            email=email,
            password_hash=hash_password(password),
            name="Admin",
            role=UserRole.admin,
            is_active=True,
        )
    )
    return True, email


def _upsert_category(
    db: Session,
    *,
    name: str,
    kind: CategoryKind,
    parent_id: int | None,
    sort_order: int,
    icon: str | None = None,
    color: str | None = None,
) -> tuple[Category, bool]:
    existing = (
        db.query(Category)
        .filter(
            Category.parent_id.is_(parent_id) if parent_id is None else Category.parent_id == parent_id,
            Category.name == name,
            Category.kind == kind,
        )
        .first()
    )
    if existing:
        return existing, False
    cat = Category(
        name=name,
        kind=kind,
        parent_id=parent_id,
        sort_order=sort_order,
        icon=icon,
        color=color,
    )
    db.add(cat)
    db.flush()
    return cat, True


def _seed_categories(db: Session) -> tuple[int, int]:
    income_inserted = 0
    expense_inserted = 0

    for idx, item in enumerate(INCOME_TREE):
        _, created = _upsert_category(
            db,
            name=item["name"],
            kind=CategoryKind.income,
            parent_id=None,
            sort_order=idx,
            icon=item.get("icon"),
            color=item.get("color"),
        )
        if created:
            income_inserted += 1

    for idx, item in enumerate(EXPENSE_TREE):
        parent, created = _upsert_category(
            db,
            name=item["name"],
            kind=CategoryKind.expense,
            parent_id=None,
            sort_order=idx,
            icon=item.get("icon"),
            color=item.get("color"),
        )
        if created:
            expense_inserted += 1

        for child_idx, child in enumerate(item.get("children", [])):
            _, child_created = _upsert_category(
                db,
                name=child["name"],
                kind=CategoryKind.expense,
                parent_id=parent.id,
                sort_order=child_idx,
                icon=child.get("icon"),
                color=child.get("color"),
            )
            if child_created:
                expense_inserted += 1

    return income_inserted, expense_inserted


def run() -> None:
    db: Session = SessionLocal()
    try:
        currency_inserts = sum(_upsert_currency(db, c) for c in CURRENCIES)
        workspace_inserted = _upsert_workspace(db)
        db.flush()

        admin_inserted, admin_email = _upsert_admin(db)
        db.flush()

        income_inserted, expense_inserted = _seed_categories(db)

        db.commit()

        currencies_total = db.query(Currency).count()
        workspaces_total = db.query(Workspace).count()
        users_total = db.query(User).count()
        categories_total = db.query(Category).count()
        income_total = (
            db.query(Category).filter(Category.kind == CategoryKind.income).count()
        )
        expense_total = (
            db.query(Category).filter(Category.kind == CategoryKind.expense).count()
        )

        print(
            f"Seed completed: {currencies_total} currencies "
            f"(+{currency_inserts} new), {workspaces_total} workspace "
            f"(+{1 if workspace_inserted else 0} new), {users_total} admin "
            f"(+{1 if admin_inserted else 0} new, email={admin_email}), "
            f"{categories_total} categorias ({income_total} receitas + "
            f"{expense_total} despesas; +{income_inserted + expense_inserted} new this run)"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
