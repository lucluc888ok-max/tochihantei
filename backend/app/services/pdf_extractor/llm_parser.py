import os
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class PropertyDataSchema(BaseModel):
    address: str = Field(..., description="物件の所在地（例: 東京都三鷹市井の頭3丁目）。不明な場合は空文字")
    area_sqm: float = Field(..., description="全体面積 (㎡)。小数第2位まで記載。不明な場合は0")
    land_use_zone: str = Field(..., description="用途地域（例: 第1種低層住居専用地域、近隣商業地域）。不明な場合は空文字")
    floor_area_ratio: float = Field(..., description="容積率 (%)。不明な場合は0")
    road_width_m: float = Field(default=0.0, description="前面道路の幅員（m）。複数ある場合は最大のものを記載。不明な場合は0")
    is_leasehold: bool = Field(..., description="底地権や借地権など、所有権以外の特殊権利が存在するか")
    leasehold_ratio: float = Field(..., description="底地権割合等 (%)。記載がない場合は100")
    road_type: str = Field(..., description="接道状況の説明文（例: 南側 法42条1項1号道路 幅員5.0mなど）。不明な場合は空文字")
    setback_area_estimated: float = Field(..., description="2項道路など幅員4m未満の場合のセットバック推定面積(㎡)。不要な場合は0")
    purchase_price_hint: float = Field(default=0.0, description="メール等に記載された仕入れ目線・希望価格（円）。記載がない場合は0")
    market_price_per_tsubo: float = Field(default=0.0, description="後処理で上書きされる。AIは0を返してよい")


_EXTRACT_PROMPT = """
あなたは熟練の不動産鑑定士です。
以下の不動産物件情報を解析し、指定のJSONスキーマに従ってデータを抽出してください。

抽出ルール：
- 面積は㎡で返す（坪表記のみの場合は ×3.305785 で換算）
- 容積率は%の数値のみ（「400%」→ 400）
- 前面道路幅員はメートルの数値のみ（「5.0m」→ 5.0）
- 仕入れ目線・希望価格・売出価格が記載されていれば purchase_price_hint に円で返す（「2億」→ 200000000）
- 2項道路など幅員4m未満の場合、セットバック面積を（4m-現況幅員）/2 × 概算間口 で推定する
- 不明な項目はデフォルト値（空文字・0・false）を返す
"""


def extract_property_data_with_llm(pdf_bytes: bytes) -> PropertyDataSchema:
    """PDFから物件情報を抽出する"""
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        print("[LLM Parser] GEMINI_API_KEYが未設定のためデモデータを返します。")
        return PropertyDataSchema(
            address="東京都三鷹市井の頭3丁目",
            area_sqm=1206.54,
            land_use_zone="第1種低層住居専用地域",
            floor_area_ratio=80.0,
            road_width_m=3.0,
            is_leasehold=True,
            leasehold_ratio=40.0,
            road_type="2項道路 (幅員約1.47〜2.74m)",
            setback_area_estimated=14.21,
            purchase_price_hint=0.0,
            market_price_per_tsubo=0.0
        )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                _EXTRACT_PROMPT,
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=PropertyDataSchema
            )
        )
        return PropertyDataSchema.model_validate_json(response.text)

    except Exception as e:
        print(f"[LLM Parser] PDF解析エラー: {e}")
        return PropertyDataSchema(
            address="",
            area_sqm=0.0,
            land_use_zone="",
            floor_area_ratio=0.0,
            road_width_m=0.0,
            is_leasehold=False,
            leasehold_ratio=100.0,
            road_type="",
            setback_area_estimated=0.0,
            purchase_price_hint=0.0,
            market_price_per_tsubo=0.0
        )


def extract_property_data_from_text(text: str) -> PropertyDataSchema:
    """
    メール・テキストからGemini Flashで物件情報を抽出する。
    APIキー未設定時は正規表現でフォールバック。
    """
    api_key = os.environ.get("GEMINI_API_KEY")

    if api_key:
        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[_EXTRACT_PROMPT, text],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=PropertyDataSchema
                )
            )
            result = PropertyDataSchema.model_validate_json(response.text)
            print(f"[Text Parser] Gemini抽出: 住所={result.address}, 面積={result.area_sqm}㎡, 容積率={result.floor_area_ratio}%")
            return result
        except Exception as e:
            print(f"[Text Parser] Gemini失敗、正規表現にフォールバック: {e}")

    # フォールバック：正規表現
    import re

    def find_float(patterns: list[str]) -> float:
        for pat in patterns:
            m = re.search(pat, text)
            if m:
                try:
                    return float(m.group(1).replace(",", ""))
                except ValueError:
                    pass
        return 0.0

    address_m = re.search(r'東京都[\u4e00-\u9fa5\w\d\-ー]+[丁目番地号\-\d]+', text)
    address = address_m.group(0).strip() if address_m else ""
    area_sqm = find_float([r'([\d,\.]+)\s*㎡'])
    if area_sqm == 0.0:
        tsubo = find_float([r'([\d,\.]+)\s*坪'])
        if tsubo > 0:
            area_sqm = round(tsubo * 3.305785, 2)
    floor_area_ratio = find_float([r'容積率\s*[：:]?\s*([\d]+)', r'容積\s*([\d]+)'])
    purchase_price_hint = 0.0
    m_oku = re.search(r'(?:目線|売価|価格|希望)[：:\s]*([\d\.]+)\s*億', text)
    if m_oku:
        purchase_price_hint = float(m_oku.group(1)) * 1_0000_0000

    print(f"[Text Parser] 正規表現: 住所={address}, 面積={area_sqm}㎡")
    return PropertyDataSchema(
        address=address, area_sqm=area_sqm, land_use_zone="",
        floor_area_ratio=floor_area_ratio, road_width_m=0.0,
        is_leasehold=False, leasehold_ratio=100.0, road_type="",
        setback_area_estimated=0.0, purchase_price_hint=purchase_price_hint,
        market_price_per_tsubo=0.0
    )
