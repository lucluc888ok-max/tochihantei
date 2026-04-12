import re
from pydantic import BaseModel, Field
from typing import Optional

class PropertyData(BaseModel):
    area_sqm: float = Field(..., description="面積 (㎡)")
    land_use_zone: str = Field(..., description="用途地域")
    floor_area_ratio: float = Field(..., description="容積率 (%)")
    is_leasehold: bool = Field(False, description="底地権等の特殊条件があるか")
    leasehold_ratio: Optional[float] = Field(None, description="底地権割合 (%)")
    road_type: str = Field(..., description="接道種別 (例: 2項道路)")
    road_width_min: float = Field(..., description="最小道路幅員 (m)")
    road_width_max: float = Field(..., description="最大道路幅員 (m)")
    # 計算で算出される値
    setback_area_estimated: Optional[float] = None


def extract_from_pdf(pdf_path: str) -> PropertyData:
    """
    対象のPDF（概要書_186井の頭）からテキスト情報を抽出し、構造化データに変換するロジック。
    ※本番環境では pdfplumber や LLM (Gemini API) 等を用いてテキストを確実に取り出しますが、
    ここでは「概要書_186井の頭」から抽出された想定のテキストテキストを正規表現やルールベースでパースする例を示します。
    """
    
    # 実際には pdfplumber などで読み込んだテキストが下記に格納される想定
    mock_extracted_text = '''
    面積: 1,206.54㎡
    用途地域: 第1種低層住居専用地域
    容積率: 80%
    特殊条件: 904番9は『底地権』であり、底地権割合40%を評価に適用すること。
    接道: 北東側が幅員約1.47〜2.74mの2項道路である。
    間口: 約15.0m (※仮定の接道長)
    '''
    
    # 面積の抽出
    area_match = re.search(r'面積:\s*([\d,]+\.?\d*)㎡', mock_extracted_text)
    area = float(area_match.group(1).replace(',', '')) if area_match else 0.0

    # 用途地域
    zone_match = re.search(r'用途地域:\s*(.+)', mock_extracted_text)
    zone = zone_match.group(1).strip() if zone_match else ""

    # 容積率
    far_match = re.search(r'容積率:\s*(\d+)%', mock_extracted_text)
    far = float(far_match.group(1)) if far_match else 0.0

    # 特殊条件（底地権）
    is_leasehold = '底地権' in mock_extracted_text
    leasehold_ratio = None
    if is_leasehold:
        ratio_match = re.search(r'底地権割合(\d+)%', mock_extracted_text)
        if ratio_match:
            leasehold_ratio = float(ratio_match.group(1))

    # 接道情報
    road_match = re.search(r'幅員約([\d\.]+)〜([\d\.]+)mの(.*?)道路', mock_extracted_text)
    if road_match:
        road_width_min = float(road_match.group(1))
        road_width_max = float(road_match.group(2))
        road_type = road_match.group(3) + "道路"
    else:
        road_width_min = road_width_max = 0.0
        road_type = "不明"

    # 間口（接道長）が記載されている場合は取得（セットバック計算に必要）
    frontage_match = re.search(r'間口:\s*約([\d\.]+)m', mock_extracted_text)
    frontage = float(frontage_match.group(1)) if frontage_match else 10.0 # デフォルト10mと仮定

    # --- ビジネスロジックの適用 ---
    
    # セットバック面積の自動計算
    # 2項道路の場合、道路中心線から2mの後退が必要
    setback_area = 0.0
    if '2項' in road_type:
        # 平均幅員からセットバック距離を概算
        avg_road_width = (road_width_min + road_width_max) / 2
        
        if avg_road_width < 4.0:
            # 中心線から2mなので、 (4m - 現状の幅員) / 2 がセットバック距離
            setback_distance = (4.0 - avg_road_width) / 2
            setback_area = round(setback_distance * frontage, 2)
            
    # データモデルに格納
    property_data = PropertyData(
        area_sqm=area,
        land_use_zone=zone,
        floor_area_ratio=far,
        is_leasehold=is_leasehold,
        leasehold_ratio=leasehold_ratio,
        road_type=road_type,
        road_width_min=road_width_min,
        road_width_max=road_width_max,
        setback_area_estimated=setback_area
    )

    return property_data


def calculate_adjusted_valuation(base_price_per_sqm: float, property_data: PropertyData) -> float:
    """
    底地権割合やセットバックなどの条件を加味した不動産評価額の計算。
    """
    # セットバック面積分は建蔽率・容積率の対象面積から除外されるため、有効宅地面積を計算
    effective_area = property_data.area_sqm - (property_data.setback_area_estimated or 0.0)
    
    # ベースの評価額
    valuation = effective_area * base_price_per_sqm
    
    # 底地権の適用 (例: 指定割合だけ減価する、あるいは指定割合だけで評価するなどロジックによる)
    if property_data.is_leasehold and property_data.leasehold_ratio:
        # ここでは純粋に敷地全体のうち底地権部分としての評価割合を乗算する例
        # ※実務では該当する地番面積のみに適用するなど詳細な計算が必要
        valuation = valuation * (property_data.leasehold_ratio / 100)
        
    return valuation

if __name__ == "__main__":
    pdf_file_path = "C:/Cursor/land-purchase-simulator/docs/概要書_186井の頭.pdf"
    
    print("--- 1. PDFデータの抽出 ---")
    data = extract_from_pdf(pdf_file_path)
    print(data.model_dump_json(indent=2))
    
    print("\n--- 2. 評価額への適用例 ---")
    # 仮に平米ごとの単価を500,000円とした場合の設定
    base_price = 500000 
    adjusted_value = calculate_adjusted_valuation(base_price, data)
    print(f"有効宅地面積: {data.area_sqm - data.setback_area_estimated:.2f} ㎡")
    print(f"セットバック面積: {data.setback_area_estimated} ㎡")
    print(f"調整後評価額: ¥{adjusted_value:,.0f}")
