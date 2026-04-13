from pydantic import BaseModel
from typing import Optional, List, Dict

class SimulatorRequest(BaseModel):
    address: str
    area_sqm: float
    road_width: float
    zoning: str
    far_limit: float
    purchase_price: Optional[float] = None    # デベロッパー提示の仕入価格（円）。未提示なら空欄
    assembly_cost: Optional[float] = None    # 地上げ費（円）。未提示なら空欄

class CostDetail(BaseModel):
    name: str
    amount: float
    note: str

class SimulatorResponse(BaseModel):
    effective_far: float
    far_calc_basis: str
    market_price_per_tsubo: float              # 宅地相場（参考値）
    condo_market_price_per_tsubo: float        # 中古マンション相場
    sales_price_per_tsubo: float               # 想定出口坪単価（中古マンション×1.4）
    land_exit_total: float                     # 土地出口総額（宅地相場×土地坪数）
    purchase_price: Optional[float] = None
    purchase_price_per_tsubo: Optional[float] = None
    profit_total: Optional[float] = None
    profit_margin: Optional[float] = None
    max_floor_area_sqm: float
    net_area_sqm: float
    net_area_tsubo: float
    premium_multiplier: float = 1.4
    report_data: Dict[str, List[CostDetail]]
    report_text: Optional[str] = ""
