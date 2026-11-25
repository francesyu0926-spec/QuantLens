export type TimeInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export type ChartLayoutMode = "single" | "dual" | "quad";

export const CHART_LAYOUTS: { id: ChartLayoutMode; label: string; icon: string }[] =
  [
    { id: "single", label: "单图", icon: "▢" },
    { id: "dual", label: "双图", icon: "▯▯" },
    { id: "quad", label: "四图", icon: "▦" },
  ];

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
  showVolumeProfile: boolean;
  subChart: "macd" | "rsi";
}

export const DEFAULT_CHART_OPTIONS: ChartDisplayOptions = {
  showEma: true,
  showBoll: true,
  showVolume: true,
  showVolumeProfile: false,
  subChart: "macd",
};