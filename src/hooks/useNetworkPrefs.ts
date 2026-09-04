import { useCallback, useState } from "react";

/** Network preferences (Settings → Network), persisted in localStorage. */
export interface NetworkPrefs {
  /** per-request timeout, milliseconds */
  timeoutMs: number;
  /** responses above this size are rejected (MB) */
  maxResponseMb: number;
  verifySsl: boolean;
  followRedirects: boolean;
  httpVersion: "auto" | "http1" | "http2";
  disableCookies: boolean;
}

export const DEFAULT_NETWORK: NetworkPrefs = {
  timeoutMs: 30_000,
  maxResponseMb: 50,
  verifySsl: true,
  followRedirects: true,
  httpVersion: "auto",
  disableCookies: false,
};

const LS_KEY = "postcat-network";

/** Read the stored preferences (merged over defaults). Safe outside React. */
export function loadNetworkPrefs(): NetworkPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_NETWORK;
    return { ...DEFAULT_NETWORK, ...(JSON.parse(raw) as Partial<NetworkPrefs>) };
  } catch {
    return DEFAULT_NETWORK;
  }
}

export function useNetworkPrefs(): [NetworkPrefs, (patch: Partial<NetworkPrefs>) => void, () => void] {
  const [prefs, setPrefs] = useState<NetworkPrefs>(loadNetworkPrefs);

  const persist = (next: NetworkPrefs) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const patch = useCallback((p: Partial<NetworkPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setPrefs(DEFAULT_NETWORK);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  return [prefs, patch, reset];
}
