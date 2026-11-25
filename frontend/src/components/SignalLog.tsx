import type { AlertRules } from "../hooks/useAlertRules";
import type { AlertSignal } from "../types/market";

interface Props {
  signals: AlertSignal[];
  onOpenSettings: () => void;
  rules: AlertRules;
  onPick?: (signal: AlertSignal) => void;
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

function ruleEnabled(rule: string, rules: AlertRules): boolean {
  if (rule === "ema_golden_cross" || rule === "ema_death_cross") return rules.emaCross;
  if (rule === "rsi_oversold") return rules.rsiOversold;
  if (rule === "rsi_overbought") return rules.rsiOverbought;
  if (rule === "bb_break_lower") return rules.bbLower;
  if (rule === "bb_break_upper") return rules.bbUpper;
  return true;
}

export function SignalLog({ signals, onOpenSettings, rules, onPick }: Props) {
  const visible = signals.filter((s) => ruleEnabled(s.rule, rules));

  return (
    <section className="signal-log">
      <header className="signal-head">
        <h2>策略信号</h2>
        <button
          type="button"
          className="chip icon-btn"
          title="预警规则"
          onClick={onOpenSettings}
        >
          ⚙
        </button>
      </header>
      <div className="log-scroll">
        {visible.length === 0 && (
          <p className="muted empty-hint">等待规则触发，或查看历史回填金叉/死叉</p>
        )}
        {visible.map((sig) => {
          const tone = signalTone(sig.rule);
          const clickable = Boolean(onPick && sig.bar_time);
          return (
            <article
              key={sig.id}
              className={`signal-item signal-${tone}${clickable ? " clickable" : ""}`}
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
              <div className="signal-main">
                <strong>{sig.message}</strong>
                <span className="price">@{sig.price.toFixed(2)}</span>
              </div>
              <div className="signal-meta">
                <span>{sig.symbol}</span>
                <time>{new Date(sig.ts).toLocaleTimeString()}</time>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}