"""
weather_model_loader.py
=======================
Changes from previous version:
  • TCN/Keras model removed — XGBoost is the sole prediction model
  • TensorFlow/Keras import removed
  • Thread-safe: load() is safe to call from run_in_executor (no asyncio inside)
  • Full try/except around each asset download — failure logged, not silently swallowed
  • _loaded stays False on partial failure so next request retries cleanly
  • HF_HOME env var respected for cache directory
"""

import os
import logging
import joblib
from huggingface_hub import hf_hub_download

log = logging.getLogger(__name__)

MODEL_REPO = "mlresearcher05/paddy-disease-detection"


class WeatherModelLoader:
    xgb_model = None
    scaler    = None
    _loaded   = False

    @classmethod
    def load(cls) -> None:
        if cls._loaded:
            return

        token     = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
        cache_dir = os.getenv("HF_HOME", "/app/models/hf_cache")

        def _dl(filename: str) -> str:
            return hf_hub_download(
                repo_id=MODEL_REPO,
                filename=f"models/{filename}",
                repo_type="model",
                token=token,
                cache_dir=cache_dir,
            )

        try:
            log.info("[WeatherModelLoader] Downloading XGBoost model...")
            cls.xgb_model = joblib.load(_dl("xgboost_model.pkl"))
            log.info("[WeatherModelLoader] XGBoost loaded OK.")
        except Exception as e:
            log.error("[WeatherModelLoader] Failed to load XGBoost: %s", e)
            raise RuntimeError(f"XGBoost model load failed: {e}") from e

        try:
            log.info("[WeatherModelLoader] Downloading scaler...")
            cls.scaler = joblib.load(_dl("scaler.pkl"))
            log.info("[WeatherModelLoader] Scaler loaded OK.")
        except Exception as e:
            log.error("[WeatherModelLoader] Failed to load scaler: %s", e)
            cls.xgb_model = None  # reset partial state
            raise RuntimeError(f"Scaler load failed: {e}") from e

        cls._loaded = True
        log.info("[WeatherModelLoader] All weather models ready.")