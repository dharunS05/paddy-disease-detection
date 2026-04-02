import os
import joblib
import tensorflow as tf
from huggingface_hub import hf_hub_download

MODEL_REPO = "mlresearcher05/paddy-disease-detection"

class WeatherModelLoader:
    xgb_model  = None
    tcn_model  = None
    scaler     = None
    _loaded    = False

    @classmethod
    def load(cls):
        if cls._loaded:
            return
        token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")

        def _dl(filename):
            return hf_hub_download(
                repo_id=MODEL_REPO,
                filename=f"models/{filename}",
                repo_type="model",
                token=token,
                cache_dir="/app/models/hf_cache",
            )

        print("[WeatherModelLoader] Loading XGBoost...")
        cls.xgb_model = joblib.load(_dl("xgboost_model.pkl"))

        print("[WeatherModelLoader] Loading TCN...")
        cls.tcn_model = tf.keras.models.load_model(_dl("paddy_tcn_multi_output.h5"), compile=False)

        print("[WeatherModelLoader] Loading scaler...")
        cls.scaler = joblib.load(_dl("scaler.pkl"))

        cls._loaded = True
        print("[WeatherModelLoader] All weather models loaded.")
