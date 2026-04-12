import os
import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv() # .envファイル等からの環境変数を明示的にロード

class PropertyDataSchema(BaseModel):
    address: str = Field(..., description="物件の所在地（例: 東京都三鷹市井の頭3丁目）。不明な場合は空文字")
    area_sqm: float = Field(..., description="全体面積 (㎡)。小数第2位まで記載。不明な場合は0")
    land_use_zone: str = Field(..., description="用途地域など (例: 第1種低層住居専用地域)")
    floor_area_ratio: float = Field(..., description="容積率 (%)。不明な場合は0")
    is_leasehold: bool = Field(..., description="底地権や借地権など、所有権以外の特殊権利が存在するか")
    leasehold_ratio: float = Field(..., description="底地権割合等 (%)。記載がない場合は100 (100%所有権として扱う)")
    road_type: str = Field(..., description="接道状況 (例: 2項道路、北東側1.47〜2.74mなど)")
    setback_area_estimated: float = Field(..., description="接道条件（2項道路等）を見てセットバックが必要と判断される場合、その推定控除面積(㎡)。計算できなければ0")
    market_price_per_tsubo: float = Field(default=0.0, description="後処理で上書きされる。AIは0を返してよい")

def extract_property_data_with_llm(pdf_bytes: bytes) -> PropertyDataSchema:
    api_key = os.environ.get("GEMINI_API_KEY")
    
    # 手動モックフォールバック
    if not api_key:
        print("[LLM Parser] GEMINI_API_KEYが未設定のためデモデータを返します。")
        return PropertyDataSchema(
            address="東京都三鷹市井の頭3丁目",
            area_sqm=1206.54,
            land_use_zone="第1種低層住居専用地域",
            floor_area_ratio=80.0,
            is_leasehold=True,
            leasehold_ratio=40.0,
            road_type="2項道路 (幅員約1.47〜2.74m)",
            setback_area_estimated=14.21,
            market_price_per_tsubo=0.0
        )
        
    try:
        # 新しい google-genai SDKのクライアント初期化
        client = genai.Client(api_key=api_key)
        
        prompt = """
        あなたは熟練の不動産鑑定士およびデータ抽出AIです。
        アップロードされた不動産物件概要書（PDF）を1文字残らず解析し、以下のデータスキーマに沿ってJSONで返却してください。
        欠損している値がある場合は文脈から補うか、合理的に推定して計算してください。
        セットバック面積については、2項道路など幅員が4m未満の場合、（4m - 現状幅員）/2 × 概算間口 で計算してください。
        """
        
        # 構造化出力（JSON Schema）を指定してモデルを呼び出す
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                prompt,
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PropertyDataSchema
            )
        )
        
        return PropertyDataSchema.model_validate_json(response.text)
        
    except Exception as e:
        print(f"Error calling Gemini LLM via new SDK: {e}")
        # もしAPIキーが不正などのエラーになった場合はモックを返してUIを止めないようにする
        return PropertyDataSchema(
            address="",
            area_sqm=1200.0,
            land_use_zone=f"解析エラー: {str(e)[:20]}",
            floor_area_ratio=80.0,
            is_leasehold=False,
            leasehold_ratio=100.0,
            road_type="エラー",
            setback_area_estimated=0.0,
            market_price_per_tsubo=0.0
        )
