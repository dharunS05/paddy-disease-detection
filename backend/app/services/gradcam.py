import numpy as np
import tensorflow as tf
from PIL import Image
import base64
import io
import matplotlib.pyplot as plt


def compute_gradcam(img_array: np.ndarray, class_idx: int) -> np.ndarray:
    from app.services.model_loader import ModelLoader
    img_tensor = tf.cast(img_array, tf.float32)
    with tf.GradientTape() as tape:
        conv_maps, preds = ModelLoader.gradcam_model(img_tensor, training=False)
        tape.watch(conv_maps)
        score = preds[0, class_idx]
    grads = tape.gradient(score, conv_maps)
    weights = tf.reduce_mean(grads, axis=(0, 1, 2))
    heatmap = tf.nn.relu(conv_maps[0] @ weights[..., tf.newaxis])
    heatmap = tf.squeeze(heatmap).numpy()
    if heatmap.max() > 0:
        heatmap /= heatmap.max()
    return heatmap


def make_gradcam_b64(raw_img_bytes: bytes, img_array: np.ndarray, class_idx: int, alpha: float = 0.45) -> str:
    heatmap = compute_gradcam(img_array, class_idx)
    orig = Image.open(io.BytesIO(raw_img_bytes)).convert("RGB").resize((224, 224))
    hm_pil = Image.fromarray(np.uint8(255 * heatmap), mode="L").resize((224, 224), Image.LANCZOS)
    colormap = plt.get_cmap("jet")   # ← fix
    hm_colored = np.uint8(colormap(np.array(hm_pil) / 255.0) * 255)[:, :, :3]
    hm_img = Image.fromarray(hm_colored)
    overlay = Image.blend(orig, hm_img, alpha=alpha)
    buf = io.BytesIO()
    overlay.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")