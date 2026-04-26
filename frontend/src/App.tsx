import React, { useState, useRef, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const TSUBO_RATIO = 3.305785;
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const STORAGE_KEY = 'tochihantei_history';

interface SavedRecord {
  id: string;
  savedAt: string;
  address: string;
  parsedData: ParsedData;
  simResult: SimResult;
}

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
  premium_multiplier: number;
  report_data: { expenses: CostDetail[]; revenues: CostDetail[] };
  road_setline_slope: number;
  road_setline_max_height_0m: number;
  road_setline_max_height_5m: number;
  road_setline_note: string;
  posted_land_price_per_sqm: number | null;
  // 天空率・日影規制（オプション：古い履歴との互換性）
  estimated_building_height_m?: number;
  sky_factor_proposed?: number;
  sky_factor_compliant?: number;
  sky_factor_passes?: boolean;
  shadow_max_length_m?: number;
  shadow_is_regulated?: boolean;
  shadow_note?: string;
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
  const [isSimulating, setIsSimulating] = useState(false);
  const [history, setHistory] = useState<SavedRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const saveToHistory = () => {
    if (!parsedData || !simResult) return;
    const record: SavedRecord = {
      id: Date.now().toString(),
      savedAt: new Date().toLocaleString('ja-JP'),
      address: parsedData.address,
      parsedData,
      simResult,
    };
    const next = [record, ...history].slice(0, 20);
    setHistory(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const deleteFromHistory = (id: string) => {
    const next = history.filter(r => r.id !== id);
    setHistory(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const loadFromHistory = (record: SavedRecord) => {
    setParsedData(record.parsedData);
    setSimResult(record.simResult);
    setRoadWidth(String(record.parsedData.road_width_m));
    setShowHistory(false);
  };

  const downloadCsv = () => {
    if (!parsedData || !simResult) return;
    const rows: string[][] = [
      ['項目', '値'],
      ['住所', parsedData.address],
      ['面積（㎡）', String(parsedData.area_sqm)],
      ['用途地域', parsedData.land_use_zone],
      ['容積率（%）', String(parsedData.floor_area_ratio)],
      ['実行容積率（%）', String(simResult.effective_far)],
      ['最大延床（㎡）', String(simResult.max_floor_area_sqm.toFixed(1))],
      ['有効専有（坪）', String(simResult.net_area_tsubo.toFixed(1))],
      ['道路斜線制限（境界線上）', `${simResult.road_setline_max_height_0m}m`],
      ['道路斜線制限（5m後退）', `${simResult.road_setline_max_height_5m}m`],
      ...(simResult.posted_land_price_per_sqm != null ? [['公示地価（万円/㎡）', String(Math.round(simResult.posted_land_price_per_sqm / 10000))]] : []),
      ['宅地相場（万円/坪）', String((simResult.market_price_per_tsubo / 10000).toFixed(0))],
      ['中古マンション相場（万円/坪）', String((simResult.condo_market_price_per_tsubo / 10000).toFixed(0))],
      ['出口坪単価（万円/坪）', String((simResult.sales_price_per_tsubo / 10000).toFixed(0))],
      ['土地出口総額（万円）', String(Math.round(simResult.land_exit_total / 10000))],
      ...simResult.report_data.expenses.map(e => [e.name + '（万円）', String(Math.round(e.amount / 10000))]),
      ...simResult.report_data.revenues.map(r => [r.name + '（万円）', String(Math.round(r.amount / 10000))]),
      ...(simResult.profit_total != null ? [['純利益（万円）', String(Math.round(simResult.profit_total / 10000))], ['利益率（%）', String(simResult.profit_margin?.toFixed(1))]] : []),
      ...(simResult.shadow_note ? [['天空率（計画）', String(((simResult.sky_factor_proposed ?? 0) * 100).toFixed(1) + '%')], ['日影規制', simResult.shadow_note]] : []),
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tochihantei_${parsedData.address.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runSimulation = useCallback(async (parsed: ParsedData, rw: string, pp: string, ac: string) => {
    const payload: Record<string, unknown> = {
      address: parsed.address,
      area_sqm: parsed.area_sqm,
      road_width: parseFloat(rw) || 4.0,
      zoning: parsed.land_use_zone,
      far_limit: parsed.floor_area_ratio,
    };
    const ppNum = parseFloat(pp) * 10000;
    if (pp.trim() && !isNaN(ppNum) && ppNum > 0) payload.purchase_price = ppNum;
    const acNum = parseFloat(ac) * 10000;
    if (ac.trim() && !isNaN(acNum) && acNum > 0) payload.assembly_cost = acNum;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail?.detail ?? res.statusText);
    }
    return (await res.json()) as SimResult;
  }, []);

  const applyParsedData = (parsed: ParsedData) => {
    setParsedData(parsed);
    if (parsed.road_width_m && parsed.road_width_m > 0) setRoadWidth(String(parsed.road_width_m));
    if ((parsed as any).purchase_price_hint && (parsed as any).purchase_price_hint > 0) {
      setPurchasePriceInput(String(Math.round((parsed as any).purchase_price_hint / 10000)));
    }
  };

  const parseTextLocally = (text: string): Partial<ParsedData> => {
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
    const addressMatch =
      t.match(/(?:所在地|住所|物件住所)[:\s]+([東京都].+?)[\n\r]/) ||
      t.match(/(東京都[\u4e00-\u9fa5\w\d\-ー]+[丁目番地号\-\d]+)/);
    const address = addressMatch ? addressMatch[1].trim() : '';
    let area_sqm = findFloat([/([0-9,\.]+)\s*㎡/]);
    if (!area_sqm) {
      const tsubo = findFloat([/([0-9,\.]+)\s*坪/]);
      if (tsubo) area_sqm = Math.round(tsubo * 3.305785 * 100) / 100;
    }
    const ZONE_MAP: Record<string, string> = {
      '第一種低層住居専用地域': '第一種低層住居専用地域', '第二種低層住居専用地域': '第二種低層住居専用地域',
      '第一種中高層住居専用地域': '第一種中高層住居専用地域', '第二種中高層住居専用地域': '第二種中高層住居専用地域',
      '第一種住居地域': '第一種住居地域', '第二種住居地域': '第二種住居地域',
      '準住居地域': '準住居地域', '近隣商業地域': '近隣商業地域', '近隣商業': '近隣商業地域',
      '商業地域': '商業地域', '準工業地域': '準工業地域', '準工業': '準工業地域',
      '工業地域': '工業地域', '工業専用地域': '工業専用地域', '田園住居地域': '田園住居地域',
    };
    const land_use_zone = Object.entries(ZONE_MAP).reduce((found, [key, val]) =>
      found || (t.includes(key) ? val : ''), '');
    let floor_area_ratio = findFloat([/容積率\s*:?\s*([0-9]+)/, /容積\s*([0-9]+)/]);
    let coverage_ratio   = findFloat([/建蔽率\s*:?\s*([0-9]+)/, /建蔽\s*([0-9]+)/]);
    if (!floor_area_ratio) {
      const allPct = [...t.matchAll(/([0-9]+)\s*%/g)].map(m => parseFloat(m[1])).sort((a, b) => a - b);
      if (allPct.length >= 2) { coverage_ratio = allPct[0]; floor_area_ratio = allPct[allPct.length - 1]; }
      else if (allPct.length === 1) floor_area_ratio = allPct[0];
    }
    const road_width_m = findFloat([/幅員\s*([0-9\.]+)\s*m/, /道路幅員\s*:?\s*([0-9\.]+)/, /([0-9\.]+)\s*m.*?道路/]);
    let purchase_price_hint = 0;
    const oku = t.match(/(?:目線|売価|価格|希望)[:\s]*([0-9\.]+)\s*億/);
    const man = t.match(/(?:目線|売価|価格|希望)[:\s]*([0-9,]+)\s*万/);
    if (oku) purchase_price_hint = parseFloat(oku[1]) * 1_0000_0000;
    else if (man) purchase_price_hint = parseFloat(man[1].replace(/,/g, '')) * 10000;
    return { address, area_sqm, land_use_zone, coverage_ratio, floor_area_ratio, road_width_m, purchase_price_hint } as any;
  };

  const handleParseText = async () => {
    if (!mailText.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${BASE_URL}/api/parse-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: mailText }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const parsed: ParsedData = (await res.json()).data;
      applyParsedData(parsed);
    } catch (err) {
      console.warn('バックエンド解析失敗、ローカル解析を使用:', err);
      const extracted = parseTextLocally(mailText);
      applyParsedData({
        address: extracted.address ?? '', area_sqm: extracted.area_sqm ?? 0,
        land_use_zone: extracted.land_use_zone ?? '', coverage_ratio: (extracted as any).coverage_ratio ?? 0,
        floor_area_ratio: extracted.floor_area_ratio ?? 0, road_width_m: (extracted as any).road_width_m ?? 0,
        is_leasehold: false, leasehold_ratio: 100, road_type: '', setback_area_estimated: 0,
        market_price_per_tsubo: 0, purchase_price_hint: (extracted as any).purchase_price_hint ?? 0,
      } as any);
    } finally {
      setIsAnalyzing(false);
    }
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
      const rw = (parsed as any).road_width_m > 0 ? String((parsed as any).road_width_m) : roadWidth;
      const result = await runSimulation(parsed, rw, purchasePriceInput, assemblyCostInput);
      setSimResult(result);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error(err);
      alert('エラーが発生しました。サーバーが起動しているか確認してください。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSimulate = async () => {
    if (!parsedData) return;
    setIsSimulating(true);
    try {
      const result = await runSimulation(parsedData, roadWidth, purchasePriceInput, assemblyCostInput);
      setSimResult(result);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('abort') || msg.includes('timeout');
      alert(isTimeout
        ? `サーバーが起動中です。\n\n初回アクセス時は60〜90秒かかる場合があります。\nしばらく待ってから再度「シミュレーション実行」を押してください。`
        : `シミュレーションに失敗しました。\n\n詳細: ${msg}`);
    } finally {
      setIsSimulating(false);
    }
  };

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
      points.push({ price: Math.round(p / 10000), profit: Math.round(profit / 10000) });
    }
    return points;
  })();

  const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

  return (
    <div className="min-h-screen bg-[#F5F7FA]" style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', sans-serif" }}>

      {/* ヘッダー */}
      <header className="bg-white border-b border-[#E5E7EB] px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <span className="text-sm font-medium text-[#111827]">土地購入シミュレーター</span>
        <div className="flex items-center gap-2">
          {simResult && (
            <span className="text-xs bg-[#DCFCE7] text-[#15803D] px-3 py-1 rounded-full font-medium">✓ 試算完了</span>
          )}
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-xs px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:border-gray-400 transition-colors"
          >
            履歴{history.length > 0 && ` (${history.length})`}
          </button>
          {simResult && (
            <>
              <button onClick={saveToHistory} className="text-xs px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:border-gray-400 transition-colors">保存</button>
              <button onClick={downloadCsv} className="text-xs px-3 py-1.5 border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:border-gray-400 transition-colors">CSV</button>
            </>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* 履歴パネル */}
        {showHistory && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
            <p className="text-xs font-medium text-[#374151] mb-3">保存済み試算</p>
            {history.length === 0 ? (
              <p className="text-xs text-[#9CA3AF] text-center py-4">保存済みデータなし</p>
            ) : (
              <ul className="space-y-0">
                {history.map(rec => (
                  <li key={rec.id} className="flex items-center justify-between gap-2 text-xs py-2.5 border-b border-[#F9FAFB] last:border-0">
                    <button onClick={() => loadFromHistory(rec)} className="text-left flex-1 hover:text-[#2563EB] transition-colors">
                      <span className="text-[#374151]">{rec.address}</span>
                      <span className="text-[#9CA3AF] ml-2">{rec.savedAt}</span>
                    </button>
                    <button onClick={() => deleteFromHistory(rec.id)} className="text-[#9CA3AF] hover:text-red-500 px-1">✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ===== 入力エリア ===== */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* 左: AI入力 */}
            <div className="space-y-5">
              {/* メール解析 */}
              <div>
                <label className="text-xs font-medium text-[#6B7280] mb-2 block">
                  ① メール・テキストから読み込む
                  <span className="font-normal text-[#9CA3AF] ml-1">（住所・面積・価格を自動抽出）</span>
                </label>
                <textarea
                  value={mailText}
                  onChange={e => setMailText(e.target.value)}
                  placeholder={'メール本文や物件概要をここに貼り付け...\n\n例：\n住所: 東京都豊島区池袋3丁目38-3\n面積: 312.63㎡\n用途地域: 近隣商業 容積率300%\n道路幅員: 4.5m\n目線: 1億円'}
                  className="w-full border border-[#E5E7EB] rounded-lg px-4 py-3 text-sm text-[#374151] placeholder-[#D1D5DB] focus:outline-none focus:border-[#2563EB] resize-none"
                  rows={6}
                />
                <button
                  onClick={handleParseText}
                  disabled={!mailText.trim() || isAnalyzing}
                  className="mt-2 w-full border border-[#E5E7EB] rounded-lg py-2 text-sm text-[#6B7280] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                >
                  {isAnalyzing
                    ? <><div className="w-3.5 h-3.5 border-2 border-[#6B7280] border-t-transparent rounded-full animate-spin" />AI解析中...</>
                    : '📧 AI解析して反映'
                  }
                </button>
              </div>

              {/* PDF */}
              <div>
                <label className="text-xs font-medium text-[#6B7280] mb-2 block">
                  ② 物件概要書（PDF）で詳細化
                  <span className="font-normal text-[#9CA3AF] ml-1">任意・①の内容を上書き精緻化</span>
                </label>
                <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center p-6 cursor-pointer transition-colors
                    ${isAnalyzing ? 'border-[#2563EB] bg-blue-50' : 'border-[#E5E7EB] hover:border-[#2563EB] hover:bg-[#F9FAFB]'}`}
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-6 h-6 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin mb-2" />
                      <p className="text-sm text-[#2563EB]">AI解析中...</p>
                    </>
                  ) : selectedFile ? (
                    <>
                      <p className="text-sm font-medium text-[#374151]">✓ {selectedFile.name}</p>
                      <p className="text-xs text-[#9CA3AF] mt-1">クリックして変更</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[#6B7280] mb-2">📄 PDFをドラッグ＆ドロップ</p>
                      <span className="text-xs text-[#2563EB] border border-[#2563EB] px-3 py-1 rounded-md">ファイルを選択</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 右: 抽出データ + 条件 */}
            <div className="space-y-5">
              {/* AI抽出データ */}
              {parsedData ? (
                <div>
                  <label className="text-xs font-medium text-[#6B7280] mb-2 block">📂 AI自動抽出データ</label>
                  <div className="border border-[#E5E7EB] rounded-lg divide-y divide-[#F9FAFB]">
                    {[
                      { label: '所在地', value: parsedData.address || '－' },
                      { label: '面積', value: `${parsedData.area_sqm} ㎡（${(parsedData.area_sqm / TSUBO_RATIO).toFixed(1)}坪）` },
                      { label: '用途地域', value: parsedData.land_use_zone || '－' },
                      { label: '容積率 / 建蔽率', value: `${parsedData.floor_area_ratio}%${parsedData.coverage_ratio > 0 ? ` / ${parsedData.coverage_ratio}%` : ''}` },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between items-center px-3 py-2.5">
                        <span className="text-xs text-[#6B7280]">{row.label}</span>
                        <span className="text-xs font-medium text-[#111827] text-right max-w-[55%]">{row.value}</span>
                      </div>
                    ))}
                    {parsedData.setback_area_estimated > 0 && (
                      <div className="flex justify-between items-center px-3 py-2.5 bg-orange-50">
                        <span className="text-xs text-orange-500">⚠ セットバック</span>
                        <span className="text-xs font-medium text-orange-600">{parsedData.setback_area_estimated} ㎡</span>
                      </div>
                    )}
                    {parsedData.is_leasehold && (
                      <div className="flex justify-between items-center px-3 py-2.5 bg-red-50">
                        <span className="text-xs text-red-500">⚠ 借地権</span>
                        <span className="text-xs font-medium text-red-600">評価割合 {parsedData.leasehold_ratio}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-[#E5E7EB] rounded-xl p-6 flex items-center justify-center min-h-[100px]">
                  <p className="text-sm text-[#9CA3AF] text-center">①または②から物件情報を読み込むと<br />ここに自動抽出データが表示されます</p>
                </div>
              )}

              {/* 計算条件 */}
              <div>
                <label className="text-xs font-medium text-[#6B7280] mb-3 block">⚙ 計算条件</label>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#9CA3AF] mb-1 block">前面道路幅員（m）</label>
                    <input
                      type="number" step="0.5" min="0"
                      value={roadWidth}
                      onChange={e => setRoadWidth(e.target.value)}
                      className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-base text-[#111827] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#9CA3AF] mb-1 block">仕入価格 <span className="text-[#D1D5DB]">（万円・任意）</span></label>
                      <input
                        type="text" placeholder="例: 17000"
                        value={purchasePriceInput}
                        onChange={e => setPurchasePriceInput(e.target.value)}
                        className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-base text-[#111827] focus:outline-none focus:border-[#2563EB] placeholder-[#D1D5DB]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#9CA3AF] mb-1 block">地上げ費 <span className="text-[#D1D5DB]">（万円・任意）</span></label>
                      <input
                        type="text" placeholder="例: 60000"
                        value={assemblyCostInput}
                        onChange={e => setAssemblyCostInput(e.target.value)}
                        className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-base text-[#111827] focus:outline-none focus:border-[#2563EB] placeholder-[#D1D5DB]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* シミュレーション実行ボタン */}
          <div className="mt-6 pt-5 border-t border-[#F3F4F6]">
            <button
              onClick={handleSimulate}
              disabled={!parsedData || isSimulating}
              className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] text-white py-4 rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isSimulating
                ? <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />計算中...</>
                : 'シミュレーション実行'
              }
            </button>
          </div>
        </div>

        {/* ===== 結果エリア ===== */}
        {simResult && (
          <div ref={resultRef} className="space-y-4">

            {/* HERO */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <p className="text-xs text-[#6B7280] mb-2 tracking-widest">想 定 出 口 総 額</p>
              <div>
                <span className="text-[42px] font-medium text-[#111827] leading-none" style={{ letterSpacing: '-0.02em' }}>
                  {fmt((simResult.report_data.revenues[0]?.amount ?? 0) / 10000)}
                </span>
                <span className="text-base text-[#9CA3AF] ml-1 font-normal">万円</span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-2">
                専有{simResult.net_area_tsubo.toFixed(0)}坪 × 出口坪単価{(simResult.sales_price_per_tsubo / 10000).toFixed(0)}万円ベース
                （×{simResult.premium_multiplier.toFixed(1)}・エリア推定）
              </p>
              {simResult.profit_margin !== null && (
                <span className={`inline-block mt-3 text-xs px-4 py-1.5 rounded-full font-medium ${
                  simResult.profit_margin >= 25 ? 'bg-[#DCFCE7] text-[#15803D]'
                  : simResult.profit_margin >= 10 ? 'bg-[#FEF9C3] text-[#92400E]'
                  : 'bg-[#FEE2E2] text-[#991B1B]'
                }`}>
                  利益率 想定 {simResult.profit_margin.toFixed(1)}%
                </span>
              )}
            </div>

            {/* セカンダリ 3カード */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '実行容積率', value: simResult.effective_far, unit: '%', color: '#2563EB', pct: Math.min(100, simResult.effective_far / 5) },
                { label: '最大延床', value: (simResult.max_floor_area_sqm / TSUBO_RATIO).toFixed(0), unit: '坪', color: '#7C3AED', pct: 60 },
                { label: '有効専有', value: simResult.net_area_tsubo.toFixed(0), unit: '坪', color: '#0891B2', pct: 82 },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                  <p className="text-xs text-[#6B7280] mb-2">{card.label}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[22px] font-medium text-[#111827]">{card.value}</span>
                    <span className="text-xs text-[#9CA3AF]">{card.unit}</span>
                  </div>
                  <div className="h-1 bg-[#F3F4F6] rounded-full mt-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${card.pct}%`, backgroundColor: card.color }} />
                  </div>
                </div>
              ))}
            </div>

            {/* 収支テーブル */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
              <p className="text-xs font-medium text-[#374151] mb-4 pb-3 border-b border-[#F3F4F6]">収益内訳</p>
              <div>
                {simResult.report_data.expenses.map((e, i) => (
                  <div key={i} className="flex justify-between items-center py-3 border-b border-[#F9FAFB]">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#D1D5DB] flex-shrink-0" />
                      <div>
                        <span className="text-sm text-[#6B7280]">{e.name}</span>
                        {e.note && <p className="text-xs text-[#D1D5DB]">{e.note}</p>}
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1 flex-shrink-0">
                      <span className="text-sm font-medium text-[#111827]">
                        {e.amount > 0 ? fmt(e.amount / 10000) : '－'}
                      </span>
                      {e.amount > 0 && <span className="text-xs text-[#9CA3AF]">万円</span>}
                    </div>
                  </div>
                ))}
                {simResult.report_data.revenues.map((rv, i) => (
                  <div key={i} className="flex justify-between items-center py-3 border-b border-[#F9FAFB]">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] flex-shrink-0" />
                      <span className="text-sm text-[#6B7280]">{rv.name}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-medium text-[#111827]">{fmt(rv.amount / 10000)}</span>
                      <span className="text-xs text-[#9CA3AF]">万円</span>
                    </div>
                  </div>
                ))}
                {simResult.profit_total !== null && (
                  <div className="flex justify-between items-center mt-3 p-3 bg-[#F0FDF4] rounded-lg">
                    <span className="text-sm font-medium text-[#15803D]">★ 想定利益</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-medium text-[#15803D]">{fmt(simResult.profit_total / 10000)}</span>
                      <span className="text-xs text-[#9CA3AF]">万円</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* コスト構成比 + 相場情報 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* コスト構成比バー */}
              {(() => {
                const exp = simResult.report_data.expenses;
                const total = exp.reduce((s, e) => s + e.amount, 0);
                if (total <= 0) return null;
                const purchase = (exp.find(e => e.name.includes('仕入'))?.amount ?? 0) + (exp.find(e => e.name.includes('地上げ'))?.amount ?? 0);
                const construction = exp.find(e => e.name.includes('建築'))?.amount ?? 0;
                const misc = total - purchase - construction;
                const pL = Math.round((purchase / total) * 100);
                const pC = Math.round((construction / total) * 100);
                const pM = 100 - pL - pC;
                return (
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
                    <p className="text-xs font-medium text-[#374151] mb-4">コスト構成比</p>
                    <div className="h-6 rounded-lg overflow-hidden flex mb-4">
                      {pL > 0 && <div className="h-full flex items-center justify-center text-xs text-white font-medium" style={{ width: `${pL}%`, background: '#6B7280' }}>{pL > 10 ? `${pL}%` : ''}</div>}
                      {pC > 0 && <div className="h-full flex items-center justify-center text-xs text-white font-medium" style={{ width: `${pC}%`, background: '#2563EB' }}>{pC > 10 ? `${pC}%` : ''}</div>}
                      {pM > 0 && <div className="h-full flex items-center justify-center text-xs text-white font-medium" style={{ width: `${pM}%`, background: '#F59E0B' }}>{pM > 10 ? `${pM}%` : ''}</div>}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {([['#6B7280', '仕入・地上げ'], ['#2563EB', '建築費'], ['#F59E0B', '諸経費']] as [string, string][]).map(([color, label]) => (
                        <div key={label} className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 相場情報 */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
                <p className="text-xs font-medium text-[#374151] mb-4">相場・市場データ</p>
                <div className="space-y-2.5">
                  {simResult.posted_land_price_per_sqm != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">公示地価</span>
                      <span className="font-medium text-[#111827]">{fmt(simResult.posted_land_price_per_sqm * 3.305785 / 10000)}万円/坪</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7280]">宅地相場</span>
                    <span className="font-medium text-[#111827]">{(simResult.market_price_per_tsubo / 10000).toFixed(0)}万円/坪</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7280]">中古マンション相場</span>
                    <span className="font-medium text-[#111827]">{(simResult.condo_market_price_per_tsubo / 10000).toFixed(0)}万円/坪</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7280]">出口坪単価（想定）</span>
                    <span className="font-medium text-[#2563EB]">{(simResult.sales_price_per_tsubo / 10000).toFixed(0)}万円/坪</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7280]">土地出口（更地売却）</span>
                    <span className="font-medium text-[#111827]">{fmt(simResult.land_exit_total / 10000)}万円</span>
                  </div>
                  {simResult.purchase_price_per_tsubo != null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">提示仕入坪単価</span>
                      <span className="font-medium text-[#F59E0B]">{(simResult.purchase_price_per_tsubo / 10000).toFixed(0)}万円/坪</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 法規制チェック */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <p className="text-xs font-medium text-[#374151] mb-4">法規制チェック（簡易試算）</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 道路斜線 */}
                <div className="p-3 bg-[#F9FAFB] rounded-lg">
                  <p className="text-xs font-medium text-[#374151] mb-2">道路斜線制限</p>
                  <p className="text-xs text-[#9CA3AF] mb-3">{simResult.road_setline_note}</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">境界線上</span>
                      <span className="font-medium text-[#111827]">{simResult.road_setline_max_height_0m}m</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#6B7280]">5m後退</span>
                      <span className="font-medium text-[#111827]">{simResult.road_setline_max_height_5m}m</span>
                    </div>
                  </div>
                </div>

                {/* 天空率 */}
                <div className="p-3 bg-[#F9FAFB] rounded-lg">
                  <p className="text-xs font-medium text-[#374151] mb-2">天空率（簡易）</p>
                  {simResult.sky_factor_proposed != null ? (
                    <>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-3 ${
                        simResult.sky_factor_passes ? 'bg-[#DCFCE7] text-[#15803D]' : 'bg-[#FEE2E2] text-[#991B1B]'
                      }`}>
                        {simResult.sky_factor_passes ? '✓ クリア見込み' : '✗ 要確認'}
                      </span>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#6B7280]">計画建物</span>
                          <span className="font-medium text-[#111827]">{((simResult.sky_factor_proposed) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[#6B7280]">適合建築物</span>
                          <span className="font-medium text-[#111827]">{((simResult.sky_factor_compliant ?? 0) * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </>
                  ) : <p className="text-xs text-[#9CA3AF]">データなし</p>}
                </div>

                {/* 日影規制 */}
                <div className="p-3 bg-[#F9FAFB] rounded-lg">
                  <p className="text-xs font-medium text-[#374151] mb-2">日影規制（簡易）</p>
                  {simResult.shadow_note ? (
                    <>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-3 ${
                        simResult.shadow_is_regulated ? 'bg-[#FEF9C3] text-[#92400E]' : 'bg-[#DCFCE7] text-[#15803D]'
                      }`}>
                        {simResult.shadow_is_regulated ? '⚠ 規制対象' : '✓ 対象外'}
                      </span>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#6B7280]">推定高さ</span>
                          <span className="font-medium text-[#111827]">{simResult.estimated_building_height_m}m</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[#6B7280]">冬至最大影長</span>
                          <span className="font-medium text-[#111827]">{simResult.shadow_max_length_m}m</span>
                        </div>
                      </div>
                    </>
                  ) : <p className="text-xs text-[#9CA3AF]">データなし</p>}
                </div>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-3 pt-3 border-t border-[#F3F4F6]">
                ※ 天空率・日影規制はすべて簡易試算です。正式判定は設計士にご確認ください。
                <br />{simResult.far_calc_basis}
              </p>
            </div>

            {/* 総合判定 */}
            {simResult.profit_margin !== null && (
              <div className={`rounded-xl border p-5 ${
                simResult.profit_margin >= 25 ? 'bg-[#F0FDF4] border-[#BBF7D0]'
                : simResult.profit_margin >= 10 ? 'bg-[#FFFBEB] border-[#FDE68A]'
                : 'bg-[#FEF2F2] border-[#FECACA]'
              }`}>
                <p className={`text-sm font-medium mb-1 ${
                  simResult.profit_margin >= 25 ? 'text-[#15803D]'
                  : simResult.profit_margin >= 10 ? 'text-[#92400E]'
                  : 'text-[#991B1B]'
                }`}>
                  {simResult.profit_margin >= 25 ? '✓ 収益性：良好'
                    : simResult.profit_margin >= 10 ? '⚠ 収益性：要検討'
                    : '✗ 収益性：要注意'}
                </p>
                <p className={`text-xs leading-relaxed ${
                  simResult.profit_margin >= 25 ? 'text-[#166534]'
                  : simResult.profit_margin >= 10 ? 'text-[#78350F]'
                  : 'text-[#7F1D1D]'
                }`}>
                  {simResult.profit_margin >= 25
                    ? `利益率${simResult.profit_margin.toFixed(1)}%。採算ラインを超えており、仕入れ交渉の余地があります。`
                    : simResult.profit_margin >= 10
                    ? `利益率${simResult.profit_margin.toFixed(1)}%。採算ライン（25%）には届いていません。仕入価格の再交渉または建築コストの見直しを検討してください。`
                    : `利益率${simResult.profit_margin.toFixed(1)}%。採算割れリスクがあります。仕入価格・条件の大幅な見直しが必要です。`
                  }
                </p>
              </div>
            )}

            {/* 仕入価格変動チャート */}
            {chartData.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
                <p className="text-xs font-medium text-[#374151] mb-4">仕入価格変動による純利益シミュレーション</p>
                <div style={{ height: '200px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="price" stroke="#D1D5DB" fontSize={10} tickFormatter={v => `${v}万`} />
                      <YAxis stroke="#D1D5DB" fontSize={10} tickFormatter={v => `${v}万`} />
                      <ReferenceLine y={0} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '損益分岐', fill: '#EF4444', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', borderColor: '#E5E7EB', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(v: unknown) => [`${Number(v).toLocaleString()}万円`, '純利益']}
                        labelFormatter={l => `仕入: ${l}万円`}
                      />
                      <Area type="monotone" dataKey="profit" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#profitGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
