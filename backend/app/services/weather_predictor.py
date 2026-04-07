import asyncio
import numpy as np
import pandas as pd
import httpx
import openmeteo_requests
import requests_cache
from retry_requests import retry

from app.services.weather_info import (
    FEATURE_COLS, BASE_FEATURE_COLS, DISTRICT_COLS,
    TRAINING_DISTRICTS, DISEASES, RISK_LEVELS, WINDOW_SIZE
)
from app.services.weather_model_loader import WeatherModelLoader

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
GEOCODE_URL  = "https://geocoding-api.open-meteo.com/v1/search"

DAILY_VARS = [
    "temperature_2m_mean", "temperature_2m_max", "temperature_2m_min",
    "relative_humidity_2m_mean", "precipitation_sum", "wind_speed_10m_max",
]

# --- Official Open-Meteo SDK client (sync, with cache + auto-retry) ----------
# Cache for 6 hours — reduces API hits significantly
_cache_session = requests_cache.CachedSession('.cache', expire_after=21600)
_retry_session = retry(_cache_session, retries=3, backoff_factor=0.5)
_openmeteo    = openmeteo_requests.Client(session=_retry_session)

# Semaphore: only 1 real API call at a time to avoid "too many concurrent requests"
_api_semaphore = asyncio.Semaphore(1)
# -----------------------------------------------------------------------------


# geocode still uses httpx (geocoding API works fine with JSON)
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
    Calls Open-Meteo via the official SDK (synchronous).
    Uses FlatBuffers under the hood — more reliable than raw JSON endpoint.
    Cache: 1 hour. Retries: 5 with exponential backoff.
    """
    params = {
        "latitude":     lat,
        "longitude":    lon,
        "daily":        DAILY_VARS,   # SDK accepts a list directly
        "forecast_days": 7,
        "timezone":     "auto",
    }

    responses = _openmeteo.weather_api(FORECAST_URL, params=params)
    response  = responses[0]

    daily = response.Daily()

    # Variables are returned in the same order as DAILY_VARS
    # DAILY_VARS = [mean, max, min, humidity, rainfall, wind_speed]
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
        "humidity":         daily.Variables(3).ValuesAsNumpy(),
        "rainfall":         daily.Variables(4).ValuesAsNumpy(),
        "wind_speed":       daily.Variables(5).ValuesAsNumpy(),
    }

    df = pd.DataFrame(data=daily_data)

    # Strip timezone so downstream .dt.month etc. work without warnings
    df["date"] = df["date"].dt.tz_localize(None)

    return df.ffill().fillna(0)


async def fetch_forecast(lat: float, lon: float) -> pd.DataFrame:
    """
    Async wrapper — runs the sync SDK call in a thread pool so FastAPI
    event loop is never blocked. Semaphore ensures only 1 live API call
    at a time (cached calls bypass the semaphore instantly).
    """
    async with _api_semaphore:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _fetch_forecast_sync, lat, lon)


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
        df[DISTRICT_COLS[0]] = 1  # default Thanjavur

    return df


def _predict_ensemble(df: pd.DataFrame) -> list:
    WeatherModelLoader.load()
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