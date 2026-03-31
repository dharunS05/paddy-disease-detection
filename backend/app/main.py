from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
from app.services.model_loader import ModelLoader
from app.routes.predict import router as predict_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    ModelLoader.load()
    yield

app = FastAPI(title="Paddy Disease Detection API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict_router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": ModelLoader.model is not None}

# Serve React frontend
static_dir = "/app/static"
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=f"{static_dir}/assets"), name="assets")

    @app.get("/")
    def serve_ui():
        return FileResponse(f"{static_dir}/index.html")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        file_path = f"{static_dir}/{full_path}"
        if os.path.exists(file_path):
            return FileResponse(file_path)
        return FileResponse(f"{static_dir}/index.html")
else:
    print(f"WARNING: static dir not found at {static_dir}")