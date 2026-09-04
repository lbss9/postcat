import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";
import TitleBar from "./components/TitleBar";
import SettingsDialog, { type SettingsTab } from "./components/SettingsDialog";
import Sidebar from "./components/Sidebar";
import VarInput from "./components/VarInput";
import Resizer from "./components/Resizer";
import Dropdown from "./components/Dropdown";
import Icon from "./components/Icon";
import Button from "./components/Button";
import CodeEditor, { type CodeEditorHandle } from "./components/CodeEditor";
import {
  envCreate,
  envDelete,
  envList,
  envSetActive,
  envUpdate,
  historyAdd,
  historyClear,
  historyList,
  nodeCreate,
  nodeDelete,
  nodeMove,
  nodeRename,
  nodeSetRequest,
  nodeSetVariables,
  nodesList,
  openThemesDir,
  readFileText,
  resolveVars,
  sendRequest,
  writeFileText,
} from "./lib/api";
import { serializeCollection, parseImport, type ImportNode } from "./lib/import";
import { computeAutoHeaders, overriddenKeys } from "./lib/autoHeaders";
import { useTheme } from "./lib/useTheme";
import { indentJsonArg, indentUnitStr } from "./lib/themes";
import type { EnvVar, Environment, NodeKind, TreeNode } from "./lib/types";
import {
  METHODS,
  RAW_LANGS,
  emptyFormField,
  emptyRow,
  newRequest,
  normalizeRequest,
  syncPathVars,
  type BodyType,
  type FormField,
  type HistoryEntry,
  type KeyVal,
  type Method,
  type RawLang,
  type RequestState,
  type SendResult,
} from "./lib/types";
import {
  runScript,
  type ScriptHeader,
  type ScriptOutcome,
  type ScriptRequest,
  type ScriptResponse,
} from "./lib/scripts";
import "./App.css";

type ReqTab = "params" | "headers" | "body" | "scripts";
type ResTab = "pretty" | "raw" | "headers" | "tests";

interface RequestTab {
  id: string;
  kind: "request";
  nodeId: string | null;
  req: RequestState;
  res: SendResult | null;
  error: string | null;
  loading: boolean;
  reqTab: ReqTab;
  resTab: ResTab;
  /** result of the post-response script (tests + logs), if any */
  script: ScriptOutcome | null;
  /** has unsaved edits (or was never saved to a folder) */
  dirty: boolean;
}
interface EnvironmentTab {
  id: string;
  kind: "environment";
  envId: string;
}
type WorkspaceTab = RequestTab | EnvironmentTab;

function newRequestTab(req?: RequestState, nodeId: string | null = null): RequestTab {
  return {
    id: crypto.randomUUID(),
    kind: "request",
    nodeId,
    req: req ?? newRequest(),
    res: null,
    error: null,
    loading: false,
    reqTab: "params",
    resTab: "pretty",
    script: null,
    dirty: false,
  };
}

const TABS_KEY = "postcat-tabs";

/** Restore the open tabs from the last session (response bodies are dropped). */
function loadTabs(): { tabs: WorkspaceTab[]; activeTabId: string } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(TABS_KEY) || "null");
    if (!saved?.tabs?.length) return null;
    const tabs: WorkspaceTab[] = saved.tabs.map((t: Any) =>
      t.kind === "environment"
        ? { id: t.id, kind: "environment", envId: t.envId }
        : {
            id: t.id,
            kind: "request",
            nodeId: t.nodeId ?? null,
            req: normalizeRequest(t.req),
            res: null,
            error: null,
            loading: false,
            reqTab: t.reqTab ?? "params",
            resTab: "pretty",
            script: null,
            dirty: !!t.dirty,
          },
    );
    const activeTabId = tabs.some((t) => t.id === saved.activeTabId)
      ? saved.activeTabId
      : tabs[0].id;
    return { tabs, activeTabId };
  } catch {
    return null;
  }
}

