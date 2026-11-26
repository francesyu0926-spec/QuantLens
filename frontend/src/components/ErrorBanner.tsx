interface Props {
  title: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ErrorBanner({ title, onRetry, onDismiss }: Props) {
  return (
    <div className="error-banner error-banner--strip" role="alert">
      <span className="error-banner-ico" aria-hidden>
        ⚠
      </span>
      <p className="error-banner-text">{title}</p>
      <button
        type="button"
        className="error-banner-retry"
        onClick={onRetry}
      >
        重新加载
      </button>
      <button
        type="button"
        className="error-banner-close"
        aria-label="关闭"
        title="关闭"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}