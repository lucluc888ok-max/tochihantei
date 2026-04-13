# tochihantei - 土地判定シミュレーター

## プロジェクト概要
不動産デベロッパー向けの土地仕入れ採算シミュレーター。
メール・PDFから物件情報をAI抽出し、収支シミュレーションを実行する。

## 技術スタック
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS → Vercel
- **Backend**: FastAPI (Python) → Railway
- **AI**: Gemini 2.5 Flash（テキスト・PDF解析）、Gemini 2.5 Pro（レポート生成）

## デプロイ先
- Frontend: https://tochihantei.vercel.app
- Backend: https://tochihantei-production.up.railway.app
- GitHub: https://github.com/lucluc888ok-max/tochihantei

git push で両方自動デプロイされる。

## 環境変数
### Backend (Railway)
- `GEMINI_API_KEY`: Gemini APIキー

### Frontend (Vercel)
- `VITE_API_BASE_URL`: バックエンドURL（https://tochihantei-production.up.railway.app）

### ローカル・Codespaces開発
- `backend/.env`: GEMINI_API_KEY=xxx
- `frontend/.env.local`: VITE_API_BASE_URL=http://localhost:8000

## ディレクトリ構成
```
land-purchase-simulator/
├── backend/
│   ├── app/
│   │   ├── main.py                          # FastAPIエントリーポイント
│   │   ├── models/simulator_models.py        # Pydanticモデル
│   │   ├── api/endpoints/simulator.py        # シミュレーションエンドポイント
│   │   └── services/
│   │       ├── calculator/simulator_logic.py # メイン計算ロジック ★よく触る
│   │       ├── external_api/mlit_api.py      # 国土交通省データ取得
│   │       └── pdf_extractor/llm_parser.py   # PDF・テキスト解析
│   ├── data/cities/                          # 49市区JSON（国交省取引データ）
│   ├── requirements.txt
│   └── railway.toml
└── frontend/
    └── src/App.tsx                           # メインUI ★よく触る
```

## よく変更するパラメータ（simulator_logic.py）

| パラメータ | 場所 | 現在値 |
|-----------|------|--------|
| 建築費単価 | `DEFAULT_CONSTRUCTION_COST_PER_TSUBO` | 160万円/坪（RC造） |
| レンタブル比 | `RENTABLE_RATIO` | 0.82 |
| 宅地相場補正 | `fetch_mlit_transaction_data(...) * 1.1` | ×1.1 |
| 区別プレミアム乗数 | `_AREA_PREMIUM_TABLE` | 港区2.1〜練馬1.4 |
| 用途地域補正 | `_ZONE_CORRECTION` | 準工業0.85・低層1.10 |
| 諸経費率 | `cost_base * 0.10` | 10% |

## 主要ロジック（simulator_logic.py）

### 実行容積率
```
実行容積率 = min(指定容積率, 道路幅員 × 0.4(住居系)/0.6(商業系) × 100)
```

### 出口坪単価（新築マンション分譲）
```
出口坪単価 = 中古マンション相場 × (区テーブル乗数 × 用途地域補正)
```

### 宅地相場
```
宅地相場 = MLITデータ取引価格 × 1.1補正
```

### レンタブル比
```
0.82（専有面積 = 延床 × 0.82）
```

### 建築費
```
RC造: 160万円/坪（DEFAULT_CONSTRUCTION_COST_PER_TSUBO）
```

### 諸経費
```
（仕入 + 地上げ + 建築費）× 10%
```

## エリア別プレミアム乗数テーブル（_AREA_PREMIUM_TABLE）
23区コード → 基準乗数。用途地域補正（_ZONE_CORRECTION）と掛け合わせる。
- 港区: 2.1 / 渋谷区: 2.0 / 千代田区: 2.0
- 文京区: 1.8 / 新宿区: 1.8 / 目黒区: 1.8
- 豊島区: 1.7 / 品川区: 1.7 / 世田谷区: 1.7
- 準工業地域補正: ×0.85 / 低層住居系: ×1.10 / 商業系: ×1.00

## データソース
- 国土交通省 不動産情報ライブラリ: 213,304件の取引データをローカルJSONに変換済み
- `backend/data/cities/13101.json`〜`13229.json`（49ファイル）
- **注意**: Git LFS無効。大容量JSONは直接コミット済み（LFS使用不可）

## ローカル起動
```bash
# バックエンド
cd backend
python -m venv venv
source venv/bin/activate    # Mac / Linux / Codespaces
venv\Scripts\activate       # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# フロントエンド（別ターミナル）
cd frontend
npm install
npm run dev
```

## APIエンドポイント
- `GET /api/health`: Gemini APIキー確認
- `POST /api/parse-pdf`: PDFから物件情報抽出
- `POST /api/parse-text`: テキストから物件情報抽出
- `POST /api/simulate`: シミュレーション実行

## 既知の注意点
- **Railway cold start**: デプロイ後・アイドル後の初回リクエストは30〜60秒かかることがある
- **Git LFS無効**: `data/cities/` の大容量JSONはLFS管理外。`git push`で直接コミット
- **CORS設定**: `allow_credentials=False` + `allow_origins=["*"]`。credentialsをTrueにするとCORSエラーになる

## 今後の課題・検討事項
- 区単位より細かいエリア補正（駅距離・路線別）の精度向上
- 乗数テーブルの管理画面化（コード変更なしで調整できるように）
