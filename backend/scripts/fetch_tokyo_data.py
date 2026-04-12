import os
import json
import time
import requests
import datetime

# 東京都内の全市区町村 (API負荷軽減のため、市区町村コードごとに分けて取得する)
TOKYO_CITIES = {
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
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "tokyo_transactions.json")

def fetch_all():
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # すでに取得済みのデータを読み込み（途中から再開できるようにする）
    existing_data = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            print(f"[{len(existing_data)}市区町村] 分のキャッシュを読み込みました。未取得の地域のみ再開します。")
        except json.JSONDecodeError:
            print("キャッシュファイルが破損しているため、最初から再取得します。")

    current_year = datetime.datetime.now().year
    years_to_fetch = [current_year - i for i in range(5)]
    
    total_cities = len(TOKYO_CITIES)
    cities_list = list(TOKYO_CITIES.items())
    
    start_time = time.time()
    processed_count = 0
    total_newly_processed = 0
    
    # 処理の全体数を把握
    cities_to_fetch = [c for c in cities_list if c[1] not in existing_data]
    total_remaining = len(cities_to_fetch)
    
    print(f"--- 取得開始 --- (残り: {total_remaining}市区町村)")
    
    for i, (city_name, city_code) in enumerate(cities_list, 1):
        if city_code in existing_data:
            processed_count += 1
            continue
            
        print(f"[{processed_count + 1}/{total_cities}] {city_name} (コード: {city_code}) の過去5年分を取得中...", end="", flush=True)
        city_start = time.time()
        
        city_transactions = []
        has_error = False
        
        headers = {"Ocp-Apim-Subscription-Key": API_KEY}
        
        for year in years_to_fetch:
            url = f"https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001?year={year}&city={city_code}"
            try:
                # サーバー負荷防止の優しいスリープ
                time.sleep(1.0)
                
                resp = requests.get(url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    city_transactions.extend(data)
                elif resp.status_code == 404:
                    # 取引事例がない年
                    pass
                else:
                    has_error = True
                    print(f"\n  [警告] {year}年取得エラー: ステータス {resp.status_code}")
                    
            except Exception as e:
                has_error = True
                print(f"\n  [エラー] {year}年で通信エラー: {e}")
        
        if not has_error or len(city_transactions) > 0:
            # エラーが無かったか、一部でもデータが取れた場合は保存
            existing_data[city_code] = city_transactions
            
            # こまめにJSONへ保存（途中でCtrl+Cされても被害を最小限に）
            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, ensure_ascii=False)
            
            total_newly_processed += 1
            city_elapsed = time.time() - city_start
            
            # 残り時間の推測
            if total_newly_processed > 0:
                elapsed_total = time.time() - start_time
                avg_time = elapsed_total / total_newly_processed
                remaining_cities = total_remaining - total_newly_processed
                eta_seconds = remaining_cities * avg_time
                eta_str = f"{int(eta_seconds//60)}分{int(eta_seconds%60)}秒"
            else:
                eta_str = "計算中..."
                
            print(f" 完了 ({len(city_transactions)}件) - 残り推定: {eta_str}")
            
        else:
            print(" 失敗 (スキップします)")
            
        processed_count += 1

    print("\n--- 全取得処理が完了しました！ ---")
    print(f"出力ファイル: {OUTPUT_FILE}")

if __name__ == "__main__":
    fetch_all()
