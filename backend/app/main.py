from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.services.model_loader import ModelLoader
from app.routes.predict import router as predict_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    ModelLoader.load()
    yield

app = FastAPI(
    title="Paddy Disease Detection API",
    description="EfficientNetB3-based rice leaf disease classifier with GradCAM",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict_router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": ModelLoader.model is not None}
