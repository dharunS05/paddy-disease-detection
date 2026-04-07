import asyncio
import time
import numpy as np
import pandas as pd
import httpx
import openmeteo_requests
import requests_cache

from app.services.weather_info import (
    FEATURE_COLS, BASE_FEATURE_COLS, DISTRICT_COLS,
    TRAINING_DISTRICTS, DISEASES, RISK_LEVELS, WINDOW_SIZE
)
from app.services.weather_model_loader import WeatherModelLoader

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL  = "https://geocoding-api.open-meteo.com/v1/search"

# FIX 1: "relative_humidity_2m_mean" is NOT a valid Open-Meteo daily variable.
# The correct daily variable is "relative_humidity_2m_mean" only exists in hourly.
# Use "precipitation_hours" is also wrong — correct daily humidity proxy is
# "relative_humidity_2m_max" combined with "relative_humidity_2m_min" and averaged,
# OR fetch hourly and resample. Simplest correct fix: use max+min average.
DAILY_VARS = [
    "temperature_2m_mean", "temperature_2m_max", "temperature_2m_min",
    "relative_humidity_2m_max", "relative_humidity_2m_min",   # FIX: split into max+min
    "precipitation_sum", "wind_speed_10m_max",
]

# --- Cache only, NO retry wrapper -------------------------------------------
try:
    _cache_session = requests_cache.CachedSession('/tmp/.om_cache', expire_after=21600)
    _cache_session.request("GET", "https://example.com", timeout=0.01)
except Exception:
    _cache_session = requests_cache.CachedSession(backend='memory', expire_after=21600)

_openmeteo = openmeteo_requests.Client(session=_cache_session)

# Semaphore: strictly 1 network call at a time across all concurrent requests
_api_semaphore = asyncio.Semaphore(1)

# In-memory forecast cache: {(lat, lon): (timestamp, dataframe)}
_mem_cache: dict = {}
_MEM_CACHE_TTL = 21600  # 6 hours
# ----------------------------------------------------------------------------


async def geocode(query: str) -> list:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(GEOCODE_URL, params={"name": query, "count": 5, "language": "en"})
        r.raise_for_status()
        data = r.json()
    results = data.get("results", [])
    if not results:
        raise ValueError(f"Location not found: {query}")
    return [
        {
            "name": f"{r.get('name')}, {r.get('admin1', '')}, {r.get('country', '')}".strip(", "),
            "lat": r["latitude"],
            "lon": r["longitude"],
        }
        for r in results
    ]


def _fetch_forecast_sync(lat: float, lon: float) -> pd.DataFrame:
    """
    Primary: Open-Meteo SDK (flatbuffers).
    Fallback: plain httpx JSON request.

    FIX 2: Log SDK error before falling through so failures are visible in logs.
    FIX 3: JSON fallback now joins DAILY_VARS with comma so httpx sends a single
            'daily' query param instead of a broken repeated-key list.
    FIX 1: humidity is computed as the average of max and min daily humidity.
    """
    params = {
        "latitude":      lat,
        "longitude":     lon,
        "daily":         ",".join(DAILY_VARS),   # FIX 3: always join for URL params
        "forecast_days": 7,
        "timezone":      "auto",
    }

    sdk_err = None

    # --- Try SDK first (flatbuffers format) ---
    try:
        responses = _openmeteo.weather_api(FORECAST_URL, params=params)
        response  = responses[0]
        daily     = response.Daily()

        # Variable indices match DAILY_VARS order:
        # 0=temp_mean, 1=temp_max, 2=temp_min,
        # 3=humidity_max, 4=humidity_min, 5=precip, 6=wind
        humidity_max = daily.Variables(3).ValuesAsNumpy()
        humidity_min = daily.Variables(4).ValuesAsNumpy()

        daily_data = {
            "date": pd.date_range(
                start=pd.to_datetime(daily.Time(),    unit="s", utc=True),
                end=  pd.to_datetime(daily.TimeEnd(), unit="s", utc=True),
                freq= pd.Timedelta(seconds=daily.Interval()),
                inclusive="left",
            ),
            "temperature_mean": daily.Variables(0).ValuesAsNumpy(),
            "temperature_max":  daily.Variables(1).ValuesAsNumpy(),
            "temperature_min":  daily.Variables(2).ValuesAsNumpy(),
            "humidity":         (humidity_max + humidity_min) / 2.0,  # FIX 1
            "rainfall":         daily.Variables(5).ValuesAsNumpy(),
            "wind_speed":       daily.Variables(6).ValuesAsNumpy(),
        }
        df = pd.DataFrame(data=daily_data)
        df["date"] = df["date"].dt.tz_localize(None)
        return df.ffill().fillna(0)

    except Exception as e:
        sdk_err = e
        print(f"[weather_predictor] SDK fetch failed, trying JSON fallback: {e}")  # FIX 2

    # --- Fallback: plain JSON via httpx ---
    try:
        with httpx.Client(timeout=15) as client:
            r = client.get(FORECAST_URL, params=params)   # FIX 3: params already joined
            r.raise_for_status()
            data = r.json()
    except Exception as json_err:
        raise RuntimeError(
            f"Both SDK and JSON fallback failed.\n"
            f"SDK error: {sdk_err}\n"
            f"JSON error: {json_err}"
        )

    daily = data["daily"]
    # FIX 1: average max+min humidity in JSON path too
    humidity_max = np.array(daily["relative_humidity_2m_max"], dtype=float)
    humidity_min = np.array(daily["relative_humidity_2m_min"], dtype=float)

    df = pd.DataFrame({
        "date":             pd.to_datetime(daily["time"]),
        "temperature_mean": daily["temperature_2m_mean"],
        "temperature_max":  daily["temperature_2m_max"],
        "temperature_min":  daily["temperature_2m_min"],
        "humidity":         (humidity_max + humidity_min) / 2.0,   # FIX 1
        "rainfall":         daily["precipitation_sum"],
        "wind_speed":       daily["wind_speed_10m_max"],
    })
    return df.ffill().fillna(0)


