# ─────────────────────────────────────────
# Stage 1: Build React frontend
# ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


# ─────────────────────────────────────────
# Stage 2: Python backend + bundled static
# ─────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ ./app/

# Copy built frontend from Stage 1 — no manual pre-build needed
COPY --from=frontend-builder /frontend/dist/ ./static/

RUN mkdir -p /app/models/hf_cache

ENV MODEL_FILENAME=rice_v3_efficientnet_best_full_finetune.keras
ENV HF_HOME=/app/models/hf_cache

EXPOSE 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]