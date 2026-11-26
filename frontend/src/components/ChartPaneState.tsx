interface Props {
  mode: "loading" | "error";
  interval: string;
  detail?: string;
  onRetry?: () => void;
  /** 全局横幅已展示时不再显示窗格内重试 */
  suppressRetry?: boolean;
}

export function ChartPaneState({
  mode,
  interval,
  detail,
  onRetry,
  suppressRetry = false,
}: Props) {
  if (mode === "loading") {
    return (
      <div className="chart-pane-state chart-pane-state--load" role="status">
        <div className="chart-pane-load-hud">
          <span className="chart-pane-load-ring" aria-hidden />
          <p className="chart-pane-state-msg">
            加载 <strong className="chart-pane-iv-em">{interval}</strong>
          </p>
        </div>
      </div>
    );
  }

  const showRetry = Boolean(onRetry) && !suppressRetry;
  const subtext =
    detail ??
    (suppressRetry ? "数据源超时" : "数据源繁忙，请稍后再试");

  return (
    <div className="chart-pane-state chart-pane-state--error" role="alert">
      <div className="chart-pane-fail-hud">
        <span className="chart-pane-error-ico" aria-hidden />
        <p className="chart-pane-state-title">⚠ 加载失败</p>
        <p className="chart-pane-state-detail">{subtext}</p>
        {showRetry && (
          <button
            type="button"
            className="chart-pane-retry chart-pane-retry--ghost"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.();
            }}
          >
            <span className="chart-pane-retry-ico" aria-hidden>
              ⟳
            </span>
            重试
          </button>
        )}
      </div>
    </div>
  );
}