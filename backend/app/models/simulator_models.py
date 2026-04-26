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
    # 道路斜線制限（概算）
    road_setline_slope: float = 1.25
    road_setline_max_height_0m: float = 0.0
    road_setline_max_height_5m: float = 0.0
    road_setline_note: str = ""
    # 公示地価
    posted_land_price_per_sqm: Optional[float] = None
    # 天空率・日影規制（簡易試算）
    estimated_building_height_m: float = 0.0
    sky_factor_proposed: float = 0.0
    sky_factor_compliant: float = 0.0
    sky_factor_passes: bool = True
    shadow_max_length_m: float = 0.0
    shadow_is_regulated: bool = False
    shadow_note: str = ""
