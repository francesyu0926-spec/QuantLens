interface Props {
  mode: "loading" | "error";
  interval: string;
  detail?: string;
  onRetry?: () => void;
}

export function ChartPaneState({
  mode,
  interval,
  detail,
  onRetry,
}: Props) {
  if (mode === "loading") {
    return (
      <div className="chart-pane-state chart-pane-state--load" role="status">
        <div className="chart-pane-skel" aria-hidden>
          <span className="chart-pane-skel-bar" />
          <span className="chart-pane-skel-bar short" />
          <span className="chart-pane-skel-line" />
        </div>
        <div className="chart-pane-state-core">
          <span className="chart-pane-spinner" aria-hidden />
          <p className="chart-pane-state-msg">
            加载 <strong className="chart-pane-iv-em">{interval}</strong> …
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-pane-state chart-pane-state--error" role="alert">
      <div className="chart-pane-state-core">
        <span className="chart-pane-warn" aria-hidden>
          ▲
        </span>
        <p className="chart-pane-state-title">行情加载失败</p>
        <p className="chart-pane-state-detail muted">
          {detail ?? "网络超时"}
        </p>
        {onRetry && (
          <button
            type="button"
            className="chart-pane-retry"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
}