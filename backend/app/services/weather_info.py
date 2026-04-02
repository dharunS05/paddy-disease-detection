
DISTRICTS = {
    "Thanjavur":     {"lat": 10.7852, "lon": 79.1391, "state": "Tamil Nadu"},
    "Nilgiris":      {"lat": 11.4916, "lon": 76.7337, "state": "Tamil Nadu"},
    "Chennai":       {"lat": 13.0827, "lon": 80.2707, "state": "Tamil Nadu"},
    "Virudhunagar":  {"lat":  9.5680, "lon": 77.9624, "state": "Tamil Nadu"},
    "Nagapattinam":  {"lat": 10.7656, "lon": 79.8428, "state": "Tamil Nadu"},
    "Coimbatore":    {"lat": 11.0168, "lon": 76.9558, "state": "Tamil Nadu"},
    "Madurai":       {"lat":  9.9252, "lon": 78.1198, "state": "Tamil Nadu"},
    "Trichy":        {"lat": 10.7905, "lon": 78.7047, "state": "Tamil Nadu"},
    "Salem":         {"lat": 11.6643, "lon": 78.1460, "state": "Tamil Nadu"},
    "Tirunelveli":   {"lat":  8.7139, "lon": 77.7567, "state": "Tamil Nadu"},
    "Cuddalore":     {"lat": 11.7480, "lon": 79.7714, "state": "Tamil Nadu"},
    "Vellore":       {"lat": 12.9165, "lon": 79.1325, "state": "Tamil Nadu"},
}

# Exactly 5 districts used during training (from notebook)
TRAINING_DISTRICTS = ["Thanjavur", "Nilgiris", "Chennai", "Virudhunagar", "Nagapattinam"]

# 16 base features + 5 district one-hot = 21 total (matches scaler)
BASE_FEATURE_COLS = [
    "temperature_mean", "temperature_max", "temperature_min",
    "humidity", "rainfall", "wind_speed",
    "temp_avg_3d", "temp_avg_5d",
    "humidity_avg_3d", "humidity_avg_5d",
    "rainfall_sum_3d", "rainfall_sum_5d",
    "temp_humidity", "rainfall_humidity",
    "month", "day_of_year",
]

DISTRICT_COLS = [f"district_{d}" for d in TRAINING_DISTRICTS]

FEATURE_COLS = BASE_FEATURE_COLS + DISTRICT_COLS  # 21 total

DISEASES    = ["Leaf Blast", "Brown Spot", "BLB", "Tungro"]
RISK_LEVELS = ["Low", "Medium", "High"]
WINDOW_SIZE = 7
