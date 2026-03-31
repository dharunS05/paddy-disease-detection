import os
import tensorflow as tf
from huggingface_hub import hf_hub_download

# ← hyphen, and repo_type="model" not "space"
MODEL_REPO     = "mlresearcher05/paddy-disease-detection"
MODEL_SUBDIR   = "models"
MODEL_FILENAME = os.getenv("MODEL_FILENAME", "rice_v3_efficientnet_best_full_finetune.keras")
LOCAL_MODEL_PATH = "/app/models/model.keras"

class ModelLoader:
    model = None
    gradcam_model = None
    LAST_CONV_LAYER = "top_conv"

    @classmethod
    def load(cls):
        if os.path.exists(LOCAL_MODEL_PATH):
            print(f"[ModelLoader] Loading from local: {LOCAL_MODEL_PATH}")
            path = LOCAL_MODEL_PATH
        else:
            print(f"[ModelLoader] Downloading from HuggingFace: {MODEL_REPO}")
            token = os.getenv("HUGGING_FACE_HUB_TOKEN") or os.getenv("HF_TOKEN")
            path = hf_hub_download(
                repo_id=MODEL_REPO,
                filename=f"{MODEL_SUBDIR}/{MODEL_FILENAME}",
                repo_type="model",       # ← important
                token=token,
                cache_dir="/app/models/hf_cache",
            )
        cls.model = tf.keras.models.load_model(path, compile=False)
        cls._build_gradcam_model()
        print("[ModelLoader] Model loaded successfully.")

    @classmethod
    def _build_gradcam_model(cls):
        conv_layer = cls.model.get_layer(cls.LAST_CONV_LAYER)
        cls.gradcam_model = tf.keras.Model(
            inputs=cls.model.inputs,
            outputs=[conv_layer.output, cls.model.output],
            name="gradcam_model",
        )


