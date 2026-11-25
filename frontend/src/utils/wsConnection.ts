/** WebSocket connection FSM — keep in sync with useMarketWebSocket */

export type WsPhase =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export const WS_CONNECT_TIMEOUT_MS = 10_000;
export const WS_IDLE_BEFORE_PING_MS = 15_000;
export const WS_PONG_WAIT_MS = 5_000;
export const WS_WATCHDOG_TICK_MS = 5_000;
export const WS_MAX_RECONNECT_ATTEMPTS = 8;

/** Delay = min(Base × 2^attempt, Max) + jitter(0..1000ms) */
export function backoffDelayMs(attempt: number): number {
  const base = 1_000;
  const max = 30_000;
  const exp = Math.min(base * 2 ** Math.max(0, attempt), max);
  const jitter = Math.floor(Math.random() * 1_001);
  return exp + jitter;
}