"""
main.py
=======
Fix: WeatherModelLoader.load() and ModelLoader.load() are blocking (joblib/tensorflow).
     Calling them directly inside async lifespan blocks the event loop.
     Fixed by running them in a threadpool via run_in_executor.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.services.model_loader import ModelLoader
from app.services.weather_model_loader import WeatherModelLoader
from app.routes.predict import router as predict_router
from app.routes.weather import router as weather_router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()

    # Run both blocking loaders concurrently in threadpool — event loop stays free
    try:
        await asyncio.gather(
            loop.run_in_executor(None, ModelLoader.load),
            loop.run_in_executor(None, WeatherModelLoader.load),
        )
        log.info("All models loaded successfully.")
    except Exception as e:
        # Log but don't crash — /health endpoint will report which model failed
        log.error("Model loading error during startup: %s", e)

    yield


app = FastAPI(title="Paddy Disease Detection API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict_router, prefix="/api")
app.include_router(weather_router, prefix="/api")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "leaf_model":    ModelLoader.model is not None,
        "weather_model": WeatherModelLoader.xgb_model is not None,
    }


# Serve React frontend
static_dir = "/app/static"
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=f"{static_dir}/assets"), name="assets")

    @app.get("/")
    def serve_ui():
        return FileResponse(f"{static_dir}/index.html")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        fp = f"{static_dir}/{full_path}"
        return FileResponse(fp) if os.path.exists(fp) else FileResponse(f"{static_dir}/index.html")
else:
    log.warning("Static dir not found at %s — frontend will not be served.", static_dir)