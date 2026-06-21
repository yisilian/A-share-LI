from __future__ import annotations

import json
import math
import subprocess
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
LATEST_PATH = DATA_DIR / "latest.json"
REVIEW_PATH = DATA_DIR / "review.json"
UNIVERSE_PATH = DATA_DIR / "universe_scan.json"
HISTORY_DIR = DATA_DIR / "history"
CN_TZ = timezone(timedelta(hours=8))
FINAL_POOL_SIZE = 10
DEEP_ANALYSIS_LIMIT = 28
UNIVERSE_EXPORT_LIMIT = 120
MAINBOARD_PREFIXES = ("000", "001", "002", "003", "600", "601", "603", "605")


@dataclass(frozen=True)
class Candidate:
    code: str
    name: str
    theme: str
    logic: str
    base_score: float
    catalysts: list[str]
    risks: list[str]


CANDIDATES = [
    Candidate("601138", "工业富联", "AI服务器/算力基础设施", "AI算力扩张带动服务器制造与系统集成需求，属于产业链中可验证订单和交付进度的关键环节。", 6.4, ["AI服务器订单", "大客户资本开支", "业绩兑现"], ["估值消化", "客户集中", "短线涨幅后波动"]),
    Candidate("002371", "北方华创", "半导体设备", "国产半导体设备替代与先进制程资本开支相关，属于供给受限、验证周期长的关键环节。", 6.4, ["国产替代", "晶圆厂扩产", "设备订单"], ["估值高", "扩产节奏变化", "技术验证不确定"]),
    Candidate("000988", "华工科技", "光模块/激光设备", "同时受益于光通信升级和制造设备需求，关注光模块放量与激光装备景气度共振。", 6.4, ["光模块需求", "激光设备订单", "业绩兑现"], ["板块拥挤", "订单波动", "竞争加剧"]),
    Candidate("002463", "沪电股份", "AI PCB", "AI服务器高速PCB需求提升，关注高端产能、良率和客户认证。", 6.0, ["AI服务器PCB", "高端产能释放", "客户认证"], ["60日涨幅偏高", "波动放大", "景气预期过满"]),
    Candidate("002409", "雅克科技", "电子材料", "电子材料位于半导体上游关键耗材环节，关注国产替代、客户认证和产能释放。", 5.5, ["国产替代", "材料认证", "先进制程需求"], ["60日涨幅偏高", "估值消化", "客户验证周期长"]),
    Candidate("002916", "深南电路", "PCB/封装基板", "高端PCB和封装基板受益于AI服务器与先进封装，关注产能利用率和高端产品占比。", 5.4, ["AI服务器PCB", "封装基板", "产能释放"], ["60日涨幅偏高", "波动偏高", "预期拥挤"]),
    Candidate("002156", "通富微电", "先进封装", "先进封装是AI芯片扩产和国产替代的关键环节，弹性较高但周期波动也大。", 5.1, ["先进封装需求", "国产替代", "客户订单"], ["换手偏高", "周期反复", "盈利弹性不稳定"]),
    Candidate("002185", "华天科技", "封测", "封测环节受益于半导体景气修复和先进封装渗透，需关注盈利改善质量。", 5.1, ["封测复苏", "先进封装", "国产替代"], ["换手偏高", "盈利修复不确定", "周期反复"]),
    Candidate("603228", "景旺电子", "PCB", "PCB需求受AI硬件和汽车电子拉动，关注高端产能和客户结构升级。", 5.0, ["高端PCB", "汽车电子", "客户结构升级"], ["需求兑现慢", "价格竞争", "板块波动"]),
    Candidate("600584", "长电科技", "先进封装", "全球封测龙头之一，先进封装和行业复苏是主要观察点。", 4.5, ["先进封装", "行业复苏", "大客户订单"], ["60日涨幅偏高", "换手偏高", "盈利修复节奏"]),
]


