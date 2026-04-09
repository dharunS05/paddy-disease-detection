# Frontend is pre-built by GitHub Actions CI and pushed as frontend/dist/
# No Node.js build stage needed here.

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 curl && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ ./app/

# Use the pre-built frontend dist from CI
COPY frontend/dist/ ./static/

RUN mkdir -p /app/models/hf_cache

ENV MODEL_FILENAME=rice_v3_efficientnet_best_full_finetune.keras
ENV HF_HOME=/app/models/hf_cache

# HF Spaces runs as non-root user 1000
RUN chown -R 1000:1000 /app

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]