import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, FileText, CheckCircle2, TrendingUp, Calculator, AlertCircle, Mail } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const TSUBO_RATIO = 3.305785;
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface ParsedData {
  address: string;
  area_sqm: number;
  land_use_zone: string;
  coverage_ratio: number;
  floor_area_ratio: number;
  road_width_m: number;
  is_leasehold: boolean;
  leasehold_ratio: number;
  road_type: string;
  setback_area_estimated: number;
  market_price_per_tsubo: number;
  purchase_price_hint: number;
}

interface CostDetail {
  name: string;
  amount: number;
  note: string;
}

interface SimResult {
  effective_far: number;
  far_calc_basis: string;
  market_price_per_tsubo: number;
  condo_market_price_per_tsubo: number;
  sales_price_per_tsubo: number;
  land_exit_total: number;
  purchase_price: number | null;
  purchase_price_per_tsubo: number | null;
  profit_total: number | null;
  profit_margin: number | null;
  max_floor_area_sqm: number;
  net_area_sqm: number;
  net_area_tsubo: number;
  report_data: { expenses: CostDetail[]; revenues: CostDetail[] };
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [roadWidth, setRoadWidth] = useState<string>('4.0');
  const [purchasePriceInput, setPurchasePriceInput] = useState<string>('');
  const [assemblyCostInput, setAssemblyCostInput] = useState<string>('');
  const [mailText, setMailText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runSimulation = useCallback(async (parsed: ParsedData, rw: string, pp: string, ac?: string) => {
    const payload: Record<string, unknown> = {
      address: parsed.address,
      area_sqm: parsed.area_sqm,
      road_width: parseFloat(rw) || 4.0,
      zoning: parsed.land_use_zone,
      far_limit: parsed.floor_area_ratio,
    };
    const ppNum = parseFloat(pp) * 10000;
    if (pp.trim() && !isNaN(ppNum) && ppNum > 0) {
      payload.purchase_price = ppNum;
    }
    const acNum = parseFloat(assemblyCostInput) * 10000;
    if (assemblyCostInput.trim() && !isNaN(acNum) && acNum > 0) {
      payload.assembly_cost = acNum;
    }
    const res = await fetch(`${BASE_URL}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(res.statusText);
    return (await res.json()) as SimResult;
  }, []);

  const applyParsedData = (parsed: ParsedData) => {
    setParsedData(parsed);
    if (parsed.road_width_m && parsed.road_width_m > 0) {
      setRoadWidth(String(parsed.road_width_m));
    }
    if ((parsed as any).purchase_price_hint && (parsed as any).purchase_price_hint > 0) {
      setPurchasePriceInput(String(Math.round((parsed as any).purchase_price_hint / 10000)));
    }
  };

  const parseTextLocally = (text: string): Partial<ParsedData> => {
    // 全角→半角の正規化
    const normalize = (s: string) =>
      s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
       .replace(/[ａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF41 + 0x61))
       .replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF21 + 0x41))
       .replace(/[．]/g, '.').replace(/[，]/g, ',').replace(/[％]/g, '%')
       .replace(/[ｍ]/g, 'm').replace(/[：]/g, ':').replace(/\u3000/g, ' ');

    const t = normalize(text);

    const findFloat = (patterns: RegExp[]): number => {
      for (const pat of patterns) {
        const m = t.match(pat);
        if (m) return parseFloat(m[1].replace(/,/g, ''));
      }
      return 0;
    };

    // 住所
    const addressMatch =
      t.match(/(?:所在地|住所|物件住所)[:\s]+([東京都].+?)[\n\r]/) ||
      t.match(/(東京都[\u4e00-\u9fa5\w\d\-ー]+[丁目番地号\-\d]+)/);
    const address = addressMatch ? addressMatch[1].trim() : '';

    // 面積（㎡優先、坪→換算）
    let area_sqm = findFloat([/([0-9,\.]+)\s*㎡/]);
    if (!area_sqm) {
      const tsubo = findFloat([/([0-9,\.]+)\s*坪/]);
      if (tsubo) area_sqm = Math.round(tsubo * 3.305785 * 100) / 100;
    }

    // 用途地域（略称も対応）
    const ZONE_MAP: Record<string, string> = {
      '第一種低層住居専用地域': '第一種低層住居専用地域',
      '第二種低層住居専用地域': '第二種低層住居専用地域',
      '第一種中高層住居専用地域': '第一種中高層住居専用地域',
      '第二種中高層住居専用地域': '第二種中高層住居専用地域',
      '第一種住居地域': '第一種住居地域',
      '第二種住居地域': '第二種住居地域',
      '準住居地域': '準住居地域',
      '近隣商業地域': '近隣商業地域',
      '近隣商業': '近隣商業地域',
      '商業地域': '商業地域',
      '準工業地域': '準工業地域',
      '準工業': '準工業地域',
      '工業地域': '工業地域',
      '工業専用地域': '工業専用地域',
      '田園住居地域': '田園住居地域',
    };
    const land_use_zone = Object.entries(ZONE_MAP).reduce((found, [key, val]) =>
      found || (t.includes(key) ? val : ''), '');

    // 容積率・建蔽率：ラベルあり優先、なければ%の大きい方=容積率・小さい方=建蔽率
    let floor_area_ratio = findFloat([/容積率\s*:?\s*([0-9]+)/, /容積\s*([0-9]+)/]);
    let coverage_ratio   = findFloat([/建蔽率\s*:?\s*([0-9]+)/, /建蔽\s*([0-9]+)/]);
    if (!floor_area_ratio) {
      const allPct = [...t.matchAll(/([0-9]+)\s*%/g)].map(m => parseFloat(m[1])).sort((a, b) => a - b);
      if (allPct.length >= 2) {
        coverage_ratio   = allPct[0];            // 小さい方 = 建蔽率
        floor_area_ratio = allPct[allPct.length - 1]; // 大きい方 = 容積率
      } else if (allPct.length === 1) {
        floor_area_ratio = allPct[0];
      }
    }

    // 道路幅員
    const road_width_m = findFloat([
      /幅員\s*([0-9\.]+)\s*m/,
      /道路幅員\s*:?\s*([0-9\.]+)/,
      /([0-9\.]+)\s*m.*?道路/,
    ]);

    // 仕入目線
    let purchase_price_hint = 0;
    const oku = t.match(/(?:目線|売価|価格|希望)[:\s]*([0-9\.]+)\s*億/);
    const man = t.match(/(?:目線|売価|価格|希望)[:\s]*([0-9,]+)\s*万/);
    if (oku) purchase_price_hint = parseFloat(oku[1]) * 1_0000_0000;
    else if (man) purchase_price_hint = parseFloat(man[1].replace(/,/g, '')) * 10000;

    return { address, area_sqm, land_use_zone, coverage_ratio, floor_area_ratio, road_width_m, purchase_price_hint } as any;
  };

  const handleParseText = () => {
    if (!mailText.trim()) return;
    const extracted = parseTextLocally(mailText);

    // フィールドに反映
    const dummy: ParsedData = {
      address: extracted.address ?? '',
      area_sqm: extracted.area_sqm ?? 0,
      land_use_zone: extracted.land_use_zone ?? '',
      coverage_ratio: (extracted as any).coverage_ratio ?? 0,
      floor_area_ratio: extracted.floor_area_ratio ?? 0,
      road_width_m: (extracted as any).road_width_m ?? 0,
      is_leasehold: false,
      leasehold_ratio: 100,
      road_type: '',
      setback_area_estimated: 0,
      market_price_per_tsubo: 0,
      purchase_price_hint: (extracted as any).purchase_price_hint ?? 0,
    } as any;
    applyParsedData(dummy);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setSelectedFile(file);
    setIsAnalyzing(true);
    setParsedData(null);
    setSimResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE_URL}/api/parse-pdf`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(res.statusText);
      const parsed: ParsedData = (await res.json()).data;
      applyParsedData(parsed);
      // PDFはroad_widthを優先。なければ既存の入力値を使う
      const rw = (parsed as any).road_width_m > 0 ? String((parsed as any).road_width_m) : roadWidth;
      const result = await runSimulation(parsed, rw, purchasePriceInput, assemblyCostInput);
      setSimResult(result);
    } catch (err) {
      console.error(err);
      alert('エラーが発生しました。サーバーが起動しているか確認してください。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSimulate = async () => {
    if (!parsedData) return;
    try {
      const result = await runSimulation(parsedData, roadWidth, purchasePriceInput, assemblyCostInput);
      setSimResult(result);
    } catch (err) {
      console.error(err);
      alert('シミュレーションに失敗しました。');
    }
  };

  // 仕入価格変動チャート（フロントで計算）
  const chartData = (() => {
    if (!simResult) return [];
    const totalSales = simResult.report_data.revenues[0]?.amount ?? 0;
    const constructionCost = simResult.report_data.expenses.find(e => e.name.includes('建築費'))?.amount ?? 0;
    const center = simResult.purchase_price ?? constructionCost;
    const min = Math.max(0, center * 0.5);
    const max = center * 1.5 + constructionCost * 0.3;
    const step = (max - min) / 20;
    const points = [];
    for (let p = min; p <= max; p += step) {
      const misc = (p + constructionCost) * 0.1;
      const profit = totalSales - p - constructionCost - misc;
      points.push({
        price: Math.round(p / 10000),
        profit: Math.round(profit / 10000),
      });
    }
    return points;
  })();

  return (
    <div className="min-h-screen bg-[#09090b] text-white p-6 font-['Inter',sans-serif]">
      {/* Header */}
      <header className="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
        <div className="bg-blue-600 p-2 rounded-lg">
          <Calculator className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">用地仕入れ収益シミュレーター</h1>
          <p className="text-sm text-gray-400">PDFをアップロードするだけで、設計や相場調査なしで瞬時に利益採算を判定</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ===== 左カラム ===== */}
        <div className="flex flex-col gap-6">

          {/* メール貼り付け */}
          <div className="bg-[#121214] rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-gray-400" />
              <span>①メール・テキストから読み込む</span>
              <span className="text-xs text-gray-600 font-normal ml-1">（物件概要・住所・価格を自動抽出）</span>
            </h2>
            <textarea
              value={mailText}
              onChange={e => setMailText(e.target.value)}
              placeholder={'メール本文や物件概要をここに貼り付け...\n\n例：\n住所: 東京都豊島区池袋3丁目38-3\n面積: 312.63㎡\n用途地域: 近隣商業 容積率300%\n道路幅員: 4.5m\n目線: 1億円'}
              className="w-full bg-[#1a1a1e] border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none font-mono"
              rows={6}
            />
            <button
              onClick={handleParseText}
              disabled={!mailText.trim()}
              className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 rounded-md font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />入力欄に反映する
            </button>
          </div>

          {/* PDF アップロード */}
          <div className="bg-[#121214] rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-gray-400" />
              <span>②物件概要書（PDF）で詳細化</span>
              <span className="text-xs text-gray-600 font-normal ml-1">（任意・①の情報を上書き精緻化）</span>
            </h2>
            <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center p-8 cursor-pointer transition-colors group
                ${isAnalyzing ? 'border-blue-500 bg-[#1a1a1e]/80 animate-pulse' : 'border-gray-700 bg-[#1a1a1e] hover:border-blue-500'}`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
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
                  <button className="bg-blue-600 px-6 py-2 text-white rounded-md font-medium text-sm">ファイルを選択</button>
                </>
              )}
            </div>
          </div>

          {/* AI抽出データ */}
          <div className={`bg-[#121214] rounded-xl border border-gray-800 p-6 transition-opacity duration-500 ${parsedData ? 'opacity-100' : 'opacity-30'}`}>
            <h3 className="text-md font-semibold text-gray-300 mb-4 border-b border-gray-800 pb-2">📂 AI自動抽出データ</h3>
            {parsedData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800/30 p-3 rounded-md border border-gray-700/50">
                    <p className="text-xs text-gray-500 mb-1">所在地</p>
                    <p className="text-sm">{parsedData.address || '（未抽出）'}</p>
                  </div>
                  <div className="bg-gray-800/30 p-3 rounded-md border border-gray-700/50">
                    <p className="text-xs text-gray-500 mb-1">面積</p>
                    <p className="text-lg font-mono">{parsedData.area_sqm} <span className="text-sm text-gray-400">㎡（{(parsedData.area_sqm / TSUBO_RATIO).toFixed(2)}坪）</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-800/30 p-3 rounded-md border border-gray-700/50">
                    <p className="text-xs text-gray-500 mb-1">用途地域</p>
                    <p className="text-sm">{parsedData.land_use_zone || '－'}</p>
                    <div className="flex gap-2 mt-1">
                      {parsedData.coverage_ratio > 0 && (
                        <p className="text-xs font-mono text-gray-400">建蔽率: {parsedData.coverage_ratio}%</p>
                      )}
                      <p className="text-xs font-mono text-gray-400">容積率: {parsedData.floor_area_ratio}%</p>
                    </div>
                  </div>
                  {parsedData.setback_area_estimated > 0 ? (
                    <div className="bg-orange-900/20 p-3 rounded-md border border-orange-800/30 relative">
                      <AlertCircle className="absolute top-2 right-2 w-4 h-4 text-orange-500 opacity-50" />
                      <p className="text-xs text-orange-400 mb-1">セットバック（自動計算）</p>
                      <p className="text-lg font-mono text-orange-300">{parsedData.setback_area_estimated} <span className="text-sm opacity-70">㎡</span></p>
                      <p className="text-[10px] text-orange-500 mt-1">{parsedData.road_type}</p>
                    </div>
                  ) : (
                    <div className="bg-gray-800/30 p-3 rounded-md border border-gray-700/50">
                      <p className="text-xs text-gray-500 mb-1">接道状況</p>
                      <p className="text-sm">{parsedData.road_type || '－'}</p>
                    </div>
                  )}
                </div>
                {parsedData.is_leasehold && (
                  <div className="bg-red-900/20 p-3 rounded-md border border-red-800/30">
                    <p className="text-xs text-red-400 mb-1">⚠ 特殊権利</p>
                    <p className="text-sm text-red-300">底地権あり（評価割合: {parsedData.leasehold_ratio}%）</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-600 text-sm">
                PDFをアップロードすると解析データが表示されます
              </div>
            )}
          </div>

          {/* 計算条件入力 */}
          <div className={`bg-[#121214] rounded-xl border border-gray-800 p-6 transition-opacity duration-500 ${parsedData ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
            <h3 className="text-md font-semibold text-gray-300 mb-4 border-b border-gray-800 pb-2">⚙ 計算条件</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">前面道路幅員（m）</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={roadWidth}
                  onChange={e => setRoadWidth(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  デベロッパー提示 仕入価格
                  <span className="text-gray-600 ml-1">（万円・任意）</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 10000　※未提示の場合は空欄"
                  value={purchasePriceInput}
                  onChange={e => setPurchasePriceInput(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 placeholder-gray-600"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  地上げ費
                  <span className="text-gray-600 ml-1">（万円・任意）</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 60000　※未提示の場合は空欄"
                  value={assemblyCostInput}
                  onChange={e => setAssemblyCostInput(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500 placeholder-gray-600"
                />
              </div>
              <button
                onClick={handleSimulate}
                disabled={!parsedData}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 rounded-md font-medium text-sm transition-colors"
              >
                シミュレーション実行
              </button>
            </div>
          </div>
        </div>

        {/* ===== 右カラム ===== */}
        <div className={`bg-[#121214] rounded-xl border border-gray-800 p-6 flex flex-col gap-5 transition-opacity duration-500 ${simResult ? 'opacity-100' : 'opacity-40'}`}>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-400" />
            採算シミュレーション結果
          </h2>

          {simResult ? (
            <>
              {/* 建築ボリューム */}
              <div className="bg-gray-900/50 rounded-lg border border-gray-800 p-4">
                <p className="text-xs text-gray-500 mb-3">建築ボリューム試算</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">実行容積率</p>
                    <p className="text-2xl font-bold font-mono text-blue-400">{simResult.effective_far}<span className="text-sm">%</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">最大延床</p>
                    <p className="text-2xl font-bold font-mono">{(simResult.max_floor_area_sqm / TSUBO_RATIO).toFixed(1)}<span className="text-sm text-gray-400">坪</span></p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">有効専有</p>
                    <p className="text-2xl font-bold font-mono">{simResult.net_area_tsubo.toFixed(1)}<span className="text-sm text-gray-400">坪</span></p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-600 mt-3">{simResult.far_calc_basis}</p>
              </div>

              {/* 収支表 */}
              <div>
                <p className="text-xs text-gray-500 mb-2">事業収支</p>
                <div className="space-y-2">
                  {simResult.report_data.expenses.map((e, i) => {
                    const isPurchase = e.name.includes('仕入');
                    const isEmpty = isPurchase && !simResult.purchase_price;
                    return (
                      <div
                        key={i}
                        className={`flex justify-between items-center p-3 rounded-md border
                          ${isEmpty ? 'border-gray-700/30 bg-gray-800/20 opacity-50' : 'border-gray-700/50 bg-gray-800/30'}`}
                      >
                        <div>
                          <p className="text-sm">{e.name}</p>
                          <p className="text-[10px] text-gray-500">{e.note}</p>
                        </div>
                        <p className="text-sm font-mono font-bold">
                          {e.amount > 0 ? `${(e.amount / 10000).toLocaleString()}万円` : '－'}
                        </p>
                      </div>
                    );
                  })}

                  {simResult.report_data.revenues.map((rv, i) => (
                    <div key={i} className="flex justify-between items-center p-3 rounded-md border border-blue-800/40 bg-blue-900/10">
                      <div>
                        <p className="text-sm text-blue-300">{rv.name}</p>
                        <p className="text-[10px] text-gray-500">{rv.note}</p>
                      </div>
                      <p className="text-sm font-mono font-bold text-blue-400">{(rv.amount / 10000).toLocaleString()}万円</p>
                    </div>
                  ))}

                  {simResult.profit_total !== null && (
                    <div className={`flex justify-between items-center p-3 rounded-md border
                      ${simResult.profit_margin! >= 20 ? 'border-green-700/50 bg-green-900/20'
                        : simResult.profit_margin! >= 10 ? 'border-yellow-700/50 bg-yellow-900/20'
                        : 'border-red-700/50 bg-red-900/20'}`}
                    >
                      <div>
                        <p className={`text-sm font-bold
                          ${simResult.profit_margin! >= 20 ? 'text-green-400'
                            : simResult.profit_margin! >= 10 ? 'text-yellow-400'
                            : 'text-red-400'}`}>
                          純利益
                        </p>
                        <p className="text-[10px] text-gray-500">
                          利益率: {simResult.profit_margin?.toFixed(1)}%
                          {simResult.profit_margin! < 10 && ' ⚠ 採算ライン割れ'}
                        </p>
                      </div>
                      <p className={`text-lg font-mono font-bold
                        ${simResult.profit_margin! >= 20 ? 'text-green-400'
                          : simResult.profit_margin! >= 10 ? 'text-yellow-400'
                          : 'text-red-400'}`}>
                        {(simResult.profit_total / 10000).toLocaleString()}万円
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 土地出口 */}
              <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-3">
                <p className="text-xs text-gray-500 mb-2">土地出口（更地売却想定）</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    宅地相場 {(simResult.market_price_per_tsubo / 10000).toFixed(0)}万円/坪 × {(simResult.max_floor_area_sqm / simResult.effective_far * 100 / TSUBO_RATIO).toFixed(1)}坪
                  </span>
                  <span className="text-base font-bold font-mono text-gray-200">
                    {(simResult.land_exit_total / 10000).toLocaleString()}万円
                  </span>
                </div>
              </div>

              {/* 相場メモ */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                <span>宅地相場: <span className="text-gray-300 font-mono">{(simResult.market_price_per_tsubo / 10000).toFixed(0)}万円/坪</span></span>
                <span>中古マンション相場: <span className="text-gray-300 font-mono">{(simResult.condo_market_price_per_tsubo / 10000).toFixed(0)}万円/坪</span></span>
                <span>出口坪単価: <span className="text-blue-300 font-mono">{(simResult.sales_price_per_tsubo / 10000).toFixed(0)}万円/坪</span>（×1.4）</span>
                {simResult.purchase_price_per_tsubo != null && (
                  <span>提示仕入坪単価: <span className="text-yellow-300 font-mono">{(simResult.purchase_price_per_tsubo / 10000).toFixed(0)}万円/坪</span></span>
                )}
              </div>

              {/* チャート */}
              {chartData.length > 0 && (
                <div className="flex-1 min-h-[180px]">
                  <p className="text-xs text-gray-500 mb-2">仕入価格変動による純利益シミュレーション</p>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis dataKey="price" stroke="#52525b" fontSize={10} tickFormatter={v => `${v}万`} />
                      <YAxis stroke="#52525b" fontSize={10} tickFormatter={v => `${v}万`} />
                      <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '損益分岐', fill: '#ef4444', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(v: unknown) => [`${Number(v).toLocaleString()}万円`, '純利益']}
                        labelFormatter={l => `仕入: ${l}万円`}
                      />
                      <Area type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#profitGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              PDFをアップロードするとシミュレーション結果が表示されます
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
