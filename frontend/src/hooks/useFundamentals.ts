import { useEffect, useState } from "react";
import { A_SHARE_ONLY } from "../config/market";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8765";

export interface FundamentalsSnapshot {
  ok: boolean;
  symbol: string;
  name?: string;
  industry?: string;
  market_cap?: number | null;
  pe_ttm?: number | null;
  pb?: number | null;
  listing_date?: string;
  warnings?: string[];
  reason?: string;
  is_etf?: boolean;
  source?: string;
}

export interface CapitalFlowSnapshot {
  ok: boolean;
  symbol: string;
  main_net_inflow?: number | null;
  main_net_pct?: number | null;
  flow_score?: number;
  date?: string;
  reason?: string;
}

export function useFundamentals(symbol: string, enabled = true) {
  const [fundamentals, setFundamentals] = useState<FundamentalsSnapshot | null>(
    null
  );
  const [flow, setFlow] = useState<CapitalFlowSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !A_SHARE_ONLY || !/^\d{6}$/.test(symbol)) {
      setFundamentals(null);
      setFlow(null);
      return;
    }
    let cancelled = false;
    const fetchJson = async <T,>(path: string, ms = 12_000): Promise<T> => {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), ms);
      try {
        const res = await fetch(path, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    };

    const load = async () => {
      setLoading(true);
      setFundamentals(null);
      try {
        const fJson = await fetchJson<FundamentalsSnapshot>(
          `${API}/fundamentals?symbol=${encodeURIComponent(symbol)}`
        );
        if (!cancelled) {
          setFundamentals(fJson);
          setLoading(false);
        }
        void fetchJson<CapitalFlowSnapshot>(
          `${API}/capital_flow?symbol=${encodeURIComponent(symbol)}`,
          15_000
        )
          .then((cJson) => {
            if (!cancelled) setFlow(cJson);
          })
          .catch(() => {
            if (!cancelled) {
              setFlow({ ok: false, symbol, reason: "fetch_failed" });
            }
          });
      } catch {
        if (!cancelled) {
          setFundamentals({ ok: false, symbol, reason: "fetch_failed" });
          setLoading(false);
        }
      }
    };
    void load();
    const id = window.setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, enabled]);

  return { fundamentals, flow, loading };
}