"""
Instrument master download, caching, and expiry detection.
Nifty weekly expiry = every Tuesday. Monthly expiry = last Tuesday of month.
"""

import os
import json
import logging
import asyncio
import httpx
import pytz
from datetime import date, datetime, timedelta
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")

INSTRUMENT_URL = (
    "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
)
CACHE_PATH = Path(__file__).parent / "data" / "instruments.json"

# Known NIFTY 50 index token on NSE
NIFTY_INDEX_TOKEN = "99926000"
NIFTY_INDEX_SYMBOL = "Nifty 50"

_instrument_cache: list = []
_last_download: Optional[date] = None


async def download_instrument_master(force: bool = False) -> list:
    """Download instrument master JSON once per day and cache locally."""
    global _instrument_cache, _last_download

    today = datetime.now(IST).date()
    if not force and _last_download == today and _instrument_cache:
        return _instrument_cache

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Use cached file if downloaded today
    if CACHE_PATH.exists() and not force:
        mtime = datetime.fromtimestamp(CACHE_PATH.stat().st_mtime, tz=IST).date()
        if mtime == today:
            logger.info("Loading instrument master from today's cache")
            with open(CACHE_PATH) as f:
                _instrument_cache = json.load(f)
            _last_download = today
            return _instrument_cache

    logger.info("Downloading instrument master from Angel One...")
    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(INSTRUMENT_URL)
            resp.raise_for_status()
            # Content-Type may be text/plain — parse manually
            import json as _json
            data = _json.loads(resp.text)

        with open(CACHE_PATH, "w") as f:
            json.dump(data, f)

        _instrument_cache = data
        _last_download = today
        logger.info(f"Downloaded {len(data)} instruments")
        return data

    except Exception as e:
        logger.error(f"Failed to download instruments: {e}")
        if CACHE_PATH.exists():
            logger.warning("Using stale instrument cache")
            with open(CACHE_PATH) as f:
                _instrument_cache = json.load(f)
        return _instrument_cache


def get_instruments() -> list:
    return _instrument_cache


def find_nifty_futures(expiry_date: Optional[date] = None) -> list:
    """Find NIFTY futures tokens. Optionally filter by expiry date."""
    results = []
    for inst in _instrument_cache:
        sym = inst.get("symbol", "").upper()
        name = inst.get("name", "").upper()
        exch = inst.get("exch_seg", "").upper()
        if "NIFTY" in name and exch == "NFO" and inst.get("instrumenttype") == "FUTIDX":
            if expiry_date:
                exp = _parse_expiry(inst.get("expiry", ""))
                if exp == expiry_date:
                    results.append(inst)
            else:
                results.append(inst)
    return results


def find_nifty_options(expiry_date: date, strike: Optional[float] = None) -> list:
    """Find NIFTY option contracts for a given expiry (and optionally strike)."""
    results = []
    for inst in _instrument_cache:
        name = inst.get("name", "").upper()
        exch = inst.get("exch_seg", "").upper()
        itype = inst.get("instrumenttype", "").upper()
        if "NIFTY" in name and exch == "NFO" and itype in ("OPTIDX",):
            exp = _parse_expiry(inst.get("expiry", ""))
            if exp == expiry_date:
                if strike is None or abs(float(inst.get("strike", 0)) / 100 - strike) < 0.01:
                    results.append(inst)
    return results


def _parse_expiry(expiry_str: str) -> Optional[date]:
    """Parse expiry string like '28MAY2025' or '2025-05-28'."""
    if not expiry_str:
        return None
    for fmt in ("%d%b%Y", "%Y-%m-%d", "%d-%b-%Y"):
        try:
            return datetime.strptime(expiry_str.upper(), fmt).date()
        except ValueError:
            continue
    return None


def get_next_expiry_tuesday(from_date: Optional[date] = None) -> date:
    """
    Get the next weekly Nifty expiry (Tuesday).
    If today IS Tuesday, return today (market hours check handled elsewhere).
    """
    d = from_date or datetime.now(IST).date()
    # weekday(): Monday=0, Tuesday=1
    days_until_tuesday = (1 - d.weekday()) % 7
    if days_until_tuesday == 0:
        return d
    return d + timedelta(days=days_until_tuesday)


