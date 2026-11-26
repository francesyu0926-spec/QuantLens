import { useEffect, useState } from "react";

export interface AlertRules {
  emaCross: boolean;
  rsiOversold: boolean;
  rsiOverbought: boolean;
  bbLower: boolean;
  bbUpper: boolean;
  soundEnabled: boolean;
  webhookUrl: string;
  webhookEnabled: boolean;
}

const STORAGE_KEY = "quantlens-alert-rules";

export const DEFAULT_ALERT_RULES: AlertRules = {
  emaCross: true,
  rsiOversold: true,
  rsiOverbought: false,
  bbLower: true,
  bbUpper: false,
  soundEnabled: true,
  webhookUrl: "",
  webhookEnabled: false,
};

export function useAlertRules() {
  const [rules, setRules] = useState<AlertRules>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_ALERT_RULES, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return DEFAULT_ALERT_RULES;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
      syncUserDataKey(STORAGE_KEY, rules)
    );
  }, [rules]);

  return { rules, setRules };
}