BROAD_CANDIDATES = [
    Candidate("002050", "三花智控", "机器人/热管理", "机器人执行器与新能源热管理属于高端制造关键部件，关注客户验证、产能和订单兑现。", 5.6, ["机器人执行器", "新能源热管理", "海外客户订单"], ["估值消化", "客户集中", "海外需求波动"]),
    Candidate("002747", "埃斯顿", "工业机器人", "国产工业机器人本体和自动化系统受益于制造业升级，关注订单质量和盈利改善。", 5.1, ["机器人国产替代", "制造业自动化", "订单修复"], ["盈利波动", "竞争加剧", "需求恢复慢"]),
    Candidate("002472", "双环传动", "机器人/精密传动", "精密传动是机器人和汽车智能化的重要零部件，关注高端客户导入和产能利用率。", 5.2, ["机器人减速器", "汽车齿轮", "客户导入"], ["价格竞争", "订单节奏", "估值波动"]),
    Candidate("603728", "鸣志电器", "机器人/控制电机", "控制电机和运动控制系统处于机器人执行链条，关注人形机器人与工业自动化需求验证。", 5.0, ["运动控制", "机器人执行器", "海外订单"], ["题材波动", "验证周期长", "竞争加剧"]),
    Candidate("600406", "国电南瑞", "电网自动化/电力IT", "新型电力系统建设推动调度、继保和电网自动化投资，属于订单可跟踪的基础设施环节。", 5.8, ["电网投资", "新型电力系统", "特高压配套"], ["投资节奏", "估值消化", "订单确认周期"]),
    Candidate("002028", "思源电气", "输变电设备", "电网投资和海外输变电需求带动一次/二次设备，关注订单、交付和毛利率。", 5.5, ["电网建设", "海外输变电", "订单兑现"], ["原材料波动", "海外交付", "估值消化"]),
    Candidate("601179", "中国西电", "特高压/电力设备", "特高压与主网建设推动高压开关和变压器需求，关注招标节奏和产能释放。", 5.2, ["特高压招标", "主网投资", "设备更新"], ["招标波动", "订单兑现慢", "短线情绪波动"]),
    Candidate("600312", "平高电气", "特高压开关", "高压开关设备是特高压建设关键环节，关注订单兑现和盈利弹性。", 5.2, ["特高压建设", "电网设备", "国企改革"], ["订单周期", "毛利率波动", "主题拥挤"]),
    Candidate("603606", "东方电缆", "海缆/海风", "海上风电海缆技术壁垒较高，关注海风项目核准、招标和交付节奏。", 5.0, ["海风招标", "海缆交付", "海外订单"], ["海风装机延迟", "价格竞争", "项目审批"]),
    Candidate("600089", "特变电工", "变压器/硅料/电力设备", "变压器出海和电网投资提供支撑，同时需跟踪硅料周期拖累。", 5.0, ["变压器出海", "电网投资", "能源建设"], ["硅料周期", "多业务估值折价", "原材料波动"]),
    Candidate("600875", "东方电气", "能源装备/燃机", "能源安全和设备更新推动发电装备需求，关注燃机、核电、风电订单。", 5.0, ["能源装备", "设备更新", "核电燃机订单"], ["订单确认慢", "毛利率波动", "周期属性"]),
    Candidate("601727", "上海电气", "能源装备/工业设备", "能源装备和工业设备更新带来订单修复弹性，关注资产质量和盈利改善。", 4.8, ["设备更新", "能源装备", "国企改革"], ["资产减值", "盈利修复慢", "业务复杂"]),
    Candidate("601899", "紫金矿业", "铜/黄金资源", "铜金资源兼具全球供给约束和通胀/利率敏感属性，关注金属价格和产量释放。", 5.7, ["铜价", "金价", "矿山产量"], ["商品价格波动", "海外运营", "汇率风险"]),
    Candidate("600547", "山东黄金", "黄金", "黄金价格受实际利率、避险和央行购金影响，关注金价趋势和矿山成本。", 5.2, ["金价上行", "避险需求", "矿山增产"], ["金价回调", "成本上升", "并购整合"]),
    Candidate("600489", "中金黄金", "黄金/央企资源", "央企黄金平台受益于金价和资源整合预期，关注产量、成本和金价。", 5.0, ["金价", "资源整合", "央企改革"], ["金价波动", "成本压力", "主题兑现慢"]),
    Candidate("601600", "中国铝业", "铝/资源", "铝价和氧化铝供需影响盈利，关注供给约束、电力成本和需求修复。", 4.9, ["铝价", "供给约束", "资源品景气"], ["商品周期", "电力成本", "需求波动"]),
    Candidate("000630", "铜陵有色", "铜/有色金属", "铜资源和冶炼加工受益于铜价和新能源需求，关注库存、TC和价格趋势。", 4.9, ["铜价", "新能源需求", "库存变化"], ["铜价回调", "加工费波动", "周期属性"]),
    Candidate("000960", "锡业股份", "锡/小金属", "锡受半导体焊料与供给约束影响，关注库存、价格和矿端扰动。", 4.9, ["锡价", "供给扰动", "半导体需求"], ["价格波动", "需求反复", "资源政策"]),
    Candidate("600111", "北方稀土", "稀土磁材上游", "稀土供给配额和新能源/机器人需求影响价格，关注价格拐点和库存。", 4.8, ["稀土价格", "机器人磁材", "新能源车"], ["价格下行", "政策扰动", "需求不及预期"]),
    Candidate("000831", "中国稀土", "稀土资源", "稀土资源整合与价格周期是主要变量，关注供给政策和下游磁材需求。", 4.8, ["资源整合", "稀土价格", "政策催化"], ["价格波动", "主题交易", "盈利弹性不稳定"]),
    Candidate("600276", "恒瑞医药", "创新药", "创新药出海和管线兑现是长期重估核心，关注临床进展、授权交易和销售恢复。", 5.3, ["创新药出海", "管线进展", "医保压力缓和"], ["研发失败", "集采降价", "估值消化"]),
    Candidate("000538", "云南白药", "中药/消费医疗", "品牌中药和消费医疗具备现金流属性，关注改革、渠道和利润率改善。", 4.8, ["国企改革", "消费医疗", "分红回报"], ["增长偏慢", "渠道压力", "估值弹性有限"]),
    Candidate("600085", "同仁堂", "中药品牌", "老字号中药品牌具备稀缺性，关注渠道扩张、提价和国企改革。", 4.8, ["中药消费", "品牌提价", "国企改革"], ["消费疲弱", "估值消化", "改革慢"]),
    Candidate("600519", "贵州茅台", "高端白酒", "高端白酒是消费龙头定价权代表，关注批价、渠道库存和分红回报。", 4.9, ["分红回报", "批价企稳", "消费修复"], ["消费疲弱", "批价下行", "估值弹性下降"]),
    Candidate("000858", "五粮液", "高端白酒", "高端白酒需求修复和渠道库存是核心变量，关注批价、动销和费用投放。", 4.7, ["消费修复", "渠道去库", "分红回报"], ["批价波动", "库存压力", "消费疲弱"]),
    Candidate("000333", "美的集团", "家电/机器人", "家电龙头现金流稳定，同时具备机器人与工业技术延展，关注出口和利润率。", 5.1, ["家电出口", "机器人业务", "分红回购"], ["地产拖累", "汇率波动", "增长放缓"]),
    Candidate("000651", "格力电器", "家电/分红", "空调龙头具备高分红属性，关注渠道改革、出口和估值修复。", 4.7, ["分红回报", "估值修复", "出口需求"], ["地产链压力", "竞争加剧", "增长放缓"]),
    Candidate("600887", "伊利股份", "乳制品消费", "乳制品龙头受消费复苏和成本变化影响，关注需求、费用率和分红。", 4.6, ["消费修复", "成本改善", "分红回报"], ["需求疲弱", "价格竞争", "增长放缓"]),
    Candidate("600036", "招商银行", "银行/财富管理", "优质银行资产质量和财富管理修复影响估值，关注息差、不良和分红。", 4.8, ["分红回报", "资产质量企稳", "财富管理修复"], ["息差下行", "地产风险", "经济修复慢"]),
    Candidate("601318", "中国平安", "保险/金融", "保险负债端和投资端修复决定估值弹性，关注新业务价值和资本市场表现。", 4.8, ["保险复苏", "权益市场修复", "分红回报"], ["投资收益波动", "地产敞口", "负债端压力"]),
    Candidate("600030", "中信证券", "券商/资本市场", "券商受资本市场活跃度和政策影响，关注成交额、投行业务和估值修复。", 4.7, ["资本市场改革", "成交活跃", "并购重组"], ["市场低迷", "投行业务波动", "政策节奏"]),
    Candidate("600150", "中国船舶", "船舶制造", "船舶景气周期由新船订单、船价和交付节奏驱动，关注盈利兑现。", 5.3, ["船价高位", "订单交付", "央企整合"], ["周期回落", "成本波动", "交付延迟"]),
    Candidate("600760", "中航沈飞", "军机/航空装备", "航空装备龙头受订单节奏和军工景气影响，关注交付、合同和盈利质量。", 5.0, ["军工订单", "航空装备", "国企改革"], ["订单节奏", "估值消化", "回款周期"]),
    Candidate("000768", "中航西飞", "军机/大飞机", "军机和大飞机产业链核心平台，关注订单、交付和产能效率。", 4.9, ["大飞机", "航空装备", "军工订单"], ["盈利释放慢", "订单节奏", "估值波动"]),
    Candidate("600893", "航发动力", "航空发动机", "航空发动机具备高壁垒属性，关注维修、交付和国产替代进度。", 4.8, ["航空发动机", "国产替代", "维修需求"], ["研发周期", "盈利波动", "订单不透明"]),
    Candidate("002594", "比亚迪", "新能源车/电池", "新能源车龙头兼具整车、电池和出海逻辑，关注销量、价格和利润率。", 5.4, ["出海销量", "电池技术", "智能化"], ["价格战", "利润率压力", "海外政策"]),
    Candidate("601127", "赛力斯", "智能汽车", "智能汽车销量和高端车型放量是核心变量，关注交付、毛利率和合作生态。", 5.1, ["智能汽车销量", "高端车型", "生态合作"], ["销量波动", "估值高", "竞争加剧"]),
    Candidate("000625", "长安汽车", "自主汽车/智能化", "自主品牌和智能化转型提供弹性，关注新能源销量和合资改善。", 4.8, ["新能源转型", "智能化车型", "国企改革"], ["价格战", "销量不及预期", "利润率压力"]),
    Candidate("601689", "拓普集团", "汽车零部件/机器人", "汽车轻量化和机器人执行器预期共同影响估值，关注客户拓展和订单兑现。", 5.0, ["汽车零部件", "机器人执行器", "客户拓展"], ["客户集中", "价格压力", "题材波动"]),
    Candidate("002920", "德赛西威", "智能座舱/智驾", "智能座舱与智能驾驶渗透率提升，关注订单、域控制器和客户结构。", 5.0, ["智能座舱", "智能驾驶", "客户升级"], ["汽车价格战", "研发投入", "客户集中"]),
]


