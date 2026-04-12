from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.services.pdf_extractor.llm_parser import extract_property_data_with_llm
from app.services.external_api.mlit_api import fetch_mlit_transaction_data
from app.api.endpoints import simulator

app = FastAPI(title="Land Purchase Simulator API")

app.include_router(simulator.router, prefix="/api", tags=["Simulator"])

# フロントエンド(localhost:5173)からAPIをコールできるようにCORSを設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/parse-pdf")
async def parse_pdf_endpoint(file: UploadFile = File(...)):
    """
    フロントエンドから送信されたPDFファイルをGeminiへ渡し、
    構造化された解析データ(JSON)を返すエンドポイント
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDFファイルのみアップロード可能です")
    
    try:
        # PDFのバイナリを読み込み
        file_bytes = await file.read()
        
        # AIで解析（またはモック返却）
        result = extract_property_data_with_llm(file_bytes)

        # ローカルJSONから相場坪単価を取得して上書き
        market_price = fetch_mlit_transaction_data(result.address, result.floor_area_ratio)
        result.market_price_per_tsubo = market_price

        return {
            "status": "success",
            "data": result.model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
