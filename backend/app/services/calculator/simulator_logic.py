import math
import os
from app.models.simulator_models import SimulatorRequest, SimulatorResponse, CostDetail
from app.services.external_api.mlit_api import fetch_mlit_transaction_data, fetch_condo_market_price, fetch_posted_land_price

# 定数
TSUBO_SQM_RATIO = 3.305785
DEFAULT_CONSTRUCTION_COST_PER_TSUBO = 1600000.0  # RC造: 160万円/坪
RENTABLE_RATIO = 0.82 # レンタブル比

# 用途地域別補正係数
_ZONE_CORRECTION = {
    "第一種低層住居専用地域": 1.10,
    "第二種低層住居専用地域": 1.10,
    "第一種中高層住居専用地域": 1.05,
    "第二種中高層住居専用地域": 1.05,
    "第一種住居地域": 1.05,
    "第二種住居地域": 1.05,
    "準住居地域": 1.00,
    "近隣商業地域": 1.00,
    "商業地域": 1.00,
    "準工業地域": 0.85,
    "工業地域": 0.75,
    "工業専用地域": 0.75,
    "田園住居地域": 1.10,
}

def _get_zone_correction(zoning: str) -> float:
    for zone, factor in _ZONE_CORRECTION.items():
        if zone in zoning:
            return factor
    return 1.00

# エリア別新築プレミアム乗数テーブル（市区コード → 乗数）
_AREA_PREMIUM_TABLE = {
    "13101": 2.0,  # 千代田区
    "13102": 1.9,  # 中央区
    "13103": 2.1,  # 港区
    "13104": 1.8,  # 新宿区
    "13105": 1.8,  # 文京区
    "13106": 1.6,  # 台東区
    "13107": 1.5,  # 墨田区
    "13108": 1.5,  # 江東区
    "13109": 1.7,  # 品川区
    "13110": 1.8,  # 目黒区
    "13111": 1.6,  # 大田区
    "13112": 1.7,  # 世田谷区
    "13113": 2.0,  # 渋谷区
    "13114": 1.6,  # 中野区
    "13115": 1.6,  # 杉並区
    "13116": 1.7,  # 豊島区（池袋）
    "13117": 1.5,  # 北区
    "13118": 1.5,  # 荒川区
    "13119": 1.5,  # 板橋区
    "13120": 1.4,  # 練馬区
    "13121": 1.4,  # 足立区
    "13122": 1.4,  # 葛飾区
    "13123": 1.4,  # 江戸川区
}

# 多摩地区Gemini補完キャッシュ
_premium_cache: dict = {}

def _get_new_construction_premium(address: str, condo_price: float, zoning: str = "") -> float:
    """市区テーブル × 用途地域補正で乗数を返す。未収録エリアはGeminiで補完。"""
    from app.services.external_api.mlit_api import get_city_code_from_address
    city_code = get_city_code_from_address(address)
    zone_factor = _get_zone_correction(zoning)

    if city_code in _AREA_PREMIUM_TABLE:
        base = _AREA_PREMIUM_TABLE[city_code]
        multiplier = round(base * zone_factor, 2)
        print(f"[premium] {address}({zoning}) → 区基準×{base} × 用途補正×{zone_factor} = ×{multiplier}")
        return multiplier

    # 多摩地区などはGeminiで補完
    cache_key = f"v3:{address}"
    if cache_key in _premium_cache:
        return _premium_cache[cache_key]

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return 1.4

    try:
        from google import genai
        from google.genai import types
        from pydantic import BaseModel

        class PremiumSchema(BaseModel):
            multiplier: float
            reason: str

        client = genai.Client(api_key=api_key)
        prompt = f"""
東京多摩地区の新築マンション市場専門家として、
中古マンション相場に対する新築プレミアム乗数を推定してください。

物件所在地: {address}
中古マンション相場: {condo_price/10000:.0f}万円/坪
参考レンジ: 1.2〜1.5倍

乗数を小数点第1位で返してください。
"""
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PremiumSchema
            )
        )
        result = PremiumSchema.model_validate_json(response.text)
        multiplier = max(1.2, min(1.6, result.multiplier))
        print(f"[premium] {address} → ×{multiplier:.1f}（Gemini補完）")
        _premium_cache[cache_key] = multiplier
        return multiplier
    except Exception as e:
        print(f"[premium] Gemini失敗、1.4を使用: {e}")
        return 1.4

def _calculate_sky_factor_simple(h: float, w: float, d: float) -> float:
    """天空率の簡易計算（矩形建物・単一測定点）"""
    if d <= 0 or h <= 0 or w <= 0:
        return 1.0
    alpha = math.atan2(w / 2, d)
    beta = math.atan2(h, d)
    obstruction = (2 * alpha * math.sin(beta)) / (2 * math.pi)
    return max(0.0, min(1.0, round(1.0 - obstruction, 4)))

