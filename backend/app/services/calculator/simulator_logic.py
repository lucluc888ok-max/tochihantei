import math
from app.models.simulator_models import SimulatorRequest, SimulatorResponse, CostDetail
from app.services.external_api.mlit_api import fetch_mlit_transaction_data, fetch_condo_market_price

# 定数
TSUBO_SQM_RATIO = 3.305785
DEFAULT_CONSTRUCTION_COST_PER_TSUBO = 1600000.0  # RC造: 160万円/坪
RENTABLE_RATIO = 0.82 # レンタブル比

def calculate_simulation(req: SimulatorRequest) -> SimulatorResponse:
    # 1. 実行容積率の計算
    res_zones = ["第一種低層住居専用地域", "第二種低層住居専用地域", "第一種中高層住居専用地域", "第二種中高層住居専用地域", "第一種住居地域", "第二種住居地域", "準住居地域", "田園住居地域", "住居系"]
    is_residential = any(z in req.zoning for z in res_zones) or req.zoning == "住居系"
    
    far_multiplier = 0.4 if is_residential else 0.6
    calculated_far = req.road_width * far_multiplier * 100
    
    effective_far = min(req.far_limit, calculated_far)
    far_calc_basis = f"前面道路幅員({req.road_width}m) × {'0.4' if is_residential else '0.6'} × 100 = {calculated_far:.1f}% と指定容積率({req.far_limit}%)の低い方を採用"

    # 2. 相場取得
    market_price_per_tsubo = fetch_mlit_transaction_data(req.address, effective_far)  # 宅地相場
    condo_market_price = fetch_condo_market_price(req.address)                         # 中古マンション相場

    # 3. 面積計算
    max_floor_area_sqm = req.area_sqm * (effective_far / 100.0)
    max_floor_area_tsubo = max_floor_area_sqm / TSUBO_SQM_RATIO
    net_area_sqm = max_floor_area_sqm * RENTABLE_RATIO
    net_area_tsubo = net_area_sqm / TSUBO_SQM_RATIO
    land_area_tsubo = req.area_sqm / TSUBO_SQM_RATIO

    # 【出口価格】
    # 中古マンション相場 × 1.4（新築プレミアム）。データなければ宅地相場 × 1.2 でフォールバック
    if condo_market_price > 0:
        sales_price_per_tsubo = condo_market_price * 1.4
    else:
        sales_price_per_tsubo = market_price_per_tsubo * 1.2

    total_sales = net_area_tsubo * sales_price_per_tsubo

    # 土地出口（更地売却）= 宅地相場 × 土地坪数
    land_exit_total = market_price_per_tsubo * land_area_tsubo

    # 【支出：原価】
    construction_cost = max_floor_area_tsubo * DEFAULT_CONSTRUCTION_COST_PER_TSUBO

    purchase_price = req.purchase_price
    assembly_cost = req.assembly_cost
    purchase_price_per_tsubo = purchase_price / land_area_tsubo if (purchase_price and land_area_tsubo > 0) else None

    # 諸経費：（仕入 ＋ 地上げ費 ＋ 建築費）× 10%
    cost_base = construction_cost + (purchase_price or 0) + (assembly_cost or 0)
    misc_expenses = cost_base * 0.10

    # 利益・利益率（仕入提示がある場合のみ算出）
    if purchase_price is not None:
        all_costs = purchase_price + (assembly_cost or 0) + construction_cost + misc_expenses
        profit_total = total_sales - all_costs
        profit_margin = (profit_total / total_sales * 100) if total_sales > 0 else 0.0
    else:
        profit_total = None
        profit_margin = None

    # 4. レポート表の組み立て
    expenses_list = []

    # 土地仕入原価
    if purchase_price is not None:
        expenses_list.append(CostDetail(
            name="土地仕入原価",
            amount=purchase_price,
            note=f"坪{purchase_price_per_tsubo / 10000:.0f}万円（デベロッパー提示）"
        ))
    else:
        expenses_list.append(CostDetail(
            name="土地仕入原価",
            amount=0,
            note="ー（デベロッパーより提示待ち）"
        ))

    # 地上げ費
    if assembly_cost is not None:
        expenses_list.append(CostDetail(
            name="地上げ費",
            amount=assembly_cost,
            note="デベロッパー提示"
        ))
    else:
        expenses_list.append(CostDetail(
            name="地上げ費",
            amount=0,
            note="ー（デベロッパーより提示待ち）"
        ))

    expenses_list += [
        CostDetail(
            name="建築費（本体＋付帯）",
            amount=construction_cost,
            note=f"延床{max_floor_area_tsubo:.0f}坪 × 坪{DEFAULT_CONSTRUCTION_COST_PER_TSUBO / 10000:.0f}万円（RC造）"
        ),
        CostDetail(
            name="設計・諸経費・金利",
            amount=misc_expenses,
            note="原価（仕入＋地上げ＋建築費）の約10%"
        )
    ]

    revenues_list = [
        CostDetail(
            name="想定出口価格（総額）",
            amount=total_sales,
            note=f"専有{net_area_tsubo:.0f}坪 × 販売坪単価{sales_price_per_tsubo / 10000:.0f}万円"
        )
    ]

    report_data = {
        "expenses": expenses_list,
        "revenues": revenues_list
    }

    report_text = _generate_llm_report(
        req, effective_far, max_floor_area_tsubo, net_area_tsubo, sales_price_per_tsubo
    )

    return SimulatorResponse(
        effective_far=effective_far,
        far_calc_basis=far_calc_basis,
        market_price_per_tsubo=market_price_per_tsubo,
        condo_market_price_per_tsubo=condo_market_price,
        sales_price_per_tsubo=sales_price_per_tsubo,
        land_exit_total=land_exit_total,
        purchase_price=purchase_price,
        purchase_price_per_tsubo=purchase_price_per_tsubo,
        profit_total=profit_total,
        profit_margin=profit_margin,
        max_floor_area_sqm=max_floor_area_sqm,
        net_area_sqm=net_area_sqm,
        net_area_tsubo=net_area_tsubo,
        report_data=report_data,
        report_text=report_text
    )

