"""
Polymarket Gamma API integration — no authentication required.
Fetches top active events by 24h volume and filters for macro-relevant markets.

No India-specific markets on Polymarket — we show global macro events that
move Nifty: geopolitics, oil, Bitcoin (risk proxy), Fed, tariffs.
API: https://gamma-api.polymarket.com/
"""

import logging
import json
import time
from typing import List, Dict, Any, Optional
from datetime import datetime
import pytz
import httpx

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

GAMMA_BASE = "https://gamma-api.polymarket.com"

# Keywords that indicate a market is macro-relevant for Nifty traders
_MACRO_KEYWORDS = {
    "oil": "Crude Oil",
    "crude": "Crude Oil",
    "iran": "Geopolitics / Oil",
    "war": "Geopolitics",
    "ceasefire": "Geopolitics",
    "bitcoin": "Bitcoin / Risk",
    "btc": "Bitcoin / Risk",
    "crypto": "Bitcoin / Risk",
    "gold": "Gold",
    "fed": "Fed Policy",
    "fomc": "Fed Policy",
    "rate cut": "Fed Policy",
    "interest rate": "Fed Policy",
    "recession": "Recession Risk",
    "gdp": "Economy",
    "inflation": "Economy",
    "tariff": "Trade / Tariffs",
    "trade war": "Trade / Tariffs",
    "trump": "Geopolitics",
    "dollar": "USD",
    "dxy": "USD",
    "vix": "Volatility",
}

_cache: Optional[List[Dict]] = None
_last_fetch: Optional[float] = None
CACHE_TTL = 600  # 10 minutes


def _categorise(question: str) -> Optional[str]:
    """Return a category label if the question is macro-relevant, else None."""
    q = question.lower()
    for kw, label in _MACRO_KEYWORDS.items():
        if kw in q:
            return label
    return None


async def fetch_polymarket_markets() -> List[Dict]:
    """
    Fetch the top 100 most-traded active events, extract markets that are:
    - Still live (end date in future, not closed)
    - Genuinely uncertain (YES between 3% and 97%)
    - Macro-relevant (matched by keyword)
    """
    global _cache, _last_fetch

    now_ts = time.time()
    if _cache and _last_fetch and (now_ts - _last_fetch) < CACHE_TTL:
        return _cache

    now_iso = datetime.now(IST).isoformat()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{GAMMA_BASE}/events",
                params={
                    "active": "true",
                    "closed": "false",
                    "limit": 100,
                    "order": "volume24hr",
                    "ascending": "false",
                },
            )
            resp.raise_for_status()
            events = resp.json()
    except Exception as e:
        logger.warning(f"Polymarket fetch error: {e}")
        return _cache or _placeholder_markets()

    results = []
    seen = set()

    for ev in events:
        for m in ev.get("markets", []):
            if not m.get("active") or m.get("closed") or m.get("archived"):
                continue

            end = m.get("endDate", "")
            if end and end < now_iso:
                continue

            question = m.get("question", "")
            category = _categorise(question)
            if not category:
                continue

            key = question[:55]
            if key in seen:
                continue
            seen.add(key)

            try:
                prices_raw = m.get("outcomePrices", "[\"0.5\",\"0.5\"]")
                prices = json.loads(prices_raw) if isinstance(prices_raw, str) else prices_raw
                yes_pct = round(float(prices[0]) * 100, 1)
            except Exception:
                continue

            if yes_pct < 3.0 or yes_pct > 97.0:
                continue

            vol    = float(m.get("volume",    0) or 0)
            vol24h = float(m.get("volume24hr", 0) or 0)

            results.append({
                "id":         m.get("conditionId", m.get("id", "")),
                "question":   question,
                "yes_pct":    yes_pct,
                "no_pct":     round(100 - yes_pct, 1),
                "volume":     round(vol, 0),
                "volume_24h": round(vol24h, 0),
                "end_date":   end[:10] if end else "",
                "category":   category,
                "url":        f"https://polymarket.com/event/{m.get('slug', ev.get('slug', ''))}",
                "active":     True,
            })

    # Sort by 24h volume — most actively traded first
    results.sort(key=lambda x: x["volume_24h"], reverse=True)
    results = results[:12]  # cap at 12

    if not results:
        logger.warning("Polymarket: no live macro markets — using placeholders")
        return _placeholder_markets()

    _cache = results
    _last_fetch = now_ts
    logger.info(f"Polymarket: {len(results)} live macro markets fetched")
    return results


