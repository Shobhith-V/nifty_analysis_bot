"""
Signal detection: gap analysis, ORB, reversal patterns, volume surge.
"""

import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, time as dtime
import pytz
import pandas as pd
import numpy as np

from indicators import candles_to_df, calculate_rsi, calculate_macd, calculate_vwap

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

# ─── Gap Analysis ──────────────────────────────────────────────────────────────

GAP_UP_THRESHOLD = 0.3       # %
GAP_DOWN_THRESHOLD = -0.3    # %
GAP_SIG_UP = 0.75            # %
GAP_SIG_DOWN = -0.75         # %


def analyze_gap(prev_close: float, today_open: float) -> Dict[str, Any]:
    """Calculate gap metrics between previous close and today's open."""
    if prev_close <= 0:
        return {"error": "Invalid previous close"}

    gap_pts = today_open - prev_close
    gap_pct = (gap_pts / prev_close) * 100

    if gap_pct >= GAP_SIG_UP:
        gap_type = "SIGNIFICANT_GAP_UP"
    elif gap_pct >= GAP_UP_THRESHOLD:
        gap_type = "GAP_UP"
    elif gap_pct <= GAP_SIG_DOWN:
        gap_type = "SIGNIFICANT_GAP_DOWN"
    elif gap_pct <= GAP_DOWN_THRESHOLD:
        gap_type = "GAP_DOWN"
    else:
        gap_type = "FLAT_OPEN"

    return {
        "prev_close": round(prev_close, 2),
        "today_open": round(today_open, 2),
        "gap_points": round(gap_pts, 2),
        "gap_pct": round(gap_pct, 3),
        "gap_type": gap_type,
        "gap_zone": {
            "low": round(min(prev_close, today_open), 2),
            "high": round(max(prev_close, today_open), 2),
        },
    }


def check_gap_fill(gap_info: Dict, candles: List[Dict]) -> Dict[str, Any]:
    """Track how much of the gap has been filled during the session."""
    if gap_info.get("gap_type") == "FLAT_OPEN" or not candles:
        return {"filled": True, "fill_pct": 100.0, "fill_time": None}

    prev_close = gap_info["prev_close"]
    today_open = gap_info["today_open"]
    gap_pts = abs(gap_info["gap_points"])
    is_gap_up = gap_info["gap_points"] > 0

    best_fill = 0.0
    fill_time = None

    for c in candles:
        if is_gap_up:
            # Gap filled when price drops to prev_close
            fill_pct = min(100.0, max(0, (today_open - c["low"]) / gap_pts * 100))
        else:
            fill_pct = min(100.0, max(0, (c["high"] - today_open) / gap_pts * 100))

        if fill_pct > best_fill:
            best_fill = fill_pct
            if fill_pct >= 100.0 and fill_time is None:
                fill_time = c["time"]

    return {
        "filled": best_fill >= 100.0,
        "fill_pct": round(best_fill, 1),
        "fill_time": fill_time,
        "gap_zone_low": gap_info["gap_zone"]["low"],
        "gap_zone_high": gap_info["gap_zone"]["high"],
    }


# ─── Opening Range Breakout ─────────────────────────────────────────────────

