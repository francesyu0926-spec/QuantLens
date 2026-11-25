import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

interface Props {
  symbol: string;
  interval: string;
  onClose: () => void;
}

export function AiDiagnoseModal({ symbol, interval, onClose }: Props) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API}/diagnose?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`
        );
        const data = await res.json();
        if (!cancelled) setText(data.text ?? "暂无诊断结果");
      } catch {
        if (!cancelled) setText("诊断请求失败，请确认后端已启动。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className="alert-modal diagnose-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h3>AI 诊断 · {symbol}</h3>
          <button type="button" className="chip" onClick={onClose}>
            关闭
          </button>
        </header>
        {loading && <p className="muted">生成中…</p>}
        {!loading && <p className="diagnose-text">{text}</p>}
      </section>
    </div>
  );
}