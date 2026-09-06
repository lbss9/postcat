/**
 * Auto-update. Thin state machine over the Tauri updater plugin so any part of
 * the UI (the toast, the About tab) can observe one shared status.
 *
 * Releases are published on GitHub by `.github/workflows/release.yml`; the
 * endpoint and public key live in `src-tauri/tauri.conf.json`.
 */
import { useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface UpdaterState {
  status: UpdaterStatus;
  /** version offered by the server, when status is available/downloading/installing */
  version?: string;
  /** release notes (markdown/plain), when provided by the release */
  notes?: string;
  /** 0..1 while downloading, when the server sends a content length */
  progress?: number;
  error?: string;
  /** the user closed the toast for this version — the About tab still shows it */
  dismissed: boolean;
}

let state: UpdaterState = { status: "idle", dismissed: false };
let pending: Update | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<UpdaterState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** React hook: the shared updater state. */
export function useUpdater(): UpdaterState {
  return useSyncExternalStore(subscribe, () => state);
}

/**
 * Ask the release endpoint for a newer version.
 * `silent` keeps "checking"/"upToDate"/"error" out of the UI (used at startup);
 * a real update is always surfaced.
 */
export async function checkForUpdates(opts: { silent?: boolean } = {}): Promise<void> {
  if (!isTauri()) return;
  if (state.status === "downloading" || state.status === "installing") return;
  if (!opts.silent) set({ status: "checking", error: undefined });
  try {
    const update = await check({ timeout: 15_000 });
    if (update) {
      pending = update;
      set({
        status: "available",
        version: update.version,
        notes: update.body ?? undefined,
        dismissed: false,
        error: undefined,
      });
    } else {
      pending = null;
      set({ status: opts.silent ? "idle" : "upToDate", version: undefined, notes: undefined });
    }
  } catch (e) {
    pending = null;
    // in dev builds there is no release to compare against — stay quiet
    set({ status: opts.silent ? "idle" : "error", error: String(e) });
  }
}

/** Download, install and relaunch. On Windows the installer restarts the app. */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  const update = pending;
  let total = 0;
  let received = 0;
  set({ status: "downloading", progress: undefined, error: undefined });
  try {
    await update.downloadAndInstall((ev) => {
      if (ev.event === "Started") {
        total = ev.data.contentLength ?? 0;
        received = 0;
        set({ progress: total ? 0 : undefined });
      } else if (ev.event === "Progress") {
        received += ev.data.chunkLength;
        if (total) set({ progress: Math.min(1, received / total) });
      } else if (ev.event === "Finished") {
        set({ status: "installing", progress: 1 });
      }
    });
    await relaunch();
  } catch (e) {
    set({ status: "error", error: String(e) });
  }
}

/** Hide the toast for this version. */
export function dismissUpdate(): void {
  set({ dismissed: true });
}
