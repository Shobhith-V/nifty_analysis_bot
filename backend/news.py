"""
News aggregation: RSS feeds (free, no key) + NewsAPI (optional, 100 req/day free).
RSS is polled every 5 min; NewsAPI every 15 min.
All articles are keyword-filtered for Indian market relevance.
"""

import asyncio
import logging
import os
import time
from datetime import date, datetime
from functools import partial
from typing import Any, Dict, List, Optional

import httpx
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

# ── RSS sources ────────────────────────────────────────────────────────────

RSS_FEEDS = [
    ("Economic Times Markets", "https://economictimes.indiatimes.com/markets/rss.cms"),
    ("MoneyControl",           "https://www.moneycontrol.com/rss/latestnews.xml"),
    ("NDTV Profit",            "https://feeds.feedburner.com/ndtvprofit-latest"),
    ("Business Standard",      "https://www.business-standard.com/rss/markets-106.rss"),
]

# Filter: at least one of these must appear in title or description
INDIA_KEYWORDS = {
    "nifty", "sensex", "nse", "bse", "fii", "dii", "rbi", "sebi",
    "india", "rupee", "inr", "repo rate", "inflation", "gdp india",
    "stock market", "stock", "equity", "midcap", "smallcap",
    "budget", "fiscal", "ipo", "f&o", "futures", "options",
}

# ── Sentiment ──────────────────────────────────────────────────────────────

BULLISH_KW = {
    "surge", "rally", "gains", "rise", "bull", "positive", "growth",
    "record", "high", "bounce", "recovery", "strong", "outperform",
    "buy", "upgrade", "beat", "profit", "inflow",
}
BEARISH_KW = {
    "fall", "drop", "crash", "down", "decline", "bear", "negative", "loss",
    "weak", "plunge", "sell-off", "correction", "underperform", "concern",
    "outflow", "downgrade", "miss", "warning", "cut",
}


def _sentiment(text: str) -> str:
    t = text.lower()
    b = sum(1 for kw in BULLISH_KW if kw in t)
    s = sum(1 for kw in BEARISH_KW if kw in t)
    if b > s: return "bullish"
    if s > b: return "bearish"
    return "neutral"


def _is_relevant(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in INDIA_KEYWORDS)


def _norm_time(ts_str: str) -> str:
    """Normalise various date formats to ISO string."""
    if not ts_str:
        return datetime.now(IST).isoformat()
    import email.utils
    try:
        dt = email.utils.parsedate_to_datetime(ts_str)
        return dt.isoformat()
    except Exception:
        pass
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(ts_str, fmt).isoformat()
        except Exception:
            pass
    return ts_str


# ── RSS fetching ───────────────────────────────────────────────────────────

_rss_cache: List[Dict] = []
_rss_last:  float = 0.0
RSS_TTL = 300  # 5 min


def _fetch_all_rss_sync() -> List[Dict]:
    try:
        import feedparser
    except ImportError:
        logger.warning("feedparser not installed — run: pip install feedparser")
        return []

    articles = []
    for source_name, url in RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:20]:
                title = entry.get("title", "")
                desc  = entry.get("summary", entry.get("description", ""))
                link  = entry.get("link", "")
                pub   = entry.get("published", entry.get("updated", ""))
                if not _is_relevant(title + " " + desc):
                    continue
                articles.append({
                    "title":        title,
                    "source":       source_name,
                    "url":          link,
                    "published_at": _norm_time(pub),
                    "sentiment":    _sentiment(title + " " + desc),
                    "via":          "rss",
                })
        except Exception as e:
            logger.warning(f"RSS feed {source_name} error: {e}")

    # Deduplicate by title prefix
    seen, unique = set(), []
    for a in articles:
        key = a["title"][:60].lower()
        if key not in seen:
            seen.add(key)
            unique.append(a)

    unique.sort(key=lambda x: x["published_at"], reverse=True)
    return unique[:40]


async def fetch_rss() -> List[Dict]:
    global _rss_cache, _rss_last
    now = time.time()
    if _rss_cache and (now - _rss_last) < RSS_TTL:
        return _rss_cache

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, _fetch_all_rss_sync)
    if result:
        _rss_cache = result
        _rss_last  = now
        logger.info(f"RSS: {len(result)} relevant articles")
    return _rss_cache


# ── NewsAPI ────────────────────────────────────────────────────────────────

_newsapi_cache: List[Dict] = []
_newsapi_last:  float = 0.0
NEWSAPI_TTL = 900  # 15 min — protect 100 req/day free quota