function persistTabs(tabs: WorkspaceTab[], activeTabId: string) {
  const slim = tabs.map((t) =>
    t.kind === "request"
      ? { id: t.id, kind: "request", nodeId: t.nodeId, req: t.req, reqTab: t.reqTab, dirty: t.dirty }
      : { id: t.id, kind: "environment", envId: t.envId },
  );
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: slim, activeTabId }));
  } catch {
    /* storage full — ignore */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function reqLabel(req: RequestState, fallback: string): string {
  if (req.url.trim()) return req.url.replace(/^https?:\/\//, "").slice(0, 32);
  return fallback;
}

export default function App() {
  const { t } = useTranslation();
  const restored = useMemo(() => loadTabs(), []);
  const firstTab = useMemo(() => newRequestTab(), []);
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => restored?.tabs ?? [firstTab]);
  const [activeTabId, setActiveTabId] = useState<string>(
    () => restored?.activeTabId ?? firstTab.id,
  );

  useEffect(() => {
    persistTabs(tabs, activeTabId);
  }, [tabs, activeTabId]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const th = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    () => Number(localStorage.getItem("postcat-sbw")) || 244,
  );
  const [responseHeight, setResponseHeight] = useState<number>(() => {
    const stored = Number(localStorage.getItem("postcat-resh"));
    const val = stored || Math.round(window.innerHeight * 0.42);
    // always keep at least ~400px for the request builder above
    return Math.max(140, Math.min(val, window.innerHeight - 400));
  });
  const baseSbw = useRef(sidebarWidth);
  const baseResh = useRef(responseHeight);
  const [zoom, setZoom] = useState<number>(
    () => Number(localStorage.getItem("postcat-zoom")) || 1,
  );

  function resizeSidebar(delta: number) {
    const w = Math.min(520, Math.max(190, baseSbw.current + delta));
    setSidebarWidth(w);
    localStorage.setItem("postcat-sbw", String(w));
  }
  function resizeResponse(delta: number) {
    // dragging the divider up (negative delta) makes the response taller
    const h = Math.min(window.innerHeight - 220, Math.max(120, baseResh.current - delta));
    setResponseHeight(h);
    localStorage.setItem("postcat-resh", String(h));
  }

  // two-pane: request on the left, response on the right (instead of stacked)
  const [twoPane, setTwoPane] = useState<boolean>(() => {
    try {
      return localStorage.getItem("postcat-two-pane") === "1";
    } catch {
      return false;
    }
  });
  function toggleTwoPane() {
    setTwoPane((v) => {
      const next = !v;
      try {
        localStorage.setItem("postcat-two-pane", next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  const [responseWidth, setResponseWidth] = useState<number>(
    () => Number(localStorage.getItem("postcat-resw")) || 480,
  );
  const baseResw = useRef(responseWidth);
  function resizeResponseWidth(delta: number) {
    // dragging the divider left (negative delta) makes the response wider
    const w = Math.min(window.innerWidth - 460, Math.max(300, baseResw.current - delta));
    setResponseWidth(w);
    localStorage.setItem("postcat-resw", String(w));
  }

  const activeTab = tabs.find((tb) => tb.id === activeTabId) ?? tabs[0];
  const activeReq = activeTab?.kind === "request" ? activeTab : null;

  useEffect(() => {
    (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom =
      String(zoom);
    localStorage.setItem("postcat-zoom", String(zoom));
  }, [zoom]);

  const zoomIn = () => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)));
  const zoomReset = () => setZoom(1);

  const openSettings = (tab?: string) => {
    if (tab) setSettingsTab(tab as SettingsTab);
    setSettingsOpen(true);
  };

  useEffect(() => {
    historyList().then(setHistory).catch(() => {});
  }, []);

  const reloadNodes = () => nodesList().then(setNodes).catch(() => {});
  const reloadEnvs = () => envList().then(setEnvironments).catch(() => {});
  useEffect(() => {
    reloadNodes();
    reloadEnvs();
  }, []);

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const activeEnv = environments.find((e) => e.isActive) ?? null;

  // collection variables from the active request's owning collection/folders
  const collectionVars = useMemo(() => {
    const map: Record<string, string> = {};
    if (!activeReq?.nodeId) return map;
    const chain: TreeNode[] = [];
    let cur: TreeNode | undefined = nodesById.get(activeReq.nodeId);
    while (cur) {
      chain.push(cur);
      cur = cur.parentId ? nodesById.get(cur.parentId) : undefined;
    }
    for (const n of chain.reverse()) {
      n.variables?.forEach((v) => {
        if (v.enabled && v.key) map[v.key] = v.value;
      });
    }
    return map;
  }, [activeReq?.nodeId, nodesById]);

  const mergedVars = useMemo(() => {
    const map: Record<string, string> = { ...collectionVars };
    activeEnv?.variables?.forEach((v) => {
      if (v.enabled && v.key) map[v.key] = v.value;
    });
    return map;
  }, [collectionVars, activeEnv]);

  // shared props so every value field highlights {{vars}} and can edit them
  const varProps = {
    vars: mergedVars,
    onSetVar: (name: string, value: string) => setVarValue(name, value),
    envName: activeEnv?.name ?? null,
  };

  // resolved indentation (from Settings → Editor), used by editors + Beautify
  const indentUnit = indentUnitStr(th.fonts);
  const indentJson = indentJsonArg(th.fonts);

  /* ------------------------------ tab management ---------------------------- */

  function updateReqTab(id: string, patch: Partial<RequestTab>) {
    setTabs((ts) =>
      ts.map((tb) => (tb.id === id && tb.kind === "request" ? { ...tb, ...patch } : tb)),
    );
  }
  function patchReq(p: Partial<RequestState>) {
    if (!activeReq) return;
    updateReqTab(activeReq.id, { req: { ...activeReq.req, ...p }, dirty: true });
  }
  function newTab() {
    const tab = newRequestTab();
    setTabs((ts) => [...ts, tab]);
    setActiveTabId(tab.id);
  }
  function openRequestTab(req: RequestState, nodeId: string | null) {
    const existing = tabs.find((tb) => {
      if (tb.kind !== "request") return false;
      // a saved request matches by node; an ad-hoc/history one by method + url
      return nodeId
        ? tb.nodeId === nodeId
        : !tb.nodeId && tb.req.method === req.method && tb.req.url === req.url;
    });
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab = newRequestTab(normalizeRequest(structuredClone(req)), nodeId);
    setTabs((ts) => [...ts, tab]);
    setActiveTabId(tab.id);
  }
  function openEnvTab(envId: string) {
    const existing = tabs.find((tb) => tb.kind === "environment" && tb.envId === envId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const tab: EnvironmentTab = { id: crypto.randomUUID(), kind: "environment", envId };
    setTabs((ts) => [...ts, tab]);
    setActiveTabId(tab.id);
  }
  function closeTab(id: string) {
    const idx = tabs.findIndex((tb) => tb.id === id);
    let next = tabs.filter((tb) => tb.id !== id);
    if (next.length === 0) {
      const nt = newRequestTab();
      next = [nt];
      setActiveTabId(nt.id);
    } else if (id === activeTabId) {
      setActiveTabId(next[Math.max(0, idx - 1)].id);
    }
    setTabs(next);
  }

  /* -------------------------------- collections ----------------------------- */

  // create a loose node at the root: request, collection or folder
  async function createNode(kind: NodeKind) {
    const name =
      kind === "collection"
        ? t("side.newCollectionName")
        : kind === "folder"
          ? t("side.newFolderName")
          : t("side.newRequestName");
    const req = kind === "request" ? newRequest() : null;
    const id = await nodeCreate(null, kind, name, req).catch(() => null);
    await reloadNodes();
    if (kind === "request" && id && req) openRequestTab(req, id);
  }
  /* ---------------------------- import / export --------------------------- */

  async function createImportTree(node: ImportNode, parentId: string | null) {
    const id = await nodeCreate(
      parentId,
      node.kind,
      node.name,
      node.request ?? null,
    ).catch(() => null);
    if (!id) return;
    if (node.variables && node.kind !== "request") {
      await nodeSetVariables(id, node.variables).catch(() => {});
    }
    for (const child of node.children ?? []) await createImportTree(child, id);
  }
  async function importFromFile() {
    try {
      const path = await openFileDialog({
        multiple: false,
        filters: [{ name: "Collection / OpenAPI", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      const text = await readFileText(path);
      await createImportTree(parseImport(text), null);
      await reloadNodes();
    } catch {
      /* invalid file / unknown format — ignore for now */
    }
  }
  async function exportCollection(node: TreeNode) {
    try {
      const json = serializeCollection(node, nodes);
      const path = await saveFileDialog({
        defaultPath: `${node.name}.collection.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      await writeFileText(path, json);
    } catch {
      /* cancelled */
    }
  }

  async function addFolder(parentId: string) {
    await nodeCreate(parentId, "folder", t("side.newFolderName")).catch(() => {});
    reloadNodes();
  }
  // "+" on a collection/folder: create a fresh request inside it and open it as a tab
  async function addRequestTo(parentId: string) {
    const base = newRequest();
    const id = await nodeCreate(
      parentId,
      "request",
      t("side.newRequestName"),
      base,
    ).catch(() => null);
    await reloadNodes();
    if (id) openRequestTab(base, id);
  }
  async function renameNode(id: string, name: string) {
    await nodeRename(id, name).catch(() => {});
    reloadNodes();
  }
  async function deleteNode(id: string) {
    await nodeDelete(id).catch(() => {});
    reloadNodes();
  }
  async function moveNode(id: string, parentId: string | null, index: number) {
    await nodeMove(id, parentId, index).catch(() => {});
    reloadNodes();
  }
  async function saveActiveRequest() {
    if (!activeReq) return;
    if (activeReq.nodeId) {
      await nodeSetRequest(activeReq.nodeId, activeReq.req).catch(() => {});
      updateReqTab(activeReq.id, { dirty: false });
      reloadNodes();
    } else {
      setSavePickerOpen(true);
    }
  }
  async function saveToDestination(parentId: string) {
    if (!activeReq) return;
    const id = await nodeCreate(
      parentId,
      "request",
      reqLabel(activeReq.req, t("side.newRequestName")),
      activeReq.req,
    ).catch(() => null);
    await reloadNodes();
    if (id) updateReqTab(activeReq.id, { nodeId: id, dirty: false });
    setSavePickerOpen(false);
  }

  /* -------------------------------- environments ---------------------------- */

  async function createEnv() {
    const id = await envCreate(t("side.newEnvName")).catch(() => null);
    await reloadEnvs();
    if (id) openEnvTab(id);
  }
  async function saveEnv(id: string, name: string, variables: EnvVar[]) {
    await envUpdate(id, name, variables).catch(() => {});
    reloadEnvs();
  }
  async function deleteEnv(id: string) {
    await envDelete(id).catch(() => {});
    setTabs((ts) => ts.filter((tb) => !(tb.kind === "environment" && tb.envId === id)));
    reloadEnvs();
  }
  async function setActiveEnvId(id: string) {
    await envSetActive(id).catch(() => {});
    reloadEnvs();
  }
  // set/create a variable from a pill popover; targets the active environment
  async function setVarValue(name: string, value: string) {
    let env = environments.find((e) => e.isActive);
    if (!env) {
      const id = await envCreate("Global").catch(() => null);
      if (!id) return;
      await envSetActive(id).catch(() => {});
      await envUpdate(id, "Global", [{ key: name, value, enabled: true }]).catch(() => {});
      reloadEnvs();
      return;
    }
    const vars = [...(env.variables ?? [])];
    const idx = vars.findIndex((v) => v.key === name);
    if (idx >= 0) vars[idx] = { ...vars[idx], value, enabled: true };
    else vars.push({ key: name, value, enabled: true });
    await envUpdate(env.id, env.name, vars).catch(() => {});
    reloadEnvs();
  }

  /* ---------------------------------- send ---------------------------------- */

  async function send() {
    if (!activeReq || !activeReq.req.url.trim() || activeReq.loading) return;
    const tabId = activeReq.id;
    let working = activeReq.req;
    // local var map for THIS run; pre-script env changes take effect immediately
    const vars: Record<string, string> = { ...mergedVars };
    const envName = activeEnv?.name ?? null;
    updateReqTab(tabId, { loading: true, error: null, script: null });
    const started = performance.now();
    try {
      // 1. pre-request script
      if (working.preScript.trim()) {
        const pre = await runScript("pre", working.preScript, {
          request: toScriptRequest(working),
          env: vars,
          envName,
        });
        applyEnvToMap(vars, pre.envSet, pre.envUnset);
        await persistEnv(pre.envSet, pre.envUnset);
        if (!pre.ok) {
          updateReqTab(tabId, {
            res: null,
            error: `Pre-request script: ${pre.error}`,
            script: pre,
            resTab: "tests",
          });
          return;
        }
        if (pre.request) working = applyScriptRequest(working, pre.request);
      }

      // 2. send
      const snapshot = normalizeRequest(structuredClone(working));
      const result = await sendRequest(resolveVars(snapshot, vars));

      // 3. post-response script (tests)
      let script: ScriptOutcome | null = null;
      if (working.postScript.trim()) {
        script = await runScript("post", working.postScript, {
          request: toScriptRequest(working),
          response: toScriptResponse(result),
          env: vars,
          envName,
        });
        await persistEnv(script.envSet, script.envUnset);
      }
      const hasTests = !!script && (script.tests.length > 0 || !script.ok);
      updateReqTab(tabId, {
        res: result,
        error: null,
        script,
        resTab: hasTests ? "tests" : "pretty",
      });
      pushHistory(working, result.status);
    } catch (e) {
      updateReqTab(tabId, { res: null, error: translateError(e) });
      pushHistory(working, null);
    } finally {
      const elapsed = performance.now() - started;
      if (elapsed < 120) await new Promise((r) => setTimeout(r, 120 - elapsed));
      updateReqTab(tabId, { loading: false });
    }
  }

  /* ------- script <-> request/response glue + env persistence ------- */

  function toScriptRequest(r: RequestState): ScriptRequest {
    return {
      method: r.method,
      url: r.url,
      headers: r.headers.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value })),
      body: r.bodyType === "raw" ? r.raw : "",
    };
  }
  function toScriptResponse(res: SendResult): ScriptResponse {
    return {
      code: res.status,
      status: res.statusText,
      headers: res.headers.map(([key, value]) => ({ key, value })),
      body: res.body,
      timeMs: res.timeMs,
      sizeBytes: res.sizeBytes,
    };
  }
  function applyScriptRequest(
    r: RequestState,
    mut: { method: string; url: string; headers: ScriptHeader[] },
  ): RequestState {
    const headers: KeyVal[] = mut.headers.map((h) => ({
      id: crypto.randomUUID(),
      key: h.key,
      value: h.value,
      enabled: true,
    }));
    headers.push(emptyRow());
    const url = mut.url;
    return {
      ...r,
      method: (mut.method.toUpperCase() as Method) || r.method,
      url,
      pathVars: syncPathVars(url, r.pathVars),
      headers,
    };
  }
  function applyEnvToMap(map: Record<string, string>, set: Record<string, string>, unset: string[]) {
    for (const [k, v] of Object.entries(set)) map[k] = v;
    for (const k of unset) delete map[k];
  }
  // persist script env changes into the active environment (batched, one write)
  async function persistEnv(set: Record<string, string>, unset: string[]) {
    const keys = Object.keys(set);
    if (keys.length === 0 && unset.length === 0) return;
    let env = environments.find((e) => e.isActive);
    if (!env) {
      const id = await envCreate("Global").catch(() => null);
      if (!id) return;
      await envSetActive(id).catch(() => {});
      const vars = keys.map((k) => ({ key: k, value: set[k], enabled: true }));
      await envUpdate(id, "Global", vars).catch(() => {});
      reloadEnvs();
      return;
    }
    const vars = [...(env.variables ?? [])];
    for (const k of keys) {
      const i = vars.findIndex((v) => v.key === k);
      if (i >= 0) vars[i] = { ...vars[i], value: set[k], enabled: true };
      else vars.push({ key: k, value: set[k], enabled: true });
    }
    for (const k of unset) {
      const i = vars.findIndex((v) => v.key === k);
      if (i >= 0) vars.splice(i, 1);
    }
    await envUpdate(env.id, env.name, vars).catch(() => {});
    reloadEnvs();
  }

  function translateError(e: unknown): string {
    const raw = (typeof e === "string" ? e : String(e)).replace(/^Error:\s*/, "");
    if (raw.startsWith("errors.")) {
      const [code, ...rest] = raw.split("|");
      return t(code, { detail: rest.join("|") });
    }
    return raw;
  }

  function pushHistory(req: RequestState, status: number | null) {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      method: req.method,
      url: req.url,
      status,
      at: Date.now(),
      request: structuredClone(req),
    };
    setHistory((h) => [entry, ...h].slice(0, 100));
    historyAdd(entry).catch(() => {});
  }

  async function clearHistory() {
    setHistory([]);
    await historyClear().catch(() => {});
  }

  // global shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        send();
      } else if (mod && e.key === "t") {
        e.preventDefault();
        newTab();
      } else if (mod && e.key === "w") {
        e.preventDefault();
        closeTab(activeTabId);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        openSettings("general");
      } else if (mod && e.key === "s") {
        e.preventDefault();
        saveActiveRequest();
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn();
      } else if (mod && e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (mod && e.key === "0") {
        e.preventDefault();
        zoomReset();
      } else if (mod && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((s) => !s);
      } else if (mod && e.key === "o") {
        e.preventDefault();
        importFromFile();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const activeParams = activeReq?.req.params.filter((p) => p.enabled && p.key).length ?? 0;
  const activeHeaders = activeReq?.req.headers.filter((h) => h.enabled && h.key).length ?? 0;

  return (
    <div className="root">
      <TitleBar
        onNewRequest={newTab}
        onOpenSettings={openSettings}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
        onImport={importFromFile}
      />
      <div
        className={`app ${sidebarOpen ? "" : "no-sidebar"}`}
        style={{
          gridTemplateColumns: sidebarOpen ? `${sidebarWidth}px 6px 1fr` : "1fr",
        }}
      >
        {sidebarOpen && (
          <Sidebar
            nodes={nodes}
            activeNodeId={activeReq?.nodeId ?? null}
            onCreateNode={createNode}
            onNewRequest={newTab}
            onAddFolder={addFolder}
            onAddRequest={addRequestTo}
            onRenameNode={renameNode}
            onDeleteNode={deleteNode}
            onOpenRequest={(node) => node.request && openRequestTab(node.request, node.id)}
            onMoveNode={moveNode}
            onExportNode={exportCollection}
            environments={environments}
            onCreateEnv={createEnv}
            onOpenEnv={openEnvTab}
            onDeleteEnv={deleteEnv}
            onSetActiveEnv={setActiveEnvId}
            history={history}
            onOpenHistory={(h) => openRequestTab(h.request, null)}
            onClearHistory={clearHistory}
          />
        )}
        {sidebarOpen && (
          <Resizer
            orientation="vertical"
            onStart={() => (baseSbw.current = sidebarWidth)}
            onMove={resizeSidebar}
          />
        )}

        <main className="main">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            nodesById={nodesById}
            environments={environments}
            onSelect={setActiveTabId}
            onClose={closeTab}
            onNew={newTab}
          />

          {activeReq ? (
            <>
              <div className="urlbar">
                <MethodSelect
                  value={activeReq.req.method}
                  onChange={(m) => patchReq({ method: m })}
                />
                <VarInput
                  value={activeReq.req.url}
                  placeholder={t("url.placeholder")}
                  onChange={(url) =>
                    patchReq({ url, pathVars: syncPathVars(url, activeReq.req.pathVars) })
                  }
                  onEnter={send}
                  vars={mergedVars}
                  onSetVar={setVarValue}
                  envName={activeEnv?.name ?? null}
                />
                <Dropdown
                  className="env-dd"
                  value={activeEnv?.id ?? ""}
                  menuAlign="right"
                  ariaLabel={t("side.environments")}
                  options={[
                    { value: "", label: t("side.noEnv") },
                    ...environments.map((e) => ({ value: e.id, label: e.name })),
                  ]}
                  onChange={setActiveEnvId}
                />
                <Button
                  variant="bare"
                  className="send-btn"
                  onClick={send}
                  disabled={activeReq.loading || !activeReq.req.url.trim()}
                >
                  {activeReq.loading ? <span className="spinner" /> : t("actions.send")}
                </Button>
              </div>

              <div className={`req-response ${twoPane ? "two-pane" : ""}`}>
              <div className="req-panel">
                <nav className="tabs">
                  <Tab
                    active={activeReq.reqTab === "params"}
                    onClick={() => updateReqTab(activeReq.id, { reqTab: "params" })}
                  >
                    {t("reqTabs.params")}{" "}
                    {activeParams > 0 && <b className="count">{activeParams}</b>}
                  </Tab>
                  <Tab
                    active={activeReq.reqTab === "headers"}
                    onClick={() => updateReqTab(activeReq.id, { reqTab: "headers" })}
                  >
                    {t("reqTabs.headers")}{" "}
                    {activeHeaders > 0 && <b className="count">{activeHeaders}</b>}
                  </Tab>
                  <Tab
                    active={activeReq.reqTab === "body"}
                    onClick={() => updateReqTab(activeReq.id, { reqTab: "body" })}
                  >
                    {t("reqTabs.body")}{" "}
                    {activeReq.req.bodyType !== "none" && <b className="count dot-only">•</b>}
                  </Tab>
                  <Tab
                    active={activeReq.reqTab === "scripts"}
                    onClick={() => updateReqTab(activeReq.id, { reqTab: "scripts" })}
                  >
                    {t("reqTabs.scripts")}{" "}
                    {(activeReq.req.preScript.trim() || activeReq.req.postScript.trim()) && (
                      <b className="count dot-only">•</b>
                    )}
                  </Tab>
                </nav>

                <div className="req-content">
                  {activeReq.reqTab === "params" && (
                    <div className="params-sections">
                      <div className="param-section-title">{t("params.query")}</div>
                      <KeyValTable
                        rows={activeReq.req.params}
                        onChange={(params) => patchReq({ params })}
                        keyPlaceholder={t("kv.param")}
                        {...varProps}
                      />
                      {activeReq.req.pathVars.length > 0 && (
                        <>
                          <div className="param-section-title">{t("params.path")}</div>
                          <KeyValTable
                            rows={activeReq.req.pathVars}
                            onChange={(pathVars) => patchReq({ pathVars })}
                            keyPlaceholder="param"
                            fixed
                            {...varProps}
                          />
                        </>
                      )}
                    </div>
                  )}
                  {activeReq.reqTab === "headers" && (
                    <div className="headers-tab">
                      <KeyValTable
                        rows={activeReq.req.headers}
                        onChange={(headers) => patchReq({ headers })}
                        keyPlaceholder={t("kv.header")}
                        {...varProps}
                      />
                      <AutoHeaders req={activeReq.req} />
                    </div>
                  )}
                  {activeReq.reqTab === "body" && (
                    <BodyEditor
                      req={activeReq.req}
                      onPatch={patchReq}
                      indentUnit={indentUnit}
                      indentJson={indentJson}
                      {...varProps}
                    />
                  )}
                  {activeReq.reqTab === "scripts" && (
                    <ScriptEditor req={activeReq.req} onPatch={patchReq} />
                  )}
                </div>
              </div>

              <Resizer
                orientation={twoPane ? "vertical" : "horizontal"}
                onStart={() => {
                  baseResh.current = responseHeight;
                  baseResw.current = responseWidth;
                }}
                onMove={twoPane ? resizeResponseWidth : resizeResponse}
              />
              <div
                className="res-wrap"
                style={twoPane ? { width: responseWidth } : { height: responseHeight }}
              >
                <ResponsePanel
                  res={activeReq.res}
                  error={activeReq.error}
                  loading={activeReq.loading}
                  tab={activeReq.resTab}
                  onTab={(rt) => updateReqTab(activeReq.id, { resTab: rt })}
                  script={activeReq.script}
                  indentJson={indentJson}
                />
              </div>
              </div>
            </>
          ) : activeTab?.kind === "environment" ? (
            <EnvironmentEditor
              key={activeTab.envId}
              env={environments.find((e) => e.id === activeTab.envId) ?? null}
              onSave={saveEnv}
              onSetActive={setActiveEnvId}
            />
          ) : null}
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        tab={settingsTab}
        onTab={setSettingsTab}
        onClose={() => setSettingsOpen(false)}
        themes={th.themes}
        currentThemeId={th.currentId}
        onSelectTheme={th.setCurrent}
        fonts={th.fonts}
        onFonts={th.setFonts}
        onOpenThemesFolder={() => openThemesDir().catch(() => {})}
        twoPane={twoPane}
        onToggleTwoPane={toggleTwoPane}
      />

      {savePickerOpen && (
        <SaveDialog
          nodes={nodes}
          onPick={saveToDestination}
          onClose={() => setSavePickerOpen(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------- SaveDialog ------------------------------- */

function SaveDialog({
  nodes,
  onPick,
  onClose,
}: {
  nodes: TreeNode[];
  onPick: (parentId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const childrenOf = useMemo(() => {
    const m = new Map<string | null, TreeNode[]>();
    for (const n of nodes) {
      const k = n.parentId;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    return m;
  }, [nodes]);

  const containers = (parentId: string | null) =>
    (childrenOf.get(parentId) ?? []).filter((n) => n.kind !== "request");

  function render(parentId: string | null, depth: number): ReactNode {
    return containers(parentId).map((n) => (
      <div key={n.id}>
        <Button
          variant="bare"
          className="save-dest"
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => onPick(n.id)}
        >
          <Icon name={n.kind === "collection" ? "library" : "folder"} size={14} />
          <span>{n.name}</span>
        </Button>
        {render(n.id, depth + 1)}
      </div>
    ));
  }

  const roots = containers(null);
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="save-head">{t("save.title")}</div>
        <div className="save-tree">
          {roots.length === 0 ? (
            <p className="side-empty">{t("save.empty")}</p>
          ) : (
            render(null, 0)
          )}
        </div>
        <div className="save-actions">
          <Button variant="bare" className="varpop-btn" onClick={onClose}>
            {t("actions.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- TabBar --------------------------------- */

function TabBar({
  tabs,
  activeTabId,
  nodesById,
  environments,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: WorkspaceTab[];
  activeTabId: string;
  nodesById: Map<string, TreeNode>;
  environments: Environment[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // keep the active tab visible, and let the wheel scroll the tab strip
  useEffect(() => {
    const el = scrollRef.current?.querySelector(".wtab.active") as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  return (
    <div className="tabbar">
      <div
        className="tabbar-scroll"
        ref={scrollRef}
        onWheel={(e) => {
          if (scrollRef.current && e.deltaY !== 0) {
            scrollRef.current.scrollLeft += e.deltaY;
          }
        }}
      >
        {tabs.map((tb) => {
          const label =
            tb.kind === "request"
              ? tb.nodeId
                ? nodesById.get(tb.nodeId)?.name ?? reqLabel(tb.req, t("side.newRequestName"))
                : reqLabel(tb.req, t("side.newRequestName"))
              : environments.find((e) => e.id === tb.envId)?.name ?? t("side.newEnvName");
          const unsaved = tb.kind === "request" && (!tb.nodeId || tb.dirty);
          return (
            <div
              key={tb.id}
              className={`wtab ${tb.id === activeTabId ? "active" : ""} ${
                unsaved ? "unsaved" : ""
              }`}
              onClick={() => onSelect(tb.id)}
              title={label}
            >
              {tb.kind === "request" ? (
                <span className={`method-tag m-${tb.req.method.toLowerCase()}`}>
                  {tb.req.method}
                </span>
              ) : (
                <Icon name="braces" size={13} className="wtab-env" />
              )}
              <span className="wtab-label" title={unsaved ? t("tab.unsaved") : label}>
                {label}
              </span>
              <Button
                variant="bare"
                className="wtab-close"
                aria-label={t("actions.clear")}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tb.id);
                }}
              >
                <Icon name="x" size={13} />
              </Button>
            </div>
          );
        })}
      </div>
      <Button variant="bare" className="tabbar-new" onClick={onNew} title={t("menu.newRequest")}>
        <Icon name="plus" size={16} />
      </Button>
    </div>
  );
}

/* ----------------------------- EnvironmentEditor --------------------------- */

function EnvironmentEditor({
  env,
  onSave,
  onSetActive,
}: {
  env: Environment | null;
  onSave: (id: string, name: string, variables: EnvVar[]) => void;
  onSetActive: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(env?.name ?? "");
  const [vars, setVars] = useState<EnvVar[]>(env?.variables ?? []);

  if (!env) {
    return <div className="env-main-empty">{t("side.noEnvs")}</div>;
  }

  const rows = [...vars, { key: "", value: "", enabled: true }];
  function update(i: number, patch: Partial<EnvVar>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setVars(next.filter((r) => r.key || r.value));
  }
  function removeVar(i: number) {
    setVars(rows.filter((_, idx) => idx !== i).filter((r) => r.key || r.value));
  }

  return (
    <div className="env-main">
      <div className="env-main-head">
        <Button
          variant="bare"
          className={`env-radio ${env.isActive ? "on" : ""}`}
          title={t("side.setActive")}
          onClick={() => onSetActive(env.isActive ? "" : env.id)}
        />
        <input
          className="env-main-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("side.envName")}
        />
        {env.isActive && <span className="env-badge">{t("side.active")}</span>}
        <Button variant="bare" className="send-btn env-main-save" onClick={() => onSave(env.id, name.trim() || env.name, vars)}>
          {t("side.saveEnv")}
        </Button>
      </div>

      <div className="em-table">
        <div className="em-head">
          <span />
          <span>{t("side.varKey")}</span>
          <span>{t("side.varValue")}</span>
          <span />
        </div>
        {rows.map((v, i) => {
          const blank = i === rows.length - 1 && !v.key && !v.value;
          return (
            <div className={`em-row ${v.enabled ? "" : "off"}`} key={i}>
              <input
                type="checkbox"
                className="kv-check"
                checked={v.enabled}
                disabled={blank}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />
              <input
                className="em-input mono"
                placeholder={t("side.varKey")}
                value={v.key}
                spellCheck={false}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <input
                className="em-input mono"
                placeholder={t("side.varValue")}
                value={v.value}
                spellCheck={false}
                onChange={(e) => update(i, { value: e.target.value })}
              />
              <Button
                variant="bare"
                className="kv-del"
                tabIndex={-1}
                style={{ visibility: blank ? "hidden" : "visible" }}
                onClick={() => removeVar(i)}
              >
                <Icon name="x" size={13} />
              </Button>
            </div>
          );
        })}
      </div>
      <p className="env-hint">{t("side.envHint")}</p>
    </div>
  );
}

/* ------------------------------- Method select ------------------------------ */

function MethodSelect({
  value,
  onChange,
}: {
  value: Method;
  onChange: (m: Method) => void;
}) {
  return (
    <Dropdown
      className="method-dd"
      value={value}
      buttonClassName={`m-${value.toLowerCase()} mono`}
      ariaLabel="HTTP method"
      options={METHODS.map((m) => ({
        value: m,
        label: m,
        className: `m-${m.toLowerCase()}`,
      }))}
      onChange={(v) => onChange(v as Method)}
    />
  );
}

/* -------------------------------- Tab button -------------------------------- */

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="bare" className={`tab ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </Button>
  );
}

/* -------------------------------- Scripts ---------------------------------- */

function ScriptEditor({
  req,
  onPatch,
}: {
  req: RequestState;
  onPatch: (patch: Partial<RequestState>) => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"pre" | "post">("pre");
  const edRef = useRef<CodeEditorHandle>(null);
  const isPre = phase === "pre";
  const value = isPre ? req.preScript : req.postScript;
  const field: keyof RequestState = isPre ? "preScript" : "postScript";

  const snippets = isPre
    ? [
        { label: "pc.env.set", code: 'pc.env.set("token", "abc123");\n' },
        { label: "header", code: 'pc.request.headers.set("X-Trace", "1");\n' },
        { label: "log", code: "pc.console.log(pc.request.url);\n" },
      ]
    : [
        { label: "status 200", code: 'pc.test("status is 200", () => {\n  pc.expect(pc.response.code).to.equal(200);\n});\n' },
        { label: "json body", code: 'pc.test("has id", () => {\n  const data = pc.response.json();\n  pc.expect(data).to.have.property("id");\n});\n' },
        { label: "save token", code: 'pc.env.set("token", pc.response.json().token);\n' },
      ];

  function insert(code: string) {
    if (edRef.current) edRef.current.insert(code);
    else onPatch({ [field]: value + code } as Partial<RequestState>);
  }

  return (
    <div className="script-editor">
      <div className="script-head">
        <div className="script-switch">
          <Button
            variant="bare"
            className={`script-seg ${isPre ? "active" : ""} ${req.preScript.trim() ? "filled" : ""}`}
            onClick={() => setPhase("pre")}
          >
            {t("scripts.pre")}
          </Button>
          <Button
            variant="bare"
            className={`script-seg ${!isPre ? "active" : ""} ${req.postScript.trim() ? "filled" : ""}`}
            onClick={() => setPhase("post")}
          >
            {t("scripts.post")}
          </Button>
        </div>
        <div className="script-snippets">
          {snippets.map((s) => (
            <Button
              key={s.label}
              variant="bare"
              className="snippet-chip"
              title={t("scripts.insert")}
              onClick={() => insert(s.code)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="script-area">
        <CodeEditor
          key={phase}
          ref={edRef}
          scripting
          value={value}
          placeholder={isPre ? t("scripts.prePlaceholder") : t("scripts.postPlaceholder")}
          onChange={(v) => onPatch({ [field]: v } as Partial<RequestState>)}
        />
      </div>
      <p className="script-hint">{t("scripts.hint")}</p>
    </div>
  );
}

/* --------------------------- auto-generated headers ------------------------ */

function AutoHeaders({ req }: { req: RequestState }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem("postcat-auto-headers") === "1";
    } catch {
      return false;
    }
  });
  const headers = computeAutoHeaders(req);
  const overridden = overriddenKeys(req);

  function toggle() {
    setShow((s) => {
      const next = !s;
      try {
        localStorage.setItem("postcat-auto-headers", next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  return (
    <div className="auto-headers">
      <Button variant="bare" className="auto-headers-toggle" onClick={toggle}>
        <Icon name="chevron" size={13} className={`ah-caret ${show ? "open" : ""}`} />
        <span>{show ? t("headers.hideAuto") : t("headers.showAuto")}</span>
        <span className="ah-count">{headers.length}</span>
      </Button>
      {show && (
        <div className="auto-headers-list">
          {headers.map((h) => {
            const isOverridden = overridden.has(h.key.toLowerCase());
            return (
              <div className={`ah-row ${isOverridden ? "overridden" : ""}`} key={h.key}>
                <span className="ah-key">{h.key}</span>
                <span className={`ah-val ${h.computed ? "computed" : ""}`}>
                  {h.computed ? t("headers.computed") : h.value}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Key/Value table ----------------------------- */

function KeyValTable({
  rows,
  onChange,
  keyPlaceholder,
  fixed,
  vars,
  onSetVar,
  envName,
}: {
  rows: KeyVal[];
  onChange: (rows: KeyVal[]) => void;
  keyPlaceholder: string;
  /** fixed rows (e.g. path variables): key read-only, no auto-append, no delete */
  fixed?: boolean;
  vars?: Record<string, string>;
  onSetVar?: (name: string, value: string) => void;
  envName?: string | null;
}) {
  const { t } = useTranslation();
  function update(id: string, patch: Partial<KeyVal>) {
    let next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    if (!fixed) {
      const last = next[next.length - 1];
      if (last && (last.key || last.value)) next = [...next, emptyRow()];
    }
    onChange(next);
  }
  function remove(id: string) {
    const next = rows.filter((r) => r.id !== id);
    onChange(next.length ? next : [emptyRow()]);
  }

  return (
    <div className="kv-table">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const isBlankLast = !fixed && isLast && !row.key && !row.value;
        return (
          <div className={`kv-row ${row.enabled ? "" : "disabled"}`} key={row.id}>
            <input
              type="checkbox"
              className="kv-check"
              checked={row.enabled}
              disabled={isBlankLast}
              onChange={(e) => update(row.id, { enabled: e.target.checked })}
            />
            <input
              className="kv-input kv-key"
              placeholder={keyPlaceholder}
              value={row.key}
              spellCheck={false}
              readOnly={fixed}
              onChange={(e) => update(row.id, { key: e.target.value })}
            />
            <VarInput
              compact
              value={row.value}
              placeholder={t("kv.value")}
              onChange={(value) => update(row.id, { value })}
              vars={vars}
              onSetVar={onSetVar}
              envName={envName}
            />
            {fixed ? (
              <span className="kv-lock" title={t("params.pathLocked")}>
                :
              </span>
            ) : (
              <Button
                variant="bare"
                className="kv-del"
                title={t("actions.remove")}
                tabIndex={-1}
                onClick={() => remove(row.id)}
                style={{ visibility: isBlankLast ? "hidden" : "visible" }}
              >
                <Icon name="x" size={13} />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------- Body editor ------------------------------- */

async function pickFile(cb: (path: string) => void) {
  try {
    const sel = await openFileDialog({ multiple: false });
    if (typeof sel === "string") cb(sel);
  } catch {
    /* dialog unavailable */
  }
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function BodyEditor({
  req,
  onPatch,
  vars,
  onSetVar,
  envName,
  indentUnit = "  ",
  indentJson = 2,
}: {
  req: RequestState;
  onPatch: (p: Partial<RequestState>) => void;
  vars?: Record<string, string>;
  onSetVar?: (name: string, value: string) => void;
  envName?: string | null;
  indentUnit?: string;
  indentJson?: string | number;
}) {
  const { t } = useTranslation();
  const varProps = { vars, onSetVar, envName };
  const types: BodyType[] = ["none", "form-data", "urlencoded", "raw", "binary"];

  function beautify() {
    try {
      onPatch({ raw: JSON.stringify(JSON.parse(req.raw), null, indentJson) });
    } catch {
      /* not valid JSON */
    }
  }

  return (
    <div className="body-editor">
      <div className="body-toolbar">
        <div className="body-types">
          {types.map((id) => (
            <Button
              variant="bare"
              key={id}
              className={`chip ${req.bodyType === id ? "active" : ""}`}
              onClick={() => onPatch({ bodyType: id })}
            >
              {t(`body.${id === "form-data" ? "formData" : id === "urlencoded" ? "urlencoded" : id}`)}
            </Button>
          ))}
        </div>
        {req.bodyType === "raw" && (
          <div className="body-raw-tools">
            <Dropdown
              className="rawlang-dd"
              value={req.rawLang}
              menuAlign="right"
              options={RAW_LANGS.map((l) => ({ value: l, label: t(`rawLang.${l}`) }))}
              onChange={(v) => onPatch({ rawLang: v as RawLang })}
            />
            {req.rawLang === "json" && (
              <Button variant="bare" className="beautify" onClick={beautify}>
                {t("actions.beautify")}
              </Button>
            )}
          </div>
        )}
      </div>

      {req.bodyType === "none" && <p className="body-none">{t("body.noBody")}</p>}

      {req.bodyType === "raw" && (
        <div className="body-raw">
          <CodeEditor
            key={`${req.rawLang}-${indentUnit}`}
            language={req.rawLang}
            indent={indentUnit}
            value={req.raw}
            placeholder={
              req.rawLang === "json" ? t("body.jsonPlaceholder") : t("body.textPlaceholder")
            }
            onChange={(v) => onPatch({ raw: v })}
          />
        </div>
      )}

      {req.bodyType === "urlencoded" && (
        <KeyValTable
          rows={req.urlencoded}
          onChange={(urlencoded) => onPatch({ urlencoded })}
          keyPlaceholder={t("side.varKey")}
          {...varProps}
        />
      )}

      {req.bodyType === "form-data" && (
        <FormDataTable
          rows={req.formData}
          onChange={(formData) => onPatch({ formData })}
          {...varProps}
        />
      )}

      {req.bodyType === "binary" && (
        <div className="binary-picker">
          <Button
            variant="bare"
            className="opt-chip"
            onClick={() => pickFile((p) => onPatch({ binaryPath: p }))}
          >
            {t("body.selectFile")}
          </Button>
          {req.binaryPath && (
            <span className="binary-path mono" title={req.binaryPath}>
              {baseName(req.binaryPath)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Form-data table ----------------------------- */

function FormDataTable({
  rows,
  onChange,
  vars,
  onSetVar,
  envName,
}: {
  rows: FormField[];
  onChange: (rows: FormField[]) => void;
  vars?: Record<string, string>;
  onSetVar?: (name: string, value: string) => void;
  envName?: string | null;
}) {
  const { t } = useTranslation();
  function update(id: string, patch: Partial<FormField>) {
    let next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    const last = next[next.length - 1];
    if (last && (last.key || last.value)) next = [...next, emptyFormField()];
    onChange(next);
  }
  function remove(id: string) {
    const next = rows.filter((r) => r.id !== id);
    onChange(next.length ? next : [emptyFormField()]);
  }

  return (
    <div className="fd-table">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const blank = isLast && !row.key && !row.value;
        return (
          <div className={`fd-row ${row.enabled ? "" : "disabled"}`} key={row.id}>
            <input
              type="checkbox"
              className="kv-check"
              checked={row.enabled}
              disabled={blank}
              onChange={(e) => update(row.id, { enabled: e.target.checked })}
            />
            <input
              className="kv-input mono"
              placeholder={t("side.varKey")}
              value={row.key}
              spellCheck={false}
              onChange={(e) => update(row.id, { key: e.target.value })}
            />
            <Dropdown
              className="fd-type-dd"
              value={row.type}
              options={[
                { value: "text", label: t("body.fdText") },
                { value: "file", label: t("body.fdFile") },
              ]}
              onChange={(v) => update(row.id, { type: v as "text" | "file", value: "" })}
            />
            {row.type === "text" ? (
              <VarInput
                compact
                value={row.value}
                placeholder={t("side.varValue")}
                onChange={(value) => update(row.id, { value })}
                vars={vars}
                onSetVar={onSetVar}
                envName={envName}
              />
            ) : (
              <Button
                variant="bare"
                className="fd-file"
                title={row.value}
                onClick={() => pickFile((p) => update(row.id, { value: p }))}
              >
                {row.value ? baseName(row.value) : t("body.selectFile")}
              </Button>
            )}
            <Button
              variant="bare"
              className="kv-del"
              tabIndex={-1}
              style={{ visibility: blank ? "hidden" : "visible" }}
              onClick={() => remove(row.id)}
            >
              <Icon name="x" size={13} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Response panel ------------------------------ */

function ResponsePanel({
  res,
  error,
  loading,
  tab,
  onTab,
  script,
  indentJson = 2,
}: {
  res: SendResult | null;
  error: string | null;
  loading: boolean;
  tab: ResTab;
  onTab: (t: ResTab) => void;
  script: ScriptOutcome | null;
  indentJson?: string | number;
}) {
  const { t } = useTranslation();
  const prettyRef = useRef<HTMLPreElement>(null);
  const passed = script ? script.tests.filter((x) => x.passed).length : 0;
  const failed = script ? script.tests.length - passed : 0;
  const hasTestTab = !!script && (script.tests.length > 0 || !script.ok || script.logs.length > 0);

  const pretty = useMemo(() => {
    if (!res) return "";
    const ct = res.contentType.toLowerCase();
    if (ct.includes("json") || looksJson(res.body)) {
      try {
        return JSON.stringify(JSON.parse(res.body), null, indentJson);
      } catch {
        return res.body;
      }
    }
    return res.body;
  }, [res, indentJson]);

  const isJson = res
    ? res.contentType.toLowerCase().includes("json") || looksJson(res.body)
    : false;

  return (
    <div className="res-panel">
      <div className="res-head">
        <span className="res-title">{t("response.title")}</span>
        {res && (
          <div className="res-meta">
            <span className={`res-status ${statusClass(res.status)}`}>
              {res.status} {res.statusText}
            </span>
            <span className="res-metric">
              <b>{res.timeMs}</b> ms
            </span>
            <span className="res-metric">
              <b>{formatBytes(res.sizeBytes)}</b>
            </span>
          </div>
        )}
      </div>

      <div className="res-body">
        {loading && (
          <div className="res-placeholder">
            <span className="spinner big" />
            <p>{t("actions.sending")}</p>
          </div>
        )}

        {!loading && error && (
          <div className="res-placeholder error">
            <span className="err-glyph">!</span>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && !res && (
          <div className="res-placeholder">
            <p className="hint">
              <Trans i18nKey="response.hint" components={{ b: <b />, k: <kbd /> }} />
            </p>
          </div>
        )}

        {!loading && !error && res && (
          <>
            <nav className="tabs sub">
              <Tab active={tab === "pretty"} onClick={() => onTab("pretty")}>
                {isJson ? t("response.pretty") : t("response.body")}
              </Tab>
              <Tab active={tab === "raw"} onClick={() => onTab("raw")}>
                {t("response.raw")}
              </Tab>
              <Tab active={tab === "headers"} onClick={() => onTab("headers")}>
                {t("response.headers")} <b className="count">{res.headers.length}</b>
              </Tab>
              {hasTestTab && (
                <Tab active={tab === "tests"} onClick={() => onTab("tests")}>
                  {t("response.tests")}{" "}
                  {failed > 0 ? (
                    <b className="count fail">{failed}✕</b>
                  ) : (
                    script!.tests.length > 0 && <b className="count pass">{passed}✓</b>
                  )}
                </Tab>
              )}
            </nav>
            <div className="res-content">
              {tab === "pretty" && (
                <pre
                  ref={prettyRef}
                  className="code mono"
                  dangerouslySetInnerHTML={{
                    __html: isJson ? highlightJson(pretty) : escapeHtml(pretty),
                  }}
                />
              )}
              {tab === "raw" && <pre className="code mono">{res.body}</pre>}
              {tab === "headers" && (
                <div className="res-headers">
                  {res.headers.map(([k, v], i) => (
                    <div className="res-header-row" key={i}>
                      <span className="rh-key">{k}</span>
                      <span className="rh-val">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab === "tests" && script && (
                <div className="res-tests">
                  {script.tests.length > 0 && (
                    <div className="test-summary">
                      {passed > 0 && <span className="ts-pass">{passed} {t("response.testsPassed")}</span>}
                      {failed > 0 && <span className="ts-fail">{failed} {t("response.testsFailed")}</span>}
                    </div>
                  )}
                  {script.tests.map((tr, i) => (
                    <div className={`test-row ${tr.passed ? "pass" : "fail"}`} key={i}>
                      <span className="test-mark">{tr.passed ? "✓" : "✕"}</span>
                      <span className="test-name">{tr.name}</span>
                      {!tr.passed && tr.error && <span className="test-err">{tr.error}</span>}
                    </div>
                  ))}
                  {!script.ok && script.error && (
                    <div className="test-fatal">
                      <span className="test-mark">!</span>
                      <span>{script.error}</span>
                    </div>
                  )}
                  {script.logs.length > 0 && (
                    <div className="test-logs">
                      <div className="test-logs-head">{t("response.logs")}</div>
                      {script.logs.map((l, i) => (
                        <div className={`log-line ${l.level}`} key={i}>
                          {l.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- helpers --------------------------------- */

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "s-2xx";
  if (status >= 300 && status < 400) return "s-3xx";
  if (status >= 400 && status < 500) return "s-4xx";
  if (status >= 500) return "s-5xx";
  return "s-0";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function looksJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Minimal, dependency-free JSON syntax highlighter. */
function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "j-num";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "j-key" : "j-str";
      } else if (/true|false/.test(match)) {
        cls = "j-bool";
      } else if (/null/.test(match)) {
        cls = "j-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}
