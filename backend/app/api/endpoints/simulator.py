from fastapi import APIRouter, HTTPException
from app.models.simulator_models import SimulatorRequest, SimulatorResponse
from app.services.calculator.simulator_logic import calculate_simulation

router = APIRouter()

@router.post("/simulate", response_model=SimulatorResponse)
async def run_simulation(request: SimulatorRequest):
    """
    対象物件の条件（住所、面積、前面道路、用途地域、指定容積率）を受け取り、
    実行容積率の計算、APIでの周辺相場取得、および事業収支（残余法）のシミュレーション結果を返します。
    """
    try:
        result = calculate_simulation(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