def all_candidates() -> list[Candidate]:
    seen: set[str] = set()
    merged: list[Candidate] = []
    for candidate in [*CANDIDATES, *BROAD_CANDIDATES]:
        if candidate.code in seen:
            continue
        seen.add(candidate.code)
        merged.append(candidate)
    return merged


def board_for(code: str) -> str:
    return "沪市主板" if code.startswith("6") else "深市主板"


def ak_symbol(code: str) -> str:
    return ("sh" if code.startswith("6") else "sz") + code


def safe_float(value: Any) -> float | None:
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def round_or_none(value: Any, digits: int = 2) -> float | None:
    value = safe_float(value)
    if value is None:
        return None
    return round(value, digits)


def normalize_code(value: Any) -> str:
    text = str(value or "").strip()
    digits = "".join(ch for ch in text if ch.isdigit())
    return digits[-6:] if len(digits) >= 6 else digits


def is_mainboard_code(code: str) -> bool:
    return code.startswith(MAINBOARD_PREFIXES)


def percentile_rank(series: pd.Series) -> pd.Series:
    return series.rank(method="average", pct=True).fillna(0.0)


def build_universe_scan(candidate_library: list[Candidate]) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    import akshare as ak

    df = ak.stock_zh_a_spot()
    if df.empty:
        raise RuntimeError("stock_zh_a_spot returned empty data")

    normalized = df.copy()
    normalized["code"] = normalized["代码"].map(normalize_code)
    normalized["name"] = normalized["名称"].astype(str)
    normalized["close"] = pd.to_numeric(normalized["最新价"], errors="coerce")
    normalized["pct_chg"] = pd.to_numeric(normalized["涨跌幅"], errors="coerce")
    normalized["amount"] = pd.to_numeric(normalized["成交额"], errors="coerce")
    normalized["high"] = pd.to_numeric(normalized["最高"], errors="coerce")
    normalized["low"] = pd.to_numeric(normalized["最低"], errors="coerce")

    mainboard = normalized[
        normalized["code"].map(is_mainboard_code)
        & normalized["close"].gt(2)
        & normalized["amount"].gt(30_000_000)
        & ~normalized["name"].str.contains("ST|退", regex=True, na=False)
    ].copy()

    if mainboard.empty:
        raise RuntimeError("no main-board rows after filtering")

    price_range = (mainboard["high"] - mainboard["low"]).replace(0, np.nan)
    intraday_position = ((mainboard["close"] - mainboard["low"]) / price_range).clip(0, 1).fillna(0.5)
    momentum_rank = percentile_rank(mainboard["pct_chg"])
    liquidity_rank = percentile_rank(mainboard["amount"])
    position_rank = percentile_rank(intraday_position)
    heat_penalty = (mainboard["pct_chg"] - 7.5).clip(lower=0).fillna(0) * 4
    weak_penalty = (-mainboard["pct_chg"]).clip(lower=0).fillna(0) * 1.2

    mainboard["layer_one_score"] = (
        momentum_rank * 48
        + liquidity_rank * 34
        + position_rank * 18
        - heat_penalty
        - weak_penalty
    ).round(2)
    mainboard = mainboard.sort_values(["layer_one_score", "amount"], ascending=[False, False]).reset_index(drop=True)
    mainboard["layer_one_rank"] = mainboard.index + 1

    universe_by_code: dict[str, dict[str, Any]] = {}
    for row in mainboard.itertuples(index=False):
        universe_by_code[row.code] = {
            "code": row.code,
            "name": row.name,
            "close": round_or_none(row.close),
            "pct_chg": round_or_none(row.pct_chg),
            "amount": round_or_none(row.amount, 0),
            "layer_one_score": round_or_none(row.layer_one_score),
            "layer_one_rank": int(row.layer_one_rank),
        }

    library_codes = {candidate.code for candidate in candidate_library}
    matched = [record for code, record in universe_by_code.items() if code in library_codes]
    top_mainboard = [
        {
            "rank": int(row.layer_one_rank),
            "code": row.code,
            "name": row.name,
            "close": round_or_none(row.close),
            "pct_chg": round_or_none(row.pct_chg),
            "amount": round_or_none(row.amount, 0),
            "layer_one_score": round_or_none(row.layer_one_score),
        }
        for row in mainboard.head(UNIVERSE_EXPORT_LIMIT).itertuples(index=False)
    ]

    payload = {
        "schema_version": "1.0",
        "generated_at": datetime.now(CN_TZ).isoformat(timespec="seconds"),
        "source": "akshare.stock_zh_a_spot / Sina",
        "scope": "全A股主板",
        "raw_count": int(len(normalized)),
        "mainboard_count": int(len(mainboard)),
        "strategic_library_count": len(library_codes),
        "matched_library_count": len(matched),
        "shortlist_limit": DEEP_ANALYSIS_LIMIT,
        "export_limit": UNIVERSE_EXPORT_LIMIT,
        "note": "第一层扫描全主板行情快照，第二层只对可解释战略主题库中的入围标的做深度打分。",
        "top_mainboard": top_mainboard,
        "matched_library": sorted(matched, key=lambda item: item["layer_one_rank"])[:UNIVERSE_EXPORT_LIMIT],
    }
    return universe_by_code, payload


