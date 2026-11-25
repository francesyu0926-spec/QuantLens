import { useEffect, useMemo, useState } from "react";
import type { Candle } from "../types/market";
import {
  buildStructuredReport,
  reportToCopyText,
} from "../utils/structuredDiagnosis";
import {
  pickResonanceFrames,
  type MtfFrame,
  type MtfTrend,
} from "../utils/mtfResonance";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

const MTF_ORDER = ["5m", "15m", "1h", "1d"] as const;

interface Props {
  symbol: string;
  interval: string;
  candles: Candle[];
  price: number;
  onClose: () => void;
  onDrawLevels?: (support?: number, resistance?: number) => void;
}

function mtfArrow(trend: MtfTrend | undefined) {
  if (trend === "bull") return "↑";
  if (trend === "bear") return "↓";
  return "—";
}

export function AiDiagnoseModal({
  symbol,
  interval,
  candles,
  price,
  onClose,
  onDrawLevels,
}: Props) {
  const [fallback, setFallback] = useState<string | null>(null);
  const [mtfFrames, setMtfFrames] = useState<MtfFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const radarRes = await fetch(
          `${API}/radar?symbol=${encodeURIComponent(symbol)}`
        );
        const radar = radarRes.ok ? await radarRes.json() : { frames: [] };
        const diagRes = await fetch(
          `${API}/diagnose?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`
        );
        const diag = diagRes.ok ? await diagRes.json() : null;
        if (!cancelled) {
          setMtfFrames(radar.frames ?? []);
          setFallback(diag?.text ?? null);
        }
      } catch {
        if (!cancelled) setFallback("诊断请求失败，请确认后端已启动。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  const report = useMemo(() => {
    if (candles.length < 20) return null;
    return buildStructuredReport(symbol, candles.slice(-50), price, mtfFrames);
  }, [candles, symbol, price, mtfFrames]);

  const mtfPills = useMemo(() => {
    const map = new Map(pickResonanceFrames(mtfFrames).map((f) => [f.interval, f]));
    return MTF_ORDER.map((iv) => ({
      iv,
      trend: map.get(iv)?.trend,
    }));
  }, [mtfFrames]);

  const copyReport = async () => {
    if (!report) return;
    const text = reportToCopyText(report);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const fmtPct = (n: number | null | undefined, plus = false) => {
    if (n == null || !Number.isFinite(n)) return "";
    const s = n.toFixed(2);
    return plus && n > 0 ? `+${s}%` : `${s}%`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className="alert-modal diagnose-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="diagnose-header">
          <h3>结构化研报 · {symbol}</h3>
          <div className="diagnose-header-actions">
            {report && (
              <button
                type="button"
                className="diag-icon-btn"
                title="复制研报"
                onClick={() => void copyReport()}
              >
                <span className="diag-copy-glyphs" aria-hidden>
                  ⧉
                </span>
                {copied ? "已复制" : "复制"}
              </button>
            )}
            <button
              type="button"
              className="diag-close-btn"
              aria-label="关闭"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </header>
        {loading && <p className="muted diagnose-skel">正在汇总多周期数据…</p>}
        {!loading && report && (
          <div className="diagnose-structured">
            <div className="diag-hero">
              <div className="diag-hero-body">
                <p className="diag-hero-situation">{report.situation}</p>
                <p className="diag-hero-basis muted">{report.bullBear}</p>
                <p className="diag-hero-advice">{report.advice}</p>
              </div>
              <div className="diag-score-badge tabular" title={report.health.label}>
                {report.health.score}
                <span className="diag-score-denom">/100</span>
              </div>
            </div>

            <div className="diag-dual-row">
              <div className="diag-surface-card">
                <h4 className="diag-card-title">关键点位</h4>
                {report.levels.resistance ? (
                  <p className="diag-level-line">
                    <span className="diag-level-label">上方阻力</span>
                    <span className="tabular pnl-up">
                      {report.levels.resistance.price.toFixed(2)}{" "}
                      {fmtPct(report.levels.resistance.pct, true)}
                    </span>
                  </p>
                ) : (
                  <p className="muted diag-level-empty">暂无上沿阻力</p>
                )}
                {report.levels.support ? (
                  <p className="diag-level-line">
                    <span className="diag-level-label">下方支撑</span>
                    <span className="tabular pnl-down">
                      {report.levels.support.price.toFixed(2)}{" "}
                      {fmtPct(report.levels.support.pct)}
                    </span>
                  </p>
                ) : (
                  <p className="muted diag-level-empty">暂无下沿支撑</p>
                )}
                {onDrawLevels &&
                  (report.supportPrice != null ||
                    report.resistancePrice != null) && (
                    <button
                      type="button"
                      className="diag-draw-full"
                      onClick={() =>
                        onDrawLevels(
                          report.supportPrice,
                          report.resistancePrice
                        )
                      }
                    >
                      一键画入主图
                    </button>
                  )}
              </div>

              <div className="diag-surface-card">
                <h4 className="diag-card-title">多周期共振</h4>
                <p className="diag-mtf-headline">{report.mtfHeadline}</p>
                <div className="diag-mtf-pills" aria-label="多周期方向">
                  {mtfPills.map(({ iv, trend }) => (
                    <span
                      key={iv}
                      className={`diag-mtf-pill${trend === "bull" ? " bull" : trend === "bear" ? " bear" : ""}`}
                    >
                      {iv} {mtfArrow(trend)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="diag-scenario-row">
              <div className="diag-scenario diag-scenario-up">
                <span className="diag-scenario-tag">多</span>
                <p>
                  放量站稳{" "}
                  <span className="tabular pnl-up">
                    {report.scenarioUp.toFixed(2)}
                  </span>{" "}
                  则顺势上看一格
                </p>
              </div>
              <div className="diag-scenario diag-scenario-down">
                <span className="diag-scenario-tag">防</span>
                <p>
                  跌破{" "}
                  <span className="tabular pnl-down">
                    {report.scenarioDown.toFixed(2)}
                  </span>{" "}
                  节奏转弱，控仓观望
                </p>
              </div>
            </div>

            <p className="diag-disclaimer">
              以上为技术面解读，非投资建议。
            </p>
          </div>
        )}
        {!loading && !report && (
          <p className="diagnose-text">{fallback ?? "K 线不足，无法生成研报。"}</p>
        )}
      </section>
    </div>
  );
}