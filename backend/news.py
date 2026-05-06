"""
News aggregation placeholder.
Structure is ready; drop NEWS_API_KEY into .env to activate real feeds.
"""

import logging
import os
from datetime import datetime, date
from typing import List, Dict, Any
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

# Economic calendar events (hardcoded structure — replace with live API)
ECONOMIC_CALENDAR_2025 = [
    {"date": "2025-06-06", "event": "RBI Monetary Policy Decision", "impact": "HIGH", "currency": "INR"},
    {"date": "2025-06-12", "event": "India CPI (May)", "impact": "MEDIUM", "currency": "INR"},
    {"date": "2025-06-13", "event": "India WPI (May)", "impact": "MEDIUM", "currency": "INR"},
    {"date": "2025-06-30", "event": "India GDP Q4 FY25", "impact": "HIGH", "currency": "INR"},
    {"date": "2025-07-01", "event": "India Fiscal Year Start Q1", "impact": "LOW", "currency": "INR"},
    {"date": "2025-08-06", "event": "RBI Monetary Policy Decision", "impact": "HIGH", "currency": "INR"},
    {"date": "2025-09-12", "event": "India CPI (Aug)", "impact": "MEDIUM", "currency": "INR"},
    {"date": "2025-10-07", "event": "RBI Monetary Policy Decision", "impact": "HIGH", "currency": "INR"},
    {"date": "2025-12-05", "event": "RBI Monetary Policy Decision", "impact": "HIGH", "currency": "INR"},
]


async def get_economic_calendar(days_ahead: int = 7) -> List[Dict]:
    """Return upcoming economic events within `days_ahead` days."""
    today = datetime.now(IST).date()
    results = []
    for event in ECONOMIC_CALENDAR_2025:
        try:
            ev_date = date.fromisoformat(event["date"])
            delta = (ev_date - today).days
            if 0 <= delta <= days_ahead:
                results.append({
                    **event,
                    "days_away": delta,
                    "today": delta == 0,
                })
        except ValueError:
            continue
    return sorted(results, key=lambda x: x["date"])


async def fetch_news_headlines(topic: str = "NIFTY market India") -> List[Dict]:
    """
    Fetch news headlines. Uses NewsAPI if key is set, otherwise returns placeholder.
    """
    if not NEWS_API_KEY:
        return _placeholder_headlines()

    try:
        import httpx
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": topic,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 10,
            "apiKey": NEWS_API_KEY,
        }
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        articles = data.get("articles", [])
        headlines = []
        for a in articles[:10]:
            headlines.append({
                "title": a.get("title", ""),
                "source": a.get("source", {}).get("name", ""),
                "url": a.get("url", ""),
                "published_at": a.get("publishedAt", ""),
                "sentiment": _classify_sentiment(a.get("title", "")),
            })
        return headlines

    except Exception as e:
        logger.warning(f"News fetch failed: {e}. Using placeholders.")
        return _placeholder_headlines()


def _placeholder_headlines() -> List[Dict]:
    now = datetime.now(IST).isoformat()
    return [
        {
            "title": "News API not configured — add NEWS_API_KEY to .env",
            "source": "System",
            "url": "",
            "published_at": now,
            "sentiment": "NEUTRAL",
        },
        {
            "title": "Nifty 50 index analysis based on technical indicators",
            "source": "Bot",
            "url": "",
            "published_at": now,
            "sentiment": "NEUTRAL",
        },
    ]


# Simple keyword-based sentiment classifier
BULLISH_KEYWORDS = {
    "surge", "rally", "gains", "up", "rise", "bull", "positive", "growth",
    "record", "high", "bounce", "recovery", "strong", "outperform",
}
BEARISH_KEYWORDS = {
    "fall", "drop", "crash", "down", "decline", "bear", "negative", "loss",
    "weak", "plunge", "sell-off", "correction", "underperform", "concern",
}


def _classify_sentiment(text: str) -> str:
    text_lower = text.lower()
    bull_count = sum(1 for kw in BULLISH_KEYWORDS if kw in text_lower)
    bear_count = sum(1 for kw in BEARISH_KEYWORDS if kw in text_lower)
    if bull_count > bear_count:
        return "BULLISH"
    elif bear_count > bull_count:
        return "BEARISH"
    return "NEUTRAL"


async def get_news_summary() -> Dict[str, Any]:
    """Aggregated news response for the API endpoint."""
    headlines = await fetch_news_headlines()
    calendar = await get_economic_calendar()

    sentiments = [h["sentiment"] for h in headlines]
    bull = sentiments.count("BULLISH")
    bear = sentiments.count("BEARISH")
    overall = "BULLISH" if bull > bear else ("BEARISH" if bear > bull else "NEUTRAL")

    return {
        "headlines": headlines[:5],
        "economic_calendar": calendar,
        "overall_sentiment": overall,
        "bull_count": bull,
        "bear_count": bear,
        "has_live_feed": bool(NEWS_API_KEY),
    }