def calculate_orb(candles: List[Dict], minutes: int = 15) -> Optional[Dict]:
    """
    Calculate Opening Range for the first `minutes` of the session.
    Returns ORB high, low and current breakout/breakdown status.
    """
    if not candles:
        return None

    orb_candles = []
    for c in candles:
        ts = datetime.fromtimestamp(c["time"], tz=IST)
        session_start = ts.replace(hour=9, minute=15, second=0, microsecond=0)
        orb_end = ts.replace(
            hour=(9 + (minutes + 15) // 60) % 24,
            minute=(15 + minutes) % 60,
            second=0,
            microsecond=0,
        )
        if session_start <= ts < orb_end:
            orb_candles.append(c)

    if not orb_candles:
        return None

    orb_high = max(c["high"] for c in orb_candles)
    orb_low = min(c["low"] for c in orb_candles)
    orb_close = orb_candles[-1]["close"]
    orb_range = orb_high - orb_low

    current_price = candles[-1]["close"] if candles else orb_close
    avg_vol_orb = sum(c["volume"] for c in orb_candles) / len(orb_candles) if orb_candles else 0

    # Volume confirmation: last candle's volume vs ORB average
    last_vol = candles[-1]["volume"] if candles else 0
    vol_confirmed = last_vol >= avg_vol_orb * 1.5

    status = "INSIDE_RANGE"
    if current_price > orb_high:
        status = "BREAKOUT" if vol_confirmed else "BREAKOUT_NO_VOL"
    elif current_price < orb_low:
        status = "BREAKDOWN" if vol_confirmed else "BREAKDOWN_NO_VOL"

    return {
        "orb_high": round(orb_high, 2),
        "orb_low": round(orb_low, 2),
        "orb_range": round(orb_range, 2),
        "orb_minutes": minutes,
        "status": status,
        "volume_confirmed": vol_confirmed,
        "current_price": round(current_price, 2),
    }


# ─── Volume Analysis ────────────────────────────────────────────────────────

def analyze_volume(candles: List[Dict]) -> Dict[str, Any]:
    """Volume surge detection and cumulative analysis."""
    if not candles:
        return {}

    df = candles_to_df(candles)
    vols = df["volume"]
    current_vol = int(vols.iloc[-1])
    avg_10 = float(vols.tail(11).head(10).mean()) if len(vols) >= 11 else float(vols.mean())
    surge = current_vol > avg_10 * 2

    cum_vol = int(vols.sum())
    # Expected cumulative volume: linear extrapolation from trading minutes elapsed
    elapsed_candles = len(candles)
    total_session_candles = 375  # 9:15-3:30 = 375 minutes of 1-min candles
    expected_cum_vol = (cum_vol / elapsed_candles * total_session_candles) if elapsed_candles else 0

    return {
        "current_volume": current_vol,
        "avg_10_period": round(avg_10, 0),
        "volume_surge": surge,
        "surge_ratio": round(current_vol / avg_10, 2) if avg_10 else 0,
        "cumulative_volume": cum_vol,
        "expected_session_volume": round(expected_cum_vol, 0),
        "volume_pace_pct": round(cum_vol / expected_cum_vol * 100, 1) if expected_cum_vol else 0,
    }


# ─── Candlestick Pattern Detection ─────────────────────────────────────────

def _body(c: Dict) -> float:
    return abs(c["close"] - c["open"])

def _upper_shadow(c: Dict) -> float:
    return c["high"] - max(c["open"], c["close"])

def _lower_shadow(c: Dict) -> float:
    return min(c["open"], c["close"]) - c["low"]

def _range(c: Dict) -> float:
    return c["high"] - c["low"]


def detect_hammer(c: Dict) -> Optional[str]:
    body = _body(c)
    lower = _lower_shadow(c)
    upper = _upper_shadow(c)
    rng = _range(c)
    if rng == 0:
        return None
    if lower >= 2 * body and upper <= body * 0.3 and body / rng > 0.1:
        return "HAMMER" if c["close"] >= c["open"] else "HANGING_MAN"
    if upper >= 2 * body and lower <= body * 0.3 and body / rng > 0.1:
        return "INVERTED_HAMMER" if c["close"] >= c["open"] else "SHOOTING_STAR"
    return None


def detect_doji(c: Dict) -> bool:
    rng = _range(c)
    if rng == 0:
        return True
    return _body(c) / rng < 0.1


def detect_engulfing(prev: Dict, curr: Dict) -> Optional[str]:
    if prev["close"] < prev["open"]:  # prev is bearish
        if curr["open"] <= prev["close"] and curr["close"] >= prev["open"]:
            return "BULLISH_ENGULFING"
    elif prev["close"] > prev["open"]:  # prev is bullish
        if curr["open"] >= prev["close"] and curr["close"] <= prev["open"]:
            return "BEARISH_ENGULFING"
    return None


def detect_rsi_divergence(candles: List[Dict], lookback: int = 20) -> Optional[str]:
    """Simple RSI divergence: last 20 candles."""
    df = candles_to_df(candles[-lookback:] if len(candles) > lookback else candles)
    if len(df) < 14:
        return None

    rsi = calculate_rsi(df["close"], 14)
    prices = df["close"]

    # Bullish divergence: price lower low, RSI higher low
    if prices.iloc[-1] < prices.iloc[-lookback // 2]:
        if rsi.iloc[-1] > rsi.iloc[-lookback // 2]:
            return "BULLISH_RSI_DIVERGENCE"

    # Bearish divergence: price higher high, RSI lower high
    if prices.iloc[-1] > prices.iloc[-lookback // 2]:
        if rsi.iloc[-1] < rsi.iloc[-lookback // 2]:
            return "BEARISH_RSI_DIVERGENCE"

    return None


def detect_macd_crossover(candles: List[Dict]) -> Optional[str]:
    df = candles_to_df(candles)
    if len(df) < 30:
        return None

    _, sig, hist = calculate_macd(df["close"])
    if len(hist) < 2:
        return None

    prev_h = hist.iloc[-2]
    curr_h = hist.iloc[-1]

    if prev_h < 0 and curr_h >= 0:
        return "MACD_BULLISH_CROSS"
    elif prev_h > 0 and curr_h <= 0:
        return "MACD_BEARISH_CROSS"
    return None


def build_signals(
    candles: List[Dict],
    cpr: Dict,
    gap_info: Dict,
    orb_15: Optional[Dict] = None,
) -> List[Dict]:
    """
    Run all signal detectors and return a unified signal list.
    Each signal: {time, price, type, direction, confidence, description}
    """
    signals = []
    if not candles:
        return signals

    def _add(ts, price, sig_type, direction, confidence, desc):
        signals.append({
            "time": ts,
            "price": round(price, 2),
            "type": sig_type,
            "direction": direction,  # "BULLISH" | "BEARISH" | "NEUTRAL"
            "confidence": confidence,  # 1-5
            "description": desc,
        })

    # Candlestick patterns (last 3 candles)
    recent = candles[-3:] if len(candles) >= 3 else candles
    for i, c in enumerate(recent):
        pattern = detect_hammer(c)
        if pattern in ("HAMMER",):
            _add(c["time"], c["close"], pattern, "BULLISH", 3, f"Hammer at {c['close']:.0f}")
        elif pattern in ("SHOOTING_STAR", "HANGING_MAN"):
            _add(c["time"], c["close"], pattern, "BEARISH", 3, f"{pattern} at {c['close']:.0f}")
        elif pattern in ("INVERTED_HAMMER",):
            _add(c["time"], c["close"], pattern, "BULLISH", 2, f"Inverted Hammer at {c['close']:.0f}")

        if detect_doji(c):
            # Doji at key levels gets higher confidence
            at_cpr = abs(c["close"] - cpr.get("pivot", 0)) < 10
            conf = 4 if at_cpr else 2
            _add(c["time"], c["close"], "DOJI", "NEUTRAL", conf, f"Doji at {c['close']:.0f}")

        if i > 0:
            eng = detect_engulfing(recent[i - 1], c)
            if eng == "BULLISH_ENGULFING":
                _add(c["time"], c["close"], eng, "BULLISH", 4, f"Bullish Engulfing at {c['close']:.0f}")
            elif eng == "BEARISH_ENGULFING":
                _add(c["time"], c["close"], eng, "BEARISH", 4, f"Bearish Engulfing at {c['close']:.0f}")

    # RSI divergence
    div = detect_rsi_divergence(candles)
    if div:
        c = candles[-1]
        direction = "BULLISH" if "BULLISH" in div else "BEARISH"
        _add(c["time"], c["close"], div, direction, 4, f"RSI Divergence detected")

    # MACD crossover
    cross = detect_macd_crossover(candles)
    if cross:
        c = candles[-1]
        direction = "BULLISH" if "BULLISH" in cross else "BEARISH"
        _add(c["time"], c["close"], cross, direction, 3, f"{cross} at {c['close']:.0f}")

    # ORB breakout signal
    if orb_15 and orb_15.get("status") in ("BREAKOUT", "BREAKDOWN"):
        c = candles[-1]
        direction = "BULLISH" if orb_15["status"] == "BREAKOUT" else "BEARISH"
        conf = 5 if orb_15["volume_confirmed"] else 3
        _add(c["time"], c["close"], f"ORB_{orb_15['status']}", direction, conf,
             f"ORB {orb_15['status']} at {c['close']:.0f}")

    # Sort by time desc
    signals.sort(key=lambda x: x["time"], reverse=True)
    return signals[:20]  # latest 20 signals


# ─── Bias Engine ─────────────────────────────────────────────────────────────

def calculate_bias(
    cpr: Dict,
    gap_info: Dict,
    indicators: Dict,
    global_markets: Dict,
    is_expiry: bool = False,
) -> Dict[str, Any]:
    """
    Aggregate all signals into a daily bias prediction.
    Returns: bias (BULLISH/BEARISH/NEUTRAL), confidence %, factors list.
    """
    score = 0  # positive = bullish, negative = bearish
    factors = []

    # CPR
    cpr_type = cpr.get("cpr_type", "")
    pos = cpr.get("price_position")
    if pos == "ABOVE_CPR":
        score += 2
        factors.append({"factor": "Price above CPR", "signal": "BULLISH"})
    elif pos == "BELOW_CPR":
        score -= 2
        factors.append({"factor": "Price below CPR", "signal": "BEARISH"})

    if cpr_type == "NARROW":
        factors.append({"factor": "Narrow CPR → Trending day expected", "signal": "NEUTRAL"})

    # Gap
    gap_type = gap_info.get("gap_type", "")
    if "GAP_UP" in gap_type:
        pts = 2 if "SIGNIFICANT" in gap_type else 1
        score += pts
        factors.append({"factor": f"Gap Up ({gap_info.get('gap_pct', 0):.2f}%)", "signal": "BULLISH"})
    elif "GAP_DOWN" in gap_type:
        pts = 2 if "SIGNIFICANT" in gap_type else 1
        score -= pts
        factors.append({"factor": f"Gap Down ({gap_info.get('gap_pct', 0):.2f}%)", "signal": "BEARISH"})

    # RSI
    rsi = indicators.get("rsi14")
    if rsi is not None:
        if rsi > 60:
            score += 1
            factors.append({"factor": f"RSI {rsi:.0f} — Bullish momentum", "signal": "BULLISH"})
        elif rsi < 40:
            score -= 1
            factors.append({"factor": f"RSI {rsi:.0f} — Bearish momentum", "signal": "BEARISH"})

    # VWAP
    above_vwap = indicators.get("above_vwap")
    if above_vwap is True:
        score += 1
        factors.append({"factor": "Price above VWAP", "signal": "BULLISH"})
    elif above_vwap is False:
        score -= 1
        factors.append({"factor": "Price below VWAP", "signal": "BEARISH"})

    # Global markets
    sgx = global_markets.get("SGX_NIFTY", {})
    sgx_chg = sgx.get("change_pct", 0) if sgx else 0
    if sgx_chg > 0.3:
        score += 1
        factors.append({"factor": f"SGX Nifty up {sgx_chg:.2f}%", "signal": "BULLISH"})
    elif sgx_chg < -0.3:
        score -= 1
        factors.append({"factor": f"SGX Nifty down {sgx_chg:.2f}%", "signal": "BEARISH"})

    if is_expiry:
        factors.append({"factor": "Expiry day — high volatility expected", "signal": "NEUTRAL"})

    # Convert score to bias
    max_score = 10
    confidence = min(100, int(abs(score) / max_score * 100))
    if score >= 2:
        bias = "BULLISH"
    elif score <= -2:
        bias = "BEARISH"
    else:
        bias = "NEUTRAL"

    return {
        "bias": bias,
        "score": score,
        "confidence": confidence,
        "factors": factors,
        "disclaimer": "ANALYSIS ONLY. This bot does not place orders. "
                      "Past signals do not guarantee future performance.",
    }
