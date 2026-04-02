from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
import asyncio

from app.services.model_loader import ModelLoader
from app.services.weather_model_loader import WeatherModelLoader
from app.routes.predict import router as predict_router
from app.routes.weather import router as weather_router


def _load_all_models():
    ModelLoader.load()
    WeatherModelLoader.load()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load both models in background thread — app starts immediately
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _load_all_models)
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
    print(f"WARNING: static dir not found at {static_dir}")