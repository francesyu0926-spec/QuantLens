interface Props {
  symbol: string;
  interval: string;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  onRetry: () => void;
}

export function ChartLoadOverlay({
  symbol,
  interval,
  loading,
  error,
  hasData,
  onRetry,
}: Props) {
  if (hasData) return null;
  if (!loading && !error) return null;
  return (
    <div className="chart-overlay">
      {loading && !error && (
        <div className="skeleton">
          <div className="sk-line" />
          <div className="sk-line short" />
          <p>正在加载 {symbol} · {interval} 行情…</p>
        </div>
      )}
      {error && (
        <div className="load-error">
          <p>{error}</p>
          <button type="button" className="chip on" onClick={onRetry}>
            点击重试
          </button>
        </div>
      )}
    </div>
  );
}