def get_monthly_expiry_tuesday(year: int, month: int) -> date:
    """Last Tuesday of a given month."""
    # Find last day of month
    if month == 12:
        last_day = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)

    # Walk back to find last Tuesday (weekday == 1)
    d = last_day
    while d.weekday() != 1:
        d -= timedelta(days=1)
    return d


def is_today_expiry() -> bool:
    today = datetime.now(IST).date()
    return today == get_next_expiry_tuesday(today)


def is_today_monthly_expiry() -> bool:
    today = datetime.now(IST).date()
    return today == get_monthly_expiry_tuesday(today.year, today.month)


def get_expiry_info() -> dict:
    today = datetime.now(IST).date()
    next_exp = get_next_expiry_tuesday(today)
    days_to_exp = (next_exp - today).days
    monthly_exp = get_monthly_expiry_tuesday(today.year, today.month)
    is_monthly = (next_exp == monthly_exp)

    return {
        "next_expiry": next_exp.isoformat(),
        "days_to_expiry": days_to_exp,
        "is_today_expiry": days_to_exp == 0,
        "is_monthly_expiry": is_monthly,
        "expiry_type": "Monthly" if is_monthly else "Weekly",
    }


# NSE holiday list (update annually from NSE circular)
NSE_HOLIDAYS = {
    date(2025, 1, 26),   # Republic Day
    date(2025, 3, 14),   # Holi
    date(2025, 4, 14),   # Dr. Ambedkar Jayanti / Ram Navami
    date(2025, 4, 18),   # Good Friday
    date(2025, 5, 1),    # Maharashtra Day
    date(2025, 8, 15),   # Independence Day
    date(2025, 8, 27),   # Ganesh Chaturthi
    date(2025, 10, 2),   # Gandhi Jayanti
    date(2025, 10, 24),  # Diwali Laxmi Puja
    date(2025, 11, 5),   # Diwali Balipratipada
    date(2025, 11, 14),  # Gurunanak Jayanti
    date(2025, 12, 25),  # Christmas
}

NSE_HOLIDAYS_2026 = {
    date(2026, 1, 26),   # Republic Day
    date(2026, 3, 30),   # Holi
    date(2026, 4, 3),    # Good Friday
    date(2026, 4, 14),   # Dr. Ambedkar Jayanti
    date(2026, 5, 1),    # Maharashtra Day
    date(2026, 8, 14),   # Independence Day (observed; Aug 15 is Saturday)
    date(2026, 10, 2),   # Gandhi Jayanti
    date(2026, 10, 29),  # Diwali Laxmi Puja (approximate — NSE to confirm)
    date(2026, 11, 14),  # Gurunanak Jayanti (approximate)
    date(2026, 12, 25),  # Christmas
}

NSE_HOLIDAYS = NSE_HOLIDAYS | NSE_HOLIDAYS_2026


def is_market_open(dt: Optional[datetime] = None) -> bool:
    """Returns True if NSE market is currently open."""
    now = dt or datetime.now(IST)
    d = now.date()

    # Weekend check
    if d.weekday() >= 5:
        return False

    # Holiday check
    if d in NSE_HOLIDAYS:
        return False

    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
    market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)
    return market_open <= now <= market_close


def get_session_status(dt: Optional[datetime] = None) -> str:
    """Return current trading session label."""
    now = dt or datetime.now(IST)
    d = now.date()

    if d.weekday() >= 5 or d in NSE_HOLIDAYS:
        return "CLOSED"

    t = now.time()
    from datetime import time as dtime

    if t < dtime(9, 0):
        return "PRE-MARKET"
    elif t < dtime(9, 15):
        return "PRE-OPEN"
    elif t < dtime(10, 15):
        return "MORNING-SESSION"
    elif t < dtime(14, 15):
        return "MID-SESSION"
    elif t <= dtime(15, 30) and is_today_expiry():
        return "EXPIRY-SESSION"
    elif t <= dtime(15, 30):
        return "MID-SESSION"
    else:
        return "CLOSED"
