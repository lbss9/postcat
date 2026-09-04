import { invoke } from "@tauri-apps/api/core";
import { loadNetworkPrefs } from "@/hooks/useNetworkPrefs";
import type {
  Environment,
  HistoryEntry,
  NodeKind,
  RequestState,
  SendResult,
  TreeNode,
} from "@/types";

export async function sendRequest(req: RequestState): Promise<SendResult> {
  const net = loadNetworkPrefs();
  return invoke<SendResult>("send_request", {
    options: {
      network: {
        timeoutMs: net.timeoutMs,
        maxResponseBytes: net.maxResponseMb * 1024 * 1024,
        verifySsl: net.verifySsl,
        followRedirects: net.followRedirects,
        httpVersion: net.httpVersion,
        disableCookies: net.disableCookies,
      },
      method: req.method,
      url: req.url,
      headers: req.headers.map(({ key, value, enabled }) => ({ key, value, enabled })),
      params: req.params.map(({ key, value, enabled }) => ({ key, value, enabled })),
      body: {
        type: req.bodyType,
        rawLang: req.rawLang,
        raw: req.raw,
        formData: req.formData.map(({ key, value, type, enabled }) => ({
          key,
          value,
          type,
          enabled,
        })),
        urlencoded: req.urlencoded.map(({ key, value, enabled }) => ({ key, value, enabled })),
        binaryPath: req.binaryPath,
      },
    },
  });
}

/* --------------------------------- history --------------------------------- */

export async function historyList(): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>("history_list");
}

export async function historyAdd(entry: HistoryEntry): Promise<void> {
  await invoke("history_add", { entry });
}

export async function historyClear(): Promise<void> {
  await invoke("history_clear");
}

/* ---------------------------------- themes --------------------------------- */

export async function listUserThemes(): Promise<unknown[]> {
  return invoke<unknown[]>("list_user_themes");
}

export async function themesDirPath(): Promise<string> {
  return invoke<string>("themes_dir_path");
}

export async function saveTheme(filename: string, content: string): Promise<void> {
  await invoke("save_theme", { filename, content });
}

export async function openThemesDir(): Promise<void> {
  await invoke("open_themes_dir");
}

/* ----------------------------------- data ---------------------------------- */

export async function dataDirPath(): Promise<string> {
  return invoke<string>("data_dir_path");
}

export async function openDataDir(): Promise<void> {
  await invoke("open_data_dir");
}

/* ------------------------------- collections ------------------------------- */

export async function nodesList(): Promise<TreeNode[]> {
  return invoke<TreeNode[]>("nodes_list");
}

export async function nodeCreate(
  parentId: string | null,
  kind: NodeKind,
  name: string,
  request?: RequestState | null,
): Promise<string> {
  return invoke<string>("node_create", {
    id: crypto.randomUUID(),
    parentId,
    kind,
    name,
    request: request ?? null,
  });
}

export async function nodeRename(id: string, name: string): Promise<void> {
  await invoke("node_rename", { id, name });
}

export async function nodeSetRequest(id: string, request: RequestState): Promise<void> {
  await invoke("node_set_request", { id, request });
}

export async function nodeSetVariables(
  id: string,
  variables: Environment["variables"],
): Promise<void> {
  await invoke("node_set_variables", { id, variables });
}

export async function nodeMove(
  id: string,
  parentId: string | null,
  index: number,
): Promise<void> {
  await invoke("node_move", { id, parentId, index });
}

export async function nodeDelete(id: string): Promise<void> {
  await invoke("node_delete", { id });
}

/* ------------------------------- environments ------------------------------ */

export async function envList(): Promise<Environment[]> {
  return invoke<Environment[]>("env_list");
}

export async function envCreate(name: string): Promise<string> {
  return invoke<string>("env_create", { id: crypto.randomUUID(), name });
}

export async function envUpdate(
  id: string,
  name: string,
  variables: Environment["variables"],
): Promise<void> {
  await invoke("env_update", { id, name, variables });
}

export async function envDelete(id: string): Promise<void> {
  await invoke("env_delete", { id });
}

export async function envSetActive(id: string): Promise<void> {
  await invoke("env_set_active", { id });
}

/* ------------------------------ import / export ---------------------------- */

export async function readFileText(path: string): Promise<string> {
  return invoke<string>("read_file_text", { path });
}

export async function writeFileText(path: string, contents: string): Promise<void> {
  await invoke("write_file_text", { path, contents });
}

/* --------------------------- variable resolution --------------------------- */

/** Replace {{key}} occurrences using the provided variable map. */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Resolve every {{var}} across a request using the active environment. */
export function resolveVars(req: RequestState, vars: Record<string, string>): RequestState {
  const r = (s: string) => interpolate(s, vars);
  // substitute :name path variables, then {{var}} in the URL
  let url = req.url;
  for (const pv of req.pathVars) {
    if (pv.enabled && pv.key) {
      url = url.replace(
        new RegExp(":" + escapeRe(pv.key) + "(?![A-Za-z0-9_])", "g"),
        encodeURIComponent(interpolate(pv.value, vars)),
      );
    }
  }
  return {
    ...req,
    url: r(url),
    raw: r(req.raw),
    params: req.params.map((p) => ({ ...p, key: r(p.key), value: r(p.value) })),
    headers: req.headers.map((h) => ({ ...h, key: r(h.key), value: r(h.value) })),
    urlencoded: req.urlencoded.map((u) => ({ ...u, key: r(u.key), value: r(u.value) })),
    formData: req.formData.map((f) => ({
      ...f,
      key: r(f.key),
      value: f.type === "file" ? f.value : r(f.value),
    })),
  };
}