def select_candidates_from_universe(candidate_library: list[Candidate]) -> tuple[list[Candidate], dict[str, dict[str, Any]], dict[str, Any], list[str]]:
    warnings: list[str] = []
    try:
        universe_by_code, universe_payload = build_universe_scan(candidate_library)
    except Exception as exc:
        warnings.append(f"全主板第一层扫描失败，回退到战略主题库：{exc}")
        fallback_meta = {
            candidate.code: {
                "candidate_source": "主题库兜底",
                "layer_one_score": None,
                "layer_one_rank": None,
                "layer_one_pct_chg": None,
                "layer_one_amount": None,
                "layer_one_bonus": 0.0,
            }
            for candidate in candidate_library[:DEEP_ANALYSIS_LIMIT]
        }
        universe_payload = {
            "schema_version": "1.0",
            "generated_at": datetime.now(CN_TZ).isoformat(timespec="seconds"),
            "source": "fallback",
            "scope": "战略主题库",
            "raw_count": 0,
            "mainboard_count": 0,
            "strategic_library_count": len(candidate_library),
            "matched_library_count": len(fallback_meta),
            "shortlist_limit": DEEP_ANALYSIS_LIMIT,
            "export_limit": UNIVERSE_EXPORT_LIMIT,
            "note": warnings[-1],
            "top_mainboard": [],
            "matched_library": [],
        }
        return candidate_library[:DEEP_ANALYSIS_LIMIT], fallback_meta, universe_payload, warnings

    scored: list[tuple[float, Candidate]] = []
    meta_by_code: dict[str, dict[str, Any]] = {}
    for candidate in candidate_library:
        scan = universe_by_code.get(candidate.code)
        if not scan:
            continue
        first_layer_score = safe_float(scan.get("layer_one_score")) or 0.0
        combined_score = first_layer_score + candidate.base_score * 7
        meta_by_code[candidate.code] = {
            "candidate_source": "全主板第一层入围",
            "layer_one_score": round_or_none(first_layer_score),
            "layer_one_rank": scan.get("layer_one_rank"),
            "layer_one_pct_chg": scan.get("pct_chg"),
            "layer_one_amount": scan.get("amount"),
            "layer_one_bonus": round_or_none(min(2.2, first_layer_score / 100 * 2.2)),
        }
        scored.append((combined_score, candidate))

    if len(scored) < min(FINAL_POOL_SIZE, 6):
        warnings.append("全主板扫描匹配到的战略候选不足，已用主题库兜底补齐。")
        existing = {candidate.code for _, candidate in scored}
        for candidate in candidate_library:
            if candidate.code in existing:
                continue
            meta_by_code[candidate.code] = {
                "candidate_source": "主题库补齐",
                "layer_one_score": None,
                "layer_one_rank": None,
                "layer_one_pct_chg": None,
                "layer_one_amount": None,
                "layer_one_bonus": 0.0,
            }
            scored.append((candidate.base_score * 7, candidate))
            if len(scored) >= DEEP_ANALYSIS_LIMIT:
                break

    scored.sort(key=lambda item: item[0], reverse=True)
    selected = [candidate for _, candidate in scored[:DEEP_ANALYSIS_LIMIT]]
    universe_payload["deep_analysis_count"] = len(selected)
    universe_payload["final_pool_size"] = FINAL_POOL_SIZE
    return selected, meta_by_code, universe_payload, warnings


def parse_date_value(value: Any):
    if not value:
        return None
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return None


