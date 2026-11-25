import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ChartErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ChartErrorBoundary", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="chart-fallback">
          <p>图表渲染失败：{this.state.message}</p>
          <button
            type="button"
            className="chip on"
            onClick={() => {
              this.setState({ hasError: false, message: "" });
              this.props.onRetry?.();
            }}
          >
            重新加载图表
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}