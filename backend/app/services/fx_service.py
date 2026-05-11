from __future__ import annotations

import logging
from datetime import UTC, datetime
from decimal import Decimal

import httpx
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models import Currency, FxRate

logger = logging.getLogger("fx")

COINGECKO_IDS = {
    "BTC": "bitcoin",
    "USDT": "tether",
    "ETH": "ethereum",
    "USDC": "usd-coin",
}
QUOTE_CURRENCIES = ["brl", "usd"]


def fetch_coingecko_rates() -> dict[str, dict[str, Decimal]]:
    ids = ",".join(COINGECKO_IDS.values())
    vs = ",".join(QUOTE_CURRENCIES)
    url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies={vs}"
    try:
        resp = httpx.get(url, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        id_to_code = {v: k for k, v in COINGECKO_IDS.items()}
        out: dict[str, dict[str, Decimal]] = {}
        for cg_id, prices in data.items():
            base = id_to_code.get(cg_id)
            if not base:
                continue
            out[base] = {q.upper(): Decimal(str(v)) for q, v in prices.items()}
        return out
    except Exception as e:
        logger.exception(f"coingecko fetch failed: {e}")
        return {}


def persist_rates(db: Session, rates: dict[str, dict[str, Decimal]]) -> int:
    known = {row[0] for row in db.execute(select(Currency.code)).all()}
    now = datetime.now(UTC).replace(tzinfo=None)
    count = 0
    for base, quotes in rates.items():
        if base not in known:
            logger.info("skipping unknown base currency %s", base)
            continue
        for quote, rate in quotes.items():
            if quote not in known:
                logger.info("skipping unknown quote currency %s", quote)
                continue
            db.add(
                FxRate(
                    base_code=base,
                    quote_code=quote,
                    rate=rate,
                    source="coingecko",
                    fetched_at=now,
                )
            )
            count += 1
    db.commit()
    return count


def refresh_rates(db: Session) -> dict:
    rates = fetch_coingecko_rates()
    if not rates:
        return {"fetched": 0, "persisted": 0, "error": "fetch failed"}
    n = persist_rates(db, rates)
    return {"fetched": sum(len(v) for v in rates.values()), "persisted": n, "error": None}


def _direct_rate(db: Session, base: str, quote: str) -> Decimal | None:
    rate = db.execute(
        select(FxRate.rate)
        .where(FxRate.base_code == base, FxRate.quote_code == quote)
        .order_by(desc(FxRate.fetched_at))
        .limit(1)
    ).scalar_one_or_none()
    if rate is not None:
        return Decimal(rate)
    rev = db.execute(
        select(FxRate.rate)
        .where(FxRate.base_code == quote, FxRate.quote_code == base)
        .order_by(desc(FxRate.fetched_at))
        .limit(1)
    ).scalar_one_or_none()
    if rev is not None and rev != 0:
        return Decimal("1") / Decimal(rev)
    return None


def get_latest_rate(db: Session, base: str, quote: str) -> Decimal | None:
    if base == quote:
        return Decimal("1")
    direct = _direct_rate(db, base, quote)
    if direct is not None:
        return direct
    # Triangulate through any intermediary currency that has both legs.
    seen_pairs = db.execute(select(FxRate.base_code, FxRate.quote_code).distinct()).all()
    intermediaries: set[str] = set()
    for b, q in seen_pairs:
        intermediaries.add(b)
        intermediaries.add(q)
    intermediaries.discard(base)
    intermediaries.discard(quote)
    for mid in intermediaries:
        leg1 = _direct_rate(db, base, mid)
        leg2 = _direct_rate(db, mid, quote)
        if leg1 is not None and leg2 is not None:
            return leg1 * leg2
    return None


def list_latest_rates(db: Session) -> list[dict]:
    sub = (
        select(
            FxRate.base_code,
            FxRate.quote_code,
            func.max(FxRate.id).label("max_id"),
        )
        .group_by(FxRate.base_code, FxRate.quote_code)
        .subquery()
    )
    rows = (
        db.execute(
            select(FxRate)
            .join(sub, FxRate.id == sub.c.max_id)
            .order_by(FxRate.base_code, FxRate.quote_code)
        )
        .scalars()
        .all()
    )
    return [
        {
            "base_code": r.base_code,
            "quote_code": r.quote_code,
            "rate": r.rate,
            "source": r.source,
            "fetched_at": r.fetched_at,
        }
        for r in rows
    ]


def convert(db: Session, amount: Decimal, from_code: str, to_code: str) -> Decimal | None:
    rate = get_latest_rate(db, from_code, to_code)
    if rate is None:
        return None
    return amount * rate