def load_history_snapshots() -> list[dict[str, Any]]:
    if not HISTORY_DIR.exists():
        return []

    snapshots: list[dict[str, Any]] = []
    for path in sorted(HISTORY_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue

        stocks = data.get("stocks")
        if not isinstance(stocks, list):
            continue

        snapshots.append(
            {
                "as_of_date": data.get("as_of_date") or path.stem,
                "stocks": stocks,
            }
        )
    return snapshots


def attach_tracking(rows: list[dict[str, Any]], as_of_date: str) -> None:
    entries_by_code: dict[str, dict[str, dict[str, Any]]] = {row["code"]: {} for row in rows}

    for snapshot in load_history_snapshots():
        snapshot_date = snapshot.get("as_of_date")
        if not snapshot_date:
            continue
        for stock in snapshot.get("stocks", []):
            code = stock.get("code")
            if code not in entries_by_code:
                continue
            close = safe_float(stock.get("close"))
            if close is None:
                continue
            entries_by_code[code][str(snapshot_date)] = {
                "date": str(snapshot_date),
                "close": close,
                "rank": stock.get("rank"),
                "status_key": stock.get("status_key"),
            }

    for row in rows:
        close = safe_float(row.get("close"))
        if close is not None:
            entries_by_code[row["code"]][as_of_date] = {
                "date": as_of_date,
                "close": close,
                "rank": row.get("rank"),
                "status_key": row.get("status_key"),
            }

    current_date = parse_date_value(as_of_date)

    for row in rows:
        series = sorted(
            entries_by_code[row["code"]].values(),
            key=lambda item: parse_date_value(item["date"]) or datetime.min.date(),
        )

        if not series:
            row["tracking"] = {
                "status": "待回访",
                "comment": "暂无历史推荐快照，等待下一次自动刷新后开始跟踪。",
            }
            continue

        first = series[0]
        latest = series[-1]
        first_close = safe_float(first.get("close"))
        latest_close = safe_float(latest.get("close"))
        max_entry = max(series, key=lambda item: safe_float(item.get("close")) or float("-inf"))
        min_entry = min(series, key=lambda item: safe_float(item.get("close")) or float("inf"))
        max_close = safe_float(max_entry.get("close"))
        min_close = safe_float(min_entry.get("close"))

        return_pct = None
        max_return_pct = None
        drawdown_from_peak_pct = None
        if first_close and latest_close is not None:
            return_pct = (latest_close / first_close - 1) * 100
        if first_close and max_close is not None:
            max_return_pct = (max_close / first_close - 1) * 100
        if latest_close is not None and max_close:
            drawdown_from_peak_pct = (latest_close / max_close - 1) * 100

        first_date = parse_date_value(first.get("date"))
        tracking_days = None
        if first_date and current_date:
            tracking_days = (current_date - first_date).days

        if return_pct is None:
            tracking_status = "待回访"
            comment = "缺少可用价格，暂不评价推荐后表现。"
        elif return_pct >= 5:
            tracking_status = "正反馈"
            comment = "推荐后已有正收益，后续重点跟踪是否继续跑赢自身观察区间。"
        elif return_pct <= -5:
            tracking_status = "负反馈"
            comment = "推荐后跌幅较明显，需要复核产业链逻辑、价格纪律和风控阈值。"
        else:
            tracking_status = "继续观察"
            comment = "推荐后涨跌幅仍在验证区间，继续观察催化剂和量价结构。"

        row["tracking"] = {
            "status": tracking_status,
            "first_recommend_date": first.get("date"),
            "first_recommend_price": round_or_none(first_close),
            "first_rank": first.get("rank"),
            "first_status_key": first.get("status_key"),
            "latest_date": latest.get("date"),
            "latest_price": round_or_none(latest_close),
            "tracking_days": tracking_days,
            "snapshot_count": len(series),
            "return_since_first_pct": round_or_none(return_pct),
            "max_return_since_first_pct": round_or_none(max_return_pct),
            "drawdown_from_peak_pct": round_or_none(drawdown_from_peak_pct),
            "best_close": round_or_none(max_close),
            "best_date": max_entry.get("date"),
            "worst_close": round_or_none(min_close),
            "worst_date": min_entry.get("date"),
            "comment": comment,
        }


def build_tracking_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    tracked = [row for row in rows if row.get("tracking", {}).get("return_since_first_pct") is not None]
    if not tracked:
        return {
            "tracked_count": 0,
            "average_return_pct": None,
            "positive_count": 0,
            "negative_count": 0,
            "best": None,
            "worst": None,
        }

    def tracking_return(row: dict[str, Any]) -> float:
        return float(row["tracking"]["return_since_first_pct"])

    returns = [tracking_return(row) for row in tracked]
    best = max(tracked, key=tracking_return)
    worst = min(tracked, key=tracking_return)
    return {
        "tracked_count": len(tracked),
        "average_return_pct": round_or_none(sum(returns) / len(returns)),
        "positive_count": sum(1 for value in returns if value > 0),
        "negative_count": sum(1 for value in returns if value < 0),
        "best": {
            "code": best["code"],
            "name": best["name"],
            "return_since_first_pct": best["tracking"]["return_since_first_pct"],
        },
        "worst": {
            "code": worst["code"],
            "name": worst["name"],
            "return_since_first_pct": worst["tracking"]["return_since_first_pct"],
        },
    }


def load_existing_review_records() -> list[dict[str, Any]]:
    records_by_code: dict[str, dict[str, Any]] = {}

    def absorb(raw: bytes | str) -> None:
        try:
            text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
            data = json.loads(text)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        for record in data.get("records", []):
            code = record.get("code")
            if code:
                records_by_code[code] = record

    if REVIEW_PATH.exists():
        try:
            absorb(REVIEW_PATH.read_text(encoding="utf-8"))
        except OSError:
            pass

    try:
        absorb(subprocess.check_output(["git", "show", "HEAD:data/review.json"], cwd=ROOT, stderr=subprocess.DEVNULL))
    except Exception:
        pass

    return list(records_by_code.values())


def build_review_center(rows: list[dict[str, Any]], as_of_date: str) -> dict[str, Any]:
    current_by_code = {row["code"]: row for row in rows}
    entries_by_code: dict[str, dict[str, dict[str, Any]]] = {}

    for record in load_existing_review_records():
        code = record.get("code")
        if not code:
            continue
        entries_by_code.setdefault(code, {})
        first_price = safe_float(record.get("first_recommend_price"))
        if record.get("first_recommend_date") and first_price is not None:
            entries_by_code[code][str(record["first_recommend_date"])] = {
                "date": str(record["first_recommend_date"]),
                "close": first_price,
                "rank": record.get("first_rank"),
                "status_key": record.get("first_status_key"),
                "name": record.get("name"),
                "theme": record.get("theme"),
                "board": record.get("board"),
            }
        latest_price = safe_float(record.get("latest_price"))
        if record.get("latest_date") and latest_price is not None:
            entries_by_code[code][str(record["latest_date"])] = {
                "date": str(record["latest_date"]),
                "close": latest_price,
                "rank": record.get("last_seen_rank"),
                "status_key": record.get("current_status_key"),
                "name": record.get("name"),
                "theme": record.get("theme"),
                "board": record.get("board"),
            }

    for snapshot in load_history_snapshots():
        snapshot_date = snapshot.get("as_of_date")
        if not snapshot_date:
            continue
        for stock in snapshot.get("stocks", []):
            code = stock.get("code")
            close = safe_float(stock.get("close"))
            if not code or close is None:
                continue
            entries_by_code.setdefault(code, {})[str(snapshot_date)] = {
                "date": str(snapshot_date),
                "close": close,
                "rank": stock.get("rank"),
                "status_key": stock.get("status_key"),
                "name": stock.get("name"),
                "theme": stock.get("theme"),
                "board": stock.get("board"),
            }

    for row in rows:
        close = safe_float(row.get("close"))
        if close is None:
            continue
        entries_by_code.setdefault(row["code"], {})[as_of_date] = {
            "date": as_of_date,
            "close": close,
            "rank": row.get("rank"),
            "status_key": row.get("status_key"),
            "name": row.get("name"),
            "theme": row.get("theme"),
            "board": row.get("board"),
        }

    records: list[dict[str, Any]] = []
    current_date = parse_date_value(as_of_date)

    for code, entries in sorted(entries_by_code.items()):
        current_row = current_by_code.get(code)
        quote_error = None
        latest_quote: dict[str, Any] | None = None

        if current_row:
            latest_quote = {
                "date": as_of_date,
                "close": safe_float(current_row.get("close")),
                "rank": current_row.get("rank"),
                "status_key": current_row.get("status_key"),
                "name": current_row.get("name"),
                "theme": current_row.get("theme"),
                "board": current_row.get("board"),
            }
        else:
            try:
                df = load_daily(code)
                latest_quote = {
                    "date": df["date"].iloc[-1].strftime("%Y-%m-%d"),
                    "close": float(df["close"].astype(float).iloc[-1]),
                    "rank": None,
                    "status_key": "exited",
                    "name": next((item.get("name") for item in entries.values() if item.get("name")), code),
                    "theme": next((item.get("theme") for item in entries.values() if item.get("theme")), ""),
                    "board": board_for(code),
                }
            except Exception as exc:  # keep historical review available even if a quote source fails
                quote_error = str(exc)

        if latest_quote and latest_quote.get("close") is not None:
            entries[str(latest_quote["date"])] = latest_quote

        series = sorted(
            entries.values(),
            key=lambda item: parse_date_value(item["date"]) or datetime.min.date(),
        )
        if not series:
            continue

        first = series[0]
        latest = series[-1]
        last_seen = max(
            [item for item in series if item.get("rank") is not None],
            key=lambda item: parse_date_value(item["date"]) or datetime.min.date(),
            default=latest,
        )

        first_close = safe_float(first.get("close"))
        latest_close = safe_float(latest.get("close"))
        max_entry = max(series, key=lambda item: safe_float(item.get("close")) or float("-inf"))
        min_entry = min(series, key=lambda item: safe_float(item.get("close")) or float("inf"))
        max_close = safe_float(max_entry.get("close"))
        min_close = safe_float(min_entry.get("close"))

        return_pct = None
        max_return_pct = None
        drawdown_from_peak_pct = None
        if first_close and latest_close is not None:
            return_pct = (latest_close / first_close - 1) * 100
        if first_close and max_close is not None:
            max_return_pct = (max_close / first_close - 1) * 100
        if latest_close is not None and max_close:
            drawdown_from_peak_pct = (latest_close / max_close - 1) * 100

        first_date = parse_date_value(first.get("date"))
        tracking_days = None
        if first_date and current_date:
            tracking_days = (current_date - first_date).days

        active = code in current_by_code
        if return_pct is None:
            review_status = "待回访"
            comment = "缺少最新价格，暂不评价推荐后表现。"
        elif active and return_pct >= 5:
            review_status = "当前池中-正反馈"
            comment = "仍在最新推荐池中，且推荐后已有正收益。"
        elif active and return_pct <= -5:
            review_status = "当前池中-负反馈"
            comment = "仍在最新推荐池中，但推荐后回撤较明显，需要复核逻辑和风控。"
        elif active:
            review_status = "当前池中-继续观察"
            comment = "仍在最新推荐池中，表现暂处于验证区间。"
        elif return_pct >= 0:
            review_status = "已调出-正收益"
            comment = "不在最新推荐池中，但历史推荐目前仍为正收益，继续保留回访记录。"
        else:
            review_status = "已调出-负收益"
            comment = "不在最新推荐池中，历史推荐目前为负收益，后续用于模型复盘。"

        if quote_error:
            comment = f"{comment} 最新行情刷新失败，暂用历史快照：{quote_error}"

        identity = current_row or latest or first
        records.append(
            {
                "code": code,
                "name": identity.get("name") or code,
                "theme": identity.get("theme") or "",
                "board": identity.get("board") or board_for(code),
                "active_in_current_pool": active,
                "current_rank": current_row.get("rank") if current_row else None,
                "current_status_key": current_row.get("status_key") if current_row else None,
                "first_recommend_date": first.get("date"),
                "first_recommend_price": round_or_none(first_close),
                "first_rank": first.get("rank"),
                "last_seen_in_pool_date": last_seen.get("date"),
                "last_seen_rank": last_seen.get("rank"),
                "latest_date": latest.get("date"),
                "latest_price": round_or_none(latest_close),
                "tracking_days": tracking_days,
                "snapshot_count": len(series),
                "return_since_first_pct": round_or_none(return_pct),
                "max_return_since_first_pct": round_or_none(max_return_pct),
                "drawdown_from_peak_pct": round_or_none(drawdown_from_peak_pct),
                "best_close": round_or_none(max_close),
                "best_date": max_entry.get("date"),
                "worst_close": round_or_none(min_close),
                "worst_date": min_entry.get("date"),
                "review_status": review_status,
                "comment": comment,
            }
        )

    tracked = [record for record in records if record.get("return_since_first_pct") is not None]

    def record_return(record: dict[str, Any]) -> float:
        return float(record["return_since_first_pct"])

    if tracked:
        returns = [record_return(record) for record in tracked]
        best = max(tracked, key=record_return)
        worst = min(tracked, key=record_return)
        summary = {
            "tracked_count": len(tracked),
            "active_count": sum(1 for record in records if record["active_in_current_pool"]),
            "exited_count": sum(1 for record in records if not record["active_in_current_pool"]),
            "average_return_pct": round_or_none(sum(returns) / len(returns)),
            "positive_count": sum(1 for value in returns if value > 0),
            "negative_count": sum(1 for value in returns if value < 0),
            "best": {
                "code": best["code"],
                "name": best["name"],
                "return_since_first_pct": best["return_since_first_pct"],
            },
            "worst": {
                "code": worst["code"],
                "name": worst["name"],
                "return_since_first_pct": worst["return_since_first_pct"],
            },
        }
    else:
        summary = {
            "tracked_count": 0,
            "active_count": sum(1 for record in records if record["active_in_current_pool"]),
            "exited_count": sum(1 for record in records if not record["active_in_current_pool"]),
            "average_return_pct": None,
            "positive_count": 0,
            "negative_count": 0,
            "best": None,
            "worst": None,
        }

    records.sort(
        key=lambda record: (
            record.get("return_since_first_pct") is None,
            -(record.get("return_since_first_pct") or 0),
            record["code"],
        )
    )
    for index, record in enumerate(records, start=1):
        record["review_rank"] = index

    return {
        "schema_version": "1.0",
        "generated_at": datetime.now(CN_TZ).isoformat(timespec="seconds"),
        "as_of_date": as_of_date,
        "summary": summary,
        "records": records,
    }


def load_daily(code: str) -> pd.DataFrame:
    import akshare as ak

    df = ak.stock_zh_a_daily(symbol=ak_symbol(code), adjust="qfq")
    if df.empty:
        raise RuntimeError(f"{code} daily data is empty")

    df = df.rename(columns={col: col.lower() for col in df.columns})
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").tail(140).reset_index(drop=True)
    return df


def analyze_candidate(candidate: Candidate) -> dict[str, Any]:
    df = load_daily(candidate.code)
    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)

    latest_close = float(close.iloc[-1])
    as_of_date = df["date"].iloc[-1].strftime("%Y-%m-%d")
    ma20 = float(close.tail(20).mean())
    ma60 = float(close.tail(60).mean()) if len(close) >= 60 else ma20
    high20 = float(high.tail(20).max())
    low20 = float(low.tail(20).min())
    previous_high_window = high.iloc[-21:-1] if len(high) > 1 else high.tail(1)
    previous_high20 = float(previous_high_window.max()) if not previous_high_window.empty else high20
    pct60 = (latest_close / float(close.iloc[-60]) - 1) * 100 if len(close) >= 60 else None

    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    atr14 = float(tr.tail(14).mean())
    volatility20 = float(close.pct_change().tail(20).std() * np.sqrt(20) * 100)

    aggressive = min(ma20, latest_close - atr14 * 0.7)
    stable = max(ma60, low20 + (high20 - low20) * 0.25)
    if stable > aggressive:
        stable = aggressive * 0.94

    breakout_confirm = max(previous_high20 * 1.01, ma20 + atr14 * 0.6)
    breakout_gap_pct = (breakout_confirm / latest_close - 1) * 100 if latest_close else None
    no_chase = max(aggressive * 1.08, breakout_confirm * 1.05, ma20 + atr14 * 1.8)
    invalid = min(ma60 * 0.92, latest_close - atr14 * 3.0)
    recommended_entry = stable + (aggressive - stable) * 0.4
    entry_gap_pct = (latest_close / recommended_entry - 1) * 100 if recommended_entry else None
    pullback_buy_lower = max(stable, invalid)
    pullback_buy_upper = aggressive
    breakout_buy_upper = min(no_chase, breakout_confirm * 1.025, breakout_confirm + atr14 * 0.8)

    overheat_penalty = 0.0
    risk_notes = list(candidate.risks)
    if pct60 is not None and pct60 > 60:
        overheat_penalty += 0.5
        if "60日涨幅偏高" not in risk_notes:
            risk_notes.insert(0, "60日涨幅偏高")
    if latest_close > ma20 + atr14 * 1.5:
        overheat_penalty += 0.3
        if "短线偏离均线" not in risk_notes:
            risk_notes.insert(0, "短线偏离均线")
    if volatility20 > 25:
        overheat_penalty += 0.2
        if "波动偏高" not in risk_notes:
            risk_notes.insert(0, "波动偏高")

    score = max(0.0, candidate.base_score - overheat_penalty)

    if latest_close > no_chase:
        status_key = "avoid"
        intervention_status = "不追高"
        position_hint = "价格高于不追高线，等待涨幅和换手降温。"
        trigger = "先等待回到观察区间，或重新形成新的平台后再复核突破价。"
        entry_note = "当前高于不追高线，不按现价追入；等回落到推荐接入价附近再复核。"
        breakout_note = "突破已经偏离合理追踪区，不把突破当成追高理由。"
    elif latest_close >= breakout_confirm and latest_close >= ma20:
        status_key = "breakout"
        intervention_status = "突破确认"
        position_hint = "只适合小仓位试探，后续必须用不跌回突破价和成交量延续来验证。"
        trigger = "已站上突破确认价；若回踩不破突破价且量能不明显萎缩，可继续观察强趋势接入。"
        entry_note = "未给出理想回撤，但价格已触发突破路径；回撤接入价仍作为更稳健的加仓纪律。"
        breakout_note = "突破路径已触发，重点看收盘能否守住突破价，以及次日是否放量/缩量不破。"
    elif latest_close <= aggressive and latest_close >= invalid:
        status_key = "watch"
        intervention_status = "观察区"
        position_hint = "可进入观察清单，只适合小仓位分批验证。"
        trigger = "价格落入观察区间后，等待缩量企稳或重新放量确认。"
        entry_note = "已进入观察区，接入价仅作为分批纪律参考，仍需看量价确认。"
        breakout_note = "尚未触发突破路径；若放量站上突破确认价，可按强趋势路径重新评估。"
    else:
        status_key = "wait"
        intervention_status = "等回踩"
        position_hint = "暂以观察为主，等价格接近观察区间再考虑。"
        trigger = "接近观察区间且产业链证据未变弱时，再重新评估。"
        entry_note = "当前未到理想接入位置，优先等待价格回落到推荐接入价附近。"
        breakout_note = "若不回踩而直接站上突破确认价，可转入小仓位突破验证路径。"

    buy_signal_key = "wait"
    buy_signal_label = "等待触发"
    is_buyable_now = False
    buyable_price = None
    buyable_lower = None
    buyable_upper = None
    next_buy_price = None
    buy_price_path = "等待"
    buy_price_note = "当前没有触发可买入观察信号，只保留跟踪。"

    if status_key == "watch":
        buy_signal_key = "pullback_buy"
        buy_signal_label = "可小仓低吸"
        is_buyable_now = True
        buyable_price = pullback_buy_upper
        buyable_lower = pullback_buy_lower
        buyable_upper = pullback_buy_upper
        next_buy_price = buyable_price
        buy_price_path = "回撤接入"
        buy_price_note = "价格已落入回撤观察区，研究口径允许小仓位分批验证；理想价靠近推荐接入价，最高不超过可买价。"
    elif status_key == "breakout":
        if latest_close <= breakout_buy_upper:
            buy_signal_key = "breakout_buy"
            buy_signal_label = "可突破试探"
            is_buyable_now = True
            buyable_price = breakout_buy_upper
            buyable_lower = breakout_confirm
            buyable_upper = breakout_buy_upper
            next_buy_price = breakout_confirm
            buy_price_path = "突破确认"
            buy_price_note = "价格已站上突破确认价但未明显追高，只适合小仓位试探；后续必须用不跌回突破价和量能延续验证。"
        else:
            buy_signal_key = "breakout_wait"
            buy_signal_label = "突破偏高"
            buyable_price = None
            buyable_lower = breakout_confirm
            buyable_upper = breakout_buy_upper
            next_buy_price = breakout_buy_upper
            buy_price_path = "等突破回踩"
            buy_price_note = "已经突破但偏离可接受上限，等待回踩到突破可买区间再复核。"
    elif status_key == "avoid":
        buy_signal_key = "avoid"
        buy_signal_label = "不可追高"
        next_buy_price = pullback_buy_upper
        buy_price_path = "等降温回撤"
        buy_price_note = "价格高于不追高线，不给当前可买价；优先等回撤到观察区间上沿以内。"
    else:
        pullback_gap = abs(latest_close / pullback_buy_upper - 1) if pullback_buy_upper else float("inf")
        breakout_gap = abs(breakout_confirm / latest_close - 1) if breakout_confirm >= latest_close else float("inf")
        if breakout_gap < pullback_gap:
            next_buy_price = breakout_confirm
            buy_price_path = "等突破确认"
            buy_price_note = "当前未触发买入观察信号；若放量站上突破确认价，可转入突破试探路径。"
        else:
            next_buy_price = pullback_buy_upper
            buy_price_path = "等回撤接入"
            buy_price_note = "当前未触发买入观察信号；优先等待回撤到观察区间上沿以内。"

    return {
        "code": candidate.code,
        "name": candidate.name,
        "board": board_for(candidate.code),
        "theme": candidate.theme,
        "logic": candidate.logic,
        "score": round(score, 1),
        "close": round_or_none(latest_close),
        "ma20": round_or_none(ma20),
        "ma60": round_or_none(ma60),
        "atr14": round_or_none(atr14),
        "pct60": round_or_none(pct60),
        "volatility20": round_or_none(volatility20),
        "aggressive_price": round_or_none(aggressive),
        "stable_price": round_or_none(stable),
        "recommended_entry_price": round_or_none(recommended_entry),
        "entry_price_lower": round_or_none(stable),
        "entry_price_upper": round_or_none(aggressive),
        "entry_gap_pct": round_or_none(entry_gap_pct),
        "entry_price_note": entry_note,
        "breakout_confirm_price": round_or_none(breakout_confirm),
        "breakout_buy_upper_price": round_or_none(breakout_buy_upper),
        "breakout_gap_pct": round_or_none(breakout_gap_pct),
        "breakout_price_note": breakout_note,
        "resistance_price": round_or_none(previous_high20),
        "is_buyable_now": is_buyable_now,
        "buy_signal_key": buy_signal_key,
        "buy_signal_label": buy_signal_label,
        "buyable_price": round_or_none(buyable_price),
        "buyable_price_lower": round_or_none(buyable_lower),
        "buyable_price_upper": round_or_none(buyable_upper),
        "next_buy_trigger_price": round_or_none(next_buy_price),
        "buy_price_path": buy_price_path,
        "buy_price_note": buy_price_note,
        "watch_zone": f"{stable:.2f}-{aggressive:.2f}",
        "no_chase_price": round_or_none(no_chase),
        "invalid_price": round_or_none(invalid),
        "status_key": status_key,
        "intervention_status": intervention_status,
        "trigger_condition": trigger,
        "position_hint": position_hint,
        "catalysts": candidate.catalysts,
        "risks": risk_notes,
        "as_of_date": as_of_date,
    }


