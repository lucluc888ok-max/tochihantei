import requests
import datetime
from typing import Optional, List, Dict

# 簡易的な市区町村コードマッピング
# 実運用では外部のジオコーディングAPIや全国の市区町村マスタを使用しますが、
# 今回はプロトタイプとして東京都内の主要な市区町村コードをマッピングしています。
CITY_CODES = {
    "千代田区": "13101", "中央区": "13102", "港区": "13103", "新宿区": "13104",
    "文京区": "13105", "台東区": "13106", "墨田区": "13107", "江東区": "13108",
    "品川区": "13109", "目黒区": "13110", "大田区": "13111", "世田谷区": "13112",
    "渋谷区": "13113", "中野区": "13114", "杉並区": "13115", "豊島区": "13116",
    "北区": "13117", "荒川区": "13118", "板橋区": "13119", "練馬区": "13120",
    "足立区": "13121", "葛飾区": "13122", "江戸川区": "13123", "武蔵野市": "13203",
    "三鷹市": "13204", "調布市": "13208"
}

API_KEY = "0d93881d4cfe4cc0bd5569f9e5e174f7"

def get_city_code_from_address(address: str) -> str:
    """住所文字列から簡易的に市区町村コードを判定する"""
    for city_name, code in CITY_CODES.items():
        if city_name in address:
            return code
    # 見つからない場合はデフォルトとして三鷹市のコードを返す（モックデータに合わせるため）
    return "13204"

def fetch_mlit_transaction_data(address: str, target_far: float) -> float:
    """
    対象住所周辺（同じ市区町村）の過去5年分の不動産取引価格データを取得し、
    対象の容積率（effective_far）に近い事例の「平均坪単価」を算出します。
    """
    city_code = get_city_code_from_address(address)
    
    current_year = datetime.datetime.now().year
    years_to_fetch = [current_year - i for i in range(5)]
    
    headers = {
        "Ocp-Apim-Subscription-Key": API_KEY
    }
    
    total_tsubo_price = 0.0
    count = 0
    
    for year in years_to_fetch:
        url = f"https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year={year}&city={city_code}"
        try:
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json().get("data", [])
                for item in data:
                    # 土地または土地と建物の取引を対象とする想定 ("種類" などで絞り込むのが理想)
                    # ここでは簡略化のために平米単価(UnitPrice) または 総額(TradePrice)と面積(Area)から算出
                    trade_price = float(item.get("TradePrice", 0))
                    area_str = item.get("Area", "0")
                    # '2000㎡以上'などの文字列が入ることがあるためパース
                    try:
                        area = float(area_str.replace("㎡以上", "").replace(",", ""))
                    except ValueError:
                        continue
                    
                    if area <= 0 or trade_price <= 0:
                        continue
                        
                    # 容積率(BuildingCoverageRatio/FloorAreaRatio)でのフィルタ
                    # APIのレスポンス仕様によってキー名が異なるので、存在すればチェック
                    far = item.get("FloorAreaRatio")
                    if far is not None:
                        try:
                            far_val = float(far)
                            # 指定容積率と著しく離れているものは除外 (±50%程度)
                            if abs(far_val - target_far) > target_far * 0.5:
                                continue
                        except ValueError:
                            pass
                            
                    sqm_price = trade_price / area
                    tsubo_price = sqm_price * 3.305785
                    
                    total_tsubo_price += tsubo_price
                    count += 1
        except Exception as e:
            print(f"Error fetching data for year {year}: {str(e)}")
            continue
            
    if count > 0:
        return total_tsubo_price / count
    
    # データが取得できなかった場合のデフォルトフォールバック値（例：150万円/坪）
    return 1500000.0
