from pydantic import BaseModel
from typing import Optional, List, Dict

class SimulatorRequest(BaseModel):
    address: str
    area_sqm: float
    road_width: float
    zoning: str
    far_limit: float

class CostDetail(BaseModel):
    name: str
    amount: float
    note: str

class SimulatorResponse(BaseModel):
    effective_far: float
    far_calc_basis: str
    market_price_per_tsubo: float
    land_value_total: float
    land_value_per_tsubo: float
    max_floor_area_sqm: float
    net_area_sqm: float
    net_area_tsubo: float
    report_data: Dict[str, List[CostDetail]]
    report_text: Optional[str] = ""
