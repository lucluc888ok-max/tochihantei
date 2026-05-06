from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from pydantic import BaseModel
from app.core.firebase_admin import verify_token, is_configured
from app.core.supabase_client import get_supabase

router = APIRouter()


class CreateShareRequest(BaseModel):
    address: str
    parsed_data: dict
    sim_result: dict


@router.post("/share")
async def create_share(body: CreateShareRequest, authorization: Optional[str] = Header(None)):
    if is_configured():
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="認証が必要です")
        try:
            verify_token(authorization[7:])
        except Exception:
            raise HTTPException(status_code=401, detail="認証トークンが無効です")
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="DB unavailable")
    result = sb.table("shared_links").insert({
        "address": body.address,
        "parsed_data": body.parsed_data,
        "sim_result": body.sim_result,
    }).execute()
    return {"id": result.data[0]["id"]}


@router.get("/share/{share_id}")
async def get_share(share_id: str):
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="DB unavailable")
    result = sb.table("shared_links").select("*").eq("id", share_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="共有データが見つかりません")
    return result.data[0]
