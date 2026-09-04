import { open as openFileDialog } from "@tauri-apps/plugin-dialog";

/** Open the native file picker and hand the chosen path to `cb`. */
export async function pickFile(cb: (path: string) => void) {
  try {
    const sel = await openFileDialog({ multiple: false });
    if (typeof sel === "string") cb(sel);
  } catch {
    /* dialog unavailable */
  }
}

/** Last path segment (works for both `/` and `\` separators). */
export function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
