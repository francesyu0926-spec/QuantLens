import type { AlertRules } from "../hooks/useAlertRules";
import type { AlertSignal } from "../types/market";
import { plainSignalMessage } from "../utils/noviceCopy";

export type SignalScope = "current" | "watchlist";

interface Props {
  signals: AlertSignal[];
  rules: AlertRules;
  onPick?: (signal: AlertSignal) => void;
  scope: SignalScope;
  onScopeChange: (scope: SignalScope) => void;
  className?: string;
  noviceMode?: boolean;
}

function signalTone(rule: string): "bull" | "bear" | "neutral" {
  if (
    rule === "ema_golden_cross" ||
    rule === "rsi_oversold" ||
    rule === "bb_break_lower"
  ) {
    return "bull";
  }
  if (
    rule === "ema_death_cross" ||
    rule === "rsi_overbought" ||
    rule === "bb_break_upper"
  ) {
    return "bear";
  }
  return "neutral";
}

function formatSignalTime(sig: AlertSignal): string {
  if (sig.bar_time != null && sig.bar_time > 0) {
    return new Date(sig.bar_time * 1000).toLocaleTimeString();
  }
  return new Date(sig.ts).toLocaleTimeString();
}

function ruleEnabled(rule: string, rules: AlertRules, message: string): boolean {
  if (rule === "ema_golden_cross" || rule === "ema_death_cross") {
    // 与主图历史标记一致：回填始终展示；盘中预警仍受规则开关控制
    if (message.startsWith("[历史]")) return true;
    return rules.emaCross;
  }
  if (rule === "rsi_oversold") return rules.rsiOversold;
  if (rule === "rsi_overbought") return rules.rsiOverbought;
  if (rule === "bb_break_lower") return rules.bbLower;
  if (rule === "bb_break_upper") return rules.bbUpper;
  return true;
}

export function SignalLog({
  signals,
  rules,
  onPick,
  scope,
  onScopeChange,
  className,
  noviceMode = false,
}: Props) {
  const visible = signals
    .filter((s) => ruleEnabled(s.rule, rules, s.message))
    .slice(0, 8);

  const stripHist = (msg: string) =>
    msg.replace(/^\[历史\]\s*/, "").replace(/^\[盘中预警\]\s*/, "");

  const isLive = (msg: string) => msg.startsWith("[盘中预警]");

  return (
    <section className={`signal-log${className ? ` ${className}` : ""}`}>
      <header className="signal-head">
        <h2>{noviceMode ? "提醒记录" : "策略信号"}</h2>
        <div className="signal-scope" role="group" aria-label="信号范围">
          <button
            type="button"
            className={`scope-btn${scope === "current" ? " on" : ""}`}
            aria-pressed={scope === "current"}
            onClick={(e) => {
              e.stopPropagation();
              onScopeChange("current");
            }}
          >
            当前
          </button>
          <button
            type="button"
            className={`scope-btn${scope === "watchlist" ? " on" : ""}`}
            aria-pressed={scope === "watchlist"}
            onClick={(e) => {
              e.stopPropagation();
              onScopeChange("watchlist");
            }}
          >
            自选
          </button>
        </div>
      </header>
      <div className="log-scroll">
        {visible.length === 0 && (
          <p className="muted empty-hint">
            {noviceMode
              ? "系统会自动记录动能强弱等白话提醒"
              : "等待规则触发，或查看历史回填金叉/死叉"}
          </p>
        )}
        {visible.map((sig, index) => {
          const tone = signalTone(sig.rule);
          const clickable = Boolean(onPick && sig.bar_time);
          const fresh = index < 2;
          return (
            <article
              key={sig.id}
              className={`signal-item signal-${tone}${fresh ? " signal-fresh" : " signal-muted"}${clickable ? " clickable" : ""}`}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => clickable && onPick?.(sig)}
              onKeyDown={(e) => {
                if (clickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onPick?.(sig);
                }
              }}
            >
              <div className="signal-row signal-row-top">
                <span className="signal-msg">
                  <span className="signal-sym-inline">{sig.symbol}</span>
                  {isLive(sig.message) && (
                    <span className="signal-new-dot" title="新触发">
                      NEW
                    </span>
                  )}
                  {noviceMode
                    ? plainSignalMessage(sig.rule, stripHist(sig.message))
                    : stripHist(sig.message)}
                </span>
                <time>{formatSignalTime(sig)}</time>
              </div>
              <div className="signal-row signal-row-bot">
                <span className="signal-price">@{sig.price.toFixed(2)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}