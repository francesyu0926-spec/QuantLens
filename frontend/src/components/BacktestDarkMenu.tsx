import { useEffect, useRef, useState } from "react";

export interface DarkMenuOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: DarkMenuOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  triggerLabel?: string;
  ariaLabel?: string;
}

export function BacktestDarkMenu<T extends string>({
  value,
  options,
  onChange,
  className = "",
  triggerLabel,
  ariaLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`bt-menu${className ? ` ${className}` : ""}`} ref={wrapRef}>
      <button
        type="button"
        className="bt-menu-trigger"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="bt-menu-trigger-text">
          {triggerLabel ?? current?.label ?? "选择"}
        </span>
        <span className="bt-menu-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="bt-menu-drop" role="listbox" onWheel={(e) => e.stopPropagation()}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`bt-menu-item${opt.value === value ? " is-on" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.value === value ? (
                <span className="bt-menu-check" aria-hidden>
                  ✓
                </span>
              ) : (
                <span className="bt-menu-check ph" aria-hidden />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}