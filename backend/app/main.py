from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.services.pdf_extractor.llm_parser import extract_property_data_with_llm, extract_property_data_from_text
from app.services.external_api.mlit_api import fetch_mlit_transaction_data
from app.api.endpoints import simulator
from app.api.endpoints import usage
from app.api.endpoints import simulations
from app.api.endpoints import share

app = FastAPI(title="Land Purchase Simulator API")

app.include_router(simulator.router, prefix="/api", tags=["Simulator"])
app.include_router(usage.router, prefix="/api", tags=["Usage"])
app.include_router(simulations.router, prefix="/api", tags=["Simulations"])
app.include_router(share.router, prefix="/api", tags=["Share"])

ALLOWED_ORIGINS = [
    "https://tochi-ai.com",
    "https://www.tochi-ai.com",
    "https://tochihantei.vercel.app",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _enrich_with_market_price(result):
    """解析結果に相場坪単価を付加する（共通処理）"""
    market_price = fetch_mlit_transaction_data(result.address, result.floor_area_ratio)
    result.market_price_per_tsubo = market_price
    return result


@app.get("/api/health")
async def health():
    import os
    key = os.environ.get("GEMINI_API_KEY")
    return {"gemini_key_set": bool(key), "key_length": len(key) if key else 0}


@app.post("/api/parse-pdf")
async def parse_pdf_endpoint(file: UploadFile = File(...)):
    """PDFをGeminiで解析し、物件情報＋相場データを返す"""
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルのみアップロード可能です")
    try:
        file_bytes = await file.read()
        result = extract_property_data_with_llm(file_bytes)
        result = _enrich_with_market_price(result)
        return {"status": "success", "data": result.model_dump()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ParseTextRequest(BaseModel):
    text: str


@app.post("/api/parse-text")
async def parse_text_endpoint(body: ParseTextRequest):
    """メール・テキストをGeminiで解析し、物件情報＋相場データを返す"""
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="テキストが空です")
    try:
        result = extract_property_data_from_text(body.text)
        result = _enrich_with_market_price(result)
        return {"status": "success", "data": result.model_dump()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
