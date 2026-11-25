import type { AlertRules } from "../hooks/useAlertRules";

interface Props {
  open: boolean;
  rules: AlertRules;
  onChange: (r: AlertRules) => void;
  onClose: () => void;
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="alert-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function AlertSettings({ open, rules, onChange, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section
        className="alert-modal"
        onClick={(e) => e.stopPropagation()}
        aria-label="预警规则"
      >
        <header>
          <h3>预警规则</h3>
          <button type="button" className="chip" onClick={onClose}>
            关闭
          </button>
        </header>
        <ToggleRow
          label="EMA 金叉 / 死叉"
          checked={rules.emaCross}
          onChange={(v) => onChange({ ...rules, emaCross: v })}
        />
        <ToggleRow
          label="RSI(14) < 30 超卖"
          checked={rules.rsiOversold}
          onChange={(v) => onChange({ ...rules, rsiOversold: v })}
        />
        <ToggleRow
          label="RSI(14) > 70 超买"
          checked={rules.rsiOverbought}
          onChange={(v) => onChange({ ...rules, rsiOverbought: v })}
        />
        <ToggleRow
          label="跌破布林下轨"
          checked={rules.bbLower}
          onChange={(v) => onChange({ ...rules, bbLower: v })}
        />
        <ToggleRow
          label="突破布林上轨"
          checked={rules.bbUpper}
          onChange={(v) => onChange({ ...rules, bbUpper: v })}
        />
        <ToggleRow
          label="触发时播放提示音"
          checked={rules.soundEnabled}
          onChange={(v) => onChange({ ...rules, soundEnabled: v })}
        />
        <ToggleRow
          label="推送到 Webhook（Server酱 / 飞书 / 钉钉等）"
          checked={rules.webhookEnabled}
          onChange={(v) => onChange({ ...rules, webhookEnabled: v })}
        />
        <label className="alert-row">
          <span>Webhook URL</span>
          <input
            type="url"
            className="webhook-input"
            placeholder="https://..."
            value={rules.webhookUrl}
            onChange={(e) => onChange({ ...rules, webhookUrl: e.target.value })}
          />
        </label>
      </section>
    </div>
  );
}