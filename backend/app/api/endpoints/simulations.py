from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from pydantic import BaseModel
from app.core.firebase_admin import verify_token, is_configured
from app.core.supabase_client import get_supabase

router = APIRouter()


class SaveSimulationRequest(BaseModel):
    address: str
    parsed_data: dict
    sim_result: dict


def _get_uid(authorization: Optional[str]) -> str:
    if not is_configured():
        raise HTTPException(status_code=503, detail="Auth not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="認証が必要です")
    try:
        return verify_token(authorization[7:])["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="認証トークンが無効です")


@router.post("/simulations")
async def save_simulation(body: SaveSimulationRequest, authorization: Optional[str] = Header(None)):
    uid = _get_uid(authorization)
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="DB unavailable")
    result = sb.table("simulations").insert({
        "uid": uid,
        "address": body.address,
        "parsed_data": body.parsed_data,
        "sim_result": body.sim_result,
    }).execute()
    return {"id": result.data[0]["id"]}


@router.get("/simulations")
async def get_simulations(authorization: Optional[str] = Header(None)):
    uid = _get_uid(authorization)
    sb = get_supabase()
    if not sb:
        return {"simulations": []}
    result = sb.table("simulations").select("*").eq("uid", uid).order("saved_at", desc=True).limit(50).execute()
    return {"simulations": result.data}


@router.delete("/simulations/{sim_id}")
async def delete_simulation(sim_id: str, authorization: Optional[str] = Header(None)):
    uid = _get_uid(authorization)
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="DB unavailable")
    sb.table("simulations").delete().eq("id", sim_id).eq("uid", uid).execute()
    return {"ok": True}
