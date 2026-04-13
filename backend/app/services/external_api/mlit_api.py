import os
import json
import datetime
import requests
from typing import Optional, Dict, List

CITY_CODES = {
    "千代田区": "13101", "中央区": "13102", "港区": "13103", "新宿区": "13104",
    "文京区": "13105", "台東区": "13106", "墨田区": "13107", "江東区": "13108",
    "品川区": "13109", "目黒区": "13110", "大田区": "13111", "世田谷区": "13112",
    "渋谷区": "13113", "中野区": "13114", "杉並区": "13115", "豊島区": "13116",
    "北区": "13117", "荒川区": "13118", "板橋区": "13119", "練馬区": "13120",
    "足立区": "13121", "葛飾区": "13122", "江戸川区": "13123",
    "八王子市": "13201", "立川市": "13202", "武蔵野市": "13203", "三鷹市": "13204",
    "青梅市": "13205", "府中市": "13206", "昭島市": "13207", "調布市": "13208",
    "町田市": "13209", "小金井市": "13210", "小平市": "13211", "日野市": "13212",
    "東村山市": "13213", "国分寺市": "13214", "国立市": "13215", "福生市": "13218",
    "狛江市": "13219", "東大和市": "13220", "清瀬市": "13221", "東久留米市": "13222",
    "武蔵村山市": "13223", "多摩市": "13224", "稲城市": "13225", "羽村市": "13227",
    "あきる野市": "13228", "西東京市": "13229"
}

API_KEY = "0d93881d4cfe4cc0bd5569f9e5e174f7"

CITIES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../data/cities")
)

# 都市コードごとにキャッシュ
_city_cache: Dict = {}


def _load_local_data() -> Dict:
    """後方互換用：全都市データをまとめて返す（非推奨）"""
    return _city_cache


def _load_city(city_code: str) -> List[dict]:
    """指定都市コードのデータをキャッシュ付きで返す"""
    if city_code in _city_cache:
        return _city_cache[city_code]
    path = os.path.join(CITIES_DIR, f"{city_code}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            _city_cache[city_code] = data
            print(f"[mlit_api] 読み込み: {city_code} ({len(data)}件)")
            return data
        except Exception as e:
            print(f"[mlit_api] 読み込みエラー {city_code}: {e}")
    else:
        print(f"[mlit_api] データなし: {city_code}")
    return []


def get_city_code_from_address(address: str) -> str:
    for city_name, code in CITY_CODES.items():
        if city_name in address:
            return code
    return "13204"  # デフォルト：三鷹市


def fetch_mlit_transaction_data(address: str, target_far: float) -> float:
    """
    住所と容積率をもとに、周辺の平均坪単価を返す。
    """
    city_code = get_city_code_from_address(address)
    records = _load_city(city_code)
    if records:
        result = _calc_avg_tsubo_price(records, target_far)
        if result > 0:
            print(f"[mlit_api] 宅地相場: {address} → {result:,.0f}円/坪")
            return result
    print(f"[mlit_api] データなし。フォールバック値を使用: {address}")
    return 1_500_000.0


def _calc_avg_tsubo_price(transactions: List[dict], target_far: float) -> float:
    """取引リストから、容積率でフィルタした平均坪単価を算出する"""
    total = 0.0
    count = 0

    for item in transactions:
        # 宅地（土地 or 土地と建物）のみ対象
        item_type = item.get("Type", "")
        if "宅地" not in item_type:
            continue

        trade_price_str = item.get("TradePrice") or "0"
        area_str = item.get("Area") or "0"

        try:
            trade_price = float(trade_price_str)
            area = float(str(area_str).replace("㎡以上", "").replace(",", ""))
        except ValueError:
            continue

        if area <= 0 or trade_price <= 0:
            continue

        # 容積率フィルタ（±50%の範囲）
        far_str = item.get("FloorAreaRatio")
        if far_str:
            try:
                far_val = float(far_str)
                if abs(far_val - target_far) > target_far * 0.5:
                    continue
            except ValueError:
                pass

        sqm_price = trade_price / area
        tsubo_price = sqm_price * 3.305785
        total += tsubo_price
        count += 1

    if count > 0:
        return total / count
    return 0.0


def fetch_condo_market_price(address: str) -> float:
    """
    中古マンション等の取引データから平均坪単価を返す。
    新築分譲の出口価格算出に使用（× 1.4 で新築プレミアムを加算）。
    """
    city_code = get_city_code_from_address(address)
    records = _load_city(city_code)
    if records:
        result = _calc_condo_avg_tsubo_price(records)
        if result > 0:
            return result
    return 0.0


def _calc_condo_avg_tsubo_price(transactions: List[dict]) -> float:
    """中古マンション等の取引から平均坪単価を算出する"""
    total = 0.0
    count = 0

    for item in transactions:
        if item.get("Type") != "中古マンション等":
            continue

        trade_price_str = item.get("TradePrice") or "0"
        area_str = item.get("Area") or "0"

        try:
            trade_price = float(trade_price_str)
            area = float(str(area_str).replace("㎡以上", "").replace(",", ""))
        except ValueError:
            continue

        if area <= 0 or trade_price <= 0:
            continue

        sqm_price = trade_price / area
        tsubo_price = sqm_price * 3.305785
        total += tsubo_price
        count += 1

    return total / count if count > 0 else 0.0


def _fetch_from_api(city_code: str, target_far: float) -> float:
    """APIから過去5年分を取得して平均坪単価を返す"""
    current_year = datetime.datetime.now().year
    years_to_fetch = [current_year - i for i in range(1, 6)]  # 昨年から5年分
    headers = {"Ocp-Apim-Subscription-Key": API_KEY}

    all_transactions = []
    for year in years_to_fetch:
        url = f"https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year={year}&city={city_code}"
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code == 200:
                all_transactions.extend(resp.json().get("data", []))
        except Exception as e:
            print(f"[mlit_api] API取得エラー ({year}年): {e}")

    result = _calc_avg_tsubo_price(all_transactions, target_far)
    return result if result > 0 else 1_500_000.0
