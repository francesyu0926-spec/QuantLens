import { useEffect, useRef, useState } from "react";
import type { AlertRules } from "../hooks/useAlertRules";
import {
  PRICE_COLOR_MODE_LABEL,
  type PriceColorMode,
} from "../utils/priceColors";
import {
  downloadUserDataBackup,
  restoreUserDataFromFile,
} from "../utils/userDataBackup";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

function downloadCsv(path: string, filename: string) {
  const a = document.createElement("a");
  a.href = `${API}${path}`;
  a.download = filename;
  a.rel = "noopener";
  a.click();
}

const PRICE_MODE_SHORT: Record<PriceColorMode, string> = {
  auto: "自动",
  cn_red_up: "红涨绿跌",
  intl_green_up: "绿涨红跌",
};

interface Props {
  open: boolean;
  rules: AlertRules;
  onChange: (r: AlertRules) => void;
  onClose: () => void;
  priceColorMode: PriceColorMode;
  onPriceColorMode: (m: PriceColorMode) => void;
  onDataRestored?: () => void;
}

function M3Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-switch-row">
      <span className="settings-switch-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`m3-switch${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

async function testWebhook(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/webhook/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        title: "QuantLens 测试",
        text: "Webhook 连通性测试",
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export function AlertSettings({
  open,
  rules,
  onChange,
  onClose,
  priceColorMode,
  onPriceColorMode,
  onDataRestored,
}: Props) {
  const [testState, setTestState] = useState<"idle" | "ok" | "fail">("idle");
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const runWebhookTest = async () => {
    const url = rules.webhookUrl.trim();
    if (!url) {
      setTestState("fail");
      return;
    }
    setTestState("idle");
    const ok = await testWebhook(url);
    setTestState(ok ? "ok" : "fail");
    window.setTimeout(() => setTestState("idle"), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className="alert-modal settings-modal"
        onClick={(e) => e.stopPropagation()}
        aria-label="系统设置"
      >
        <header className="settings-modal-header">
          <h3 className="settings-modal-title">系统设置</h3>
          <button
            type="button"
            className="settings-close-btn"
            aria-label="关闭"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="settings-card">
          <h4 className="settings-card-title">外观与显示</h4>
          <p className="settings-card-hint muted">涨跌配色</p>
          <div
            className="settings-color-segment"
            role="radiogroup"
            aria-label="涨跌配色"
          >
            {(Object.keys(PRICE_COLOR_MODE_LABEL) as PriceColorMode[]).map(
              (key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={priceColorMode === key}
                  title={PRICE_COLOR_MODE_LABEL[key]}
                  className={`settings-segment-btn${
                    priceColorMode === key ? " on" : ""
                  }`}
                  onClick={() => onPriceColorMode(key)}
                >
                  {PRICE_MODE_SHORT[key]}
                </button>
              )
            )}
          </div>
        </div>

        <div className="settings-card">
          <h4 className="settings-card-title">策略预警条件</h4>
          <div className="settings-rule-grid">
            <M3Switch
              label="EMA 金叉 / 死叉"
              checked={rules.emaCross}
              onChange={(v) => onChange({ ...rules, emaCross: v })}
            />
            <M3Switch
              label="RSI(14) < 30 超卖"
              checked={rules.rsiOversold}
              onChange={(v) => onChange({ ...rules, rsiOversold: v })}
            />
            <M3Switch
              label="RSI(14) > 70 超买"
              checked={rules.rsiOverbought}
              onChange={(v) => onChange({ ...rules, rsiOverbought: v })}
            />
            <M3Switch
              label="跌破布林下轨"
              checked={rules.bbLower}
              onChange={(v) => onChange({ ...rules, bbLower: v })}
            />
            <M3Switch
              label="突破布林上轨"
              checked={rules.bbUpper}
              onChange={(v) => onChange({ ...rules, bbUpper: v })}
            />
          </div>
        </div>

        <div className="settings-card">
          <h4 className="settings-card-title">数据备份</h4>
          <p className="settings-card-hint muted">
            导出/恢复自选、模拟持仓、复盘笔记、画线与预警配置（JSON）
          </p>
          <div className="settings-backup-actions">
            <button
              type="button"
              className="chip"
              onClick={() => {
                downloadUserDataBackup();
                setBackupMsg("已下载备份文件");
                window.setTimeout(() => setBackupMsg(null), 2500);
              }}
            >
              导出全部数据
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => importRef.current?.click()}
            >
              从备份恢复
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="settings-backup-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void restoreUserDataFromFile(file).then((res) => {
                  if (res.ok) {
                    setBackupMsg("恢复成功，正在刷新…");
                    onDataRestored?.();
                    window.setTimeout(() => window.location.reload(), 400);
                  } else {
                    setBackupMsg(res.message);
                    window.setTimeout(() => setBackupMsg(null), 3500);
                  }
                });
              }}
            />
          </div>
          {backupMsg && (
            <p className="settings-card-hint muted">{backupMsg}</p>
          )}
          <div className="settings-backup-actions">
            <button
              type="button"
              className="chip"
              onClick={() => downloadCsv("/export/trades.csv", "quantlens-trades.csv")}
            >
              导出模拟成交 CSV
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                downloadCsv("/export/journal.csv", "quantlens-journal.csv")
              }
            >
              导出复盘笔记 CSV
            </button>
          </div>
          <p className="settings-card-hint muted">
            SQLite 已同步的数据可在其他设备通过「从备份恢复」或自动拉取对齐
          </p>
        </div>

        <div className="settings-card">
          <h4 className="settings-card-title">通知与推送</h4>
          <M3Switch
            label="触发时播放提示音"
            checked={rules.soundEnabled}
            onChange={(v) => onChange({ ...rules, soundEnabled: v })}
          />
          <M3Switch
            label="推送到 Webhook"
            checked={rules.webhookEnabled}
            onChange={(v) => onChange({ ...rules, webhookEnabled: v })}
          />
          {rules.webhookEnabled && (
            <div className="settings-webhook-block">
              <label className="settings-webhook-field">
                <span className="settings-card-hint muted">Webhook URL</span>
                <div className="settings-webhook-input-wrap">
                  <input
                    type="url"
                    className="settings-webhook-input"
                    placeholder="https://..."
                    value={rules.webhookUrl}
                    onChange={(e) => {
                      setTestState("idle");
                      onChange({ ...rules, webhookUrl: e.target.value });
                    }}
                  />
                  <button
                    type="button"
                    className="settings-webhook-test"
                    onClick={() => void runWebhookTest()}
                  >
                    {testState === "ok"
                      ? "已发送"
                      : testState === "fail"
                        ? "失败"
                        : "测试"}
                  </button>
                </div>
              </label>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}