import os
import json
import firebase_admin
from firebase_admin import credentials, auth as fb_auth

_app = None


def _init():
    global _app
    if _app is not None:
        return
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        return
    sa_dict = json.loads(sa_json)
    cred = credentials.Certificate(sa_dict)
    _app = firebase_admin.initialize_app(cred)


def verify_token(id_token: str) -> dict:
    _init()
    if _app is None:
        raise ValueError("Firebase not configured")
    return fb_auth.verify_id_token(id_token)


def is_configured() -> bool:
    return bool(os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON"))
