import { useEffect, useState } from "react";

interface Props {
  targetSymbol: string;
  interval: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
  /** Show translucent loading mask over previous chart */
  visible: boolean;
  /** When stale chart is visible, avoid blocking center error card (use top banner). */
  suppressCenterError?: boolean;
}

export function ChartLoadOverlay({
  targetSymbol,
  interval,
  loading,
  error,
  onRetry,
  onCancel,
  visible,
  suppressCenterError = false,
}: Props) {
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    if (!visible || error || !loading) {
      setShowCancel(false);
      return;
    }
    const id = window.setTimeout(() => setShowCancel(true), 10_000);
    return () => clearTimeout(id);
  }, [visible, loading, error, targetSymbol]);

  if (!visible) return null;

  const showLoading = loading && !error;
  const showError = Boolean(error) && !loading && !suppressCenterError;

  return (
    <div
      className={`chart-overlay chart-overlay-grid${
        showLoading ? " overlay-dim" : ""
      }`}
    >
      {showLoading && (
        <div className="skeleton chart-skeleton">
          <div className="spinner-ring" aria-hidden />
          <div className="fake-bars" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} style={{ height: `${30 + (i % 5) * 12}%` }} />
            ))}
          </div>
          <p>
            正在加载 {targetSymbol} · {interval} …
          </p>
          {showCancel && (
            <button type="button" className="chip" onClick={onCancel}>
              取消并返回上一标的
            </button>
          )}
        </div>
      )}
      {showError && (
        <div className="load-error load-error-card">
          <div className="load-icon warn" aria-hidden>
            ⚠
          </div>
          <p className="err-title">行情拉取超时</p>
          <p className="err-detail muted">
            切换至 {targetSymbol} 失败，请检查网络或稍后重试。
          </p>
          <div className="error-actions">
            <button type="button" className="retry-btn" onClick={onRetry}>
              重新加载
            </button>
            <button type="button" className="chip" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}