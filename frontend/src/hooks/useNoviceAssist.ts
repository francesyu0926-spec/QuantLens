import { useCallback, useState } from "react";

const KEY = "quantlens-novice-assist";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useNoviceAssist() {
  const [enabled, setEnabled] = useState(load);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      try {
        localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setOn = useCallback((on: boolean) => {
    setEnabled(on);
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  return { noviceMode: enabled, toggleNovice: toggle, setNoviceMode: setOn };
}