import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, TrendingUp, DollarSign, Calculator, AlertCircle } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// フロントエンド内で計算ロジックをシミュレーションするための型定義
interface ParsedData {
  area_sqm: number;
  land_use_zone: string;
  floor_area_ratio: number;
  is_leasehold: boolean;
  leasehold_ratio: number;
  road_type: string;
  setback_area_estimated: number;
  market_price_per_tsubo: number;
}

export default function App() {
  const [purchasePrice, setPurchasePrice] = useState(250000000); // 手動スライダー用（万円）
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // API通信開始（ローディング演出）
      setIsAnalyzing(true);
      setParsedData(null);
      
      try {
        const formData = new FormData();
        formData.append("file", file);
        
        // FastAPI へのリクエスト (環境変数から取得、なければデフォルトでローカル)
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        const response = await fetch(`${baseUrl}/api/parse-pdf`, {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`サーバーエラー: ${response.statusText}`);
        }
        
        const resJson = await response.json();
        const apiData: ParsedData = resJson.data;
        
        setParsedData(apiData);
        
        // 解析結果をもとに、適正仕入上限額付近にスライダーを自動設定
        const effectiveAreaSqm = apiData.area_sqm - apiData.setback_area_estimated;
        const effectiveTsubo = effectiveAreaSqm / 3.305785;
        // 底地権割合を加味し、さらに利益・建築費を引いた適正仕入れ額を簡易算出
        const suggestedRawPrice = (effectiveTsubo * apiData.market_price_per_tsubo * (apiData.leasehold_ratio / 100)) * 0.75; 
        
        setPurchasePrice(Math.round(suggestedRawPrice / 10000) * 10000);
      } catch (err) {
        console.error("PDFパースエラー", err);
        alert("PDFの解析に失敗しました。サーバーが起動しているか確認してください。");
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  // --- 収益シミュレーションの計算ロジック ---
  const effectiveAreaSqm = parsedData ? (parsedData.area_sqm - parsedData.setback_area_estimated) : 0;
  const areaTsubo = effectiveAreaSqm / 3.305785;
  
  // 売上推定: 市場の坪単価 × 坪数 × (借地・底地割合など)
  const estimatedSalesPrice = parsedData 
    ? (areaTsubo * parsedData.market_price_per_tsubo * (parsedData.leasehold_ratio / 100))
    : 0;
    
  // 建築費・造成等 (ダミー固定値)
  const constructionCost = parsedData ? 50000000 : 0;
  
  // 現在の利益 (売上 - 仕入 - 建築)
  const currentProfit = estimatedSalesPrice - purchasePrice - constructionCost;
  const currentProfitMargin = estimatedSalesPrice > 0 ? (currentProfit / estimatedSalesPrice) * 100 : 0;
  
  // 今現在の設定仕入価格に対する「仕入坪単価」
  const currentTsuboPrice = areaTsubo > 0 ? purchasePrice / areaTsubo : 0;

  // チャート用データ生成 (仕入れ価格変動による利益率推移)
  const generateChartData = () => {
    if (!parsedData) return [];
    const points = [];
    const minP = Math.max(100000000, purchasePrice - 100000000);
    const maxP = purchasePrice + 100000000;
    
    for (let p = minP; p <= maxP; p += 5000000) {
      const profit = estimatedSalesPrice - (p + constructionCost);
      points.push({
        price: p / 10000,
        profit: profit / 10000,
        margin: (profit / estimatedSalesPrice) * 100,
      });
    }
    return points;
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 font-['Inter',sans-serif]">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Calculator className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">用地仕入れ収益シミュレーター</h1>
            <p className="text-sm text-gray-400">PDFをアップロードするだけで、設計や相場調査なしで瞬時に利益採算を判定</p>
          </div>
        </div>
      </header>

      {/* Main Grid: 2 columns (Left: Upload & Parse, Right: Simulation) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-140px)]">
        
        {/* Left Column: Data Extraction */}
        <div className="flex flex-col gap-6">
          <div className="bg-[#121214] rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-gray-400" />
              物件概要書（PDF）読み込み
            </h2>
            
            <input 
              type="file" 
              accept="application/pdf"
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
            />
            
            <div 
              onClick={handleFileClick}
              className={`border-2 border-dashed ${isAnalyzing ? 'border-blue-500 bg-[#1a1a1e]/80 animate-pulse' : 'border-gray-700 bg-[#1a1a1e] hover:border-blue-500'} rounded-xl flex flex-col items-center justify-center text-center p-8 transition-colors cursor-pointer group mb-4`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-md font-medium text-blue-400">AI解析・自動計算中...</p>
                  <p className="text-sm text-gray-500 mt-2">用途地域、接道状態、周辺事例を照合しています</p>
                </>
              ) : selectedFile ? (
                 <>
                  <div className="bg-green-900/40 border border-green-500/50 p-4 rounded-full mb-4">
                    <CheckCircle2 className="w-8 h-8 text-green-400" />
                  </div>
                  <p className="text-md font-medium text-green-400">{selectedFile.name}</p>
                  <p className="text-sm text-gray-400 mt-2">クリックして別のファイルをアップロード</p>
                 </>
              ) : (
                <>
                  <div className="bg-gray-800/50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <FileText className="w-8 h-8 text-blue-400" />
                  </div>
                  <p className="text-md font-medium mb-1">PDFをここにドラッグ＆ドロップ</p>
                  <p className="text-sm text-gray-500 mb-4">物件情報から1秒で採算を割り出します</p>
                  <button className="bg-blue-600 px-6 py-2 flex text-white rounded-md font-medium text-sm">
                    ファイルを選択
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Extraction Results */}
          <div className={`bg-[#121214] rounded-xl border border-gray-800 p-6 flex-1 transition-opacity duration-500 ${parsedData ? 'opacity-100' : 'opacity-30'}`}>
            <h3 className="text-md font-semibold text-gray-300 mb-4 border-b border-gray-800 pb-2">📂 AI自動抽出データ</h3>
            
            {parsedData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-gray-800/30 p-3 rounded-md border border-gray-700/50">
                     <p className="text-xs text-gray-500 mb-1">全体面積</p>
                     <p className="text-lg font-mono">{parsedData.area_sqm} <span className="text-sm text-gray-400">㎡</span></p>
                   </div>
                   <div className="bg-orange-900/20 p-3 rounded-md border border-orange-800/30 relative">
                     <AlertCircle className="absolute top-2 right-2 w-4 h-4 text-orange-500 opacity-50" />
                     <p className="text-xs text-orange-400 mb-1">セットバック差引後 (自動計算)</p>
                     <p className="text-lg font-mono text-orange-300">{effectiveAreaSqm.toFixed(2)} <span className="text-sm opacity-70">㎡</span></p>
                     <p className="text-[10px] text-orange-500 mt-1">接道: {parsedData.road_type} より {parsedData.setback_area_estimated}㎡後退</p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-gray-800/30 p-3 rounded-md border border-gray-700/50">
                     <p className="text-xs text-gray-500 mb-1">用途地域 / 容積</p>
                     <p className="text-sm">{parsedData.land_use_zone}</p>
                     <p className="text-xs font-mono text-gray-400 mt-1">容積率: {parsedData.floor_area_ratio}%</p>
                   </div>
                   <div className="bg-red-900/20 p-3 rounded-md border border-red-800/30 relative">
                     <AlertCircle className="absolute top-2 right-2 w-4 h-4 text-red-500 opacity-50" />
                     <p className="text-xs text-red-400 mb-1">特殊要件 (権利)</p>
                     <p className="text-sm font-bold text-red-300">底地権あり</p>
                     <p className="text-[10px] text-red-400 mt-1">底地権割合評価: {parsedData.leasehold_ratio}%適用</p>
                   </div>
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
                PDFがアップロードされると、ここに解析・計算済みの情報が表示されます
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Profit Simulation */}
        <div className={`bg-[#121214] rounded-xl border border-gray-800 p-6 flex flex-col transition-opacity duration-500 ${parsedData ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            一発採算チェック (仕入シミュレーション)
          </h2>
          
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-800/50 border border-gray-700 p-3 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">想定販売価格 (周辺相場より)</p>
              <p className="text-lg font-bold font-mono text-gray-200">
                {Math.round(estimatedSalesPrice / 10000).toLocaleString()} <span className="text-xs text-gray-500">万円</span>
              </p>
              {parsedData && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                   市場相場: 約{Math.round(parsedData.market_price_per_tsubo / 10000).toLocaleString()}万円 / 坪
                </p>
              )}
            </div>
            <div className="bg-gray-800/50 border border-gray-700 p-3 rounded-lg">
              <p className="text-xs text-gray-400 mb-1">大まかな設計・建築等</p>
              <p className="text-lg font-bold font-mono text-gray-200">
                {Math.round(constructionCost / 10000).toLocaleString()} <span className="text-xs text-gray-500">万円</span>
              </p>
            </div>
            <div className={`border p-3 rounded-lg ${currentProfitMargin >= 20 ? 'bg-blue-900/20 border-blue-500/50' : currentProfitMargin >= 10 ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-red-900/20 border-red-500/50'}`}>
               <p className="text-xs text-gray-400 mb-1">想定純利益</p>
               <p className={`text-xl font-bold font-mono ${currentProfitMargin >= 20 ? 'text-blue-400' : currentProfitMargin >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                 {Math.round(currentProfit / 10000).toLocaleString()} <span className="text-xs">万円</span>
               </p>
               <p className={`text-[10px] mt-0.5 ${currentProfitMargin < 10 ? 'text-red-400' : 'text-gray-400'}`}>
                 利益率: {currentProfitMargin.toFixed(1)}% {currentProfitMargin < 10 && '(採算ライン割れ)'}
               </p>
            </div>
          </div>

          <div className="mb-8 bg-gray-900/50 p-5 rounded-lg border border-gray-800">
            <div className="flex justify-between items-end mb-4">
              <label className="text-sm font-medium text-gray-300">本物件の仕入れ価格 (スライダー調整)</label>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1 bg-black px-4 py-2 rounded-md border border-gray-700 shadow-inner mb-1">
                  <DollarSign className="w-5 h-5 text-gray-400" />
                  <span className="text-2xl font-bold font-mono text-white">{(purchasePrice / 10000).toLocaleString()}</span>
                  <span className="text-sm text-gray-500">万円</span>
                </div>
                {parsedData && (
                  <span className="text-xs font-mono text-blue-300 bg-blue-900/40 border border-blue-900 px-2 py-0.5 rounded shadow-sm">
                    仕入坪単価: 約 {Math.round(currentTsuboPrice / 10000).toLocaleString()} 万円/坪
                  </span>
                )}
              </div>
            </div>
            
            <input 
              type="range" 
              min={parsedData ? 150000000 : 0} 
              max={parsedData ? 400000000 : 0} 
              step="1000000"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(Number(e.target.value))}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2 font-mono">
              <span>{parsedData ? '安く買い叩く' : ''}</span>
              <span className="text-blue-400 font-bold border-b border-dashed border-blue-600">デベロッパー採算ライン</span>
              <span>{parsedData ? '高値掴み' : ''}</span>
            </div>
          </div>

          <div className="flex-1 mt-2 relative min-h-[150px]">
            {parsedData && (
              <>
                <h3 className="text-xs font-semibold text-gray-500 mb-2">仕入れ額・売上利益への影響チャート</h3>
                <ResponsiveContainer width="100%" height="90%">
                  <AreaChart data={generateChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis 
                      dataKey="price" 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickFormatter={(val) => `${val}`}
                    />
                    <YAxis 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#e4e4e7' }}
                      labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                      formatter={(value: any) => [`${Number(value).toLocaleString()} 万円`, '純利益']}
                      labelFormatter={(label) => `仕入: ${label}万円`}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="profit" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorProfit)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
