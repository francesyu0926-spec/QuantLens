import type { AlertSignal, WatchlistItem } from "../types/market";
import type { QuoteMap } from "../hooks/useWatchlistQuotes";
import type { PaperTrade } from "../hooks/usePaperTrades";
import { isAShareSessionOpen } from "./marketSession";

export function buildDailyReviewMarkdown(input: {
  watchlist: WatchlistItem[];
  quotes: QuoteMap;
  signals: AlertSignal[];
  paperBySymbol: Record<string, PaperTrade[]>;
  symbol: string;
}): string {
  const d = new Date();
  const date = d.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  const session = isAShareSessionOpen(d) ? "盘中" : "盘后";

  const movers = input.watchlist
    .map((w) => ({
      sym: w.symbol,
      name: w.name,
      pct: input.quotes[w.symbol]?.changePct ?? null,
      px: input.quotes[w.symbol]?.price ?? null,
    }))
    .filter((r) => r.pct != null)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  const top = movers.slice(0, 8);
  const bottom = [...movers].reverse().slice(0, 5);
  const sigLines = input.signals.slice(0, 12).map(
    (s) => `- ${s.symbol} ${s.rule} @${s.price.toFixed(2)} ${s.message}`
  );

  const trades = input.paperBySymbol[input.symbol] ?? [];
  const lastTrade = trades[trades.length - 1];

  return [
    `# 日复盘 ${date}（${session}）`,
    "",
    "## 自选涨跌",
    ...top.map(
      (r) =>
        `- **${r.name}** \`${r.sym}\` ${(r.pct ?? 0) >= 0 ? "+" : ""}${(r.pct ?? 0).toFixed(2)}% · ${r.px?.toFixed(2) ?? "—"}`
    ),
    "",
    "### 跌幅居前",
    ...bottom.map(
      (r) => `- ${r.name} ${(r.pct ?? 0).toFixed(2)}%`
    ),
    "",
    "## 今日策略信号",
    ...(sigLines.length ? sigLines : ["- （无）"]),
    "",
    "## 当前标的模拟",
    lastTrade
      ? `- 最近成交：${lastTrade.side === "buy" ? "买入" : "卖出"} ${lastTrade.qty} @${lastTrade.price.toFixed(2)}`
      : "- 无模拟成交记录",
    "",
    "## 明日观察",
    "- ",
    "",
  ].join("\n");
}