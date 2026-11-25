import type { ChartDisplayOptions, TimeInterval } from "../types/chart";
import { INTERVALS } from "../types/chart";

interface Props {
  interval: TimeInterval;
  onInterval: (v: TimeInterval) => void;
  options: ChartDisplayOptions;
  onOptions: (v: ChartDisplayOptions) => void;
}

function Toggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`chip ${on ? "on" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ChartToolbar({ interval, onInterval, options, onOptions }: Props) {
  return (
    <div className="chart-toolbar">
      <div className="interval-group">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            type="button"
            className={`chip ${interval === iv ? "on" : ""}`}
            onClick={() => onInterval(iv)}
          >
            {iv}
          </button>
        ))}
      </div>

      <div className="toggle-group">
        <Toggle
          label="EMA"
          on={options.showEma}
          onClick={() => onOptions({ ...options, showEma: !options.showEma })}
        />
        <Toggle
          label="BOLL"
          on={options.showBoll}
          onClick={() => onOptions({ ...options, showBoll: !options.showBoll })}
        />
        <Toggle
          label="VOL"
          on={options.showVolume}
          onClick={() =>
            onOptions({ ...options, showVolume: !options.showVolume })
          }
        />
        <Toggle
          label="MACD"
          on={options.subChart === "macd"}
          onClick={() => onOptions({ ...options, subChart: "macd" })}
        />
        <Toggle
          label="RSI"
          on={options.subChart === "rsi"}
          onClick={() => onOptions({ ...options, subChart: "rsi" })}
        />
      </div>
    </div>
  );
}