import numpy as np
from app.services.model_loader import ModelLoader

CLASS_NAMES = [
    "Bacterial Leaf Blight",
    "Bacterial Leaf Streak",
    "Bacterial Panicle Blight",
    "Brown Spot",
    "Dead Heart",
    "Downy Mildew",
    "Healthy Rice Leaf",
    "Hispa",
    "Leaf Blast",
    "Tungro",
]


def predict(img_array: np.ndarray) -> dict:
    preds = ModelLoader.model.predict(img_array, verbose=0)
    idx = int(np.argmax(preds[0]))
    confidence = float(preds[0][idx])
    all_probs = {CLASS_NAMES[i]: round(float(preds[0][i]), 4) for i in range(len(CLASS_NAMES))}
    return {
        "class_index": idx,
        "class_name": CLASS_NAMES[idx],
        "confidence": round(confidence, 4),
        "all_probabilities": all_probs,
    }
