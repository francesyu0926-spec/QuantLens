import { useCallback, useState } from "react";

const KEY = "quantlens-novice-assist";
const ONBOARD_KEY = "quantlens-novice-onboard-v1";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function loadOnboard(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === "1";
  } catch {
    return false;
  }
}

export function useNoviceAssist() {
  const [enabled, setEnabled] = useState(load);
  const [onboardingDone, setOnboardingDone] = useState(loadOnboard);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      const next = !on;
      try {
        const v = next ? "1" : "0";
        localStorage.setItem(KEY, v);
        void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
          syncUserDataKey(KEY, v)
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const setOn = useCallback((on: boolean) => {
    setEnabled(on);
    try {
      const v = on ? "1" : "0";
      localStorage.setItem(KEY, v);
      void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
        syncUserDataKey(KEY, v)
      );
    } catch {
      /* ignore */
    }
  }, []);

  const completeOnboarding = useCallback(() => {
    setOnboardingDone(true);
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
      void import("../utils/userDataSync").then(({ syncUserDataKey }) =>
        syncUserDataKey(ONBOARD_KEY, "1")
      );
    } catch {
      /* ignore */
    }
  }, []);

  return {
    noviceMode: enabled,
    toggleNovice: toggle,
    setNoviceMode: setOn,
    onboardingDone,
    completeOnboarding,
  };
}