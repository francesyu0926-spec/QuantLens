export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function nativeNotify(
  title: string,
  body: string,
  symbol?: string
): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("notify_signal", { title, body, symbol: symbol ?? "" });
  } catch {
    /* ignore */
  }
}

export async function toggleMiniTicker(show?: boolean): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toggle_mini_ticker", { show: show ?? true });
  } catch {
    /* ignore */
  }
}

export async function focusMainChart(symbol?: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("focus_main_window", { symbol: symbol ?? "" });
  } catch {
    /* ignore */
  }
}

export async function updateTrayQuotes(tooltip: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_tray_tooltip", { tooltip });
  } catch {
    /* ignore */
  }
}

export async function openSignalsWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_signals_window");
  } catch {
    /* ignore */
  }
}