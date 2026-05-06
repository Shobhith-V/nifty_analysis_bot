"""
Polymarket API integration placeholder.
Ready to activate when API access is confirmed.
Endpoint: https://gamma-api.polymarket.com/
"""

import logging
import os
from typing import List, Dict, Any, Optional
from datetime import datetime
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

POLYMARKET_API_KEY = os.getenv("POLYMARKET_API_KEY", "")
POLYMARKET_BASE_URL = "https://gamma-api.polymarket.com"

# Keywords to filter India-relevant questions
INDIA_KEYWORDS = {
    "india", "nifty", "sensex", "rbi", "rupee", "inr", "bse", "nse",
    "modi", "budget", "inflation", "repo rate", "gdp india",
}


async def fetch_polymarket_markets(limit: int = 20) -> List[Dict]:
    """
    Fetch active prediction markets from Polymarket.
    Filters for India-market-relevant questions.
    Returns placeholder data if API key not set.
    """
    if not POLYMARKET_API_KEY:
        return _placeholder_markets()

    try:
        import httpx
        headers = {
            "Authorization": f"Bearer {POLYMARKET_API_KEY}",
            "Content-Type": "application/json",
        }
        params = {
            "active": True,
            "limit": limit,
            "order": "volume",
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{POLYMARKET_BASE_URL}/markets",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

        markets = []
        for m in data.get("markets", data if isinstance(data, list) else []):
            question = m.get("question", "").lower()
            if _is_relevant(question):
                markets.append(_parse_market(m))

        return markets or _placeholder_markets()

    except Exception as e:
        logger.warning(f"Polymarket fetch failed: {e}")
        return _placeholder_markets()


def _is_relevant(question: str) -> bool:
    return any(kw in question for kw in INDIA_KEYWORDS)


def _parse_market(m: dict) -> Dict[str, Any]:
    outcomes = m.get("outcomes", [])
    yes_pct = 0.0
    no_pct = 0.0
    for o in outcomes:
        if isinstance(o, dict):
            name = o.get("name", "").lower()
            price = float(o.get("price", 0)) * 100
            if name == "yes":
                yes_pct = price
            elif name == "no":
                no_pct = price

    return {
        "id": m.get("conditionId", m.get("id", "")),
        "question": m.get("question", ""),
        "yes_pct": round(yes_pct, 1),
        "no_pct": round(no_pct, 1),
        "volume": m.get("volume", 0),
        "end_date": m.get("endDate", m.get("end_date_iso", "")),
        "active": m.get("active", True),
        "url": f"https://polymarket.com/event/{m.get('slug', '')}",
    }


def _placeholder_markets() -> List[Dict]:
    return [
        {
            "id": "placeholder_1",
            "question": "Will Nifty 50 close above 25,000 by end of June 2025?",
            "yes_pct": 62.0,
            "no_pct": 38.0,
            "volume": 0,
            "end_date": "2025-06-30",
            "active": True,
            "url": "",
            "is_placeholder": True,
        },
        {
            "id": "placeholder_2",
            "question": "Will RBI cut rates in June 2025?",
            "yes_pct": 45.0,
            "no_pct": 55.0,
            "volume": 0,
            "end_date": "2025-06-06",
            "active": True,
            "url": "",
            "is_placeholder": True,
        },
        {
            "id": "placeholder_3",
            "question": "Will India GDP grow above 7% in FY26?",
            "yes_pct": 70.0,
            "no_pct": 30.0,
            "volume": 0,
            "end_date": "2026-06-30",
            "active": True,
            "url": "",
            "is_placeholder": True,
        },
    ]


async def get_polymarket_summary() -> Dict[str, Any]:
    markets = await fetch_polymarket_markets()
    return {
        "markets": markets,
        "count": len(markets),
        "has_live_feed": bool(POLYMARKET_API_KEY),
        "api_url": POLYMARKET_BASE_URL,
        "disclaimer": "Prediction market data — not financial advice.",
        "last_updated": datetime.now(IST).isoformat(),
    }
