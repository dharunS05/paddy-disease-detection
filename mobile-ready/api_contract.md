# Paddy Disease Detection – API Contract (Mobile Dev Reference)

Base URL: `http://<server-ip>:8000`

---

## POST /api/predict

Classify a rice leaf image and return disease info + GradCAM heatmap.

### Request
- **Content-Type**: `multipart/form-data`
- **Fields**:
  | Field   | Type    | Required | Description                         |
  |---------|---------|----------|-------------------------------------|
  | file    | File    | Yes      | Image file (JPG/PNG)                |
  | gradcam | boolean | No       | Include GradCAM heatmap (default: true) |

### Response (200 OK)
```json
{
  "class_name": "Leaf Blast",
  "confidence": 0.9423,
  "all_probabilities": {
    "Bacterial Leaf Blight": 0.0021,
    "Leaf Blast": 0.9423,
    ...
  },
  "gradcam_image": "<base64-encoded PNG string>",
  "info_en": {
    "description": "Caused by Magnaporthe oryzae...",
    "symptoms": "Diamond-shaped spots...",
    "treatment": "Apply tricyclazole...",
    "severity": "Very High"
  },
  "info_ta": {
    "description": "Magnaporthe oryzae பூஞ்சையால்...",
    "symptoms": "வைர வடிவ புள்ளிகள்...",
    "treatment": "tricyclazole தெளிக்கவும்...",
    "severity": "மிக அதிகம்"
  }
}
```

### Errors
| Code | Reason                         |
|------|-------------------------------|
| 400  | Non-image file uploaded        |
| 422  | Missing required `file` field  |
| 500  | Internal model inference error |

---

## GET /health

Returns model load status.

```json
{ "status": "ok", "model_loaded": true }
```

---

## Classes
0. Bacterial Leaf Blight
1. Bacterial Leaf Streak
2. Bacterial Panicle Blight
3. Brown Spot
4. Dead Heart
5. Downy Mildew
6. Healthy Rice Leaf
7. Hispa
8. Leaf Blast
9. Tungro

---

## Notes for mobile
- GradCAM image: decode base64 and render as `image/png`
- Image input: resize to 224×224 before upload for faster inference
- Disable gradcam for speed: `POST /api/predict?gradcam=false`
