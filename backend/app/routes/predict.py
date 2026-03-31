from fastapi import APIRouter, UploadFile, File, HTTPException
from app.utils.image_preprocess import preprocess
from app.services.predictor import predict
from app.services.gradcam import make_gradcam_b64
from app.services.disease_info import get_disease_info
from app.schemas.response import PredictionResponse, DiseaseDetail

router = APIRouter()

@router.post("/predict", response_model=PredictionResponse)
async def predict_disease(file: UploadFile = File(...), gradcam: bool = True):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    raw_bytes = await file.read()
    img_array = preprocess(raw_bytes)
    result = predict(img_array)
    class_name = result["class_name"]
    class_idx = result["class_index"]
    gradcam_b64 = make_gradcam_b64(raw_bytes, img_array, class_idx) if gradcam else None
    info = get_disease_info(class_name)
    info_en = DiseaseDetail(**info["en"]) if info.get("en") else None
    info_ta = DiseaseDetail(**info["ta"]) if info.get("ta") else None
    return PredictionResponse(
        class_name=class_name,
        confidence=result["confidence"],
        all_probabilities=result["all_probabilities"],
        gradcam_image=gradcam_b64,
        info_en=info_en,
        info_ta=info_ta,
    )
