import { useEffect, useRef, useState } from "react";
import { isTauri } from "../utils/nativeBridge";

const CODE_RE = /\b([036]\d{5})\b/;

interface Props {
  onOpen: (symbol: string) => void;
}

export function ClipboardSymbolToast({ onOpen }: Props) {
  const [hint, setHint] = useState<string | null>(null);
  const last = useRef("");

  useEffect(() => {
    if (!isTauri()) return;
    const tick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const m = text.match(CODE_RE);
        if (!m) return;
        const code = m[1];
        if (code === last.current) return;
        last.current = code;
        setHint(code);
        window.setTimeout(() => setHint(null), 12_000);
      } catch {
        /* permission */
      }
    };
    const id = window.setInterval(tick, 2500);
    return () => clearInterval(id);
  }, []);

  if (!hint) return null;
  return (
    <div className="clip-toast" role="status">
      <span>检测到代码 {hint}</span>
      <button type="button" className="chip" onClick={() => onOpen(hint)}>
        打开
      </button>
      <button
        type="button"
        className="chip clip-toast-dismiss"
        onClick={() => setHint(null)}
      >
        ×
      </button>
    </div>
  );
}