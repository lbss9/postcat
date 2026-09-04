import { ask } from "@tauri-apps/plugin-dialog";

const inTauri = () => "__TAURI_INTERNALS__" in window;

/**
 * Yes/no confirmation. Uses the native dialog inside Tauri (WebView2 does not
 * reliably show `window.confirm`) and falls back to the browser dialog when the
 * UI runs standalone at localhost:1420.
 */
export async function confirmDialog(message: string, title = "PostCat"): Promise<boolean> {
  if (inTauri()) {
    try {
      return await ask(message, { title, kind: "warning" });
    } catch {
      /* permission missing or plugin unavailable — fall through */
    }
  }
  return window.confirm(message);
}