def _placeholder_markets() -> List[Dict]:
    """Fallback when API is unreachable."""
    return [
        {
            "id": "placeholder_fed",
            "question": "Will the Fed cut rates at the next FOMC meeting?",
            "yes_pct": 45.0, "no_pct": 55.0,
            "volume": 0, "volume_24h": 0,
            "end_date": "", "category": "Fed Policy", "tag": "fomc",
            "url": "", "active": True, "is_placeholder": True,
        },
        {
            "id": "placeholder_gold",
            "question": "Will Gold hit $3,200 in 2025?",
            "yes_pct": 62.0, "no_pct": 38.0,
            "volume": 0, "volume_24h": 0,
            "end_date": "", "category": "Gold", "tag": "gold",
            "url": "", "active": True, "is_placeholder": True,
        },
    ]


def _build_nifty_insights(markets: List[Dict]) -> List[str]:
    """Derive Nifty-relevant one-liners from live prediction market odds."""
    insights = []
    seen_cats = set()

    for m in sorted(markets, key=lambda x: x["volume_24h"], reverse=True):
        q   = m["question"].lower()
        yes = m["yes_pct"]
        cat = m["category"]
        vol = m["volume_24h"]

        # Only one insight per broad category
        cat_key = cat.split("/")[0].strip()
        if cat_key in seen_cats:
            continue

        if "Geopolitics" in cat or "iran" in q or "war" in q:
            if "peace" in q or "ceasefire" in q:
                if yes > 50:
                    insights.append(f"Polymarket: {yes}% Iran peace deal odds (${vol/1e3:.0f}k 24h vol) → oil supply relief, positive for India's import bill")
                else:
                    insights.append(f"Polymarket: only {yes}% Iran peace deal probability → elevated oil risk, watch for rupee pressure")
            elif "invade" in q or "regime" in q:
                if yes > 30:
                    insights.append(f"Polymarket: {yes}% Iran escalation risk → oil spike threat, Nifty energy/OMC stocks in focus")
            seen_cats.add(cat_key)

        elif "Fed" in cat or "fomc" in q or "rate cut" in q:
            if yes > 60:
                insights.append(f"Polymarket: {yes}% Fed rate cut probability → risk-on, positive for FII flows into Nifty")
            elif yes < 30:
                insights.append(f"Polymarket: {yes}% Fed cut odds → tighter USD, watch for FII selling pressure")
            seen_cats.add(cat_key)

        elif "Bitcoin" in cat or "bitcoin" in q:
            if yes > 60:
                insights.append(f"Polymarket: {yes}% Bitcoin bullish target probability → broad risk-on sentiment globally")
            elif yes < 20:
                insights.append(f"Polymarket: only {yes}% Bitcoin target probability → crypto risk-off, EM caution")
            seen_cats.add(cat_key)

        elif "Oil" in cat or "crude" in q:
            if yes > 50:
                insights.append(f"Polymarket: {yes}% high oil price target probability → input cost risk for India, watch OMCs")
            seen_cats.add(cat_key)

        elif "Recession" in cat:
            if yes > 40:
                insights.append(f"Polymarket: {yes}% US recession probability → global risk-off headwind for Nifty")
            seen_cats.add(cat_key)

        elif "Tariff" in cat or "tariff" in q:
            if yes > 50:
                insights.append(f"Polymarket: {yes}% trade escalation probability → EM/India export headwind")
            seen_cats.add(cat_key)

        if len(insights) >= 3:
            break

    return insights


async def get_polymarket_summary() -> Dict[str, Any]:
    markets = await fetch_polymarket_markets()
    insights = _build_nifty_insights(markets)

    return {
        "markets": markets,
        "count": len(markets),
        "nifty_insights": insights,
        "has_live_feed": True,   # always live, no auth needed
        "note": "No India-specific markets on Polymarket — showing global macro events relevant to Nifty",
        "api_url": GAMMA_BASE,
        "disclaimer": "Prediction market data — not financial advice.",
        "last_updated": datetime.now(IST).isoformat(),
    }
