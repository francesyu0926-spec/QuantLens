import { useMemo, useState } from "react";
import type { TimeInterval } from "../types/chart";
import { useTradingJournal } from "../hooks/useTradingJournal";

const QUICK_TAGS = ["开仓", "平仓", "观察"] as const;

const JOURNAL_MAX = 200;

interface Props {
  symbol: string;
  interval: TimeInterval;
  price: number;
  extraTags?: string[];
  onDailyReview?: () => void;
}

export function TradingJournalPanel({
  symbol,
  interval,
  price,
  extraTags = [],
  onDailyReview,
}: Props) {
  const { entries, addEntry, removeEntry } = useTradingJournal();
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const countLabel = `${entries.length}/${JOURNAL_MAX}`;

  const recent = useMemo(
    () => [...entries].sort((a, b) => b.ts - a.ts).slice(0, 15),
    [entries]
  );

  const toggleTag = (tag: string) => {
    setPicked((prev) => (prev === tag ? null : tag));
  };

  const save = () => {
    const text = note.trim();
    const tags = picked ? [picked, ...extraTags] : [...extraTags];
    if (!text && tags.length === 0) return;
    addEntry({
      symbol,
      interval,
      price,
      note: text || (picked ?? ""),
      tags,
    });
    setNote("");
    setPicked(null);
  };

  return (
    <section className="dock-panel journal-panel">
      <header className="journal-title-row">
        <h2 className="journal-title">复盘笔记</h2>
        <div className="journal-title-actions">
          {onDailyReview && (
            <button
              type="button"
              className="journal-chip"
              title="生成今日复盘 Markdown"
              onClick={onDailyReview}
            >
              日复盘
            </button>
          )}
          <span className="journal-storage muted">本地已存 {countLabel}</span>
        </div>
      </header>

      <div className="journal-quick" role="group" aria-label="快捷标签">
        {QUICK_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`journal-chip${picked === tag ? " on" : ""}`}
            onClick={() => toggleTag(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      <textarea
        className="journal-textarea"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="输入交易依据或盘面备注…"
        rows={3}
      />

      <button type="button" className="journal-save" onClick={save}>
        保存记录
      </button>

      <div className="journal-divider" aria-hidden />

      {recent.length === 0 ? (
        <p className="journal-empty-line muted">暂无历史记录</p>
      ) : (
        <ul className="journal-timeline">
          {recent.map((e) => (
            <li key={e.id} className="journal-card">
              <div className="journal-card-top">
                <span className="journal-badge">
                  {e.symbol} · {e.interval}
                </span>
                <span className="journal-card-px tabular">
                  @{e.price.toFixed(2)}
                </span>
                <time className="journal-card-time tabular">
                  {new Date(e.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <button
                  type="button"
                  className="journal-del"
                  title="删除"
                  onClick={() => removeEntry(e.id)}
                >
                  ×
                </button>
              </div>
              <p className="journal-card-note">{e.note}</p>
              {e.tags.length > 0 && (
                <div className="journal-card-tags">
                  {e.tags.map((t) => (
                    <span key={`${e.id}-${t}`} className="assist-chip">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}