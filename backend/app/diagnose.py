"""Rule-based market diagnosis (LLM hook placeholder)."""

from __future__ import annotations

from typing import Any


def build_diagnosis(
    symbol: str,
    candles: list[dict[str, Any]],
    indicators: dict[str, float],
    signals: list[dict[str, Any]],
) -> str:
    if len(candles) < 5:
        return f"{symbol}：K 线数据不足，暂无法诊断。"

    price = float(candles[-1]["close"])
    e20 = indicators.get("ema20")
    e50 = indicators.get("ema50")
    rsi = indicators.get("rsi")
    bb_u = indicators.get("bb_upper")
    bb_m = indicators.get("bb_middle")
    bb_l = indicators.get("bb_lower")

    parts: list[str] = [f"**{symbol}** 现价 {price:.4f}。"]

    if e20 is not None and e50 is not None:
        if e20 > e50:
            parts.append("EMA20 在 EMA50 上方，短期均线结构偏多。")
        elif e20 < e50:
            parts.append("EMA20 低于 EMA50，短期均线结构偏空。")
        else:
            parts.append("EMA 均线粘合，方向待选择。")

    if bb_m is not None and bb_u is not None and bb_l is not None:
        if price > bb_u:
            parts.append("价格站上布林上轨，注意超买回落风险。")
        elif price < bb_l:
            parts.append("价格跌破布林下轨，关注超卖反弹。")
        elif price >= bb_m:
            parts.append("价格运行在布林中轨上方，震荡偏多。")
        else:
            parts.append("价格运行在布林中轨下方，震荡偏空。")

    if rsi is not None:
        if rsi >= 70:
            parts.append(f"RSI {rsi:.1f} 接近超买区。")
        elif rsi <= 30:
            parts.append(f"RSI {rsi:.1f} 接近超卖区。")
        else:
            parts.append(f"RSI {rsi:.1f} 处于中性区间。")

    if signals:
        parts.append(f"近期触发 {len(signals)} 条规则信号，请以收盘确认后决策。")
    else:
        parts.append("本周期暂无新增策略信号。")

    parts.append("以上为依据当前 K 线与指标的简要技术解读，非投资建议。")
    return " ".join(parts)