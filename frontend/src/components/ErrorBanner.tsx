interface Props {
  title: string;
  detail?: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ErrorBanner({ title, detail, onRetry, onDismiss }: Props) {
  return (
    <div className="error-banner" role="alert">
      <div>
        <strong>{title}</strong>
        {detail && <p className="banner-detail">{detail}</p>}
      </div>
      <div className="banner-actions">
        <button type="button" className="retry-btn" onClick={onRetry}>
          重新加载
        </button>
        <button type="button" className="chip" onClick={onDismiss}>
          关闭
        </button>
      </div>
    </div>
  );
}