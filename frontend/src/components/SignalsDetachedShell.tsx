import { useMemo, useState } from "react";
import { SignalLog, type SignalScope } from "./SignalLog";
import { useAlertRules } from "../hooks/useAlertRules";
import { usePersistedWatchlist } from "../hooks/usePersistedWatchlist";
import { useWatchlistEmaSignals } from "../hooks/useWatchlistEmaSignals";
import { PINNED_A_SHARE_SYMBOLS } from "../config/pinnedWatchlist";
import { DEFAULT_SYMBOL } from "../config/market";

export function SignalsDetachedShell() {
  const { rules } = useAlertRules();
  const { symbolList } = usePersistedWatchlist();
  const [scope, setScope] = useState<SignalScope>("watchlist");

  const watchSymbols = useMemo(() => {
    const merged = new Set<string>([
      DEFAULT_SYMBOL,
      ...PINNED_A_SHARE_SYMBOLS,
      ...symbolList.slice(0, 20),
    ]);
    return [...merged];
  }, [symbolList]);

  const backfill = useWatchlistEmaSignals(watchSymbols, "15m", true);

  const signals = useMemo(() => {
    const allow = new Set(watchSymbols);
    return backfill
      .filter((s) => allow.has(s.symbol))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 120);
  }, [backfill, watchSymbols]);

  return (
    <div className="signals-detached-shell">
      <header className="signals-detached-head">
        <strong>QuantLens 信号日志</strong>
        <span className="muted">独立窗口 · 多屏看盘</span>
      </header>
      <SignalLog
        className="signal-log-dock signal-log-detached"
        signals={signals}
        rules={rules}
        scope={scope}
        onScopeChange={setScope}
      />
    </div>
  );
}