import os
try:
    from google import genai
except ImportError:
    genai = None

def _generate_llm_report(req: SimulatorRequest, effective_far: float, max_floor_area_tsubo: float, net_area_tsubo: float, sales_price_per_tsubo: float) -> str:
    """Gemini APIを使用して自然な日本語レポートを生成する"""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or genai is None:
        return (
            f"今回の物件は「{req.address}」に位置する立地ですが、「道路幅員{req.road_width}m」による容積率の制限をどうクリアするかがポイントになります。\n\n"
            f"1. 建築ボリュームの試算（実行容積率の判定）\n"
            f"指定容積率が{req.far_limit}%でも、前面道路による制限を受けます。\n"
            f"・実行容積率: 指定の{req.far_limit}%に対し、{effective_far}%が法的な上限となります。\n"
            f"・最大延床面積: 約{max_floor_area_tsubo:.1f}坪\n"
            f"・有効専有面積: 約{net_area_tsubo:.1f}坪\n\n"
            f"2. 周辺相場と出口価格の想定\n"
            f"近隣の取引データに基づき、販売坪単価は 坪{sales_price_per_tsubo/10000:.0f}万円 程度が射程圏内です。\n"
            f"※（Gemini APIキーが設定されていないため、定型文を出力しています）"
        )
        
    try:
        client = genai.Client(api_key=api_key)
        prompt = f"""
        あなたは熟練の不動産鑑定士およびディベロッパーです。
        以下のデータに基づき、対象物件についての「1. 建築ボリュームの試算（実行容積率の判定）」および「2. 周辺相場と出口価格の想定」のレポートを作成してください。
        出力例のような、説得力のある自然な日本語の文章で、立地の利便性にも少し触れつつ簡潔にまとめてください。
        
        [物件情報]
        住所: {req.address}
        用途地域: {req.zoning}
        指定容積率: {req.far_limit}%
        前面道路幅員: {req.road_width}m
        
        [計算結果データ]
        実行容積率: {effective_far}%
        最大延床面積: 約{max_floor_area_tsubo:.1f}坪
        有効専有面積: 約{net_area_tsubo:.1f}坪
        想定販売坪単価: 坪{sales_price_per_tsubo/10000:.0f}万円前後
        """
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt
        )
        return response.text
    except Exception as e:
        return f"レポートの自動生成に失敗しました: {str(e)}"

