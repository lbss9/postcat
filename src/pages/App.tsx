/**
 * PostCat — the application page.
 *
 * Owns the data layer (collections, environments, history, the send pipeline
 * with pre/post scripts) and composes the templates/organisms. Pure UI state
 * lives in hooks (`useWorkspaceTabs`, `useLayout`, `useTheme`).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog, save as saveFileDialog } from "@tauri-apps/plugin-dialog";

import WorkspaceLayout from "@/components/templates/WorkspaceLayout";
import RequestView from "@/components/templates/RequestView";
import TitleBar from "@/components/organisms/TitleBar";
import Sidebar from "@/components/organisms/Sidebar";
import TabBar from "@/components/organisms/TabBar";
import UrlBar from "@/components/organisms/UrlBar";
import RequestBuilder from "@/components/organisms/RequestBuilder";
import ResponsePanel from "@/components/organisms/ResponsePanel";
import EnvironmentEditor from "@/components/organisms/EnvironmentEditor";
import SaveDialog from "@/components/organisms/SaveDialog";
import SettingsDialog, { type SettingsTab } from "@/components/organisms/SettingsDialog";
import { usePersistedBool } from "@/hooks/usePersistedBool";
import { confirmDialog } from "@/utils/dialog";

import { useLayout } from "@/hooks/useLayout";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspaceTabs } from "@/hooks/useWorkspaceTabs";
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
  openDataDir,
  openThemesDir,
  readFileText,
  resolveVars,
  sendRequest,
  writeFileText,
} from "@/services/tauri";
import { serializeCollection, parseImport, type ImportNode } from "@/services/import";
import {
  runScript,
  type ScriptHeader,
  type ScriptOutcome,
  type ScriptRequest,
  type ScriptResponse,
} from "@/scripting/runner";
import { indentJsonArg, indentUnitStr } from "@/theme/themes";
import {
  emptyRow,
  newRequest,
  normalizeRequest,
  syncPathVars,
  type EnvVar,
  type Environment,
  type HistoryEntry,
  type KeyVal,
  type Method,
  type NodeKind,
  type RequestState,
  type SendResult,
  type TreeNode,
} from "@/types";
import { reqLabel } from "@/utils/request";
import "@/styles/app.css";

export default function App() {
  const { t } = useTranslation();
  const th = useTheme();
  const layout = useLayout();
  const ws = useWorkspaceTabs();
  // general preferences (Settings → General)
  const [confirmClose, toggleConfirmClose] = usePersistedBool("postcat-confirm-close", true);
  const [saveHistory, toggleSaveHistory] = usePersistedBool("postcat-save-history", true);
  const { activeTab, activeReq, updateReqTab, patchReq } = ws;

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [savePickerOpen, setSavePickerOpen] = useState(false);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);

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
    if (kind === "request" && id && req) ws.openRequestTab(req, id);
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
    if (id) ws.openRequestTab(base, id);
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
    if (id) ws.openEnvTab(id);
  }
  async function saveEnv(id: string, name: string, variables: EnvVar[]) {
    await envUpdate(id, name, variables).catch(() => {});
    reloadEnvs();
  }
  async function deleteEnv(id: string) {
    await envDelete(id).catch(() => {});
    ws.setTabs((ts) => ts.filter((tb) => !(tb.kind === "environment" && tb.envId === id)));
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
    if (!saveHistory) return;
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

  // closing a tab with unsaved changes asks first (Settings → General)
  async function closeTab(id: string) {
    const tab = ws.tabs.find((x) => x.id === id);
    if (confirmClose && tab && "dirty" in tab && tab.dirty) {
      if (!(await confirmDialog(t("tab.confirmClose")))) return;
    }
    ws.closeTab(id);
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
        ws.newTab();
      } else if (mod && e.key === "w") {
        e.preventDefault();
        closeTab(ws.activeTabId);
      } else if (mod && e.key === ",") {
        e.preventDefault();
        openSettings("general");
      } else if (mod && e.key === "s") {
        e.preventDefault();
        saveActiveRequest();
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        layout.zoomIn();
      } else if (mod && e.key === "-") {
        e.preventDefault();
        layout.zoomOut();
      } else if (mod && e.key === "0") {
        e.preventDefault();
        layout.zoomReset();
      } else if (mod && e.key === "b") {
        e.preventDefault();
        layout.toggleSidebar();
      } else if (mod && e.key === "o") {
        e.preventDefault();
        importFromFile();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <WorkspaceLayout
      titleBar={
        <TitleBar
          onNewRequest={ws.newTab}
          onOpenSettings={openSettings}
          onZoomIn={layout.zoomIn}
          onZoomOut={layout.zoomOut}
          onZoomReset={layout.zoomReset}
          onToggleSidebar={layout.toggleSidebar}
          onImport={importFromFile}
        />
      }
      sidebar={
        <Sidebar
          nodes={nodes}
          activeNodeId={activeReq?.nodeId ?? null}
          onCreateNode={createNode}
          onNewRequest={ws.newTab}
          onAddFolder={addFolder}
          onAddRequest={addRequestTo}
          onRenameNode={renameNode}
          onDeleteNode={deleteNode}
          onOpenRequest={(node) => node.request && ws.openRequestTab(node.request, node.id)}
          onMoveNode={moveNode}
          onExportNode={exportCollection}
          environments={environments}
          onCreateEnv={createEnv}
          onOpenEnv={ws.openEnvTab}
          onDeleteEnv={deleteEnv}
          onSetActiveEnv={setActiveEnvId}
          history={history}
          onOpenHistory={(h) => ws.openRequestTab(h.request, null)}
          onClearHistory={clearHistory}
        />
      }
      sidebarOpen={layout.sidebarOpen}
      sidebarWidth={layout.sidebarWidth}
      onSidebarResizeStart={layout.startSidebarResize}
      onSidebarResize={layout.resizeSidebar}
      overlays={
        <>
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
            twoPane={layout.twoPane}
            onToggleTwoPane={layout.toggleTwoPane}
            confirmClose={confirmClose}
            onToggleConfirmClose={toggleConfirmClose}
            saveHistory={saveHistory}
            onToggleSaveHistory={toggleSaveHistory}
            onImport={importFromFile}
            onClearHistory={clearHistory}
            onOpenDataFolder={() => openDataDir().catch(() => {})}
            onResetLayout={layout.resetLayout}
          />

          {savePickerOpen && (
            <SaveDialog
              nodes={nodes}
              onPick={saveToDestination}
              onClose={() => setSavePickerOpen(false)}
            />
          )}
        </>
      }
    >
      <TabBar
        tabs={ws.tabs}
        activeTabId={ws.activeTabId}
        nodesById={nodesById}
        environments={environments}
        onSelect={ws.setActiveTabId}
        onClose={closeTab}
        onNew={ws.newTab}
      />

      {activeReq ? (
        <>
          <UrlBar
            method={activeReq.req.method}
            url={activeReq.req.url}
            loading={activeReq.loading}
            onMethod={(m) => patchReq({ method: m })}
            onUrl={(url) =>
              patchReq({ url, pathVars: syncPathVars(url, activeReq.req.pathVars) })
            }
            onSend={send}
            vars={mergedVars}
            onSetVar={setVarValue}
            envName={activeEnv?.name ?? null}
            environments={environments}
            activeEnvId={activeEnv?.id ?? ""}
            onSelectEnv={setActiveEnvId}
          />

          <RequestView
            twoPane={layout.twoPane}
            responseHeight={layout.responseHeight}
            responseWidth={layout.responseWidth}
            onResizeStart={layout.startResponseResize}
            onResizeHeight={layout.resizeResponse}
            onResizeWidth={layout.resizeResponseWidth}
            builder={
              <RequestBuilder
                req={activeReq.req}
                reqTab={activeReq.reqTab}
                onReqTab={(reqTab) => updateReqTab(activeReq.id, { reqTab })}
                onPatch={patchReq}
                varProps={varProps}
                indentUnit={indentUnit}
                indentJson={indentJson}
              />
            }
            response={
              <ResponsePanel
                res={activeReq.res}
                error={activeReq.error}
                loading={activeReq.loading}
                tab={activeReq.resTab}
                onTab={(rt) => updateReqTab(activeReq.id, { resTab: rt })}
                script={activeReq.script}
                indentJson={indentJson}
              />
            }
          />
        </>
      ) : activeTab?.kind === "environment" ? (
        <EnvironmentEditor
          key={activeTab.envId}
          env={environments.find((e) => e.id === activeTab.envId) ?? null}
          onSave={saveEnv}
          onSetActive={setActiveEnvId}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