async def fetch_forecast(lat: float, lon: float) -> pd.DataFrame:
    cache_key = (round(lat, 3), round(lon, 3))
    now = time.time()
    if cache_key in _mem_cache:
        cached_time, cached_df = _mem_cache[cache_key]
        if now - cached_time < _MEM_CACHE_TTL:
            return cached_df

    async with _api_semaphore:
        if cache_key in _mem_cache:
            cached_time, cached_df = _mem_cache[cache_key]
            if now - cached_time < _MEM_CACHE_TTL:
                return cached_df

        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, _fetch_forecast_sync, lat, lon)
        _mem_cache[cache_key] = (time.time(), df)
        return df


def _add_features(df: pd.DataFrame, district_name: str = None) -> pd.DataFrame:
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
        df[DISTRICT_COLS[0]] = 1

    return df


def _predict_ensemble(df: pd.DataFrame) -> list:
    scaler    = WeatherModelLoader.scaler
    xgb_model = WeatherModelLoader.xgb_model
    tcn_model = WeatherModelLoader.tcn_model

    X_raw    = df[FEATURE_COLS].values.astype(np.float32)
    X_scaled = scaler.transform(X_raw)

    results = []
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
        day_result = {
            "date": row["date"].strftime("%Y-%m-%d"),
            "weather": {
                "temp_mean":  round(float(row["temperature_mean"]), 1),
                "temp_max":   round(float(row["temperature_max"]), 1),
                "temp_min":   round(float(row["temperature_min"]), 1),
                "humidity":   round(float(row["humidity"]), 1),
                "rainfall":   round(float(row["rainfall"]), 2),
                "wind_speed": round(float(row["wind_speed"]), 1),
            },
            "diseases": {}
        }

        for i, disease in enumerate(DISEASES):
            xgb_class  = int(xgb_pred[i])
            xgb_onehot = np.zeros(3); xgb_onehot[xgb_class] = 1.0
            ensemble   = 0.6 * xgb_onehot + 0.4 * tcn_probs[i]
            final      = int(np.argmax(ensemble))

            day_result["diseases"][disease] = {
                "risk":       RISK_LEVELS[final],
                "confidence": round(float(np.max(ensemble)), 3),
                "xgb_risk":   RISK_LEVELS[xgb_class],
                "tcn_risk":   RISK_LEVELS[int(np.argmax(tcn_probs[i]))],
            }

        results.append(day_result)

    return results


async def get_forecast(lat: float, lon: float, location_name: str, district_name: str = None) -> dict:
    df          = await fetch_forecast(lat, lon)
    df          = _add_features(df, district_name=district_name)
    predictions = _predict_ensemble(df)
    return {
        "location": location_name,
        "lat": lat,
        "lon": lon,
        "forecast": predictions,
    }