import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { listUserThemes, saveTheme } from "@/services/tauri";
import {
  BUILTIN_THEMES,
  DARK,
  LIGHT,
  applyTheme,
  coerceTheme,
  themeToJson,
  type FontOverride,
  type Theme,
} from "@/theme/themes";

const LS_ID = "postcat-theme-id";
const LS_FONTS = "postcat-fonts";
const LS_SEEDED = "postcat-themes-seeded-1";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** "auto" follows the OS light/dark preference. */
export const AUTO_ID = "auto";

function prefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

export function useTheme() {
  const [userThemes, setUserThemes] = useState<Theme[]>([]);
  const [currentId, setCurrentId] = useState<string>(
    () => localStorage.getItem(LS_ID) || DARK.id,
  );
  const [fonts, setFontsState] = useState<FontOverride>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_FONTS) || "{}") as FontOverride;
    } catch {
      return {};
    }
  });

  // Built-in ids seeded to disk take their file version (so user edits win),
  // but keep their built-in label instead of showing up as "custom".
  const themes = useMemo(() => {
    const builtinIds = new Set(BUILTIN_THEMES.map((t) => t.id));
    const byId = new Map<string, Theme>();
    for (const t of BUILTIN_THEMES) byId.set(t.id, t);
    for (const t of userThemes) {
      byId.set(t.id, builtinIds.has(t.id) ? { ...t, __source: "builtin" } : t);
    }
    return [...byId.values()];
  }, [userThemes]);

  const resolveTheme = useCallback(
    (id: string): Theme => {
      if (id === AUTO_ID) return prefersDark() ? DARK : LIGHT;
      return themes.find((t) => t.id === id) ?? DARK;
    },
    [themes],
  );

  // apply on any change to selection / fonts / available themes
  useEffect(() => {
    applyTheme(resolveTheme(currentId), fonts);
  }, [currentId, fonts, resolveTheme]);

  // follow OS scheme changes while in auto mode
  useEffect(() => {
    if (currentId !== AUTO_ID) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(resolveTheme(AUTO_ID), fonts);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [currentId, fonts, resolveTheme]);

  const loadUserThemes = useCallback(async (): Promise<Theme[]> => {
    try {
      const raw = await listUserThemes();
      const parsed: Theme[] = [];
      raw.forEach((r, i) => {
        const file = (r as { __file?: string }).__file ?? `theme-${i}.json`;
        const t = coerceTheme(r, file);
        if (t) parsed.push(t);
      });
      return parsed;
    } catch {
      return []; // running outside Tauri — no user themes
    }
  }, []);

  const reloadThemes = useCallback(async () => {
    setUserThemes(await loadUserThemes());
  }, [loadUserThemes]);

  // initial load: seed the built-in themes to disk (once), then load from disk;
  // + live re-scan when the themes folder changes
  useEffect(() => {
    (async () => {
      let loaded = await loadUserThemes();
      if (inTauri && !localStorage.getItem(LS_SEEDED)) {
        const have = new Set(loaded.map((t) => t.id));
        for (const t of BUILTIN_THEMES) {
          if (!have.has(t.id)) {
            await saveTheme(t.id, themeToJson(t)).catch(() => {});
          }
        }
        loaded = await loadUserThemes();
        // only mark as seeded once the defaults are actually on disk, so a
        // failed write is retried next launch (and deletions later stick)
        const onDisk = new Set(loaded.map((t) => t.id));
        if (BUILTIN_THEMES.every((t) => onDisk.has(t.id))) {
          try {
            localStorage.setItem(LS_SEEDED, "1");
          } catch {
            /* private mode */
          }
        }
      }
      setUserThemes(loaded);
    })();

    let unlisten: (() => void) | undefined;
    listen("themes-changed", () => reloadThemes())
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  }, [loadUserThemes, reloadThemes]);

  const setCurrent = useCallback((id: string) => {
    setCurrentId(id);
    localStorage.setItem(LS_ID, id);
  }, []);

  const setFonts = useCallback((f: FontOverride) => {
    setFontsState(f);
    localStorage.setItem(LS_FONTS, JSON.stringify(f));
  }, []);

  const resolved = resolveTheme(currentId);
  const isDark = resolved.type === "dark";
  const toggleDark = useCallback(
    () => setCurrent(isDark ? LIGHT.id : DARK.id),
    [isDark, setCurrent],
  );

  return {
    themes,
    currentId,
    setCurrent,
    resolved,
    isDark,
    toggleDark,
    fonts,
    setFonts,
    reloadThemes,
  };
}