async def fetch_newsapi() -> List[Dict]:
    global _newsapi_cache, _newsapi_last
    if not NEWS_API_KEY:
        return []
    now = time.time()
    if _newsapi_cache and (now - _newsapi_last) < NEWSAPI_TTL:
        return _newsapi_cache

    try:
        # newsapi-python is sync — run in executor
        def _fetch():
            from newsapi import NewsApiClient
            client = NewsApiClient(api_key=NEWS_API_KEY)
            resp = client.get_everything(
                q="Nifty OR NSE OR Sensex OR FII OR RBI",
                language="en",
                sort_by="publishedAt",
                page_size=20,
            )
            out = []
            for a in resp.get("articles", []):
                title = a.get("title", "") or ""
                desc  = a.get("description", "") or ""
                if not _is_relevant(title + " " + desc):
                    continue
                out.append({
                    "title":        title,
                    "source":       a.get("source", {}).get("name", ""),
                    "url":          a.get("url", ""),
                    "published_at": a.get("publishedAt", ""),
                    "sentiment":    _sentiment(title + " " + desc),
                    "via":          "newsapi",
                })
            return out

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _fetch)
        if result:
            _newsapi_cache = result
            _newsapi_last  = now
            logger.info(f"NewsAPI: {len(result)} articles")
        return _newsapi_cache

    except Exception as e:
        logger.warning(f"NewsAPI error: {e}")
        return _newsapi_cache


# ── Economic calendar ──────────────────────────────────────────────────────

ECONOMIC_CALENDAR = [
    {"date": "2026-05-09", "event": "India CPI (Apr)",           "impact": "MEDIUM", "currency": "INR"},
    {"date": "2026-05-14", "event": "India WPI (Apr)",           "impact": "MEDIUM", "currency": "INR"},
    {"date": "2026-05-29", "event": "India GDP Q4 FY26",         "impact": "HIGH",   "currency": "INR"},
    {"date": "2026-06-05", "event": "RBI Monetary Policy",       "impact": "HIGH",   "currency": "INR"},
    {"date": "2026-06-12", "event": "India CPI (May)",           "impact": "MEDIUM", "currency": "INR"},
    {"date": "2026-07-01", "event": "Union Budget FY27",         "impact": "HIGH",   "currency": "INR"},
    {"date": "2026-08-05", "event": "RBI Monetary Policy",       "impact": "HIGH",   "currency": "INR"},
    {"date": "2026-10-07", "event": "RBI Monetary Policy",       "impact": "HIGH",   "currency": "INR"},
    {"date": "2026-12-04", "event": "RBI Monetary Policy",       "impact": "HIGH",   "currency": "INR"},
]


async def get_economic_calendar(days_ahead: int = 14) -> List[Dict]:
    today = datetime.now(IST).date()
    out = []
    for ev in ECONOMIC_CALENDAR:
        try:
            ev_date = date.fromisoformat(ev["date"])
            delta = (ev_date - today).days
            if 0 <= delta <= days_ahead:
                out.append({**ev, "days_away": delta, "today": delta == 0})
        except ValueError:
            continue
    return sorted(out, key=lambda x: x["date"])


# ── Aggregate refresh & public API ─────────────────────────────────────────

async def refresh_news():
    """Called by scheduler every 5 min."""
    await fetch_rss()
    # NewsAPI is called on its own 15-min TTL gate inside fetch_newsapi()
    await fetch_newsapi()


async def get_news_summary() -> Dict[str, Any]:
    """Merged response for GET /api/news."""
    rss     = await fetch_rss()
    newsapi = await fetch_newsapi()
    calendar = await get_economic_calendar()

    # Merge and deduplicate by title prefix
    all_articles = rss + newsapi
    seen, merged = set(), []
    for a in sorted(all_articles, key=lambda x: x.get("published_at", ""), reverse=True):
        key = a["title"][:60].lower()
        if key not in seen:
            seen.add(key)
            merged.append(a)

    sentiments = [a["sentiment"] for a in merged]
    bull = sentiments.count("bullish")
    bear = sentiments.count("bearish")

    return {
        "headlines":        merged[:20],
        "economic_calendar": calendar,
        "overall_sentiment": "bullish" if bull > bear else ("bearish" if bear > bull else "neutral"),
        "bull_count":       bull,
        "bear_count":       bear,
        "has_rss":          bool(rss),
        "has_newsapi":      bool(newsapi),
        "has_live_feed":    bool(rss or newsapi),
        "last_updated":     datetime.now(IST).isoformat(),
    }
