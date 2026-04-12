from pydantic import BaseModel
from typing import Optional, List, Dict

class SimulatorRequest(BaseModel):
    address: str
    area_sqm: float
    road_width: float
    zoning: str
    far_limit: float
    purchase_price: Optional[float] = None  # デベロッパー提示の仕入価格（円）。未提示なら空欄

class CostDetail(BaseModel):
    name: str
    amount: float
    note: str

class SimulatorResponse(BaseModel):
    effective_far: float
    far_calc_basis: str
    market_price_per_tsubo: float
    purchase_price: Optional[float] = None       # デベロッパー提示額（未提示ならNone）
    purchase_price_per_tsubo: Optional[float] = None
    profit_total: Optional[float] = None         # 純利益（仕入提示がある場合のみ算出）
    profit_margin: Optional[float] = None        # 利益率
    max_floor_area_sqm: float
    net_area_sqm: float
    net_area_tsubo: float
    report_data: Dict[str, List[CostDetail]]
    report_text: Optional[str] = ""
