import numpy as np
from PIL import Image
import io

IMG_SIZE = (224, 224)


def preprocess(file_bytes: bytes) -> np.ndarray:
    """Returns float32 array shape (1, 224, 224, 3), values in [0, 255]."""
    img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    img = img.resize(IMG_SIZE, Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)
    return np.expand_dims(arr, axis=0)