def fallback_latest(error: Exception) -> dict[str, Any]:
    if not LATEST_PATH.exists():
        raise error
    data = json.loads(LATEST_PATH.read_text(encoding="utf-8"))
    data["generated_at"] = datetime.now(CN_TZ).isoformat(timespec="seconds")
    data["source_status"] = {
        "quotes": "fallback seeded/latest json",
        "fallback": True,
        "note": f"自动刷新失败，沿用上一版数据。错误：{error}",
    }
    return data


def build_payload() -> dict[str, Any]:
    rows = []
    errors = []
    candidate_library = all_candidates()
    selected_candidates, candidate_meta, universe_payload, universe_warnings = select_candidates_from_universe(candidate_library)
    errors.extend(universe_warnings)

    for candidate in selected_candidates:
        try:
            row = analyze_candidate(candidate)
            meta = candidate_meta.get(candidate.code, {})
            layer_one_bonus = safe_float(meta.get("layer_one_bonus")) or 0.0
            row["score"] = round(row["score"] + layer_one_bonus, 1)
            row["candidate_source"] = meta.get("candidate_source") or "主题库"
            row["layer_one_score"] = meta.get("layer_one_score")
            row["layer_one_rank"] = meta.get("layer_one_rank")
            row["layer_one_pct_chg"] = meta.get("layer_one_pct_chg")
            row["layer_one_amount"] = meta.get("layer_one_amount")
            rows.append(row)
        except Exception as exc:  # network/free data sources are not always stable
            errors.append(f"{candidate.code} {candidate.name}: {exc}")

    if not rows:
        raise RuntimeError("; ".join(errors) or "no rows generated")

    rows.sort(key=lambda row: row["score"], reverse=True)
    rows = rows[:FINAL_POOL_SIZE]
    for index, row in enumerate(rows, start=1):
        row["rank"] = index

    as_of_date = max(row["as_of_date"] for row in rows)
    attach_tracking(rows, as_of_date)
    tracking_summary = build_tracking_summary(rows)
    review_payload = build_review_center(rows, as_of_date)
    counts = {
        "total": len(rows),
        "watch": sum(1 for row in rows if row["status_key"] == "watch"),
        "breakout": sum(1 for row in rows if row["status_key"] == "breakout"),
        "wait": sum(1 for row in rows if row["status_key"] == "wait"),
        "avoid": sum(1 for row in rows if row["status_key"] == "avoid"),
        "buyable": sum(1 for row in rows if row.get("is_buyable_now")),
        "buyable_pullback": sum(1 for row in rows if row.get("buy_signal_key") == "pullback_buy"),
        "buyable_breakout": sum(1 for row in rows if row.get("buy_signal_key") == "breakout_buy"),
    }
    if counts["buyable"]:
        overall_signal = f"{counts['buyable']}只触发可买入观察信号"
    elif counts["watch"]:
        overall_signal = "有少量标的进入观察区"
    elif counts["breakout"]:
        overall_signal = "部分标的进入突破确认"
    elif counts["avoid"] >= len(rows) / 2:
        overall_signal = "整体偏热，谨慎追高"
    else:
        overall_signal = "以等待回踩为主"

    return {
        "schema_version": "1.0",
        "generated_at": datetime.now(CN_TZ).isoformat(timespec="seconds"),
        "as_of_date": as_of_date,
        "market": "A股主板",
        "source_status": {
            "quotes": "akshare.stock_zh_a_spot + stock_zh_a_daily / Sina",
            "fallback": False,
            "note": "免费数据源可能延迟或限流；关键决策请复核实时行情。",
            "warnings": errors,
        },
        "model": {
            "name": "Two-layer Serenity main-board screen",
            "description": "第一层扫描全A股主板的趋势、动量和流动性；第二层再做产业链瓶颈、供需验证、催化剂和估值重估筛选；价格纪律拆成回撤接入和突破确认两条路径。",
            "board_filter": "000/001/002/003/600/601/603/605",
            "universe_layer": "全主板行情快照粗筛",
            "serenity_layer": "战略主题库 + 产业链瓶颈深度打分",
            "candidates": [asdict(candidate) for candidate in candidate_library],
        },
        "universe_scan": universe_payload,
        "summary": {**counts, "overall_signal": overall_signal, "tracking": tracking_summary},
        "review": review_payload,
        "stocks": rows,
    }


def write_payload(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    HISTORY_DIR.mkdir(exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    LATEST_PATH.write_text(text + "\n", encoding="utf-8")
    review_payload = payload.get("review")
    if isinstance(review_payload, dict):
        REVIEW_PATH.write_text(json.dumps(review_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    universe_payload = payload.get("universe_scan")
    if isinstance(universe_payload, dict):
        UNIVERSE_PATH.write_text(json.dumps(universe_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    history_path = HISTORY_DIR / f"{payload['as_of_date']}.json"
    history_path.write_text(text + "\n", encoding="utf-8")


def main() -> None:
    try:
        payload = build_payload()
    except Exception as exc:
        payload = fallback_latest(exc)
    write_payload(payload)
    print(f"wrote {LATEST_PATH}")
    print(f"as_of_date={payload.get('as_of_date')} fallback={payload.get('source_status', {}).get('fallback')}")


if __name__ == "__main__":
    main()
