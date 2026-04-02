from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.weather_predictor import get_forecast, geocode
from app.services.weather_info import DISTRICTS

router = APIRouter()

@router.get("/weather/districts")
def list_districts():
    return {"districts": [
        {"name": k, "lat": v["lat"], "lon": v["lon"], "state": v["state"]}
        for k, v in DISTRICTS.items()
    ]}

@router.get("/weather/search")
async def search_location(q: str = Query(..., min_length=2)):
    try:
        return {"results": await geocode(q)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Geocoding failed: {e}")

@router.get("/weather/forecast")
async def weather_forecast(
    district: Optional[str]  = Query(None),
    lat:      Optional[float] = Query(None),
    lon:      Optional[float] = Query(None),
    location: Optional[str]   = Query(None),
):
    if district:
        if district not in DISTRICTS:
            raise HTTPException(status_code=404, detail="District not found.")
        d = DISTRICTS[district]
        return await get_forecast(d["lat"], d["lon"], district, district_name=district)
    elif lat is not None and lon is not None:
        name = location or f"{lat:.4f}, {lon:.4f}"
        return await get_forecast(lat, lon, name, district_name=None)
    else:
        raise HTTPException(status_code=400, detail="Provide 'district' or 'lat'+'lon'")
