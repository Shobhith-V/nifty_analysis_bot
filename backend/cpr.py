"""
CPR (Central Pivot Range) calculator.
Computes daily, weekly, and monthly CPR + support/resistance levels.
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")


def calculate_cpr(high: float, low: float, close: float) -> Dict[str, float]:
    """
    Calculate full CPR and pivot levels from a single period's HLC.

    Returns:
        pivot, bc, tc, cpr_width,
        r1, r2, r3, s1, s2, s3
    """
    pivot = (high + low + close) / 3
    bc = (high + low) / 2
    tc = (pivot - bc) + pivot

    # Ensure TC > BC
    if tc < bc:
        tc, bc = bc, tc

    cpr_width = tc - bc
    cpr_pct = (cpr_width / pivot) * 100 if pivot else 0

    # Classic pivot support/resistance
    r1 = (2 * pivot) - low
    r2 = pivot + (high - low)
    r3 = high + 2 * (pivot - low)
    s1 = (2 * pivot) - high
    s2 = pivot - (high - low)
    s3 = low - 2 * (high - pivot)

    return {
        "pivot": round(pivot, 2),
        "bc": round(bc, 2),
        "tc": round(tc, 2),
        "cpr_width": round(cpr_width, 2),
        "cpr_width_pct": round(cpr_pct, 3),
        "r1": round(r1, 2),
        "r2": round(r2, 2),
        "r3": round(r3, 2),
        "s1": round(s1, 2),
        "s2": round(s2, 2),
        "s3": round(s3, 2),
    }


def classify_cpr(cpr_width_pct: float) -> str:
    """
    Classify CPR width to predict day type.
    Thresholds calibrated for NIFTY (~22,000 level).
    """
    if cpr_width_pct < 0.1:
        return "VERY_NARROW"   # Strong trending day expected
    elif cpr_width_pct < 0.2:
        return "NARROW"        # Trending day expected
    elif cpr_width_pct < 0.4:
        return "MODERATE"      # Mixed / watch for breakout
    else:
        return "WIDE"          # Sideways / range-bound day expected


def cpr_prediction_text(cpr_type: str) -> str:
    msgs = {
        "VERY_NARROW": "Very Narrow CPR → Strong Trending Day Expected",
        "NARROW": "Narrow CPR → Trending Day Expected",
        "MODERATE": "Moderate CPR → Watch for Range Breakout",
        "WIDE": "Wide CPR → Sideways / Range-Bound Day Expected",
    }
    return msgs.get(cpr_type, "")


def check_virgin_cpr(cpr: Dict[str, float], candles: List[Dict]) -> bool:
    """
    Virgin CPR: price has NOT touched the CPR band (BC to TC) today.
    Returns True if CPR is still virgin.
    """
    if not candles:
        return True
    tc = cpr["tc"]
    bc = cpr["bc"]
    for c in candles:
        # Check if any candle's range overlapped with CPR band
        if c["low"] <= tc and c["high"] >= bc:
            return False
    return True


def cpr_magnet_signal(cpr: Dict[str, float], current_price: float) -> Optional[str]:
    """
    Detect if price is approaching CPR from above or below.
    Returns signal string or None.
    """
    tc = cpr["tc"]
    bc = cpr["bc"]
    width = cpr["cpr_width"]
    approach_zone = max(width * 2, 15)  # within 2x CPR width or 15pts

    if bc - approach_zone <= current_price < bc:
        return "APPROACHING_CPR_FROM_BELOW"
    elif tc < current_price <= tc + approach_zone:
        return "APPROACHING_CPR_FROM_ABOVE"
    elif bc <= current_price <= tc:
        return "INSIDE_CPR"
    return None


def calculate_weekly_cpr(daily_candles: List[Dict]) -> Optional[Dict]:
    """
    Calculate weekly CPR using the previous complete week's data.
    daily_candles: list of daily OHLCV dicts sorted ascending.
    """
    if not daily_candles:
        return None

    now = datetime.now(IST)
    # Find previous week's candles (Mon-Fri)
    current_weekday = now.weekday()  # 0=Mon
    days_since_monday = current_weekday
    this_week_start = (now - timedelta(days=days_since_monday)).date()

    prev_week_candles = [
        c for c in daily_candles
        if datetime.fromtimestamp(c["time"], tz=IST).date() < this_week_start
    ]
    if not prev_week_candles:
        return None

    # Take last 5 trading days (one week)
    week = prev_week_candles[-5:]
    high = max(c["high"] for c in week)
    low = min(c["low"] for c in week)
    close = week[-1]["close"]

    result = calculate_cpr(high, low, close)
    result["period"] = "weekly"
    return result


def calculate_monthly_cpr(daily_candles: List[Dict]) -> Optional[Dict]:
    """Calculate monthly CPR using the previous complete month's OHLC."""
    if not daily_candles:
        return None

    now = datetime.now(IST)
    current_month_start = now.replace(day=1).date()

    prev_month_candles = [
        c for c in daily_candles
        if datetime.fromtimestamp(c["time"], tz=IST).date() < current_month_start
    ]
    if not prev_month_candles:
        return None

    high = max(c["high"] for c in prev_month_candles)
    low = min(c["low"] for c in prev_month_candles)
    close = prev_month_candles[-1]["close"]

    result = calculate_cpr(high, low, close)
    result["period"] = "monthly"
    return result


def build_cpr_response(
    prev_day: Dict,
    today_candles: List[Dict],
    daily_history: List[Dict],
    current_price: Optional[float] = None,
) -> Dict[str, Any]:
    """Build complete CPR API response."""
    daily_cpr = calculate_cpr(prev_day["high"], prev_day["low"], prev_day["close"])
    daily_cpr["period"] = "daily"

    cpr_type = classify_cpr(daily_cpr["cpr_width_pct"])
    is_virgin = check_virgin_cpr(daily_cpr, today_candles)

    magnet = None
    position = None
    if current_price:
        magnet = cpr_magnet_signal(daily_cpr, current_price)
        if current_price > daily_cpr["tc"]:
            position = "ABOVE_CPR"
        elif current_price < daily_cpr["bc"]:
            position = "BELOW_CPR"
        else:
            position = "INSIDE_CPR"

    weekly = calculate_weekly_cpr(daily_history)
    monthly = calculate_monthly_cpr(daily_history)

    return {
        "daily": daily_cpr,
        "weekly": weekly,
        "monthly": monthly,
        "cpr_type": cpr_type,
        "prediction": cpr_prediction_text(cpr_type),
        "is_virgin": is_virgin,
        "magnet_signal": magnet,
        "price_position": position,
        "current_price": current_price,
    }
