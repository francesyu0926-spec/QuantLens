import { useEffect, useMemo, useState } from "react";
import {
  type PriceColorMode,
  type PriceColors,
  resolvePriceColors,
} from "../utils/priceColors";

const STORAGE_KEY = "quantlens-price-color-mode";

export function usePriceColorScheme(symbol: string) {
  const [mode, setMode] = useState<PriceColorMode>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (
        raw === "auto" ||
        raw === "cn_red_up" ||
        raw === "intl_green_up"
      ) {
        return raw;
      }
    } catch {
      /* ignore */
    }
    return "auto";
  });

  const colors = useMemo(
    (): PriceColors => resolvePriceColors(mode, symbol),
    [mode, symbol]
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
      syncUserDataKey(STORAGE_KEY, mode)
    );
  }, [mode]);

  return { mode, setMode, colors };
}