from pydantic import BaseModel
from typing import Dict, Optional

class DiseaseDetail(BaseModel):
    description: str
    symptoms: str
    treatment: str
    severity: str

class PredictionResponse(BaseModel):
    class_name: str
    confidence: float
    all_probabilities: Dict[str, float]
    gradcam_image: Optional[str] = None
    info_en: Optional[DiseaseDetail] = None
    info_ta: Optional[DiseaseDetail] = None
