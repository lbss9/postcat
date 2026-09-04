import { useCallback, useState } from "react";

/**
 * A boolean preference persisted in localStorage.
 *
 * Used for the editor word-wrap toggles: one key per area (response, scripts,
 * raw body), so each area remembers its own setting and new editors of that
 * area start with it.
 */
export function usePersistedBool(key: string, initial = false): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : raw === "1";
    } catch {
      return initial;
    }
  });

  const toggle = useCallback(() => {
    setValue((v) => {
      const next = !v;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, [key]);

  return [value, toggle];
}

export const WRAP_KEYS = {
  response: "postcat-wrap-response",
  scripts: "postcat-wrap-scripts",
  raw: "postcat-wrap-raw",
} as const;
