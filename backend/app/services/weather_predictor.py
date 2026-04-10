"""
weather_predictor.py  –  Production-ready weather fetch + XGBoost prediction
=============================================================================
Changes from previous version:
  • TCN model removed — XGBoost is now the sole prediction model
  • XGBoost receives shape (1, 147) = flattened 7-day window (matches training)
  • Scaler applied per-row (N, 21) — matches notebook
  • WeatherModelLoader.load() offloaded to threadpool (non-blocking)
  • Retry with exponential back-off
  • In-memory LRU cache with 30-min TTL
  • Safe fallback DataFrame when all retries exhausted
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
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

DAILY_VARS = (
    "temperature_2m_mean,"
    "temperature_2m_max,"
    "temperature_2m_min,"
    "relative_humidity_2m_mean,"
    "precipitation_sum,"
    "wind_speed_10m_max"
)

MAX_RETRIES     = 3
BASE_BACKOFF_S  = 3.0
BACKOFF_FACTOR  = 3.0
CONNECT_TIMEOUT = 8.0
READ_TIMEOUT    = 20.0

_CACHE_TTL_S = 1_800
_forecast_cache: dict[str, tuple[float, pd.DataFrame]] = {}

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

async def geocode(query: str) -> list[dict]:
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
# Weather fetch with retry + cache + fallback
# ---------------------------------------------------------------------------

def _cache_key(lat: float, lon: float) -> str:
    return f"{round(lat, 2)},{round(lon, 2)}"


def _get_cached(key: str) -> Optional[pd.DataFrame]:
    entry = _forecast_cache.get(key)
    if entry and (time.monotonic() - entry[0]) < _CACHE_TTL_S:
        log.info("Weather cache HIT for key=%s", key)
        return entry[1].copy()
    return None


def _set_cache(key: str, df: pd.DataFrame) -> None:
    _forecast_cache[key] = (time.monotonic(), df.copy())
    if len(_forecast_cache) > 128:
        oldest_key = min(_forecast_cache, key=lambda k: _forecast_cache[k][0])
        del _forecast_cache[oldest_key]


def _fallback_dataframe() -> pd.DataFrame:
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
    key    = _cache_key(lat, lon)
    cached = _get_cached(key)
    if cached is not None:
        return cached, False

    timeout = httpx.Timeout(connect=CONNECT_TIMEOUT, read=READ_TIMEOUT, write=5.0, pool=5.0)
    params  = {
        "latitude":      lat,
        "longitude":     lon,
        "daily":         DAILY_VARS,
        "forecast_days": 7,
        "timezone":      "auto",
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
            log.info("Weather fetch OK for (%.4f, %.4f) attempt %d", lat, lon, attempt)
            return df, False

        except httpx.TimeoutException as exc:
            last_exc = exc
            log.warning("Timeout attempt %d/%d (%.4f, %.4f): %s", attempt, MAX_RETRIES, lat, lon, exc)
        except httpx.HTTPStatusError as exc:
            last_exc = exc
            status = exc.response.status_code
            log.warning("HTTP %d attempt %d/%d (%.4f, %.4f)", status, attempt, MAX_RETRIES, lat, lon)
            if status < 500 and status != 429:
                break
        except (httpx.RequestError, ConnectionResetError, OSError) as exc:
            last_exc = exc
            log.warning("Connection error attempt %d/%d (%.4f, %.4f): %s", attempt, MAX_RETRIES, lat, lon, exc)
        except Exception as exc:
            last_exc = exc
            log.exception("Unexpected error attempt %d/%d (%.4f, %.4f)", attempt, MAX_RETRIES, lat, lon)

        if attempt < MAX_RETRIES:
            wait   = BASE_BACKOFF_S * (BACKOFF_FACTOR ** (attempt - 1))
            jitter = random.uniform(0.5, 1.5)
            await asyncio.sleep(wait * jitter)

    stale = _forecast_cache.get(key)
    if stale:
        log.error("All retries failed (%.4f, %.4f) – serving STALE cache. Error: %s", lat, lon, last_exc)
        return stale[1].copy(), True

    log.error("All retries failed (%.4f, %.4f) – serving FALLBACK. Error: %s", lat, lon, last_exc)
    return _fallback_dataframe(), True


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def _add_features(df: pd.DataFrame, district_name: Optional[str] = None) -> pd.DataFrame:
    df = df.copy()

    df["temp_avg_3d"]       = df["temperature_mean"].rolling(3, min_periods=1).mean()
    df["temp_avg_5d"]       = df["temperature_mean"].rolling(5, min_periods=1).mean()
    df["humidity_avg_3d"]   = df["humidity"].rolling(3, min_periods=1).mean()
    df["humidity_avg_5d"]   = df["humidity"].rolling(5, min_periods=1).mean()
    df["rainfall_sum_3d"]   = df["rainfall"].rolling(3, min_periods=1).sum()
    df["rainfall_sum_5d"]   = df["rainfall"].rolling(5, min_periods=1).sum()

    df["temp_humidity"]     = df["temperature_mean"] * df["humidity"]
    df["rainfall_humidity"] = df["rainfall"] * df["humidity"]

    df["month"]             = df["date"].dt.month
    df["day_of_year"]       = df["date"].dt.dayofyear

    for col in DISTRICT_COLS:
        df[col] = 0
    matched = f"district_{district_name}" if district_name in TRAINING_DISTRICTS else None
    if matched and matched in DISTRICT_COLS:
        df[matched] = 1
    else:
        df[DISTRICT_COLS[0]] = 1  # default: Thanjavur

    return df


# ---------------------------------------------------------------------------
# XGBoost-only prediction  —  shape: (1, WINDOW_SIZE * n_features) = (1, 147)
# ---------------------------------------------------------------------------

def _predict_xgboost(df: pd.DataFrame) -> list[dict]:
    """
    XGBoost expects shape (1, WINDOW_SIZE * n_features) = (1, 147)  [flattened window]
    Scaler was fit on (N, 21) per-row — apply per-row first, then flatten window.
    """
    WeatherModelLoader.load()
    scaler    = WeatherModelLoader.scaler
    xgb_model = WeatherModelLoader.xgb_model

    n_features = len(FEATURE_COLS)  # 21

    # Scale per-row: (7, 21) → (7, 21)
    X_raw    = df[FEATURE_COLS].values.astype(np.float32)   # shape: (7, 21)
    X_scaled = scaler.transform(X_raw)                       # shape: (7, 21)

    results: list[dict] = []

    for day_idx in range(len(df)):
        # Build (WINDOW_SIZE, n_features) window with zero-padding if needed
        start  = max(0, day_idx - WINDOW_SIZE + 1)
        window = X_scaled[start : day_idx + 1]               # shape: (<=7, 21)

        if len(window) < WINDOW_SIZE:
            pad    = np.zeros((WINDOW_SIZE - len(window), n_features))
            window = np.vstack([pad, window])                 # shape: (7, 21)

        # XGBoost: flatten entire window → (1, 147)
        xgb_input  = window.reshape(1, -1)                   # shape: (1, 147)
        xgb_pred   = xgb_model.predict(xgb_input)[0]         # shape: (4,) — one class per disease
        xgb_proba  = xgb_model.predict_proba(xgb_input)      # list of 4 arrays, each (1, 3)

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
            pred_class  = int(xgb_pred[i])
            confidence  = float(np.max(xgb_proba[i][0]))

            day_result["diseases"][disease] = {
                "risk":       RISK_LEVELS[pred_class],
                "confidence": round(confidence, 3),
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
    df, is_fallback = await fetch_forecast(lat, lon)
    df       = _add_features(df, district_name=district_name)

    # Run blocking prediction in threadpool — keeps event loop free
    loop     = asyncio.get_event_loop()
    forecast = await loop.run_in_executor(None, _predict_xgboost, df)

    return {
        "location":    location_name,
        "lat":         lat,
        "lon":         lon,
        "is_fallback": bool(is_fallback),
        "forecast":    forecast,
    }