from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.models.simulator_models import SimulatorRequest, SimulatorResponse
from app.services.calculator.simulator_logic import calculate_simulation
from app.core.firebase_admin import verify_token, is_configured
from app.services.usage_service import ensure_user_exists, check_and_increment

router = APIRouter()


@router.post("/simulate", response_model=SimulatorResponse)
async def run_simulation(request: SimulatorRequest, authorization: Optional[str] = Header(None)):
    if is_configured():
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="認証が必要です")
        try:
            token = authorization[7:]
            decoded = verify_token(token)
            uid = decoded["uid"]
            email = decoded.get("email", "")
        except Exception:
            raise HTTPException(status_code=401, detail="認証トークンが無効です")

        ensure_user_exists(uid, email)
        allowed, _ = check_and_increment(uid)
        if not allowed:
            raise HTTPException(status_code=403, detail="limit_reached")

    try:
        result = calculate_simulation(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
