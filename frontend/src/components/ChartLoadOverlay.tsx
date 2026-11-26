import { useEffect, useState } from "react";

const IV_LABEL: Record<string, string> = {
  "1m": "1 分钟",
  "5m": "5 分钟",
  "15m": "15 分钟",
  "1h": "1 小时",
  "4h": "4 小时",
  "1d": "日线",
};

function intervalLabel(iv: string): string {
  return IV_LABEL[iv] ?? iv;
}

interface Props {
  targetSymbol: string;
  targetName?: string;
  interval: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
  visible: boolean;
}

export function ChartLoadOverlay({
  targetSymbol,
  targetName,
  interval,
  loading,
  error,
  onRetry,
  onCancel,
  visible,
}: Props) {
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    if (!visible || error || !loading) {
      setShowCancel(false);
      return;
    }
    const id = window.setTimeout(() => setShowCancel(true), 3000);
    return () => clearTimeout(id);
  }, [visible, loading, error, targetSymbol]);

  if (!visible) return null;

  const showLoading = loading && !error;
  const showError = Boolean(error) && !loading;
  const displayName = targetName?.trim() || targetSymbol;
  const ivText = intervalLabel(interval);

  return (
    <div className="chart-overlay chart-overlay-load">
      {showLoading && (
        <div className="chart-load-card" role="status" aria-live="polite">
          <div className="spinner-ring" aria-hidden />
          <p className="chart-load-title">正在拉取行情</p>
          <p className="chart-load-detail muted">
            {displayName}（{targetSymbol}）· {ivText}
          </p>
          {showCancel && (
            <button
              type="button"
              className="chart-load-cancel"
              onClick={onCancel}
            >
              返回上一标的
            </button>
          )}
        </div>
      )}
      {showError && (
        <div className="chart-load-card chart-load-card--error load-error">
          <div className="load-icon warn" aria-hidden>
            ⚠
          </div>
          <p className="err-title">行情拉取超时</p>
          <p className="err-detail muted">
            切换至 {displayName}（{targetSymbol}）失败，请检查网络或稍后重试。
          </p>
          <div className="error-actions">
            <button type="button" className="retry-btn" onClick={onRetry}>
              重新加载
            </button>
            <button
              type="button"
              className="chart-load-cancel"
              onClick={onCancel}
            >
              返回上一标的
            </button>
          </div>
        </div>
      )}
    </div>
  );
}