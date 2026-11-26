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
    const load = async () => {
      setLoading(true);
      try {
        const [fRes, cRes] = await Promise.all([
          fetch(`${API}/fundamentals?symbol=${encodeURIComponent(symbol)}`),
          fetch(`${API}/capital_flow?symbol=${encodeURIComponent(symbol)}`),
        ]);
        const fJson = (await fRes.json()) as FundamentalsSnapshot;
        const cJson = (await cRes.json()) as CapitalFlowSnapshot;
        if (!cancelled) {
          setFundamentals(fJson);
          setFlow(cJson);
        }
      } catch {
        if (!cancelled) {
          setFundamentals({ ok: false, symbol, reason: "fetch_failed" });
          setFlow({ ok: false, symbol, reason: "fetch_failed" });
        }
      } finally {
        if (!cancelled) setLoading(false);
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