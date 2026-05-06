from datetime import datetime
from app.core.supabase_client import get_supabase

FREE_PLAN_LIMIT = 5


def get_year_month() -> str:
    return datetime.now().strftime("%Y-%m")


def ensure_user_exists(uid: str, email: str):
    sb = get_supabase()
    if not sb:
        return
    sb.table("users").upsert({"uid": uid, "email": email}, on_conflict="uid").execute()


def get_usage_count(uid: str) -> int:
    sb = get_supabase()
    if not sb:
        return 0
    ym = get_year_month()
    res = sb.table("usage_logs").select("count").eq("uid", uid).eq("year_month", ym).execute()
    if res.data:
        return res.data[0]["count"]
    return 0


def check_and_increment(uid: str) -> tuple[bool, int]:
    sb = get_supabase()
    if not sb:
        return True, 0

    ym = get_year_month()
    res = sb.table("usage_logs").select("count").eq("uid", uid).eq("year_month", ym).execute()
    current = res.data[0]["count"] if res.data else 0

    user_res = sb.table("users").select("plan").eq("uid", uid).execute()
    plan = user_res.data[0]["plan"] if user_res.data else "free"

    if plan != "free":
        _increment(sb, uid, ym, current)
        return True, current + 1

    if current >= FREE_PLAN_LIMIT:
        return False, current

    _increment(sb, uid, ym, current)
    return True, current + 1


def _increment(sb, uid: str, ym: str, current: int):
    if current == 0:
        sb.table("usage_logs").insert({"uid": uid, "year_month": ym, "count": 1}).execute()
    else:
        sb.table("usage_logs").update({"count": current + 1}).eq("uid", uid).eq("year_month", ym).execute()
