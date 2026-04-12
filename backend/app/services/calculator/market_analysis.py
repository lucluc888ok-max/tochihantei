import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime
from dateutil.relativedelta import relativedelta
import japanize_matplotlib  # 日本語フォント用

def analyze_market_and_calculate_price(csv_path: str, target_address: str, target_zone: str, target_far: int):
    """
    取引事例のCSVから条件に合うデータを抽出し、過去3年間の坪単価推移のグラフ化と
    適正仕入れ単価の算出を行うビジネスロジック。
    """
    
    # モックCSVデータの生成 (ファイルが存在しない場合のみ作成)
    if not os.path.exists(csv_path):
        create_mock_csv(csv_path)
        print(f"モックデータのCSVを作成しました: {csv_path}")

    # 1. CSVデータの読み込み
    df = pd.read_csv(csv_path)
    # 取引日をdatetime型に変換
    df['取引時期'] = pd.to_datetime(df['取引時期'])
    
    # 2. 条件によるデータの絞り込み
    # 住所、用途地域、容積率での抽出
    condition_address = df['住所'].str.contains(target_address, na=False)
    condition_zone = df['用途地域'] == target_zone
    condition_far = df['容積率'] == target_far
    
    # 過去3年間のデータに限定
    three_years_ago = datetime.now() - relativedelta(years=3)
    condition_date = df['取引時期'] >= three_years_ago
    
    filtered_df = df[condition_address & condition_zone & condition_far & condition_date].copy()
    
    if filtered_df.empty:
        print("条件に合致する取引事例が見つかりませんでした。")
        return None

    # ㎡単価から坪単価を計算 (1坪 = 約3.305785㎡)
    if '坪単価' not in filtered_df.columns:
         filtered_df['坪単価'] = filtered_df['平米単価'] * 3.305785

    # 取引時期でソート
    filtered_df = filtered_df.sort_values('取引時期')

    # --- 3. 適正仕入れ単価の算出アルゴリズム ---
    # トレンドを考慮するため、直近1年間の取引事例の平均坪単価を「市場相場単価」とする
    one_year_ago = datetime.now() - relativedelta(years=1)
    recent_transactions = filtered_df[filtered_df['取引時期'] >= one_year_ago]
    
    if not recent_transactions.empty:
        market_price_per_tsubo = recent_transactions['坪単価'].mean()
    else:
        market_price_per_tsubo = filtered_df['坪単価'].mean()

    # デベロッパーとしての適正仕入れ単価の計算
    # 一般市場価格(エンド価格)から、事業利益(粗利)と販売管理費・事業リスクを差引いた「卸値」
    # ここでは仮に市場相場の 75% を適正仕入れ単価の上限とするロジック
    developer_purchase_ratio = 0.75
    proper_purchase_price_per_tsubo = market_price_per_tsubo * developer_purchase_ratio

    # --- 4. グラフの作成 ---
    # 月単位での平均坪単価推移をプロット
    monthly_trend = filtered_df.set_index('取引時期').resample('M')['坪単価'].mean().dropna()

    plt.figure(figsize=(10, 6))
    plt.plot(monthly_trend.index, monthly_trend.values, marker='o', linestyle='-', color='#3b82f6', linewidth=2, label="月別平均坪単価")
    
    # 市場相場と適正仕入れ単価のラインを描画
    plt.axhline(y=market_price_per_tsubo, color='red', linestyle='--', label=f'直近平均市場単価: {market_price_per_tsubo:,.0f}円/坪')
    plt.axhline(y=proper_purchase_price_per_tsubo, color='green', linestyle='-.', label=f'適正仕入単価: {proper_purchase_price_per_tsubo:,.0f}円/坪 (市場価格の75%)')
    
    plt.title(f'【{target_address}】過去3年間の坪単価推移\n({target_zone} / 容積率{target_far}%)', fontsize=14)
    plt.xlabel('取引時期', fontsize=12)
    plt.ylabel('坪単価 (円/坪)', fontsize=12)
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.legend()
    plt.tight_layout()
    
    # グラフを保存 (フロントエンドに渡せるように画像化)
    graph_path = os.path.join(os.path.dirname(csv_path), "tsubo_price_trend.png")
    plt.savefig(graph_path)
    plt.close()
    
    print(f"グラフを保存しました: {graph_path}")
    
    return {
        "market_price_per_tsubo": market_price_per_tsubo,
        "proper_purchase_price_per_tsubo": proper_purchase_price_per_tsubo,
        "sample_count": len(filtered_df),
        "recent_sample_count": len(recent_transactions)
    }

def create_mock_csv(path: str):
    """動作確認用モックデータの生成"""
    np.random.seed(42)
    dates = [datetime.now() - relativedelta(months=i) for i in range(36)]
    data = []
    
    for _ in range(100):
        # 井の頭を多めに生成
        address = np.random.choice(['三鷹市井の頭1丁目', '三鷹市井の頭2丁目', '三鷹市下連雀', '武蔵野市吉祥寺'], p=[0.4, 0.4, 0.1, 0.1])
        zone = np.random.choice(['第1種低層住居専用地域', '第1種中高層住居専用地域'], p=[0.8, 0.2])
        far = np.random.choice([80, 100, 150], p=[0.7, 0.2, 0.1])
        date = np.random.choice(dates)
        
        # 井の頭かつ1低層・80%の場合は平米単価を60万〜90万の範囲でばらつかせる
        # トレンドとして直近ほど少し高くなるようにする
        months_ago = (datetime.now() - date).days / 30
        trend_factor = 1.0 - (months_ago * 0.005) # 昔のものほど少し安い
        
        base_price = np.random.uniform(600000, 900000)
        sqm_price = int(base_price * trend_factor)
        
        data.append({
            "住所": address,
            "用途地域": zone,
            "容積率": far,
            "取引時期": date.strftime('%Y-%m-%d'),
            "平米単価": sqm_price
        })
        
    df = pd.DataFrame(data)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False, encoding='utf-8')


if __name__ == "__main__":
    csv_file_path = "C:/Cursor/land-purchase-simulator/docs/transactions.csv"
    
    print("--- 三鷹市井の頭の取引事例分析 ---")
    result = analyze_market_and_calculate_price(
        csv_path=csv_file_path,
        target_address="三鷹市井の頭",
        target_zone="第1種低層住居専用地域",
        target_far=80
    )
    
    if result:
        print(f"\n[分析結果]")
        print(f"・抽出された事例数: {result['sample_count']}件 (うち直近1年: {result['recent_sample_count']}件)")
        print(f"・市場相場坪単価: 約 {result['market_price_per_tsubo']:,.0f} 円/坪")
        print(f"・適正仕入れ坪単価 (上限):  約 {result['proper_purchase_price_per_tsubo']:,.0f} 円/坪")
