from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.core.firebase_admin import verify_token, is_configured
from app.core.supabase_client import get_supabase
from app.services.usage_service import get_usage_count, FREE_PLAN_LIMIT

router = APIRouter()


def get_user_plan(uid: str) -> str:
    sb = get_supabase()
    if not sb:
        return "free"
    res = sb.table("users").select("plan").eq("uid", uid).execute()
    if res.data:
        return res.data[0]["plan"]
    return "free"


@router.get("/usage")
async def get_usage(authorization: Optional[str] = Header(None)):
    if not is_configured():
        return {"count": 0, "limit": FREE_PLAN_LIMIT, "remaining": FREE_PLAN_LIMIT}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="認証が必要です")
    try:
        token = authorization[7:]
        decoded = verify_token(token)
        uid = decoded["uid"]
    except Exception:
        raise HTTPException(status_code=401, detail="認証トークンが無効です")

    plan = get_user_plan(uid)
    if plan != "free":
        count = get_usage_count(uid)
        return {"count": count, "limit": -1, "remaining": -1}

    count = get_usage_count(uid)
    return {"count": count, "limit": FREE_PLAN_LIMIT, "remaining": max(0, FREE_PLAN_LIMIT - count)}
