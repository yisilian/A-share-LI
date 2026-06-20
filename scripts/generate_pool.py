from __future__ import annotations

import json
import math
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
LATEST_PATH = DATA_DIR / "latest.json"
HISTORY_DIR = DATA_DIR / "history"
CN_TZ = timezone(timedelta(hours=8))


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

    no_chase = max(aggressive * 1.08, ma20 + atr14 * 1.2)
    invalid = min(ma60 * 0.92, latest_close - atr14 * 3.0)

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

    if latest_close <= aggressive and latest_close >= invalid:
        status_key = "watch"
        intervention_status = "观察区"
        position_hint = "可进入观察清单，只适合小仓位分批验证。"
        trigger = "价格落入观察区间后，等待缩量企稳或重新放量确认。"
    elif latest_close > no_chase:
        status_key = "avoid"
        intervention_status = "不追高"
        position_hint = "价格高于不追高线，等待涨幅和换手降温。"
        trigger = "先等待回到观察区间，避免把长期逻辑变成短线追涨。"
    else:
        status_key = "wait"
        intervention_status = "等回踩"
        position_hint = "暂以观察为主，等价格接近观察区间再考虑。"
        trigger = "接近观察区间且产业链证据未变弱时，再重新评估。"

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
    for candidate in CANDIDATES:
        try:
            rows.append(analyze_candidate(candidate))
        except Exception as exc:  # network/free data sources are not always stable
            errors.append(f"{candidate.code} {candidate.name}: {exc}")

    if not rows:
        raise RuntimeError("; ".join(errors) or "no rows generated")

    rows.sort(key=lambda row: row["score"], reverse=True)
    for index, row in enumerate(rows, start=1):
        row["rank"] = index

    as_of_date = max(row["as_of_date"] for row in rows)
    attach_tracking(rows, as_of_date)
    tracking_summary = build_tracking_summary(rows)
    counts = {
        "total": len(rows),
        "watch": sum(1 for row in rows if row["status_key"] == "watch"),
        "wait": sum(1 for row in rows if row["status_key"] == "wait"),
        "avoid": sum(1 for row in rows if row["status_key"] == "avoid"),
    }
    if counts["watch"]:
        overall_signal = "有少量标的进入观察区"
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
            "quotes": "akshare.stock_zh_a_daily / Sina",
            "fallback": False,
            "note": "免费数据源可能延迟或限流；关键决策请复核实时行情。",
            "warnings": errors,
        },
        "model": {
            "name": "Serenity-style main-board screen",
            "description": "长期趋势确认 → 产业链瓶颈 → 供需验证 → 低关注度/错定价 → 催化剂 → 估值重估。",
            "board_filter": "000/001/002/003/600/601/603/605",
            "candidates": [asdict(candidate) for candidate in CANDIDATES],
        },
        "summary": {**counts, "overall_signal": overall_signal, "tracking": tracking_summary},
        "stocks": rows,
    }


def write_payload(payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    HISTORY_DIR.mkdir(exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    LATEST_PATH.write_text(text + "\n", encoding="utf-8")
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
