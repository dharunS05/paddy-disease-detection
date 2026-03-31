---
title: Paddy Disease Detection
emoji: 🌾
colorFrom: green
colorTo: yellow
sdk: docker
pinned: false
---
```

---






# 🌾 Paddy Disease Detection – Full Stack App

EfficientNetB3-powered rice leaf disease classifier with GradCAM visualisation, Tamil + English disease info, and a modern React UI.

## Architecture

```
paddy-disease-app/
├── backend/   FastAPI + TensorFlow inference server
├── frontend/  React + Vite + Tailwind UI
└── mobile-ready/  API contract for mobile devs
```

---

## Quick Start (Docker)

### 1. Set your model filename in `.env`
```bash
# Edit .env
MODEL_FILENAME=rice_v3_efficientnet_best_full_finetune.keras
```

> This filename must match what you uploaded to:
> `mlresearcher05/paddy-disease-detection/models/<MODEL_FILENAME>`

### 2. (Optional) Place model locally for offline use
```
backend/models/model.keras
```
If present, the backend uses the local file instead of downloading from HuggingFace.

### 3. Run
```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Local Development (without Docker)

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev   # runs on http://localhost:3000
```

---

## HuggingFace Model Storage

Your models folder on HuggingFace:
```
mlresearcher05/paddy-disease-detection/models/
```

The backend downloads the model automatically on first startup using `huggingface_hub`.

For a **private repo**, add your token to `.env`:
```
HUGGING_FACE_HUB_TOKEN=hf_xxxxxxxxxxxx
```

---

## Model Details

| Property       | Value                   |
|----------------|-------------------------|
| Architecture   | EfficientNetB3          |
| Input size     | 224 × 224 × 3           |
| Preprocessing  | None (model handles it) |
| Output classes | 10                      |
| GradCAM layer  | top_conv                |

---

## Disease Classes

| # | Class Name               |
|---|--------------------------|
| 0 | Bacterial Leaf Blight    |
| 1 | Bacterial Leaf Streak    |
| 2 | Bacterial Panicle Blight |
| 3 | Brown Spot               |
| 4 | Dead Heart               |
| 5 | Downy Mildew             |
| 6 | Healthy Rice Leaf        |
| 7 | Hispa                    |
| 8 | Leaf Blast               |
| 9 | Tungro                   |
