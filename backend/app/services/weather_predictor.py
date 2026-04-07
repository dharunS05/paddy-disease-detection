"""
weather_predictor.py  –  Production-ready weather fetch + ML prediction
=======================================================================
Fixes applied vs original:
  • Comma-separated `daily` param  (fixes 502 / 524 from repeated params)
  • Retry with exponential back-off (fixes ConnectionResetError / transient failures)
  • Per-request and connect timeouts
  • In-memory LRU-style cache keyed on (lat, lon, date)  –  TTL = 30 min
  • Safe fallback DataFrame when all retries are exhausted
  • All exceptions are caught; the prediction pipeline never crashes on API failure
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from functools import lru_cache
from typing import Optional

import httpx
import numpy as np
import pandas as pd

from app.services.weather_info import (
    BASE_FEATURE_COLS, DISTRICT_COLS, DISEASES,
    FEATURE_COLS, RISK_LEVELS, TRAINING_DISTRICTS, WINDOW_SIZE,
)
from app.services.weather_model_loader import WeatherModelLoader

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL  = "https://geocoding-api.open-meteo.com/v1/search"

# Single comma-separated string — this is what Open-Meteo actually expects
DAILY_VARS = (
    "temperature_2m_mean,"
    "temperature_2m_max,"
    "temperature_2m_min,"
    "relative_humidity_2m_mean,"
    "precipitation_sum,"
    "wind_speed_10m_max"
)

# Retry / timeout knobs
MAX_RETRIES      = 3          # total attempts (1 original + 2 retries)
BASE_BACKOFF_S   = 3.0        # seconds before first retry (increased to avoid 429)
BACKOFF_FACTOR   = 3.0        # multiplier per attempt → waits: 3s, 9s
CONNECT_TIMEOUT  = 8.0        # seconds to establish TCP connection
READ_TIMEOUT     = 20.0       # seconds to receive full response

# Cache
_CACHE_TTL_S = 1_800          # 30 minutes
_forecast_cache: dict[str, tuple[float, pd.DataFrame]] = {}   # key → (ts, df)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

async def geocode(query: str) -> list[dict]:
    """Resolve a free-text location to (lat, lon) candidates."""
    timeout = httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=5.0, pool=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(
            GEOCODE_URL,
            params={"name": query, "count": 5, "language": "en"},
        )
        r.raise_for_status()
        data = r.json()

    results = data.get("results", [])
    if not results:
        raise ValueError(f"Location not found: {query!r}")

    return [
        {
            "name": f"{r.get('name')}, {r.get('admin1', '')}, {r.get('country', '')}".strip(", "),
            "lat":  r["latitude"],
            "lon":  r["longitude"],
        }
        for r in results
    ]


# ---------------------------------------------------------------------------
# Weather fetch  –  with retry + cache + fallback
# ---------------------------------------------------------------------------

def _cache_key(lat: float, lon: float) -> str:
    """Round to ~1 km grid so nearby points share a cache slot."""
    return f"{round(lat, 2)},{round(lon, 2)}"


def _get_cached(key: str) -> Optional[pd.DataFrame]:
    entry = _forecast_cache.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL_S:
        log.info("Weather cache HIT for key=%s", key)
        return entry[1].copy()
    return None


def _set_cache(key: str, df: pd.DataFrame) -> None:
    _forecast_cache[key] = (time.monotonic(), df.copy())
    # Evict old entries to keep memory bounded (keep latest 128 locations)
    if len(_forecast_cache) > 128:
        oldest_key = min(_forecast_cache, key=lambda k: _forecast_cache[k][0])
        del _forecast_cache[oldest_key]


def _fallback_dataframe() -> pd.DataFrame:
    """
    Return 7 rows of climatological-mean-ish safe defaults.
    The caller will log a warning; predictions will be conservative (Low risk).
    """
    today = pd.Timestamp.now().normalize()
    dates = pd.date_range(today, periods=7, freq="D")
    return pd.DataFrame({
        "date":             dates,
        "temperature_mean": [28.0] * 7,
        "temperature_max":  [32.0] * 7,
        "temperature_min":  [24.0] * 7,
        "humidity":         [70.0] * 7,
        "rainfall":         [0.0]  * 7,
        "wind_speed":       [10.0] * 7,
    })


async def fetch_forecast(lat: float, lon: float) -> tuple[pd.DataFrame, bool]:
    """
    Fetch 7-day daily forecast from Open-Meteo.

    Strategy
    --------
    1. Return cached data if still fresh.
    2. Try the API up to MAX_RETRIES times with exponential back-off + jitter.
    3. On total failure: serve stale cache or safe fallback DataFrame.

    Returns
    -------
    (df, is_fallback) — is_fallback=True when live data could not be fetched.
    Never raises — always returns a valid DataFrame.
    """
    key    = _cache_key(lat, lon)
    cached = _get_cached(key)
    if cached is not None:
        return cached, False   # ← fresh cache = not fallback

    timeout = httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=5.0, pool=5.0)
    params  = {
        "latitude":     lat,
        "longitude":    lon,
        "daily":        DAILY_VARS,      # ← single comma-separated string (key fix)
        "forecast_days": 7,
        "timezone":     "auto",
    }

    last_exc: Exception = RuntimeError("No attempts made")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(FORECAST_URL, params=params)
                r.raise_for_status()
                data = r.json()

            daily = data["daily"]
            df = pd.DataFrame({
                "date":             pd.to_datetime(daily["time"]),
                "temperature_mean": daily["temperature_2m_mean"],
                "temperature_max":  daily["temperature_2m_max"],
                "temperature_min":  daily["temperature_2m_min"],
                "humidity":         daily["relative_humidity_2m_mean"],
                "rainfall":         daily["precipitation_sum"],
                "wind_speed":       daily["wind_speed_10m_max"],
            })
            df = df.ffill().fillna(0)

            _set_cache(key, df)
            log.info("Weather fetch OK for (%.4f, %.4f) on attempt %d", lat, lon, attempt)
            return df, False   # ← live data = not fallback

        except httpx.TimeoutException as exc:
            last_exc = exc
            log.warning(
                "Weather API timeout on attempt %d/%d for (%.4f, %.4f): %s",
                attempt, MAX_RETRIES, lat, lon, exc,
            )
        except httpx.HTTPStatusError as exc:
            last_exc = exc
            status = exc.response.status_code
            log.warning(
                "Weather API HTTP %d on attempt %d/%d for (%.4f, %.4f)",
                status, attempt, MAX_RETRIES, lat, lon,
            )
            # 4xx errors (except 429) are not worth retrying
            if status < 500 and status != 429:
                break
        except (httpx.RequestError, ConnectionResetError, OSError) as exc:
            last_exc = exc
            log.warning(
                "Weather API connection error on attempt %d/%d for (%.4f, %.4f): %s",
                attempt, MAX_RETRIES, lat, lon, exc,
            )
        except Exception as exc:
            last_exc = exc
            log.exception(
                "Unexpected error on attempt %d/%d for (%.4f, %.4f)",
                attempt, MAX_RETRIES, lat, lon,
            )

        if attempt < MAX_RETRIES:
            wait   = BASE_BACKOFF_S * (BACKOFF_FACTOR ** (attempt - 1))
            jitter = random.uniform(0.5, 1.5)
            log.info("Retrying in %.1fs (with jitter) ...", wait * jitter)
            await asyncio.sleep(wait * jitter)

    # All retries exhausted – use stale cache if available, else fallback
    stale = _forecast_cache.get(key)
    if stale:
        log.error(
            "All retries failed for (%.4f, %.4f) – serving STALE cache. Last error: %s",
            lat, lon, last_exc,
        )
        return stale[1].copy(), True   # ← stale = is_fallback

    log.error(
        "All retries failed for (%.4f, %.4f) – serving FALLBACK data. Last error: %s",
        lat, lon, last_exc,
    )
    return _fallback_dataframe(), True   # ← fallback = is_fallback


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def _add_features(df: pd.DataFrame, district_name: Optional[str] = None) -> pd.DataFrame:
    df = df.copy()

    # Rolling aggregates
    df["temp_avg_3d"]       = df["temperature_mean"].rolling(3, min_periods=1).mean()
    df["temp_avg_5d"]       = df["temperature_mean"].rolling(5, min_periods=1).mean()
    df["humidity_avg_3d"]   = df["humidity"].rolling(3, min_periods=1).mean()
    df["humidity_avg_5d"]   = df["humidity"].rolling(5, min_periods=1).mean()
    df["rainfall_sum_3d"]   = df["rainfall"].rolling(3, min_periods=1).sum()
    df["rainfall_sum_5d"]   = df["rainfall"].rolling(5, min_periods=1).sum()

    # Interaction features
    df["temp_humidity"]     = df["temperature_mean"] * df["humidity"]
    df["rainfall_humidity"] = df["rainfall"] * df["humidity"]

    # Calendar
    df["month"]             = df["date"].dt.month
    df["day_of_year"]       = df["date"].dt.dayofyear

    # District one-hot
    for col in DISTRICT_COLS:
        df[col] = 0
    matched = f"district_{district_name}" if district_name in TRAINING_DISTRICTS else None
    if matched and matched in DISTRICT_COLS:
        df[matched] = 1
    else:
        df[DISTRICT_COLS[0]] = 1   # default Thanjavur

    return df


# ---------------------------------------------------------------------------
# Ensemble prediction
# ---------------------------------------------------------------------------

def _predict_ensemble(df: pd.DataFrame) -> list[dict]:
    WeatherModelLoader.load()
    scaler    = WeatherModelLoader.scaler
    xgb_model = WeatherModelLoader.xgb_model
    tcn_model = WeatherModelLoader.tcn_model

    X_raw    = df[FEATURE_COLS].values.astype(np.float32)
    X_scaled = scaler.transform(X_raw)

    results: list[dict] = []

    for day_idx in range(len(df)):
        start  = max(0, day_idx - WINDOW_SIZE + 1)
        window = X_scaled[start:day_idx + 1]
        if len(window) < WINDOW_SIZE:
            pad    = np.zeros((WINDOW_SIZE - len(window), X_scaled.shape[1]))
            window = np.vstack([pad, window])

        xgb_pred  = xgb_model.predict(window.reshape(1, -1))[0]
        tcn_raw   = tcn_model.predict(window[np.newaxis, ...], verbose=0)
        tcn_probs = [tcn_raw[i][0] for i in range(4)]

        row = df.iloc[day_idx]
        day_result: dict = {
            "date": row["date"].strftime("%Y-%m-%d"),
            "weather": {
                "temp_mean":  round(float(row["temperature_mean"]), 1),
                "temp_max":   round(float(row["temperature_max"]),  1),
                "temp_min":   round(float(row["temperature_min"]),  1),
                "humidity":   round(float(row["humidity"]),         1),
                "rainfall":   round(float(row["rainfall"]),         2),
                "wind_speed": round(float(row["wind_speed"]),       1),
            },
            "diseases": {},
        }

        for i, disease in enumerate(DISEASES):
            xgb_class  = int(xgb_pred[i])
            xgb_onehot = np.zeros(3)
            xgb_onehot[xgb_class] = 1.0
            ensemble = 0.6 * xgb_onehot + 0.4 * tcn_probs[i]
            final    = int(np.argmax(ensemble))

            day_result["diseases"][disease] = {
                "risk":       RISK_LEVELS[final],
                "confidence": round(float(np.max(ensemble)), 3),
                "xgb_risk":   RISK_LEVELS[xgb_class],
                "tcn_risk":   RISK_LEVELS[int(np.argmax(tcn_probs[i]))],
            }

        results.append(day_result)

    return results


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def get_forecast(
    lat: float,
    lon: float,
    location_name: str,
    district_name: Optional[str] = None,
) -> dict:
    """
    Fetch weather, engineer features, and run ensemble prediction.

    Always returns a valid response dict — never raises on API failure.
    The `is_fallback` flag in the response lets the frontend show a banner
    when live data could not be retrieved.
    """
    df, is_fallback = await fetch_forecast(lat, lon)   # ← unpack (df, is_fallback)
    df       = _add_features(df, district_name=district_name)
    forecast = _predict_ensemble(df)

    return {
        "location":    location_name,
        "lat":         lat,
        "lon":         lon,
        "is_fallback": bool(is_fallback),   # ← native Python bool, safe for JSON
        "forecast":    forecast,
    }