"""
Technical indicators: VWAP, EMA, RSI, MACD, Bollinger Bands.
All calculations are done on pandas DataFrames for efficiency.
"""

import logging
from typing import List, Dict, Optional, Tuple
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def candles_to_df(candles: List[Dict]) -> pd.DataFrame:
    if not candles:
        return pd.DataFrame()
    df = pd.DataFrame(candles)
    df = df.sort_values("time").reset_index(drop=True)
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def calculate_vwap(df: pd.DataFrame) -> pd.Series:
    """
    VWAP = cumsum(typical_price * volume) / cumsum(volume)
    Resets at 9:15 AM IST (session start) — assumes df is already filtered to today.
    """
    if df.empty:
        return pd.Series(dtype=float)
    tp = (df["high"] + df["low"] + df["close"]) / 3
    vwap = (tp * df["volume"]).cumsum() / df["volume"].cumsum()
    return vwap.round(2)


def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean().round(2)


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = (-delta).clip(lower=0)
    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.round(2)


def calculate_macd(
    series: pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """Returns (macd_line, signal_line, histogram)."""
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    sig = macd.ewm(span=signal, adjust=False).mean()
    hist = macd - sig
    return macd.round(2), sig.round(2), hist.round(2)


def calculate_bollinger_bands(
    series: pd.Series, period: int = 20, num_std: float = 2.0
) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """Returns (upper, middle, lower)."""
    mid = series.rolling(period).mean()
    std = series.rolling(period).std()
    upper = (mid + num_std * std).round(2)
    lower = (mid - num_std * std).round(2)
    return upper, mid.round(2), lower


def calculate_all_indicators(df: pd.DataFrame) -> Dict:
    """Compute all indicators and return as dict of lists (for JSON serialization)."""
    if df.empty:
        return {}

    close = df["close"]
    vwap = calculate_vwap(df)
    ema9 = calculate_ema(close, 9)
    ema21 = calculate_ema(close, 21)
    ema50 = calculate_ema(close, 50)
    rsi14 = calculate_rsi(close, 14)
    macd_line, macd_sig, macd_hist = calculate_macd(close)
    bb_upper, bb_mid, bb_lower = calculate_bollinger_bands(close)

    return {
        "vwap": vwap.tolist(),
        "ema9": ema9.tolist(),
        "ema21": ema21.tolist(),
        "ema50": ema50.tolist(),
        "rsi14": rsi14.tolist(),
        "macd": macd_line.tolist(),
        "macd_signal": macd_sig.tolist(),
        "macd_hist": macd_hist.tolist(),
        "bb_upper": bb_upper.tolist(),
        "bb_mid": bb_mid.tolist(),
        "bb_lower": bb_lower.tolist(),
        "timestamps": df["time"].tolist(),
    }


def get_current_indicators(candles: List[Dict]) -> Dict:
    """Get latest indicator values (for dashboard display)."""
    df = candles_to_df(candles)
    if df.empty:
        return {}

    close = df["close"]
    vwap = calculate_vwap(df)
    ema9 = calculate_ema(close, 9)
    ema21 = calculate_ema(close, 21)
    ema50 = calculate_ema(close, 50)
    rsi_15m = calculate_rsi(close, 14)
    macd_line, macd_sig, macd_hist = calculate_macd(close)

    current_price = float(close.iloc[-1]) if not close.empty else None
    current_vwap = float(vwap.iloc[-1]) if not vwap.empty else None

    return {
        "price": current_price,
        "vwap": current_vwap,
        "ema9": float(ema9.iloc[-1]) if not ema9.empty else None,
        "ema21": float(ema21.iloc[-1]) if not ema21.empty else None,
        "ema50": float(ema50.iloc[-1]) if not ema50.empty else None,
        "rsi14": float(rsi_15m.iloc[-1]) if not rsi_15m.empty else None,
        "macd": float(macd_line.iloc[-1]) if not macd_line.empty else None,
        "macd_signal": float(macd_sig.iloc[-1]) if not macd_sig.empty else None,
        "macd_hist": float(macd_hist.iloc[-1]) if not macd_hist.empty else None,
        "above_vwap": (current_price > current_vwap) if current_price and current_vwap else None,
    }


def calculate_volume_profile(candles: List[Dict], bins: int = 20) -> List[Dict]:
    """Build a simple volume profile (volume at price histogram)."""
    df = candles_to_df(candles)
    if df.empty:
        return []

    price_min = df["low"].min()
    price_max = df["high"].max()
    price_range = price_max - price_min
    if price_range == 0:
        return []

    bin_size = price_range / bins
    profile = []
    for i in range(bins):
        level_low = price_min + i * bin_size
        level_high = level_low + bin_size
        level_mid = (level_low + level_high) / 2

        # Sum volume for candles whose typical price falls in this bin
        mask = (df["close"] >= level_low) & (df["close"] < level_high)
        vol = int(df.loc[mask, "volume"].sum())
        profile.append({
            "price": round(level_mid, 2),
            "volume": vol,
        })

    max_vol = max((p["volume"] for p in profile), default=1)
    for p in profile:
        p["pct"] = round(p["volume"] / max_vol * 100, 1) if max_vol else 0

    return profile


def get_vwap_series(candles: List[Dict]) -> List[Dict]:
    """Return VWAP as time-series for chart overlay."""
    df = candles_to_df(candles)
    if df.empty:
        return []
    vwap = calculate_vwap(df)
    return [
        {"time": int(df.iloc[i]["time"]), "value": float(vwap.iloc[i])}
        for i in range(len(df))
        if not pd.isna(vwap.iloc[i])
    ]
