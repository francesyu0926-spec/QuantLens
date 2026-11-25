import type { ChartLayoutMode, TimeInterval } from "../types/chart";

export const QUAD_INTERVALS_DEFAULT: TimeInterval[] = [
  "1m",
  "15m",
  "1h",
  "1d",
];

export function defaultDualSecondary(primary: TimeInterval): TimeInterval {
  if (primary === "1d" || primary === "4h") return "15m";
  if (primary === "1m" || primary === "5m") return "15m";
  return "1h";
}

export function paneIntervals(
  layout: ChartLayoutMode,
  primary: TimeInterval
): TimeInterval[] {
  if (layout === "single") return [primary];
  if (layout === "dual") return [primary, defaultDualSecondary(primary)];
  return [...QUAD_INTERVALS_DEFAULT];
}

export function resolveToolbarInterval(
  layout: ChartLayoutMode,
  activePane: number,
  primary: TimeInterval,
  dualIv: TimeInterval,
  quadIvs: TimeInterval[]
): TimeInterval {
  if (layout === "single") return primary;
  if (layout === "dual") return activePane === 1 ? dualIv : primary;
  return quadIvs[activePane] ?? primary;
}