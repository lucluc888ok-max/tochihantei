import os
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from pydantic import BaseModel
from app.core.firebase_admin import verify_token, is_configured
from app.core.supabase_client import get_supabase
from app.services.usage_service import get_year_month

router = APIRouter()

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "")


def _check_admin(authorization: Optional[str]) -> None:
    if not is_configured():
        raise HTTPException(status_code=503, detail="認証未設定")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="認証が必要です")
    try:
        token = authorization[7:]
        decoded = verify_token(token)
        email = decoded.get("email", "")
    except Exception:
        raise HTTPException(status_code=401, detail="認証トークンが無効です")
    if not ADMIN_EMAIL or email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="管理者権限がありません")


@router.get("/admin/users")
async def list_users(authorization: Optional[str] = Header(None)):
    _check_admin(authorization)
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="DB未設定")

    users_res = sb.table("users").select("uid, email, plan").execute()
    users = users_res.data or []

    ym = get_year_month()
    usage_res = sb.table("usage_logs").select("uid, count").eq("year_month", ym).execute()
    usage_map = {r["uid"]: r["count"] for r in (usage_res.data or [])}

    return [
        {
            "uid": u["uid"],
            "email": u["email"],
            "plan": u["plan"],
            "usage_this_month": usage_map.get(u["uid"], 0),
        }
        for u in users
    ]


class PlanUpdate(BaseModel):
    plan: str


@router.patch("/admin/users/{uid}/plan")
async def update_plan(uid: str, body: PlanUpdate, authorization: Optional[str] = Header(None)):
    _check_admin(authorization)
    if body.plan not in ("free", "standard"):
        raise HTTPException(status_code=400, detail="プランは free または standard を指定してください")
    sb = get_supabase()
    if not sb:
        raise HTTPException(status_code=503, detail="DB未設定")
    sb.table("users").update({"plan": body.plan}).eq("uid", uid).execute()
    return {"uid": uid, "plan": body.plan}
