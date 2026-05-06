from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.core.firebase_admin import verify_token, is_configured
from app.services.usage_service import get_usage_count, FREE_PLAN_LIMIT

router = APIRouter()


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
    count = get_usage_count(uid)
    return {"count": count, "limit": FREE_PLAN_LIMIT, "remaining": max(0, FREE_PLAN_LIMIT - count)}
