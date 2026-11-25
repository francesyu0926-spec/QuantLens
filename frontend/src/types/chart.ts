export type TimeInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const INTERVALS: TimeInterval[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

export interface ChartDisplayOptions {
  showEma: boolean;
  showBoll: boolean;
  showVolume: boolean;
  subChart: "macd" | "rsi";
}

export const DEFAULT_CHART_OPTIONS: ChartDisplayOptions = {
  showEma: true,
  showBoll: true,
  showVolume: true,
  subChart: "macd",
};