def _calculate_sky_and_shadow(
    area_sqm: float,
    effective_far: float,
    road_width: float,
    road_setline_slope: float,
    is_residential: bool,
) -> dict:
    """天空率・日影規制の簡易試算"""
    # 建物幅を土地面積から推定（正方形仮定）
    building_width = math.sqrt(max(area_sqm, 1.0))

    # 建物高さの推定（容積率 ÷ 想定建蔽率60% × 3.3m/階）
    assumed_coverage = 0.60
    floors = (effective_far / 100.0) / assumed_coverage
    building_height = round(floors * 3.3, 1)

    # 測定点：道路中心（道路幅員/2の距離）
    measure_distance = max(road_width / 2, 0.5)

    # 道路斜線の適合建築物高さ（境界線上）
    setline_height = road_width * road_setline_slope

    # 天空率計算
    proposed_sf = _calculate_sky_factor_simple(building_height, building_width, measure_distance)
    compliant_sf = _calculate_sky_factor_simple(setline_height, building_width, measure_distance)
    sky_passes = proposed_sf >= compliant_sf

    # 日影規制（東京・冬至日 北緯35.7度）
    solar_altitude_rad = math.radians(90 - 35.7 - 23.4)  # ≈ 30.9度
    shadow_ratio = 1.0 / math.tan(solar_altitude_rad)
    max_shadow_m = round(building_height * shadow_ratio, 1)

    # 規制対象：住居系は高さ10m超、商業・準住居は高さ15m超
    regulated_limit = 10 if is_residential else 15
    is_regulated = building_height > regulated_limit

    if is_regulated:
        shadow_note = f"建物高さ約{building_height}m推定 → 冬至日の最大影長 約{max_shadow_m}m（日影規制要確認）"
    else:
        shadow_note = f"建物高さ約{building_height}m推定 → 日影規制対象外（{regulated_limit}m以下）"

    return {
        "estimated_building_height_m": building_height,
        "sky_factor_proposed": proposed_sf,
        "sky_factor_compliant": compliant_sf,
        "sky_factor_passes": sky_passes,
        "shadow_max_length_m": max_shadow_m,
        "shadow_is_regulated": is_regulated,
        "shadow_note": shadow_note,
    }

def calculate_simulation(req: SimulatorRequest) -> SimulatorResponse:
    # 1. 実行容積率の計算
    res_zones = ["第一種低層住居専用地域", "第二種低層住居専用地域", "第一種中高層住居専用地域", "第二種中高層住居専用地域", "第一種住居地域", "第二種住居地域", "準住居地域", "田園住居地域", "住居系"]
    is_residential = any(z in req.zoning for z in res_zones) or req.zoning == "住居系"
    
    far_multiplier = 0.4 if is_residential else 0.6
    calculated_far = req.road_width * far_multiplier * 100
    
    effective_far = min(req.far_limit, calculated_far)
    far_calc_basis = f"前面道路幅員({req.road_width}m) × {'0.4' if is_residential else '0.6'} × 100 = {calculated_far:.1f}% と指定容積率({req.far_limit}%)の低い方を採用"

    # 2. 相場取得
    market_price_per_tsubo = fetch_mlit_transaction_data(req.address, effective_far) * 1.1  # 宅地相場（×1.1補正）
    condo_market_price = fetch_condo_market_price(req.address)                         # 中古マンション相場
    posted_land_price_per_sqm = fetch_posted_land_price(req.address)                  # 公示地価（円/㎡）

    # 3. 面積計算
    max_floor_area_sqm = req.area_sqm * (effective_far / 100.0)
    max_floor_area_tsubo = max_floor_area_sqm / TSUBO_SQM_RATIO
    net_area_sqm = max_floor_area_sqm * RENTABLE_RATIO
    net_area_tsubo = net_area_sqm / TSUBO_SQM_RATIO
    land_area_tsubo = req.area_sqm / TSUBO_SQM_RATIO

    # 【出口価格】
    # 中古マンション相場 × Gemini推定乗数（新築プレミアム）。データなければ宅地相場 × 1.2 でフォールバック
    if condo_market_price > 0:
        premium_multiplier = _get_new_construction_premium(req.address, condo_market_price, req.zoning)
        sales_price_per_tsubo = condo_market_price * premium_multiplier
    else:
        premium_multiplier = 1.2
        sales_price_per_tsubo = market_price_per_tsubo * premium_multiplier

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

    # 3.5 道路斜線制限（概算）
    road_setline_slope = 1.25 if is_residential else 1.5
    road_setline_max_height_0m = round(req.road_width * road_setline_slope, 1)
    road_setline_max_height_5m = round((req.road_width + 5) * road_setline_slope, 1)
    road_setline_note = f"{'住居系（勾配1:1.25）' if is_residential else '商業・工業系（勾配1:1.5）'}"

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

    # 天空率・日影規制の簡易試算
    sky_shadow = _calculate_sky_and_shadow(
        area_sqm=req.area_sqm,
        effective_far=effective_far,
        road_width=req.road_width,
        road_setline_slope=road_setline_slope,
        is_residential=is_residential,
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
        premium_multiplier=premium_multiplier,
        report_data=report_data,
        report_text="",
        road_setline_slope=road_setline_slope,
        road_setline_max_height_0m=road_setline_max_height_0m,
        road_setline_max_height_5m=road_setline_max_height_5m,
        road_setline_note=road_setline_note,
        posted_land_price_per_sqm=posted_land_price_per_sqm,
        **sky_shadow,
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

